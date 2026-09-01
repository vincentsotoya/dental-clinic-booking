import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createAuthMiddleware } from './auth'
import { getAuth, getSession } from './auth-context'
import { errorHandler } from '../routes/errors'
import {
  ADMIN_USER,
  brokenAuth,
  PATIENT_CHART,
  PATIENT_USER,
  stubAuth,
  stubPatientDb,
  type StubUser,
} from '../test-support/stubs'

// The permission matrix, driven over probe routes rather than real ones: the guards
// must hold for routes that do not exist yet, and testing them through whichever
// endpoint was built first would tie the property to that endpoint. The same matrix
// runs against real cookies in `npm run db:authz`.

function probeApp(user: StubUser | null, chart = PATIENT_CHART) {
  const { attachSession, requireAuth, requireRole } = createAuthMiddleware({
    auth: stubAuth(user),
    db: stubPatientDb(user?.role === 'PATIENT' ? chart : null),
  })

  const app = express()

  app.get('/open', attachSession, (req, res) => {
    res.json({ session: getSession(req) })
  })

  app.get('/guarded', requireAuth, (req, res) => {
    const { user: caller, patientId } = getAuth(req)
    res.json({ id: caller.id, role: caller.role, patientId })
  })

  app.get('/admin-only', requireRole('ADMIN'), (_req, res) => {
    res.json({ ok: true })
  })

  app.get('/staff', requireRole('ADMIN', 'PATIENT'), (_req, res) => {
    res.json({ ok: true })
  })

  // No middleware at all: reading the session here is a wiring bug.
  app.get('/unwired', (req, res) => {
    res.json({ session: getSession(req) })
  })

  app.use(errorHandler)
  return app
}

describe('requireAuth', () => {
  it('401 UNAUTHENTICATED for a stranger', async () => {
    const res = await request(probeApp(null)).get('/guarded')

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
  })

  it('lets a patient through with their chart id attached', async () => {
    const res = await request(probeApp(PATIENT_USER)).get('/guarded')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      id: PATIENT_USER.id,
      role: 'PATIENT',
      patientId: PATIENT_CHART.id,
    })
  })

  // Not a failure: an admin receives no care, so there is no chart to attach.
  it('lets an admin through with a null chart id', async () => {
    const res = await request(probeApp(ADMIN_USER)).get('/guarded')

    expect(res.status).toBe(200)
    expect(res.body.patientId).toBeNull()
  })

  // The ADR-0007 window: the login works and simply cannot book, rather than
  // being locked out.
  it('lets a patient whose chart is missing through with a null chart id', async () => {
    const { requireAuth } = createAuthMiddleware({
      auth: stubAuth(PATIENT_USER),
      db: stubPatientDb(null),
    })
    const app = express()
    app.get('/guarded', requireAuth, (req, res) => res.json(getAuth(req)))
    app.use(errorHandler)

    const res = await request(app).get('/guarded')

    expect(res.status).toBe(200)
    expect(res.body.patientId).toBeNull()
  })
})

describe('requireRole', () => {
  it('403 FORBIDDEN when a patient asks for an admin route', async () => {
    const res = await request(probeApp(PATIENT_USER)).get('/admin-only')

    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('lets the named role through', async () => {
    const res = await request(probeApp(ADMIN_USER)).get('/admin-only')
    expect(res.status).toBe(200)
  })

  it('accepts any of several roles', async () => {
    expect((await request(probeApp(PATIENT_USER)).get('/staff')).status).toBe(200)
    expect((await request(probeApp(ADMIN_USER)).get('/staff')).status).toBe(200)
  })

  // 401 before 403: a stranger is unidentified, not forbidden, and a 403 would
  // confirm the route exists to someone who never signed in.
  it('401s a stranger rather than 403ing them', async () => {
    const res = await request(probeApp(null)).get('/admin-only')

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
  })
})

describe('attachSession', () => {
  it('serves a stranger without refusing them', async () => {
    const res = await request(probeApp(null)).get('/open')

    expect(res.status).toBe(200)
    expect(res.body.session).toBeNull()
  })

  it('resolves a signed-in caller', async () => {
    const res = await request(probeApp(PATIENT_USER)).get('/open')

    expect(res.status).toBe(200)
    expect(res.body.session.user.email).toBe(PATIENT_USER.email)
  })

  // A session store that is down is not the same as nobody being signed in, and
  // must not quietly downgrade a caller to anonymous.
  it('500s when the session store fails rather than reporting anonymous', async () => {
    const { attachSession } = createAuthMiddleware({
      auth: brokenAuth(),
      db: stubPatientDb(null),
    })
    const app = express()
    app.get('/open', attachSession, (req, res) => res.json({ session: getSession(req) }))
    app.use(errorHandler)

    const res = await request(app).get('/open')

    expect(res.status).toBe(500)
    expect(res.body.error.code).toBe('INTERNAL')
    expect(res.body.error.message).not.toContain('5432')
  })
})

// A route that lost its middleware must not look like a logged-out user: a 401
// would send them to a login screen and fail again after they log in.
describe('a route with no session middleware', () => {
  it('500s rather than reporting anonymous', async () => {
    const res = await request(probeApp(PATIENT_USER)).get('/unwired')

    expect(res.status).toBe(500)
    expect(res.body.error.code).toBe('INTERNAL')
    // The wiring bug is logged, not served: a 500 says one thing, always.
    expect(res.body.error.message).toBe('Something went wrong.')
  })
})
