import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../app'
import { ADMIN_USER, PATIENT_USER, stubAuth, stubTransaction, type StubUser } from '../test-support/stubs'

// No Postgres. What a stub cannot prove — that the transaction really is
// atomic, that a real instant round-trips through Postgres in the clinic's
// zone — is `db:closures`'s job.

const CLOSURE_ID = '4b6f2e00-0000-4000-8000-000000000010'
const TIME_ZONE = 'America/New_York'

const TRAINING_DAY = {
  id: CLOSURE_ID,
  startsAt: new Date('2026-09-29T04:00:00.000Z'), // 2026-09-29 00:00 America/New_York
  endsAt: new Date('2026-09-30T04:00:00.000Z'), // 2026-09-30 00:00 America/New_York
  reason: 'Staff training day',
}

function appFor(
  user: StubUser | null,
  options: { rows?: (typeof TRAINING_DAY)[]; confirmedConflicts?: number } = {},
) {
  const { rows = [TRAINING_DAY], confirmedConflicts = 0 } = options
  const calls: { created: unknown[]; deletedId: string | null } = { created: [], deletedId: null }
  let current = rows

  const resources = {
    clinicClosure: {
      findMany: async () => current,
      findUnique: async ({ where: { id } }: { where: { id: string } }) =>
        current.find((row) => row.id === id) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const created = { id: CLOSURE_ID, ...data } as typeof TRAINING_DAY
        calls.created.push(created)
        current = [...current, created]
        return created
      },
      delete: async ({ where: { id } }: { where: { id: string } }) => {
        calls.deletedId = id
        current = current.filter((row) => row.id !== id)
        return {}
      },
    },
    appointment: {
      count: async () => confirmedConflicts,
    },
  }

  const db = {
    ...resources,
    ...stubTransaction(resources),
    // Unused by this route; only here because requireAuth's own session
    // resolution asks for it.
    patient: { findUnique: async () => null },
  }

  const app = createApp({
    db,
    auth: stubAuth(user),
    databaseIsReachable: async () => true,
    timeZone: TIME_ZONE,
  } as unknown as Parameters<typeof createApp>[0])

  return { app, calls }
}

describe('GET /api/admin/closures', () => {
  it('refuses a stranger', async () => {
    const { app } = appFor(null)
    const res = await request(app).get('/api/admin/closures')
    expect(res.status).toBe(401)
  })

  it('refuses a signed-in patient', async () => {
    const { app } = appFor(PATIENT_USER)
    const res = await request(app).get('/api/admin/closures')
    expect(res.status).toBe(403)
  })

  it('answers an admin with every closure, as civil dates in the clinic’s zone', async () => {
    const { app } = appFor(ADMIN_USER)
    const res = await request(app).get('/api/admin/closures')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      closures: [
        {
          id: CLOSURE_ID,
          fromDate: '2026-09-29',
          toDate: '2026-09-29',
          reason: 'Staff training day',
        },
      ],
    })
  })

  it('is not cached', async () => {
    const { app } = appFor(ADMIN_USER)
    const res = await request(app).get('/api/admin/closures')
    expect(res.headers['cache-control']).toBe('no-store')
  })
})

describe('POST /api/admin/closures', () => {
  it('refuses a signed-in patient', async () => {
    const { app } = appFor(PATIENT_USER)
    const res = await request(app)
      .post('/api/admin/closures')
      .send({ fromDate: '2026-11-26', toDate: '2026-11-26' })
    expect(res.status).toBe(403)
  })

  it('creates a row spanning whole clinic-zone days and echoes it back', async () => {
    const { app, calls } = appFor(ADMIN_USER, { rows: [] })
    const res = await request(app)
      .post('/api/admin/closures')
      .send({ fromDate: '2026-11-26', toDate: '2026-11-27', reason: 'Thanksgiving' })

    expect(res.status).toBe(201)
    expect(res.body).toEqual({
      closure: { id: CLOSURE_ID, fromDate: '2026-11-26', toDate: '2026-11-27', reason: 'Thanksgiving' },
    })
    expect(calls.created).toHaveLength(1)
  })

  it('rejects a range that ends before it starts', async () => {
    const { app, calls } = appFor(ADMIN_USER, { rows: [] })
    const res = await request(app)
      .post('/api/admin/closures')
      .send({ fromDate: '2026-11-27', toDate: '2026-11-26' })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_REQUEST')
    expect(calls.created).toHaveLength(0)
  })

  it('blocks a range that overlaps a CONFIRMED appointment, any provider, and writes nothing', async () => {
    const { app, calls } = appFor(ADMIN_USER, { rows: [], confirmedConflicts: 3 })
    const res = await request(app)
      .post('/api/admin/closures')
      .send({ fromDate: '2026-11-26', toDate: '2026-11-26' })

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('CLOSURE_CONFLICT')
    expect(res.body.error.message).toContain('3 confirmed appointments')
    expect(calls.created).toHaveLength(0)
  })
})

describe('DELETE /api/admin/closures/:id', () => {
  it('refuses a signed-in patient', async () => {
    const { app } = appFor(PATIENT_USER)
    const res = await request(app).delete(`/api/admin/closures/${CLOSURE_ID}`)
    expect(res.status).toBe(403)
  })

  it('removes the row and echoes its id', async () => {
    const { app, calls } = appFor(ADMIN_USER)
    const res = await request(app).delete(`/api/admin/closures/${CLOSURE_ID}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ id: CLOSURE_ID })
    expect(calls.deletedId).toBe(CLOSURE_ID)
  })

  it('404s a row that does not exist', async () => {
    const { app } = appFor(ADMIN_USER, { rows: [] })
    const res = await request(app).delete(`/api/admin/closures/${CLOSURE_ID}`)

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  it('rejects a malformed id as 400', async () => {
    const { app } = appFor(ADMIN_USER)
    const res = await request(app).delete('/api/admin/closures/not-a-uuid')

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_REQUEST')
  })
})
