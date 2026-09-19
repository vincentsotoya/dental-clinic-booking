// The wire contract for `GET /api/admin/appointments` — the clinic's own read
// of the schedule, not a patient's.
//
// A third projection of the appointment row, for a third audience.
// `appointments.ts`'s `patientAppointment` answers "what is mine"; this
// answers "what is happening this day or week", across every patient, which
// is exactly what the patient projection may not say. The room is part of
// that answer too — which chair is busy is the point of a day view, unlike a
// patient's own booking, where CONTEXT.md keeps it off the wire entirely.
//
// Guarded by role, not by ownership: nothing here is addressed by an id
// belonging to one patient, so `requireRole('ADMIN')` is the whole guard —
// there is no "mine" for `requireOwnership` to compare against (ADR-0007).

import { z } from 'zod'
import { appointmentStatus } from './appointments'
import { isoDateToClinicDate, providerType } from './availability'
import { apiErrorCode, errorBody } from './errors'

/**
 * `?from=2026-09-21&to=2026-09-27`. `to` collapses to `from`, so a single day
 * is `?from=…` alone — the day view's whole query, and the same shape
 * availability's own range takes.
 */
export const adminAppointmentsQuery = z
  .object({ from: isoDateToClinicDate, to: isoDateToClinicDate.optional() })
  .transform((query) => ({ from: query.from, to: query.to ?? query.from }))

export type AdminAppointmentsQuery = z.infer<typeof adminAppointmentsQuery>

export const adminAppointment = z.object({
  id: z.uuid(),
  status: appointmentStatus,
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  /** "I'm nervous about the drill." The front desk's reason to read it; a patient's own reason to write it. */
  notes: z.string().nullable(),
  patient: z.object({ id: z.uuid(), firstName: z.string(), lastName: z.string() }),
  service: z.object({
    id: z.uuid(),
    slug: z.string(),
    name: z.string(),
    durationMins: z.int().positive(),
  }),
  provider: z.object({
    id: z.uuid(),
    type: providerType,
    firstName: z.string(),
    lastName: z.string(),
    title: z.string().nullable(),
  }),
  operatory: z.object({ id: z.uuid(), name: z.string() }),
})

export type AdminAppointment = z.infer<typeof adminAppointment>

/**
 * Every status is included, cancelled and completed alike, the same reasoning
 * `myAppointmentsResponse` already carries: a front desk that cannot see a
 * cancellation happened concludes the clinic lost it, not that it was
 * handled. Chronological, ties broken by provider id — availability's own
 * convention, for the same reason: deterministic without being arbitrary.
 */
export const adminAppointmentsResponse = z.object({
  range: z.object({ from: z.iso.date(), to: z.iso.date() }),
  /** Echoed so the client groups and labels days without hardcoding the clinic's zone. */
  timeZone: z.string(),
  appointments: z.array(adminAppointment),
})

export type AdminAppointmentsResponse = z.infer<typeof adminAppointmentsResponse>

export const adminAppointmentsErrorCode = apiErrorCode.extract([
  'INVALID_REQUEST',
  'INTERNAL',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'RANGE_INVERTED',
  'RANGE_TOO_LONG',
])

export const adminAppointmentsError = errorBody(adminAppointmentsErrorCode)

export type AdminAppointmentsErrorCode = z.infer<typeof adminAppointmentsErrorCode>
export type AdminAppointmentsError = z.infer<typeof adminAppointmentsError>

// ---------------------------------------------------------------------------
// PATCH /api/admin/appointments/:id/close
//
// One route for both outcomes rather than two: `appointments.ts` already
// frames `COMPLETED` and `NO_SHOW` together as "the clinic's judgements about
// what happened", and a two-value `outcome` excludes `CONFIRMED`/`CANCELLED`
// by type, the same job a runtime check would otherwise do twice.

export const appointmentOutcome = z.enum(['COMPLETED', 'NO_SHOW'])

export type AppointmentOutcome = z.infer<typeof appointmentOutcome>

export const closeAppointmentRequest = z.object({ outcome: appointmentOutcome })

export type CloseAppointmentRequest = z.infer<typeof closeAppointmentRequest>

/** The same appointment, closed out — same `id`, so the calendar row updates in place. */
export const closeAppointmentResponse = z.object({ appointment: adminAppointment })

export type CloseAppointmentResponse = z.infer<typeof closeAppointmentResponse>

/**
 * `NOT_CLOSEABLE` is one code for every refusal about the appointment's own
 * state — cancelled, too early, already closed the other way — following
 * `NOT_CANCELLABLE`'s own precedent: which one it was belongs in the message.
 */
export const closeAppointmentErrorCode = apiErrorCode.extract([
  'INVALID_REQUEST',
  'INTERNAL',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'NOT_CLOSEABLE',
])

export const closeAppointmentError = errorBody(closeAppointmentErrorCode)

export type CloseAppointmentErrorCode = z.infer<typeof closeAppointmentErrorCode>
export type CloseAppointmentError = z.infer<typeof closeAppointmentError>
