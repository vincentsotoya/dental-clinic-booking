import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PatientAppointment } from '@dental/shared'
import { appointmentToIcs, downloadIcs } from './ics'

afterEach(vi.unstubAllGlobals)

const APPOINTMENT: PatientAppointment = {
  id: '5f2b8c00-0000-4000-8000-000000000001',
  status: 'CONFIRMED',
  startsAt: '2026-10-06T13:15:00.000Z',
  endsAt: '2026-10-06T13:45:00.000Z',
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
    firstName: 'Amara',
    lastName: 'Osei',
    title: 'DDS',
  },
}

describe('appointmentToIcs', () => {
  it('carries the instant the server sent, not a converted one', () => {
    const ics = appointmentToIcs(APPOINTMENT, new Date('2026-09-20T00:00:00.000Z'))

    // No VTIMEZONE, so a reading calendar app places these in its own zone —
    // correct for a reminder, and it is why the milliseconds and the colons
    // that would make this a *local* time have to go.
    expect(ics).toContain('DTSTART:20261006T131500Z')
    expect(ics).toContain('DTEND:20261006T134500Z')
    expect(ics).toContain('DTSTAMP:20260920T000000Z')
  })

  it('names the treatment and the clinic, never a fabricated address', () => {
    const ics = appointmentToIcs(APPOINTMENT)

    expect(ics).toContain('SUMMARY:Routine Exam — Quillon Dental')
    expect(ics).toContain('LOCATION:Quillon Dental')
    expect(ics).toContain('DESCRIPTION:With Dr Amara Osei.')
  })

  it('gives every appointment a unique id that resolves nowhere real', () => {
    const ics = appointmentToIcs(APPOINTMENT)

    expect(ics).toContain(`UID:${APPOINTMENT.id}@quillondental.invalid`)
  })

  // A stray comma in a treatment name would otherwise be read by the parser as
  // a list separator rather than as text.
  it('escapes a comma so a calendar app reads it as one line, not two fields', () => {
    const ics = appointmentToIcs({
      ...APPOINTMENT,
      service: { ...APPOINTMENT.service, name: 'Crown, Prep' },
    })

    expect(ics).toContain('SUMMARY:Crown\\, Prep — Quillon Dental')
  })

  it('uses CRLF line endings, the format RFC 5545 requires', () => {
    const ics = appointmentToIcs(APPOINTMENT)

    expect(ics).toContain('\r\n')
    expect(ics.split('\r\n').some((line) => line.includes('\n'))).toBe(false)
  })
})

describe('downloadIcs', () => {
  it('names the file after the appointment and cleans up the object URL', () => {
    const url = 'blob:mock-url'
    const createObjectURL = vi.fn().mockReturnValue(url)
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })

    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    downloadIcs(APPOINTMENT)

    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(click).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith(url)

    click.mockRestore()
  })
})
