import {
  bookAppointmentError,
  bookAppointmentResponse,
  cancelAppointmentError,
  cancelAppointmentResponse,
  myAppointmentsError,
  myAppointmentsResponse,
  rescheduleAppointmentError,
  rescheduleAppointmentResponse,
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
  /**
   * Rows the id-addressed routes read and write. Mutable on purpose: the
   * cancel path has to see its own UPDATE.
   */
  rows?: StubRow[]
  /** Runs inside `updateMany`, before it matches — the front desk, committing first. */
  interfere?: () => void
  /** Throw from here to stand in for a constraint rejecting the move. */
  update?: () => unknown
}

type StubRow = {
  id: string
  patientId: string
  status: string
  startsAt: Date
  [key: string]: unknown
}

/** Every column named in the WHERE clause has to match, as Postgres would. */
const matches = (row: StubRow, where: Record<string, unknown> = {}) =>
  Object.entries(where).every(([column, value]) => row[column] === value)

function stubDb(options: StubOptions = {}) {
  const writes: CreateArgs[] = []
  const reads: FindManyArgs[] = []
  const updates: unknown[] = []
  const events: { data: Record<string, unknown> }[] = []
  const rows = options.rows ?? []

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
      // Copies, not the stored objects. Prisma deserialises each read off the
      // wire, so a row already in hand does not change under a later UPDATE —
      // and the reschedule event reads its "from" values out of exactly such a
      // row after the write.
      findFirst: async (args: FindManyArgs = {}) => {
        const hit = rows.find((row) => matches(row, args.where))
        return hit ? { ...hit } : null
      },
      findUnique: async (args: FindManyArgs = {}) => {
        const hit = rows.find((row) => matches(row, args.where))
        return hit ? { ...hit } : null
      },
      updateMany: async (args: FindManyArgs & { data: Record<string, unknown> }) => {
        updates.push(args)
        options.interfere?.()
        if (options.update) return options.update() as { count: number }
        const hit = rows.filter((row) => matches(row, args.where))
        hit.forEach((row) => Object.assign(row, args.data))
        return { count: hit.length }
      },
    },
    // The log the three writing services append to, inside their transactions.
    appointmentEvent: {
      create: async (args: { data: Record<string, unknown> }) => {
        events.push(args)
        return { id: 'event_1', ...args.data }
      },
    },
  }

  return { db: { ...db, ...stubTransaction(db) }, writes, reads, rows, updates, events }
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

const HIS = '5f2b8c00-0000-4000-8000-0000000000b1'
const NAKAMURA_CHART = '3d604f00-0000-4000-8000-0000000000a2'

/** Hers, confirmed, and a month after `NOW` unless a test says otherwise. */
function row(overrides: Partial<StubRow> = {}): StubRow {
  // providerId is a column; ROW carries only the joined provider the wire sees.
  return {
    ...ROW,
    patientId: PATIENT_CHART.id,
    providerId: PROVIDER.id,
    status: 'CONFIRMED',
    ...overrides,
  }
}

function cancel(user: StubUser | null, id: string, stub = stubDb({ rows: [row()] })) {
  const app = createApp({
    db: stub.db,
    auth: stubAuth(user),
    databaseIsReachable: async () => true,
    timeZone: 'America/New_York',
    now: () => NOW,
  } as unknown as Parameters<typeof createApp>[0])

  return { res: request(app).patch(`/api/appointments/${id}/cancel`), stub }
}

