import {
  bookAppointmentError,
  bookAppointmentResponse,
  myAppointmentsError,
  myAppointmentsResponse,
} from '@dental/shared'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../app'
import {
  ADMIN_USER,
  PATIENT_CHART,
  PATIENT_USER,
  stubAuth,
  stubPatientDb,
  stubTransaction,
  type StubUser,
} from '../test-support/stubs'

// No Postgres and no .env. A stub cannot enforce an exclusion constraint, so
// the race itself is proven against real rows by `npm run db:booking`; what
// these tests hold down is everything around it — the guard, the contract, and
// the fact that the row written comes from the engine and not from the body.

const SERVICE = {
  id: '3d604f00-0000-4000-8000-000000000005',
  slug: 'routine-exam',
  name: 'Routine Exam',
  durationMins: 30,
  bufferMins: 10,
  providerType: 'DENTIST' as const,
  isActive: true,
}

const PROVIDER = {
  id: '1b4e2d00-0000-4000-8000-000000000001',
  type: 'DENTIST' as const,
  firstName: 'Alice',
  lastName: 'Okonkwo',
  title: 'DDS',
  // Morning only, so the afternoon is provably not on offer.
  workingHours: [{ weekday: 'MONDAY' as const, startMinute: 480, endMinute: 720 }],
}

const OPERATORY = { id: '7a9c1e00-0000-4000-8000-000000000001', name: 'Operatory 1' }

const APPOINTMENT_ID = '5f2b8c00-0000-4000-8000-000000000001'

/** 2026-08-31 is a Monday; 08:00 EDT is 12:00Z, the first slot of that day. */
const FIRST_SLOT = '2026-08-31T12:00:00.000Z'

/** Well before the booked day, so the lead-time cutoff never hides a slot. */
const NOW = new Date('2026-08-01T00:00:00.000Z')

type CreateArgs = { data: Record<string, unknown> }

type FindManyArgs = { where?: Record<string, unknown>; orderBy?: Record<string, unknown> }

type StubOptions = {
  /** Throw from here to stand in for a constraint rejecting the insert. */
  create?: () => unknown
  service?: unknown
  /** Null models a login with no chart — an admin, or ADR-0007's gap. */
  chart?: typeof PATIENT_CHART | null
  /** What the list route reads back. The booking path wants this empty. */
  appointments?: unknown[]
}

function stubDb(options: StubOptions = {}) {
  const writes: CreateArgs[] = []
  const reads: FindManyArgs[] = []

  const db = {
    ...stubPatientDb(options.chart === undefined ? PATIENT_CHART : options.chart),
    service: { findUnique: async () => (options.service === undefined ? SERVICE : options.service) },
    provider: { findMany: async () => [PROVIDER] },
    operatory: { findMany: async () => [OPERATORY] },
    timeOff: { findMany: async () => [] },
    clinicClosure: { findMany: async () => [] },
    appointment: {
      findMany: async (args: FindManyArgs = {}) => {
        reads.push(args)
        return options.appointments ?? []
      },
      create: async (args: CreateArgs) => {
        writes.push(args)
        if (options.create) return options.create()
        return {
          id: APPOINTMENT_ID,
          startsAt: args.data.startsAt,
          endsAt: args.data.endsAt,
          notes: args.data.notes ?? null,
        }
      },
    },
  }

  return { db: { ...db, ...stubTransaction(db) }, writes, reads }
}

function post(user: StubUser | null, body: object, db: ReturnType<typeof stubDb>['db'] = stubDb().db) {
  const app = createApp({
    db,
    auth: stubAuth(user),
    databaseIsReachable: async () => true,
    timeZone: 'America/New_York',
    now: () => NOW,
  } as unknown as Parameters<typeof createApp>[0])

  return request(app).post('/api/appointments').send(body)
}

const VALID = { service: 'routine-exam', providerId: PROVIDER.id, startsAt: FIRST_SLOT }

