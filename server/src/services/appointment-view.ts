// The one projection of an appointment a patient may see, and the one place its
// instants become strings.
//
// Three callers now — book, list, cancel — and a fourth written by hand would
// be a fourth chance to put the room or the blocked range on the wire.

import type { PatientAppointment } from '@dental/shared'

/** Turnover time and which chair the clinic cleans are its business, not the patient's. */
export const PATIENT_APPOINTMENT_SELECT = {
  id: true,
  status: true,
  startsAt: true,
  endsAt: true,
  notes: true,
  service: { select: { id: true, slug: true, name: true, durationMins: true } },
  provider: { select: { id: true, type: true, firstName: true, lastName: true, title: true } },
} as const

/** What that select returns: the contract, with the two instants still Dates. */
export type AppointmentRow = Omit<PatientAppointment, 'startsAt' | 'endsAt'> & {
  startsAt: Date
  endsAt: Date
}

export function toPatientAppointment(row: AppointmentRow): PatientAppointment {
  return { ...row, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString() }
}