describe('PATCH /api/appointments/:id/cancel', () => {
  it('cancels the row and answers 200 with the shared contract', async () => {
    const stub = stubDb({ rows: [row()] })
    const res = await cancel(PATIENT_USER, ROW.id, stub).res

    expect(res.status).toBe(200)
    expect(() => cancelAppointmentResponse.parse(res.body)).not.toThrow()
    expect(res.body.appointment.status).toBe('CANCELLED')
    expect(stub.rows[0]?.status).toBe('CANCELLED')
  })

  // The row is the only thing that moves. Cancelling must not quietly free the
  // slot by deleting it — the appointment stays, visible in the patient's list.
  it('writes only the status, and only to the row named in the URL', async () => {
    const stub = stubDb({ rows: [row()] })
    await cancel(PATIENT_USER, ROW.id, stub).res

    expect(stub.updates).toEqual([
      { where: { id: ROW.id, status: 'CONFIRMED' }, data: { status: 'CANCELLED' } },
    ])
  })

  // A double tap and a retried request both asked for the state the row is
  // already in, and got it. Reporting a conflict would be a lie.
  it('is idempotent, and does not write a second time', async () => {
    const stub = stubDb({ rows: [row()] })
    const first = await cancel(PATIENT_USER, ROW.id, stub).res
    const second = await cancel(PATIENT_USER, ROW.id, stub).res

    expect([first.status, second.status]).toEqual([200, 200])
    expect(second.body.appointment.status).toBe('CANCELLED')
    expect(stub.updates).toHaveLength(1)
  })

  it('409s an appointment the clinic has already closed out', async () => {
    for (const status of ['COMPLETED', 'NO_SHOW']) {
      const stub = stubDb({ rows: [row({ status })] })
      const res = await cancel(PATIENT_USER, ROW.id, stub).res

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('NOT_CANCELLABLE')
      expect(() => cancelAppointmentError.parse(res.body)).not.toThrow()
      expect(stub.updates).toHaveLength(0)
    }
  })

  // Cancelling backwards would rewrite what happened, and would let a patient
  // erase a no-show in the window before the clinic records one.
  it('409s an appointment that has already started', async () => {
    const startsAt = new Date(NOW.getTime() - 60_000)
    const stub = stubDb({ rows: [row({ startsAt })] })
    const res = await cancel(PATIENT_USER, ROW.id, stub).res

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('NOT_CANCELLABLE')
    expect(res.body.error.message).toContain('already started')
  })

  // The race this route is shaped around: the front desk marks it COMPLETED
  // between the read and the write, so the UPDATE's WHERE clause matches
  // nothing and the patient's cancellation does not overwrite that judgement.
  it('loses to a status written between the read and the update', async () => {
    const rows = [row()]
    const stub = stubDb({
      rows,
      interfere: () => {
        rows[0]!.status = 'COMPLETED'
      },
    })
    const res = await cancel(PATIENT_USER, ROW.id, stub).res

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('NOT_CANCELLABLE')
    expect(res.body.error.message).toContain('already taken place')
    expect(stub.rows[0]?.status).toBe('COMPLETED')
  })

  it('404s another patient’s appointment, and a missing one identically', async () => {
    const stranger = await cancel(PATIENT_USER, HIS, stubDb({
      rows: [row({ id: HIS, patientId: NAKAMURA_CHART })],
    })).res
    const missing = await cancel(PATIENT_USER, HIS, stubDb({ rows: [] })).res

    expect(stranger.status).toBe(404)
    expect(stranger.body).toEqual(missing.body)
  })

  it('does not write to a row it answered 404 for', async () => {
    const stub = stubDb({ rows: [row({ id: HIS, patientId: NAKAMURA_CHART })] })
    await cancel(PATIENT_USER, HIS, stub).res

    expect(stub.updates).toHaveLength(0)
    expect(stub.rows[0]?.status).toBe('CONFIRMED')
  })

  // The front desk cancelling for a patient on the phone — the guard's one
  // branch, and the only reason an admin gets past a chart-scoped lookup.
  it('lets an admin cancel a patient’s appointment', async () => {
    const stub = stubDb({ chart: null, rows: [row({ id: HIS, patientId: NAKAMURA_CHART })] })
    const res = await cancel(ADMIN_USER, HIS, stub).res

    expect(res.status).toBe(200)
    expect(stub.rows[0]?.status).toBe('CANCELLED')
  })

  it('refuses a stranger with 401', async () => {
    const res = await cancel(null, ROW.id).res

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
  })

  it('400s a malformed id', async () => {
    const res = await cancel(PATIENT_USER, 'not-a-uuid').res

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_REQUEST')
  })

  it('never sends the room or the blocked range', async () => {
    const res = await cancel(PATIENT_USER, ROW.id).res

    expect(res.body.appointment).not.toHaveProperty('operatoryId')
    expect(res.body.appointment).not.toHaveProperty('blockedUntil')
    expect(res.body.appointment).not.toHaveProperty('patientId')
  })
})

/** 08:15 EDT the same Monday — on the grid, inside the provider's morning. */
const MOVED_TO = '2026-08-31T12:15:00.000Z'

function reschedule(
  user: StubUser | null,
  id: string,
  body: object = { providerId: PROVIDER.id, startsAt: MOVED_TO },
  stub = stubDb({ rows: [row()] }),
) {
  const app = createApp({
    db: stub.db,
    auth: stubAuth(user),
    databaseIsReachable: async () => true,
    timeZone: 'America/New_York',
    now: () => NOW,
  } as unknown as Parameters<typeof createApp>[0])

  return { res: request(app).patch(`/api/appointments/${id}/reschedule`).send(body), stub }
}

