import { describe, expect, it } from 'vitest'
import { adminAppointment, adminAppointmentsError, adminAppointmentsQuery } from './admin'

const APPOINTMENT = {
  id: '5f2b8c00-0000-4000-8000-000000000001',
  status: 'CONFIRMED',
  startsAt: '2026-09-21T13:00:00.000Z',
  endsAt: '2026-09-21T13:30:00.000Z',
  notes: null,
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

describe('adminAppointmentsQuery', () => {
  it('collapses a single day to from = to', () => {
    const parsed = adminAppointmentsQuery.parse({ from: '2026-09-21' })
    expect(parsed).toEqual({
      from: { year: 2026, month: 9, day: 21 },
      to: { year: 2026, month: 9, day: 21 },
    })
  })

  it('accepts an explicit range', () => {
    const parsed = adminAppointmentsQuery.parse({ from: '2026-09-21', to: '2026-09-27' })
    expect(parsed.to).toEqual({ year: 2026, month: 9, day: 27 })
  })

  it('rejects a date that does not exist', () => {
    expect(adminAppointmentsQuery.safeParse({ from: '2026-02-30' }).success).toBe(false)
  })
})

describe('adminAppointment', () => {
  it('carries the patient and the room, which the patient-facing contract withholds', () => {
    expect(adminAppointment.safeParse(APPOINTMENT).success).toBe(true)
  })

  it('refuses a row with no patient identity', () => {
    const { patient, ...withoutPatient } = APPOINTMENT
    void patient
    expect(adminAppointment.safeParse(withoutPatient).success).toBe(false)
  })
})

describe('adminAppointmentsErrorCode', () => {
  it('has no NOT_FOUND — nothing here is addressed by an id', () => {
    const body = { error: { code: 'NOT_FOUND', message: 'x' } }
    expect(adminAppointmentsError.safeParse(body).success).toBe(false)
  })

  it('accepts the range codes availability also produces', () => {
    const body = { error: { code: 'RANGE_TOO_LONG', message: 'x' } }
    expect(adminAppointmentsError.safeParse(body).success).toBe(true)
  })
})
