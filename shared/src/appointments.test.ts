import { describe, expect, it } from 'vitest'
import {
  bookAppointmentError,
  bookAppointmentRequest,
  bookAppointmentResponse,
  cancelAppointmentError,
  cancelAppointmentResponse,
  myAppointmentsError,
  myAppointmentsQuery,
  myAppointmentsResponse,
} from './appointments'

const VALID = {
  service: 'routine-exam',
  providerId: '1b4e2d00-0000-4000-8000-000000000001',
  startsAt: '2026-09-01T14:15:00.000Z',
}

const APPOINTMENT = {
  id: '5f2b8c00-0000-4000-8000-000000000001',
  status: 'CONFIRMED',
  startsAt: '2026-09-01T14:15:00.000Z',
  endsAt: '2026-09-01T14:45:00.000Z',
  notes: null,
  service: {
    id: '3d604f00-0000-4000-8000-000000000005',
    slug: 'routine-exam',
    name: 'Routine Exam',
    durationMins: 30,
  },
  provider: {
    id: '1b4e2d00-0000-4000-8000-000000000001',
    type: 'DENTIST',
    firstName: 'Alice',
    lastName: 'Okonkwo',
    title: 'DDS',
  },
}

describe('bookAppointmentRequest', () => {
  it('accepts a slug, a provider and an instant', () => {
    expect(bookAppointmentRequest.safeParse(VALID).success).toBe(true)
  })

  // The server derives these; a body that could name them could book a
  // ten-minute crown or pick its own room.
  it('drops anything the caller is not trusted with', () => {
    const parsed = bookAppointmentRequest.parse({
      ...VALID,
      patientId: '2c5f3e00-0000-4000-8000-000000000001',
      operatoryId: '7a9c1e00-0000-4000-8000-000000000001',
      endsAt: '2026-09-01T14:20:00.000Z',
      status: 'COMPLETED',
    })

    expect(parsed).toEqual(VALID)
  })

  it('requires an instant, not a civil date', () => {
    expect(bookAppointmentRequest.safeParse({ ...VALID, startsAt: '2026-09-01' }).success).toBe(
      false,
    )
  })

  // A UUID is itself a well-formed slug, so this rejects shape, not identity —
  // an id that is not a service simply fails the lookup with SERVICE_NOT_FOUND.
  it.each(['Routine-Exam', 'routine exam', 'routine--exam', '-routine', 'routine_exam', ''])(
    'rejects %o as a slug',
    (service) => {
      expect(bookAppointmentRequest.safeParse({ ...VALID, service }).success).toBe(false)
    },
  )

  it('caps notes', () => {
    expect(bookAppointmentRequest.safeParse({ ...VALID, notes: 'x'.repeat(500) }).success).toBe(true)
    expect(bookAppointmentRequest.safeParse({ ...VALID, notes: 'x'.repeat(501) }).success).toBe(
      false,
    )
  })
})

describe('bookAppointmentResponse', () => {
  it('accepts the confirmation the route sends', () => {
    expect(bookAppointmentResponse.safeParse({ appointment: APPOINTMENT }).success).toBe(true)
  })

  // Turnover time and which chair gets cleaned are the clinic's business.
  it('has nowhere to put blockedUntil or an operatory', () => {
    const parsed = bookAppointmentResponse.parse({
      appointment: { ...APPOINTMENT, blockedUntil: '2026-09-01T14:55:00.000Z', operatoryId: 'x' },
    })

    expect(parsed.appointment).not.toHaveProperty('blockedUntil')
    expect(parsed.appointment).not.toHaveProperty('operatoryId')
  })
})