describe('PATCH /api/appointments/:id/reschedule', () => {
  it('moves the row and answers 200 with the same id at the new time', async () => {
    const stub = stubDb({ rows: [row()] })
    const res = await reschedule(PATIENT_USER, ROW.id, undefined, stub).res

    expect(res.status).toBe(200)
    expect(() => rescheduleAppointmentResponse.parse(res.body)).not.toThrow()
    expect(res.body.appointment.id).toBe(ROW.id)
    expect(res.body.appointment.startsAt).toBe(MOVED_TO)
    expect(res.body.appointment.status).toBe('CONFIRMED')
  })

  // Without this the row blocks its own move: its own buffer covers the slot it
  // is moving into, so 09:00 could never shift to 09:15 for its own provider.
  it('asks the engine to compute as if this appointment were not booked', async () => {
    const stub = stubDb({ rows: [row()] })
    await reschedule(PATIENT_USER, ROW.id, undefined, stub).res

    expect(stub.reads[0]?.where?.id).toEqual({ not: ROW.id })
  })

  it('derives every time from the engine and never rewrites the service', async () => {
    const stub = stubDb({ rows: [row()] })
    const body = { providerId: PROVIDER.id, startsAt: MOVED_TO, service: 'root-canal' }
    await reschedule(PATIENT_USER, ROW.id, body, stub).res

    const written = (stub.updates[0] as { data: Record<string, unknown> }).data
    expect(written).not.toHaveProperty('serviceId')
    expect((written.endsAt as Date).toISOString()).toBe('2026-08-31T12:45:00.000Z')
    expect((written.blockedUntil as Date).toISOString()).toBe('2026-08-31T12:55:00.000Z')
    // Re-snapshotted with the buffer that produced that blockedUntil, or the
    // CHECK constraint would reject the row (ADR-0004).
    expect(written.bufferMins).toBe(SERVICE.bufferMins)
  })

  it('keeps the status in the WHERE clause, as cancel does', async () => {
    const stub = stubDb({ rows: [row()] })
    await reschedule(PATIENT_USER, ROW.id, undefined, stub).res

    expect((stub.updates[0] as { where: unknown }).where).toEqual({
      id: ROW.id,
      status: 'CONFIRMED',
    })
  })

  it('409s SLOT_UNAVAILABLE for a time outside working hours', async () => {
    const stub = stubDb({ rows: [row()] })
    const body = { providerId: PROVIDER.id, startsAt: '2026-08-31T20:00:00.000Z' }
    const res = await reschedule(PATIENT_USER, ROW.id, body, stub).res

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('SLOT_UNAVAILABLE')
    expect(() => rescheduleAppointmentError.parse(res.body)).not.toThrow()
    expect(stub.updates).toHaveLength(0)
  })

  // Moving it would revive a slot the clinic released, without ever passing
  // back through booking.
  it('409s a cancelled appointment rather than reviving it', async () => {
    const stub = stubDb({ rows: [row({ status: 'CANCELLED' })] })
    const res = await reschedule(PATIENT_USER, ROW.id, undefined, stub).res

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('NOT_RESCHEDULABLE')
    expect(res.body.error.message).toContain('cancelled')
  })

  it.each(['COMPLETED', 'NO_SHOW'])('409s a %s appointment', async (status) => {
    const stub = stubDb({ rows: [row({ status })] })
    const res = await reschedule(PATIENT_USER, ROW.id, undefined, stub).res

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('NOT_RESCHEDULABLE')
    expect(stub.updates).toHaveLength(0)
  })

  it('409s an appointment that has already started', async () => {
    const stub = stubDb({ rows: [row({ startsAt: new Date(NOW.getTime() - 60_000) })] })
    const res = await reschedule(PATIENT_USER, ROW.id, undefined, stub).res

    expect(res.status).toBe(409)
    expect(res.body.error.message).toContain('already started')
  })

  // A move loses the same race a booking does, and to a booking: both end up as
  // one index entry on one operatory.
  it('409s SLOT_TAKEN when the constraint rejects the move', async () => {
    const stub = stubDb({
      rows: [row()],
      update: () => {
        throw Object.assign(new Error('Database error.'), {
          code: 'P2039',
          meta: { driverAdapterError: { cause: { code: '23P01' } } },
        })
      },
    })
    const res = await reschedule(PATIENT_USER, ROW.id, undefined, stub).res

    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('SLOT_TAKEN')
  })

  it('lets an unrelated database failure stay a 500', async () => {
    const stub = stubDb({
      rows: [row()],
      update: () => {
        throw Object.assign(new Error('nope'), {
          code: 'P2002',
          meta: { driverAdapterError: { cause: { code: '23505' } } },
        })
      },
    })
    const res = await reschedule(PATIENT_USER, ROW.id, undefined, stub).res

    expect(res.status).toBe(500)
    expect(res.body.error.code).toBe('INTERNAL')
  })

  it('404s another patient row, and does not move it', async () => {
    const original = new Date(ROW.startsAt)
    const stub = stubDb({ rows: [row({ id: HIS, patientId: NAKAMURA_CHART })] })
    const res = await reschedule(PATIENT_USER, HIS, undefined, stub).res

    expect(res.status).toBe(404)
    expect(stub.updates).toHaveLength(0)
    expect(stub.rows[0]?.startsAt).toEqual(original)
  })

  it('refuses a stranger with 401 before it looks at the body', async () => {
    const res = await reschedule(null, ROW.id, { nonsense: true }).res

    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
  })

  it('400s a malformed body and names the field', async () => {
    const body = { providerId: 'not-a-uuid', startsAt: MOVED_TO }
    const res = await reschedule(PATIENT_USER, ROW.id, body).res

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_REQUEST')
    expect(res.body.error.message).toContain('providerId')
  })
})

