// The wire contract for `/api/admin/providers/:providerId/time-off` and
// `/api/admin/time-off/:id` — the clinic's own record of when one provider is
// unavailable (schema.prisma's `TimeOff`, CONTEXT.md).
//
// `TimeOff` is stored as two `timestamptz` columns because that is what the
// availability engine subtracts against, but CONTEXT.md's own word for it is
// "a dated range" — so this contract never asks the client for an instant.
// `fromDate`/`toDate` are whole clinic-zone civil days, inclusive on both
// ends; the server resolves them to instants and back at the boundary, the
// same layering `admin.ts`'s `from`/`to` already uses. An admin who happens to
// be in a different timezone from the clinic never has to think about that.
//
// Guarded by role, not by ownership: nothing here is addressed by "mine", the
// same shape `working-hours.ts` already uses.

import { z } from 'zod'
import { isoDateToClinicDate } from './availability'
import { apiErrorCode, errorBody } from './errors'

/** `{year, month, day}` as one comparable number — for range order only, never displayed. */
const ordinal = (date: { year: number; month: number; day: number }): number =>
  date.year * 10_000 + date.month * 100 + date.day

export const timeOffRange = z.object({
  id: z.uuid(),
  providerId: z.uuid(),
  fromDate: z.iso.date(),
  toDate: z.iso.date(),
  /** "Continuing education." Free text, the same length limit `notes` carries. */
  reason: z.string().max(500).nullable(),
})

export type TimeOffRange = z.infer<typeof timeOffRange>

// ---------------------------------------------------------------------------
// GET /api/admin/providers/:providerId/time-off
// ---------------------------------------------------------------------------

export const getTimeOffResponse = z.object({
  providerId: z.uuid(),
  timeOff: z.array(timeOffRange),
})

export type GetTimeOffResponse = z.infer<typeof getTimeOffResponse>

export const getTimeOffErrorCode = apiErrorCode.extract([
  'INVALID_REQUEST',
  'INTERNAL',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
])
export const getTimeOffError = errorBody(getTimeOffErrorCode)

export type GetTimeOffErrorCode = z.infer<typeof getTimeOffErrorCode>
export type GetTimeOffError = z.infer<typeof getTimeOffError>

// ---------------------------------------------------------------------------
// POST /api/admin/providers/:providerId/time-off
// ---------------------------------------------------------------------------

export const createTimeOffRequest = z
  .object({
    fromDate: isoDateToClinicDate,
    toDate: isoDateToClinicDate,
    reason: z.string().max(500).optional(),
  })
  .refine((input) => ordinal(input.toDate) >= ordinal(input.fromDate), {
    message: 'A range must end on or after the day it starts.',
    path: ['toDate'],
  })

/**
 * The *parsed* shape — `fromDate`/`toDate` as `ClinicDate`, what the server
 * works with once `.parse()` has run. Not what travels over the wire; see
 * `CreateTimeOffRequestInput` for that.
 */
export type CreateTimeOffRequest = z.infer<typeof createTimeOffRequest>

/** What a client actually sends: the raw ISO dates, before the transform. */
export type CreateTimeOffRequestInput = z.input<typeof createTimeOffRequest>

export const createTimeOffResponse = z.object({ timeOff: timeOffRange })

export type CreateTimeOffResponse = z.infer<typeof createTimeOffResponse>

export const createTimeOffErrorCode = apiErrorCode.extract([
  'INVALID_REQUEST',
  'INTERNAL',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  /** Overlaps a CONFIRMED appointment for this provider. The message says how many. */
  'TIME_OFF_CONFLICT',
])
export const createTimeOffError = errorBody(createTimeOffErrorCode)

export type CreateTimeOffErrorCode = z.infer<typeof createTimeOffErrorCode>
export type CreateTimeOffError = z.infer<typeof createTimeOffError>

// ---------------------------------------------------------------------------
// DELETE /api/admin/time-off/:id
// ---------------------------------------------------------------------------

export const deleteTimeOffResponse = z.object({ id: z.uuid() })

export type DeleteTimeOffResponse = z.infer<typeof deleteTimeOffResponse>

export const deleteTimeOffErrorCode = getTimeOffErrorCode
export const deleteTimeOffError = getTimeOffError

export type DeleteTimeOffErrorCode = GetTimeOffErrorCode
export type DeleteTimeOffError = GetTimeOffError
