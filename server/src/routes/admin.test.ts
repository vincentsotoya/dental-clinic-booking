import { adminAppointmentsError, adminAppointmentsResponse } from '@dental/shared'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../app'
import { ADMIN_USER, PATIENT_USER, stubAuth, type StubUser } from '../test-support/stubs'

// No Postgres. What a stub cannot prove — the range really is one indexed
// read, and Postgres really groups a row under the civil day it starts on —
// is `npm run db:admin-appointments`'s job.

const ROW = {
  id: '5f2b8c00-0000-4000-8000-000000000001',
  status: 'CONFIRMED',
  startsAt: new Date('2026-09-21T12:00:00.000Z'),
  endsAt: new Date('2026-09-21T13:00:00.000Z'),
  notes: 'Nervous about the drill.',
  patient: { id: '2c5f3e00-0000-4000-8000-000000000001', firstName: 'Elena', lastName: 'Marsh' },
  service: {
    id: '3d604f00-0000-4000-8000-000000000005',
    slug: 'routine-cleaning',
    name: 'Routine Cleaning',
    durationMins: 60,
  },
  provider: {
    id: '1b4e2d00-0000-4000-8000-000000000004',
    type: 'HYGIENIST',
    firstName: 'Naomi',
    lastName: 'Clarke',
    title: 'RDH',
  },
  operatory: { id: '0a3d1c00-0000-4000-8000-000000000001', name: 'Operatory 1' },
}

function appFor(user: StubUser | null, rows: unknown[] = [ROW]) {
  const reads: unknown[] = []

  const app = createApp({
    db: {
      appointment: {
        findMany: async (args: unknown) => {
          reads.push(args)
          return rows
        },
      },
      // Unused by this route; only here because AppDeps and requireAuth's own
      // session resolution ask for it (the latter to learn there is no chart).
      service: { findUnique: async () => null },
      patient: { findUnique: async () => null },
    },
    auth: stubAuth(user),
    databaseIsReachable: async () => true,
    timeZone: 'America/New_York',
  } as unknown as Parameters<typeof createApp>[0])

  return { app, reads }
}

describe('GET /api/admin/appointments', () => {
  it('refuses a stranger', async () => {
    const { app } = appFor(null)
    const res = await request(app).get('/api/admin/appointments?from=2026-09-21')
    expect(res.status).toBe(401)
  })

  it('refuses a signed-in patient — this is not their row to read', async () => {
    const { app } = appFor(PATIENT_USER)
    const res = await request(app).get('/api/admin/appointments?from=2026-09-21')
    expect(res.status).toBe(403)
  })

  it('answers an admin with the fields a patient-facing route withholds', async () => {
    const { app } = appFor(ADMIN_USER)
    const res = await request(app).get('/api/admin/appointments?from=2026-09-21')

    expect(res.status).toBe(200)
    expect(() => adminAppointmentsResponse.parse(res.body)).not.toThrow()
    expect(res.body.appointments[0]).toMatchObject({
      patient: { firstName: 'Elena', lastName: 'Marsh' },
      operatory: { name: 'Operatory 1' },
    })
  })

  it('is not cached — the clinic’s own schedule is as volatile as a patient’s', async () => {
    const { app } = appFor(ADMIN_USER)
    const res = await request(app).get('/api/admin/appointments?from=2026-09-21')
    expect(res.headers['cache-control']).toBe('no-store')
  })

  it('collapses a single day: `to` defaults to `from`', async () => {
    const { app, reads } = appFor(ADMIN_USER)
    await request(app).get('/api/admin/appointments?from=2026-09-21')

    expect(reads).toHaveLength(1)
    const where = (reads[0] as { where: { startsAt: { gte: Date; lt: Date } } }).where
    // A calendar day in America/New_York: 04:00Z opens it, the next day's
    // 04:00Z closes it, both correct on either side of a DST boundary.
    expect(where.startsAt.gte.toISOString()).toBe('2026-09-21T04:00:00.000Z')
    expect(where.startsAt.lt.toISOString()).toBe('2026-09-22T04:00:00.000Z')
  })

  it('refuses a range that ends before it starts', async () => {
    const { app } = appFor(ADMIN_USER)
    const res = await request(app).get('/api/admin/appointments?from=2026-09-27&to=2026-09-21')

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('RANGE_INVERTED')
    expect(() => adminAppointmentsError.parse(res.body)).not.toThrow()
  })

  it('refuses a range past the ceiling', async () => {
    const { app } = appFor(ADMIN_USER)
    const res = await request(app).get('/api/admin/appointments?from=2026-01-01&to=2026-12-31')

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('RANGE_TOO_LONG')
  })

  it('rejects a malformed date the same way every other route does', async () => {
    const { app } = appFor(ADMIN_USER)
    const res = await request(app).get('/api/admin/appointments?from=not-a-date')

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_REQUEST')
  })
})