describe('POST /api/appointments', () => {
  it('books the slot and answers 201 with the shared contract', async () => {
    const res = await post(PATIENT_USER, VALID)

    expect(res.status).toBe(201)
    expect(() => bookAppointmentResponse.parse(res.body)).not.toThrow()
    expect(res.body.appointment.id).toBe(APPOINTMENT_ID)
    expect(res.body.appointment.status).toBe('CONFIRMED')
    expect(res.body.appointment.startsAt).toBe(FIRST_SLOT)
    expect(res.body.appointment.provider.lastName).toBe('Okonkwo')
  })

  it('derives the chart, the room and every derived time from the server', async () => {
    const stub = stubDb()
    const body = { ...VALID, patientId: 'someone-else', operatoryId: 'a-nicer-room' }
    await post(PATIENT_USER, body, stub.db)

    const written = stub.writes[0]?.data
    expect(written?.patientId).toBe(PATIENT_CHART.id)
    expect(written?.operatoryId).toBe(OPERATORY.id)
    // 08:00 plus 30 minutes of treatment, then plus a 10-minute buffer.
    expect((written?.endsAt as Date).toISOString()).toBe('2026-08-31T12:30:00.000Z')
    expect((written?.blockedUntil as Date).toISOString()).toBe('2026-08-31T12:40:00.000Z')
    expect(written?.bufferMins).toBe(10)
  })

  it('refuses a stranger with 401 before it looks at the body', async () => {
    const res = await post(null, { nonsense: true })

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
  })

  // An admin has no chart of their own. Booking on a patient's behalf is a
  // Phase 7 route with a patient id in it, not a field on this one.
  it('refuses a signed-in account with no chart with 403', async () => {
    const res = await post(ADMIN_USER, VALID, stubDb({ chart: null }).db)

    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
  })

  it('rejects a malformed body with 400 and names the field', async () => {
    const res = await post(PATIENT_USER, { ...VALID, providerId: 'not-a-uuid' })

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_REQUEST')
    expect(res.body.error.message).toContain('providerId')
  })

  it('rejects notes longer than the cap', async () => {
    const res = await post(PATIENT_USER, { ...VALID, notes: 'x'.repeat(501) })

    expect(res.status).toBe(400)
    expect(res.body.error.message).toContain('notes')
  })

  it('answers 404 for a service the clinic does not offer', async () => {
    const res = await post(PATIENT_USER, VALID, stubDb({ service: null }).db)

    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('SERVICE_NOT_FOUND')
  })

  // Postgres would take this row without complaint — the exclusion constraints
  // know nothing about lunch. The re-check is the only thing in front of it.
  it('answers 409 SLOT_UNAVAILABLE for a time outside working hours', async () => {
    const res = await post(PATIENT_USER, { ...VALID, startsAt: '2026-08-31T20:00:00.000Z' })

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('SLOT_UNAVAILABLE')
    expect(() => bookAppointmentError.parse(res.body)).not.toThrow()
  })

  it('answers 409 SLOT_UNAVAILABLE for a provider who was never offered it', async () => {
    const providerId = '1b4e2d00-0000-4000-8000-00000000ffff'
    const res = await post(PATIENT_USER, { ...VALID, providerId })

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('SLOT_UNAVAILABLE')
  })

  // The loser of the race. The error shape is the one Prisma really produces —
  // booking.test.ts pins it against the recorded original.
  it('answers 409 SLOT_TAKEN when the exclusion constraint rejects the insert', async () => {
    const conflict = Object.assign(new Error('Database error.'), {
      code: 'P2039',
      meta: { driverAdapterError: { cause: { code: '23P01' } } },
    })

    const stub = stubDb({
      create: () => {
        throw conflict
      },
    })
    const res = await post(PATIENT_USER, VALID, stub.db)

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('SLOT_TAKEN')
    expect(() => bookAppointmentError.parse(res.body)).not.toThrow()
  })

  // A 409 promises that retrying might work. Another database failure does not,
  // and must not be dressed up as one.
  it('lets an unrelated database failure stay a 500', async () => {
    const stub = stubDb({
      create: () => {
        throw Object.assign(new Error('unique violation'), {
          code: 'P2002',
          meta: { driverAdapterError: { cause: { code: '23505' } } },
        })
      },
    })
    const res = await post(PATIENT_USER, VALID, stub.db)

    expect(res.status).toBe(500)
    expect(res.body.error.code).toBe('INTERNAL')
    expect(res.body.error.message).toBe('Something went wrong.')
  })
})

