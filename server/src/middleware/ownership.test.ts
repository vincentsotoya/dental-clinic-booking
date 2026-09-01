import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import type { PrismaClient } from '../../generated/prisma/client'
import { errorHandler } from '../routes/errors'
import {
  ADMIN_USER,
  PATIENT_CHART,
  PATIENT_USER,
  stubAuth,
  stubPatientDb,
  type StubUser,
} from '../test-support/stubs'
import { createAuthMiddleware } from './auth'
import { createRequireOwnership, getOwnedAppointmentId } from './ownership'

// Driven over a probe route rather than cancel or reschedule: the guard has to
// hold for whichever route is mounted behind it, and testing it through the
// first one built would tie the property to that route. `npm run db:authz` runs
// the same claims over real cookies and real rows.

const HERS = '5f2b8c00-0000-4000-8000-0000000000a1'
const HIS = '5f2b8c00-0000-4000-8000-0000000000b1'
const NEVER_EXISTED = '00000000-0000-4000-8000-000000000000'

type Where = { id?: string; patientId?: string }
type FindFirstArgs = { where?: Where }

const ROWS = [
  { id: HERS, patientId: PATIENT_CHART.id },
  { id: HIS, patientId: '2c5f3e00-0000-4000-8000-00000000000b' },
]

/**
 * Applies the WHERE clause it is given rather than answering the one it
 * expected. That difference is the whole test: a stub keyed on the chart id
 * returns nothing once the guard drops it, so every 404 assertion stays green
 * while the guard is wide open.
 */
function stubAppointmentDb(rows = ROWS) {
  const reads: FindFirstArgs[] = []

  const db = {
    appointment: {
      findFirst: async (args: FindFirstArgs) => {
        reads.push(args)
        const where = args.where ?? {}
        const match = rows.find((row) =>
          Object.entries(where).every(([column, value]) => row[column as keyof Where] === value),
        )
        return match ? { id: match.id } : null
      },
    },
  }

  return { db: db as unknown as Pick<PrismaClient, 'appointment'>, reads }
}

function probeApp(
  user: StubUser | null,
  stub = stubAppointmentDb(),
  chart: typeof PATIENT_CHART | null = PATIENT_CHART,
) {
  const { requireAuth } = createAuthMiddleware({
    auth: stubAuth(user),
    db: stubPatientDb(user?.role === 'PATIENT' ? chart : null),
  })
  const requireOwnership = createRequireOwnership({ db: stub.db, requireAuth })

  const app = express()

  app.patch('/probe/appointments/:id/cancel', requireOwnership, (req, res) => {
    res.json({ id: getOwnedAppointmentId(req) })
  })

  // The guard forgotten. The handler must not quietly fall back to the URL.
  app.patch('/unguarded/appointments/:id/cancel', requireAuth, (req, res) => {
    res.json({ id: getOwnedAppointmentId(req) })
  })

  app.use(errorHandler)
  return app
}

const cancel = (app: express.Express, id: string, path = 'probe') =>
  request(app).patch(`/${path}/appointments/${id}/cancel`)

describe('requireOwnership', () => {
  it('clears the caller’s own appointment and hands the handler its id', async () => {
    const res = await cancel(probeApp(PATIENT_USER), HERS)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ id: HERS })
  })

  it('puts the chart id in the WHERE clause rather than comparing afterwards', async () => {
    const stub = stubAppointmentDb()
    await cancel(probeApp(PATIENT_USER, stub), HERS)

    expect(stub.reads[0]?.where).toEqual({ id: HERS, patientId: PATIENT_CHART.id })
  })

  it('404s a row that exists and belongs to somebody else', async () => {
    const res = await cancel(probeApp(PATIENT_USER), HIS)

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  // The point of the 404: distinguishing the two would let a caller walk ids
  // and count the clinic's bookings without reading one — ADR-0007.
  it('answers a stranger’s row and a missing row identically', async () => {
    const stranger = await cancel(probeApp(PATIENT_USER), HIS)
    const missing = await cancel(probeApp(PATIENT_USER), NEVER_EXISTED)

    expect(stranger.status).toBe(missing.status)
    expect(stranger.body).toEqual(missing.body)
  })

  // The one branch that skips scoping, and it skips the read with it.
  it('lets an admin through without scoping the lookup to a chart', async () => {
    const stub = stubAppointmentDb()
    const res = await cancel(probeApp(ADMIN_USER, stub), HIS)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ id: HIS })
    expect(stub.reads).toHaveLength(0)
  })

  it('401s a stranger before it looks anything up', async () => {
    const stub = stubAppointmentDb()
    const res = await cancel(probeApp(null, stub), HERS)

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
    expect(stub.reads).toHaveLength(0)
  })

  // ADR-0007's gap: a login whose chart insert failed. It owns nothing, and
  // that is a fact about the account rather than about the id, so it is a 403
  // with no oracle in it.
  it('403s a signed-in account with no chart', async () => {
    const stub = stubAppointmentDb()
    const res = await cancel(probeApp(PATIENT_USER, stub, null), HERS)

    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
    expect(stub.reads).toHaveLength(0)
  })

  // Decided from the string alone, so it discloses nothing a 404 would hide —
  // and it keeps a non-UUID away from a `uuid` column, which 500s.
  it('400s a malformed id rather than querying with it', async () => {
    const stub = stubAppointmentDb()
    const res = await cancel(probeApp(PATIENT_USER, stub), 'not-a-uuid')

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_REQUEST')
    expect(res.body.error.message).toContain('id')
    expect(stub.reads).toHaveLength(0)
  })
})

describe('a route that forgot the guard', () => {
  it('500s rather than acting on the id in the URL', async () => {
    const res = await cancel(probeApp(PATIENT_USER), HIS, 'unguarded')

    expect(res.status).toBe(500)
    expect(res.body.error.code).toBe('INTERNAL')
    expect(res.body.error.message).toBe('Something went wrong.')
  })
})
