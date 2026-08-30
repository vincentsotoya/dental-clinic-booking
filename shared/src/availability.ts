// The wire contract for `GET /api/availability`.
//
// WHAT A SCHEMA IS FOR HERE
//
// Not just "reject bad input". These schemas are where the two hard parts of
// this endpoint are pinned down in one place both sides import:
//
//   1. A query parameter is a string. `from=2026-08-31` has to become the
//      civil date {2026, 8, 31} without ever becoming an instant on the way —
//      `new Date('2026-08-31')` is UTC midnight, which is the previous evening
//      in the clinic's zone, and that is the exact bug clinic-time.ts exists
//      to prevent. The transform below produces calendar components and no
//      Date at all.
//
//   2. A slot's times are instants and are serialised as UTC ISO strings, but
//      the *day a patient sees them under* is a civil date in the clinic's
//      zone. Deriving one from the other needs the zone and Intl. The server
//      knows the zone, so it does that once and sends `date` alongside; the
//      client groups by a string and does no timezone arithmetic ever.

import { z } from 'zod'

/**
 * A civil date — no time, no zone, no instant.
 *
 * Structurally identical to the server's `ClinicDate` on purpose rather than
 * imported from it: `shared` must not depend on `server`, and structural
 * typing means the compiler still checks the two agree.
 */
export const clinicDate = z.object({
  year: z.int(),
  month: z.int().min(1).max(12),
  day: z.int().min(1).max(31),
})

export type ClinicDate = z.infer<typeof clinicDate>

/**
 * `2026-08-31` as calendar components.
 *
 * `z.iso.date()` already rejects `2026-02-30` and accepts `2024-02-29`, so the
 * split below is only ever splitting a date that exists.
 */
export const isoDateToClinicDate = z.iso.date().transform((value): ClinicDate => {
  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  return { year, month, day }
})

/** The inverse, for building a response. */
export function toIsoDate(date: ClinicDate): string {
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`
}

export const providerType = z.enum(['DENTIST', 'HYGIENIST'])

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

/** Matches the `slug` column: lowercase words joined by single hyphens. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * `?service=routine-exam&from=2026-08-31&to=2026-09-05`
 *
 * `to` is optional and collapses to `from`, so a single day is `?from=…` with
 * nothing else — the common case for a patient picking a date, and the easiest
 * thing to type into curl.
 *
 * The range is NOT bounded here even though `MAX_AVAILABILITY_DAYS` exists.
 * That limit is clinic policy and lives in the server's config; duplicating
 * the number in a schema the client also imports would give it two homes and
 * one day two values. `findAvailability` rejects an over-long range with
 * `RANGE_TOO_LONG`, and the route maps that to a 400.
 */
export const availabilityQuery = z
  .object({
    service: z.string().regex(SLUG, 'Not a service slug.'),
    from: isoDateToClinicDate,
    to: isoDateToClinicDate.optional(),
  })
  .transform((query) => ({
    serviceSlug: query.service,
    from: query.from,
    to: query.to ?? query.from,
  }))

export type AvailabilityQuery = z.infer<typeof availabilityQuery>

// ---------------------------------------------------------------------------
// Response
// ---------------------------------------------------------------------------

/**
 * Who the patient would be seeing. Sent as a keyed map rather than repeated on
 * every slot: a week of a popular service is hundreds of slots and three
 * providers, and the name would otherwise be on the wire hundreds of times.
 */
export const availabilityProvider = z.object({
  id: z.uuid(),
  type: providerType,
  firstName: z.string(),
  lastName: z.string(),
  /** "DDS", "RDH". Absent for a provider who has none. */
  title: z.string().nullable(),
})

export const availabilityService = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  durationMins: z.int().positive(),
  bufferMins: z.int().nonnegative(),
  providerType,
})

/**
 * One bookable start time.
 *
 * All three timestamps are UTC ISO strings. `endsAt` and `blockedUntil` are
 * derived from `startsAt` and the service, and are sent anyway: the client
 * shows `startsAt`–`endsAt` as the appointment length without re-deriving it,
 * and Phase 4 posts back the exact range it was offered rather than
 * recomputing one that might differ.
 *
 * No operatory *name*. The room is never something the patient chooses
 * (CONTEXT.md), so only the id travels — enough for Phase 4 to write the row,
 * nothing for a UI to be tempted to render.
 */
export const availabilitySlot = z.object({
  /** The clinic-zone civil date this slot falls on. Group by this, never by parsing `startsAt`. */
  date: z.iso.date(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  blockedUntil: z.iso.datetime(),
  providerId: z.uuid(),
  operatoryId: z.uuid(),
})

export const availabilityResponse = z.object({
  service: availabilityService,
  /** Echoed so the client can label the results without trusting its own request state. */
  timeZone: z.string(),
  range: z.object({ from: z.iso.date(), to: z.iso.date() }),
  /** Every provider referenced by a slot, keyed by id. */
  providers: z.record(z.uuid(), availabilityProvider),
  /** Chronological, ties broken by provider id — the order the engine returns. */
  slots: z.array(availabilitySlot),
})

export type AvailabilityProvider = z.infer<typeof availabilityProvider>
export type AvailabilityService = z.infer<typeof availabilityService>
export type AvailabilitySlot = z.infer<typeof availabilitySlot>
export type AvailabilityResponse = z.infer<typeof availabilityResponse>

/**
 * The error body for a rejected query, and the codes that produce it.
 *
 * The code is what the client switches on — an unknown slug and a range that
 * is too long are both 400-ish to a browser but say very different things to a
 * user, and neither should be distinguished by matching on prose.
 */
export const availabilityErrorCode = z.enum([
  'SERVICE_NOT_FOUND',
  'RANGE_INVERTED',
  'RANGE_TOO_LONG',
  'INVALID_QUERY',
])

export const availabilityError = z.object({
  error: z.object({
    code: availabilityErrorCode,
    message: z.string(),
  }),
})

export type AvailabilityErrorCode = z.infer<typeof availabilityErrorCode>
export type AvailabilityError = z.infer<typeof availabilityError>