describe('bookAppointmentError', () => {
  it.each(['SLOT_TAKEN', 'SLOT_UNAVAILABLE', 'SERVICE_NOT_FOUND', 'FORBIDDEN', 'UNAUTHENTICATED'])(
    'admits %s',
    (code) => {
      expect(bookAppointmentError.safeParse({ error: { code, message: 'x' } }).success).toBe(true)
    },
  )

  // Nothing here is addressed by an id the caller supplies, so there is no
  // stranger's row to hide behind a 404. Cancel and reschedule will list it.
  it('does not admit NOT_FOUND', () => {
    expect(bookAppointmentError.safeParse({ error: { code: 'NOT_FOUND', message: 'x' } }).success)
      .toBe(false)
  })

  it('does not admit an availability range code', () => {
    expect(
      bookAppointmentError.safeParse({ error: { code: 'RANGE_TOO_LONG', message: 'x' } }).success,
    ).toBe(false)
  })
})

describe('myAppointmentsQuery', () => {
  // The screen opens on it, and it is the one window bounded by reality.
  it('defaults to upcoming when the client says nothing', () => {
    expect(myAppointmentsQuery.parse({})).toEqual({ when: 'upcoming' })
  })

  it.each(['upcoming', 'past', 'all'])('accepts %s', (when) => {
    expect(myAppointmentsQuery.safeParse({ when }).success).toBe(true)
  })

  it('rejects a window it does not offer', () => {
    expect(myAppointmentsQuery.safeParse({ when: 'someday' }).success).toBe(false)
    expect(myAppointmentsQuery.safeParse({ when: '' }).success).toBe(false)
  })
})

describe('myAppointmentsResponse', () => {
  it('echoes the window back alongside the rows', () => {
    const parsed = myAppointmentsResponse.parse({ when: 'past', appointments: [APPOINTMENT] })

    expect(parsed.when).toBe('past')
    expect(parsed.appointments).toHaveLength(1)
  })

  it('accepts an empty list — having none is a real answer', () => {
    expect(
      myAppointmentsResponse.safeParse({ when: 'upcoming', appointments: [] }).success,
    ).toBe(true)
  })

  it.each(['CANCELLED', 'COMPLETED', 'NO_SHOW'])('carries a %s row', (status) => {
    const body = { when: 'all', appointments: [{ ...APPOINTMENT, status }] }
    expect(myAppointmentsResponse.safeParse(body).success).toBe(true)
  })
})

describe('cancelAppointmentResponse', () => {
  it('sends back one appointment, cancelled', () => {
    const body = { appointment: { ...APPOINTMENT, status: 'CANCELLED' } }
    expect(cancelAppointmentResponse.safeParse(body).success).toBe(true)
  })
})

describe('cancelAppointmentErrorCode', () => {
  // The first contract here addressed by a caller-supplied id, so the first
  // that can hide a stranger's row behind a 404 (ADR-0007).
  it.each(['NOT_FOUND', 'NOT_CANCELLABLE', 'FORBIDDEN', 'UNAUTHENTICATED'])(
    'admits %s',
    (code) => {
      expect(cancelAppointmentError.safeParse({ error: { code, message: 'x' } }).success).toBe(true)
    },
  )

  // Nothing here is booking a time, so neither refusal about one belongs.
  it.each(['SLOT_TAKEN', 'SLOT_UNAVAILABLE', 'SERVICE_NOT_FOUND'])('does not admit %s', (code) => {
    expect(cancelAppointmentError.safeParse({ error: { code, message: 'x' } }).success).toBe(false)
  })
})

describe('myAppointmentsErrorCode', () => {
  it.each(['UNAUTHENTICATED', 'FORBIDDEN', 'INVALID_REQUEST', 'INTERNAL'])('admits %s', (code) => {
    expect(myAppointmentsError.safeParse({ error: { code, message: 'x' } }).success).toBe(true)
  })

  // Addressed by the session, not by an id, so nothing can be probed for.
  it.each(['NOT_FOUND', 'SLOT_TAKEN', 'SERVICE_NOT_FOUND'])('does not admit %s', (code) => {
    expect(myAppointmentsError.safeParse({ error: { code, message: 'x' } }).success).toBe(false)
  })
})
