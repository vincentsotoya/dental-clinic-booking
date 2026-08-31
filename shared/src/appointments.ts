// The wire contract for `POST /api/appointments`.
//
// WHAT THE CLIENT IS TRUSTED WITH
//
// Three fields, and every one of them is a choice the patient actually made: a
// service, a provider, a start time. Everything else about the row — who it
// belongs to, when treatment ends, how long the room stays blocked, which room
// it is — is derived by the server from those three plus the session.
//
// That is not defensive habit, it is the difference between a contract and a
// suggestion. `endsAt` is `startsAt` plus the service's duration; a body that
// could name its own would book a ninety-minute crown into a fifteen-minute
// gap, and no database constraint would object, because the exclusion
// constraints police overlap, not honesty about duration.

import { z } from 'zod'
import { providerType, serviceSlug } from './availability'
import { apiErrorCode, errorBody } from './errors'

/** Mirrors the schema's `AppointmentStatus`. No PENDING — booking is immediate. */
export const appointmentStatus = z.enum(['CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'])

export type AppointmentStatus = z.infer<typeof appointmentStatus>

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

/**
 * One slot the patient picked out of `GET /api/availability`.
 *
 * No `patientId`: the chart comes from the session, never the body — the same
 * rule that keeps `role` out of a signup body. An admin booking on someone
 * else's behalf is Phase 7 and will be a different route, not a field here.
 *
 * No `operatoryId` either, though availability sends one. The room is not the
 * patient's choice (CONTEXT.md), and letting the body name it would turn a
 * display detail into an input. The server re-picks it, which also means a
 * patient whose offered room was taken in the meantime still gets their time
 * in whatever room is free rather than a pointless 409.
 */
export const bookAppointmentRequest = z.object({
  service: serviceSlug,
  providerId: z.uuid(),
  /** Must equal an offered slot's `startsAt` exactly; the server re-derives the rest. */
  startsAt: z.iso.datetime(),
  /** "I'm nervous about the drill." Free text for the clinic, capped so it cannot be a payload. */
  notes: z.string().max(500).optional(),
})

export type BookAppointmentRequest = z.infer<typeof bookAppointmentRequest>

// ---------------------------------------------------------------------------
// Response
// ---------------------------------------------------------------------------

/**
 * The booked appointment, named well enough to render a confirmation without a
 * second round trip.
 *
 * No `blockedUntil` and no operatory. Turnover time and which chair the clinic
 * cleans are its business, not the patient's — their appointment runs
 * `startsAt` to `endsAt`, and sending more would invite a UI to show it.
 */
export const bookedAppointment = z.object({
  id: z.uuid(),
  status: appointmentStatus,
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  notes: z.string().nullable(),
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
})

export const bookAppointmentResponse = z.object({ appointment: bookedAppointment })

export type BookedAppointment = z.infer<typeof bookedAppointment>
export type BookAppointmentResponse = z.infer<typeof bookAppointmentResponse>

/**
 * Every code this endpoint can produce.
 *
 * `NOT_FOUND` is absent and that is the point of declaring these per endpoint:
 * nothing here is addressed by an id the caller supplies, so there is no
 * stranger's row to hide. Cancel and reschedule will list it; this one cannot.
 *
 * `SERVICE_NOT_FOUND` and `SLOT_UNAVAILABLE` are both "no", and are still
 * separate: one is a slug the clinic has never heard of, which means the client
 * is broken, and the other is a real service at a time that is not on offer,
 * which means the patient's slot list went stale.
 */
export const bookAppointmentErrorCode = apiErrorCode.extract([
  'INVALID_REQUEST',
  'INTERNAL',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'SERVICE_NOT_FOUND',
  'SLOT_UNAVAILABLE',
  'SLOT_TAKEN',
])

export const bookAppointmentError = errorBody(bookAppointmentErrorCode)

export type BookAppointmentErrorCode = z.infer<typeof bookAppointmentErrorCode>
export type BookAppointmentError = z.infer<typeof bookAppointmentError>
