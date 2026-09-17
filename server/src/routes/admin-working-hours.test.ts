import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../app'
import { ADMIN_USER, PATIENT_USER, stubAuth, stubTransaction, type StubUser } from '../test-support/stubs'

// No Postgres. What a stub cannot prove — that the transaction really is
// atomic, that a real `Weekday` enum round-trips — is `db:working-hours`'s job.

const PROVIDER_ID = '1b4e2d00-0000-4000-8000-000000000004'
const MORNING = { weekday: 'MONDAY', startMinute: 480, endMinute: 720 }
const AFTERNOON = { weekday: 'MONDAY', startMinute: 780, endMinute: 1020 }

function appFor(
  user: StubUser | null,
  options: { providerExists?: boolean; rows?: unknown[] } = {},
) {
  const { providerExists = true, rows = [MORNING, AFTERNOON] } = options
  const calls: { deleted: number; created: unknown[] } = { deleted: 0, created: [] }
  let current = rows

  const resources = {
    provider: {
      findUnique: async () => (providerExists ? { id: PROVIDER_ID } : null),
    },
    workingHours: {
      findMany: async () => current,
      deleteMany: async () => {
        calls.deleted += 1
        current = []
        return { count: 0 }
      },
      createMany: async ({ data }: { data: unknown[] }) => {
        calls.created = data
        current = data
        return { count: data.length }
      },
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
    timeZone: 'America/New_York',
  } as unknown as Parameters<typeof createApp>[0])

  return { app, calls }
}

describe('GET /api/admin/providers/:providerId/working-hours', () => {
  it('refuses a stranger', async () => {
    const { app } = appFor(null)
    const res = await request(app).get(`/api/admin/providers/${PROVIDER_ID}/working-hours`)
    expect(res.status).toBe(401)
  })

  it('refuses a signed-in patient', async () => {
    const { app } = appFor(PATIENT_USER)
    const res = await request(app).get(`/api/admin/providers/${PROVIDER_ID}/working-hours`)
    expect(res.status).toBe(403)
  })

  it('answers an admin with the week, sorted Monday first', async () => {
    const { app } = appFor(ADMIN_USER, { rows: [AFTERNOON, MORNING] })
    const res = await request(app).get(`/api/admin/providers/${PROVIDER_ID}/working-hours`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ providerId: PROVIDER_ID, workingHours: [MORNING, AFTERNOON] })
  })

  it('is not cached — an admin about to edit it needs the real row', async () => {
    const { app } = appFor(ADMIN_USER)
    const res = await request(app).get(`/api/admin/providers/${PROVIDER_ID}/working-hours`)
    expect(res.headers['cache-control']).toBe('no-store')
  })

  it('404s a provider that does not exist', async () => {
    const { app } = appFor(ADMIN_USER, { providerExists: false })
    const res = await request(app).get(`/api/admin/providers/${PROVIDER_ID}/working-hours`)

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  it('rejects a malformed provider id as 400, never reaching a uuid column', async () => {
    const { app } = appFor(ADMIN_USER)
    const res = await request(app).get('/api/admin/providers/not-a-uuid/working-hours')

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_REQUEST')
  })
})

describe('PATCH /api/admin/providers/:providerId/working-hours', () => {
  it('refuses a signed-in patient', async () => {
    const { app } = appFor(PATIENT_USER)
    const res = await request(app)
      .patch(`/api/admin/providers/${PROVIDER_ID}/working-hours`)
      .send({ workingHours: [MORNING] })
    expect(res.status).toBe(403)
  })

  it('replaces the whole week and echoes it back sorted', async () => {
    const { app, calls } = appFor(ADMIN_USER)
    const res = await request(app)
      .patch(`/api/admin/providers/${PROVIDER_ID}/working-hours`)
      .send({ workingHours: [AFTERNOON, MORNING] })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ providerId: PROVIDER_ID, workingHours: [MORNING, AFTERNOON] })
    expect(calls.deleted).toBe(1)
    expect(calls.created).toHaveLength(2)
  })

  it('accepts an empty week — every window removed at once', async () => {
    const { app, calls } = appFor(ADMIN_USER)
    const res = await request(app)
      .patch(`/api/admin/providers/${PROVIDER_ID}/working-hours`)
      .send({ workingHours: [] })

    expect(res.status).toBe(200)
    expect(res.body.workingHours).toEqual([])
    expect(calls.deleted).toBe(1)
  })

  it('rejects two overlapping windows on the same day before it writes anything', async () => {
    const { app, calls } = appFor(ADMIN_USER)
    const res = await request(app)
      .patch(`/api/admin/providers/${PROVIDER_ID}/working-hours`)
      .send({
        workingHours: [
          { weekday: 'MONDAY', startMinute: 480, endMinute: 720 },
          { weekday: 'MONDAY', startMinute: 700, endMinute: 900 },
        ],
      })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_REQUEST')
    expect(calls.deleted).toBe(0)
  })

  it('rejects a window that ends before it starts', async () => {
    const { app } = appFor(ADMIN_USER)
    const res = await request(app)
      .patch(`/api/admin/providers/${PROVIDER_ID}/working-hours`)
      .send({ workingHours: [{ weekday: 'MONDAY', startMinute: 720, endMinute: 480 }] })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_REQUEST')
  })

  it('404s a provider that does not exist, and writes nothing', async () => {
    const { app, calls } = appFor(ADMIN_USER, { providerExists: false })
    const res = await request(app)
      .patch(`/api/admin/providers/${PROVIDER_ID}/working-hours`)
      .send({ workingHours: [MORNING] })

    expect(res.status).toBe(404)
    expect(calls.deleted).toBe(0)
  })
})
