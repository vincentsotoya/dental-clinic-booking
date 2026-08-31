import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { availabilityError, availabilityResponse } from '@dental/shared'
import { createApp } from '../app'
import type { AvailabilityDb } from '../services/availability-query'
import { stubAuth, stubPatientDb, stubTransaction } from '../test-support/stubs'

// No Postgres and no .env: every dependency is injected, so these tests drive
// the real routing, the real schemas and the real error mapping over a stub
// database. The DB-backed happy path is proven separately against real rows by
// `npm run db:availability`.
//
// Three of the four rejections never reach the stub at all — a bad query dies
// in Zod, and `datesInRange` throws before `findAvailability` looks a service
// up. That ordering is what makes an over-long range cheap to refuse.

const SERVICE = {
  id: '3d604f00-0000-4000-8000-000000000005',
  slug: 'routine-exam',
  name: 'Routine Exam',
  durationMins: 30,
  bufferMins: 10,
  providerType: 'DENTIST' as const,
  isActive: true,
}

/** Empty clinic by default: valid rows, no providers, therefore no slots. */
function stubDb(service: unknown = SERVICE): AvailabilityDb {
  return {
    service: { findUnique: async () => service },
    provider: { findMany: async () => [] },
    operatory: { findMany: async () => [] },
    appointment: { findMany: async () => [] },
    timeOff: { findMany: async () => [] },
    clinicClosure: { findMany: async () => [] },
  } as unknown as AvailabilityDb
}

function app(db: AvailabilityDb = stubDb()) {
  // Availability is public; the auth and booking halves of AppDeps are here
  // only because createApp mounts every router.
  const stub = { ...db, ...stubPatientDb(null) }

  return createApp({
    db: { ...stub, ...stubTransaction(stub) },
    auth: stubAuth(null),
    databaseIsReachable: async () => true,
    timeZone: 'America/New_York',
    now: () => new Date('2026-01-01T00:00:00.000Z'),
  })
}

const get = (query: string, db?: AvailabilityDb) =>
  request(app(db)).get(`/api/availability${query}`)

describe('GET /api/availability', () => {
  it('answers 200 with a body matching the shared contract', async () => {
    const res = await get('?service=routine-exam&from=2026-08-31')

    expect(res.status).toBe(200)
    expect(() => availabilityResponse.parse(res.body)).not.toThrow()
    expect(res.body.service.slug).toBe('routine-exam')
    expect(res.body.timeZone).toBe('America/New_York')
    expect(res.body.range).toEqual({ from: '2026-08-31', to: '2026-08-31' })
  })

  it('collapses a missing `to` so one date is a range of one', async () => {
    const res = await get('?service=routine-exam&from=2026-08-31&to=2026-09-02')
    expect(res.body.range).toEqual({ from: '2026-08-31', to: '2026-09-02' })
  })

  // An empty clinic is a legitimate answer, not a failure. A day with nothing
  // free must not be reported the same way as a day that does not exist.
  it('answers 200 with an empty list when nothing is bookable', async () => {
    const res = await get('?service=routine-exam&from=2026-08-31')
    expect(res.status).toBe(200)
    expect(res.body.slots).toEqual([])
    expect(res.body.providers).toEqual({})
  })

  it('refuses to let a slot list be cached', async () => {
    const res = await get('?service=routine-exam&from=2026-08-31')
    expect(res.headers['cache-control']).toBe('no-store')
  })
})

describe('GET /api/availability — rejections', () => {
  it.each([
    ['a date that does not exist', '?service=routine-exam&from=2026-02-30'],
    ['a date that is not ISO', '?service=routine-exam&from=31-08-2026'],
    ['an instant where a date belongs', '?service=routine-exam&from=2026-08-31T00:00:00Z'],
    ['a slug with spaces', '?service=routine%20exam&from=2026-08-31'],
    ['no service', '?from=2026-08-31'],
    ['no from', '?service=routine-exam'],
    ['nothing at all', ''],
  ])('400 INVALID_REQUEST for %s', async (_label, query) => {
    const res = await get(query)

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_REQUEST')
    expect(() => availabilityError.parse(res.body)).not.toThrow()
  })

  it('400 RANGE_INVERTED when the range runs backwards', async () => {
    const res = await get('?service=routine-exam&from=2026-09-05&to=2026-08-31')

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('RANGE_INVERTED')
  })

  it('400 RANGE_TOO_LONG past the booking horizon', async () => {
    const res = await get('?service=routine-exam&from=2026-08-31&to=2027-08-31')

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('RANGE_TOO_LONG')
  })

  it('404 SERVICE_NOT_FOUND for a slug nobody offers', async () => {
    const res = await get('?service=teeth-whitening&from=2026-08-31', stubDb(null))

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('SERVICE_NOT_FOUND')
  })

  // Retired, not deleted: the row survives for the appointments pointing at
  // it, and a patient simply cannot book it.
  it('404 SERVICE_NOT_FOUND for a service that is no longer offered', async () => {
    const res = await get('?service=routine-exam&from=2026-08-31', stubDb({ ...SERVICE, isActive: false }))

    expect(res.status).toBe(404)
  })

  it('500 INTERNAL without echoing the underlying failure', async () => {
    const broken = {
      service: {
        findUnique: async () => {
          throw new Error('connect ECONNREFUSED 127.0.0.1:5432')
        },
      },
    } as unknown as AvailabilityDb

    const res = await get('?service=routine-exam&from=2026-08-31', broken)

    expect(res.status).toBe(500)
    expect(res.body.error.code).toBe('INTERNAL')
    expect(res.body.error.message).not.toContain('5432')
    expect(() => availabilityError.parse(res.body)).not.toThrow()
  })
})