const ROW = {
  id: '5f2b8c00-0000-4000-8000-0000000000a1',
  status: 'CONFIRMED',
  startsAt: new Date('2026-09-01T14:15:00.000Z'),
  endsAt: new Date('2026-09-01T14:45:00.000Z'),
  notes: null,
  service: { id: SERVICE.id, slug: SERVICE.slug, name: SERVICE.name, durationMins: 30 },
  provider: {
    id: PROVIDER.id,
    type: PROVIDER.type,
    firstName: PROVIDER.firstName,
    lastName: PROVIDER.lastName,
    title: PROVIDER.title,
  },
}

function list(user: StubUser | null, query = '', db = stubDb({ appointments: [ROW] })) {
  const app = createApp({
    db: db.db,
    auth: stubAuth(user),
    databaseIsReachable: async () => true,
    timeZone: 'America/New_York',
    now: () => NOW,
  } as unknown as Parameters<typeof createApp>[0])

  return { res: request(app).get(`/api/appointments/me${query}`), db }
}

describe('GET /api/appointments/me', () => {
  it('answers 200 with a body matching the shared contract', async () => {
    const res = await list(PATIENT_USER).res

    expect(res.status).toBe(200)
    expect(() => myAppointmentsResponse.parse(res.body)).not.toThrow()
    expect(res.body.appointments).toHaveLength(1)
    expect(res.body.appointments[0].id).toBe(ROW.id)
    expect(res.body.appointments[0].provider.lastName).toBe('Okonkwo')
  })

  // The property ADR-0007 is about: a stranger's row is never in the answer,
  // rather than filtered out of it afterwards.
  it('puts the caller’s chart id in the WHERE clause', async () => {
    const stub = list(PATIENT_USER)
    await stub.res

    expect(stub.db.reads[0]?.where?.patientId).toBe(PATIENT_CHART.id)
  })

  it('defaults to upcoming, soonest first', async () => {
    const stub = list(PATIENT_USER)
    const res = await stub.res

    expect(res.body.when).toBe('upcoming')
    expect(stub.db.reads[0]?.where?.startsAt).toEqual({ gte: NOW })
    expect(stub.db.reads[0]?.orderBy).toEqual({ startsAt: 'asc' })
  })

  it('flips the bound and the order for past', async () => {
    const stub = list(PATIENT_USER, '?when=past')
    const res = await stub.res

    expect(res.body.when).toBe('past')
    expect(stub.db.reads[0]?.where?.startsAt).toEqual({ lt: NOW })
    expect(stub.db.reads[0]?.orderBy).toEqual({ startsAt: 'desc' })
  })

  it('drops the time bound entirely for all, keeping the chart scope', async () => {
    const stub = list(PATIENT_USER, '?when=all')
    await stub.res

    expect(stub.db.reads[0]?.where).toEqual({ patientId: PATIENT_CHART.id })
  })

  // A patient who cancelled yesterday and sees no trace of it concludes the
  // clinic lost it, not that the cancellation worked.
  it('includes cancelled and completed rows', async () => {
    const rows = [
      { ...ROW, status: 'CANCELLED' },
      { ...ROW, id: '5f2b8c00-0000-4000-8000-0000000000a2', status: 'COMPLETED' },
    ]
    const res = await list(PATIENT_USER, '?when=all', stubDb({ appointments: rows })).res

    expect(res.status).toBe(200)
    expect(res.body.appointments.map((a: { status: string }) => a.status)).toEqual([
      'CANCELLED',
      'COMPLETED',
    ])
  })

  it('never sends the room or the blocked range', async () => {
    const res = await list(PATIENT_USER).res

    expect(res.body.appointments[0]).not.toHaveProperty('operatoryId')
    expect(res.body.appointments[0]).not.toHaveProperty('blockedUntil')
  })

  it('rejects a window it does not offer with 400', async () => {
    const res = await list(PATIENT_USER, '?when=someday').res

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_REQUEST')
    expect(() => myAppointmentsError.parse(res.body)).not.toThrow()
  })

  it('refuses a stranger with 401', async () => {
    const res = await list(null).res

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
  })

  // "You have no appointments" and "this account cannot have any" are different
  // claims, and only one of them is true for an admin.
  it('refuses an account with no chart with 403, not an empty list', async () => {
    const stub = list(ADMIN_USER, '', stubDb({ chart: null, appointments: [ROW] }))
    const res = await stub.res

    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('FORBIDDEN')
    expect(stub.db.reads).toHaveLength(0)
  })
})