// The log is append-only and written inside each service's transaction, so
// these assert on what the three writing routes appended, not on a read route:
// nothing serves events yet. `npm run db:events` runs the same claims against
// real rows, where the transaction is a real one.
describe('the appointment event log', () => {
  it('records a booking, with the times it landed on', async () => {
    const stub = stubDb()
    await post(PATIENT_USER, VALID, stub.db)

    expect(stub.events).toHaveLength(1)
    expect(stub.events[0]?.data).toMatchObject({
      appointmentId: APPOINTMENT_ID,
      type: 'BOOKED',
      toStatus: 'CONFIRMED',
      actorUserId: PATIENT_USER.id,
      actorRole: 'PATIENT',
    })
  })

  it('records a cancellation as a status change', async () => {
    const stub = stubDb({ rows: [row()] })
    await cancel(PATIENT_USER, ROW.id, stub).res

    expect(stub.events[0]?.data).toMatchObject({
      appointmentId: ROW.id,
      type: 'CANCELLED',
      fromStatus: 'CONFIRMED',
      toStatus: 'CANCELLED',
    })
  })

  // Asking twice is 200 both times and changes nothing, so it must not leave
  // two cancellations in a log that is supposed to say what happened.
  it('does not log the second, idempotent cancellation', async () => {
    const stub = stubDb({ rows: [row()] })
    await cancel(PATIENT_USER, ROW.id, stub).res
    await cancel(PATIENT_USER, ROW.id, stub).res

    expect(stub.events).toHaveLength(1)
  })

  // The event this table exists for: no status changed, and the time it moved
  // from is now recorded nowhere else.
  it('records a move with both halves of the change', async () => {
    const stub = stubDb({ rows: [row()] })
    await reschedule(PATIENT_USER, ROW.id, undefined, stub).res

    expect(stub.events[0]?.data).toMatchObject({
      appointmentId: ROW.id,
      type: 'RESCHEDULED',
      fromStartsAt: ROW.startsAt,
      fromProviderId: PROVIDER.id,
      toProviderId: PROVIDER.id,
    })
    expect((stub.events[0]?.data.toStartsAt as Date).toISOString()).toBe(MOVED_TO)
    expect(stub.events[0]?.data.toStatus).toBeUndefined()
  })

  // The front desk acting for a patient is the case the actor column exists to
  // tell apart: the chart is the patient's, the login is the admin's.
  it('names the admin, not the patient, when the front desk acts', async () => {
    const stub = stubDb({ chart: null, rows: [row({ id: HIS, patientId: NAKAMURA_CHART })] })
    await cancel(ADMIN_USER, HIS, stub).res

    expect(stub.events[0]?.data).toMatchObject({
      actorUserId: ADMIN_USER.id,
      actorRole: 'ADMIN',
    })
  })

  it('writes nothing when the change was refused', async () => {
    const completed = stubDb({ rows: [row({ status: 'COMPLETED' })] })
    await cancel(PATIENT_USER, ROW.id, completed).res

    const stranger = stubDb({ rows: [row({ id: HIS, patientId: NAKAMURA_CHART })] })
    await reschedule(PATIENT_USER, HIS, undefined, stranger).res

    expect(completed.events).toHaveLength(0)
    expect(stranger.events).toHaveLength(0)
  })
})
