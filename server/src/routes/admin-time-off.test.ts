import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../app'
import { ADMIN_USER, PATIENT_USER, stubAuth, stubTransaction, type StubUser } from '../test-support/stubs'

// No Postgres. What a stub cannot prove — that the transaction really is
// atomic, that a real instant round-trips through Postgres in the clinic's
// zone — is `db:time-off`'s job.

const PROVIDER_ID = '1b4e2d00-0000-4000-8000-000000000004'
const TIME_OFF_ID = '2c5f3e00-0000-4000-8000-000000000009'
const TIME_ZONE = 'America/New_York'

const RAMAN_THURSDAY = {
  id: TIME_OFF_ID,
  providerId: PROVIDER_ID,
  startsAt: new Date('2026-09-10T04:00:00.000Z'), // 2026-09-10 00:00 America/New_York
  endsAt: new Date('2026-09-11T04:00:00.000Z'), // 2026-09-11 00:00 America/New_York
  reason: 'Continuing education',
}

function appFor(
  user: StubUser | null,
  options: { providerExists?: boolean; rows?: (typeof RAMAN_THURSDAY)[]; confirmedConflicts?: number } = {},
) {
  const { providerExists = true, rows = [RAMAN_THURSDAY], confirmedConflicts = 0 } = options
  const calls: { created: unknown[]; deletedId: string | null } = { created: [], deletedId: null }
  let current = rows

  const resources = {
    provider: {
      findUnique: async () => (providerExists ? { id: PROVIDER_ID } : null),
    },
    timeOff: {
      findMany: async () => current,
      findUnique: async ({ where: { id } }: { where: { id: string } }) =>
        current.find((row) => row.id === id) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const created = { id: TIME_OFF_ID, ...data } as (typeof RAMAN_THURSDAY)
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

describe('GET /api/admin/providers/:providerId/time-off', () => {
  it('refuses a stranger', async () => {
    const { app } = appFor(null)
    const res = await request(app).get(`/api/admin/providers/${PROVIDER_ID}/time-off`)
    expect(res.status).toBe(401)
  })

  it('refuses a signed-in patient', async () => {
    const { app } = appFor(PATIENT_USER)
    const res = await request(app).get(`/api/admin/providers/${PROVIDER_ID}/time-off`)
    expect(res.status).toBe(403)
  })

  it("answers an admin with the provider's rows, as civil dates in the clinic's zone", async () => {
    const { app } = appFor(ADMIN_USER)
    const res = await request(app).get(`/api/admin/providers/${PROVIDER_ID}/time-off`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      providerId: PROVIDER_ID,
      timeOff: [
        {
          id: TIME_OFF_ID,
          providerId: PROVIDER_ID,
          fromDate: '2026-09-10',
          toDate: '2026-09-10',
          reason: 'Continuing education',
        },
      ],
    })
  })

  it('is not cached', async () => {
    const { app } = appFor(ADMIN_USER)
    const res = await request(app).get(`/api/admin/providers/${PROVIDER_ID}/time-off`)
    expect(res.headers['cache-control']).toBe('no-store')
  })

  it('404s a provider that does not exist', async () => {
    const { app } = appFor(ADMIN_USER, { providerExists: false })
    const res = await request(app).get(`/api/admin/providers/${PROVIDER_ID}/time-off`)

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  it('rejects a malformed provider id as 400, never reaching a uuid column', async () => {
    const { app } = appFor(ADMIN_USER)
    const res = await request(app).get('/api/admin/providers/not-a-uuid/time-off')

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_REQUEST')
  })
})

describe('POST /api/admin/providers/:providerId/time-off', () => {
  it('refuses a signed-in patient', async () => {
    const { app } = appFor(PATIENT_USER)
    const res = await request(app)
      .post(`/api/admin/providers/${PROVIDER_ID}/time-off`)
      .send({ fromDate: '2026-09-14', toDate: '2026-09-14' })
    expect(res.status).toBe(403)
  })

  it('creates a row spanning whole clinic-zone days and echoes it back', async () => {
    const { app, calls } = appFor(ADMIN_USER, { rows: [] })
    const res = await request(app)
      .post(`/api/admin/providers/${PROVIDER_ID}/time-off`)
      .send({ fromDate: '2026-09-14', toDate: '2026-09-15', reason: 'Conference' })

    expect(res.status).toBe(201)
    expect(res.body).toEqual({
      timeOff: {
        id: TIME_OFF_ID,
        providerId: PROVIDER_ID,
        fromDate: '2026-09-14',
        toDate: '2026-09-15',
        reason: 'Conference',
      },
    })
    expect(calls.created).toHaveLength(1)
  })

  it('rejects a range that ends before it starts', async () => {
    const { app, calls } = appFor(ADMIN_USER, { rows: [] })
    const res = await request(app)
      .post(`/api/admin/providers/${PROVIDER_ID}/time-off`)
      .send({ fromDate: '2026-09-15', toDate: '2026-09-14' })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_REQUEST')
    expect(calls.created).toHaveLength(0)
  })

  it('404s a provider that does not exist, and writes nothing', async () => {
    const { app, calls } = appFor(ADMIN_USER, { providerExists: false, rows: [] })
    const res = await request(app)
      .post(`/api/admin/providers/${PROVIDER_ID}/time-off`)
      .send({ fromDate: '2026-09-14', toDate: '2026-09-14' })

    expect(res.status).toBe(404)
    expect(calls.created).toHaveLength(0)
  })

  it('blocks a range that overlaps a CONFIRMED appointment for this provider, and writes nothing', async () => {
    const { app, calls } = appFor(ADMIN_USER, { rows: [], confirmedConflicts: 2 })
    const res = await request(app)
      .post(`/api/admin/providers/${PROVIDER_ID}/time-off`)
      .send({ fromDate: '2026-09-14', toDate: '2026-09-14' })

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('TIME_OFF_CONFLICT')
    expect(res.body.error.message).toContain('2 confirmed appointments')
    expect(calls.created).toHaveLength(0)
  })
})

describe('DELETE /api/admin/time-off/:id', () => {
  it('refuses a signed-in patient', async () => {
    const { app } = appFor(PATIENT_USER)
    const res = await request(app).delete(`/api/admin/time-off/${TIME_OFF_ID}`)
    expect(res.status).toBe(403)
  })

  it('removes the row and echoes its id', async () => {
    const { app, calls } = appFor(ADMIN_USER)
    const res = await request(app).delete(`/api/admin/time-off/${TIME_OFF_ID}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ id: TIME_OFF_ID })
    expect(calls.deletedId).toBe(TIME_OFF_ID)
  })

  it('404s a row that does not exist', async () => {
    const { app } = appFor(ADMIN_USER, { rows: [] })
    const res = await request(app).delete(`/api/admin/time-off/${TIME_OFF_ID}`)

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  it('rejects a malformed id as 400', async () => {
    const { app } = appFor(ADMIN_USER)
    const res = await request(app).delete('/api/admin/time-off/not-a-uuid')

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_REQUEST')
  })
})
