// The wire contract for `/api/admin/closures` and `/api/admin/closures/:id`
// — the clinic's own record of when the whole practice is shut
// (schema.prisma's `ClinicClosure`, CONTEXT.md).
//
// The same shape `time-off.ts` already argued for `TimeOff`: stored as two
// `timestamptz` columns because that is what the availability engine
// subtracts against, but CONTEXT.md's own word for it is "a dated range", so
// this contract carries `fromDate`/`toDate` and never an instant. The one
// difference from time off is that nothing here is scoped to a provider —
// the whole clinic closes at once, so there is no id to 404 a GET against.
//
// Guarded by role, not by ownership — nothing here is addressed by "mine".

import { z } from 'zod'
import { isoDateToClinicDate } from './availability'
import { apiErrorCode, errorBody } from './errors'

/** `{year, month, day}` as one comparable number — for range order only, never displayed. */
const ordinal = (date: { year: number; month: number; day: number }): number =>
  date.year * 10_000 + date.month * 100 + date.day

export const closureRange = z.object({
  id: z.uuid(),
  fromDate: z.iso.date(),
  toDate: z.iso.date(),
  /** "Staff training day." Free text, the same length limit `notes` carries. */
  reason: z.string().max(500).nullable(),
})

export type ClosureRange = z.infer<typeof closureRange>

// ---------------------------------------------------------------------------
// GET /api/admin/closures
// ---------------------------------------------------------------------------

export const getClosuresResponse = z.object({ closures: z.array(closureRange) })

export type GetClosuresResponse = z.infer<typeof getClosuresResponse>

export const getClosuresErrorCode = apiErrorCode.extract([
  'INVALID_REQUEST',
  'INTERNAL',
  'UNAUTHENTICATED',
  'FORBIDDEN',
])
export const getClosuresError = errorBody(getClosuresErrorCode)

export type GetClosuresErrorCode = z.infer<typeof getClosuresErrorCode>
export type GetClosuresError = z.infer<typeof getClosuresError>

// ---------------------------------------------------------------------------
// POST /api/admin/closures
// ---------------------------------------------------------------------------

export const createClosureRequest = z
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
 * `CreateClosureRequestInput` for that.
 */
export type CreateClosureRequest = z.infer<typeof createClosureRequest>

/** What a client actually sends: the raw ISO dates, before the transform. */
export type CreateClosureRequestInput = z.input<typeof createClosureRequest>

export const createClosureResponse = z.object({ closure: closureRange })

export type CreateClosureResponse = z.infer<typeof createClosureResponse>

export const createClosureErrorCode = apiErrorCode.extract([
  'INVALID_REQUEST',
  'INTERNAL',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  /** Overlaps a CONFIRMED appointment, any provider. The message says how many. */
  'CLOSURE_CONFLICT',
])
export const createClosureError = errorBody(createClosureErrorCode)

export type CreateClosureErrorCode = z.infer<typeof createClosureErrorCode>
export type CreateClosureError = z.infer<typeof createClosureError>

// ---------------------------------------------------------------------------
// DELETE /api/admin/closures/:id
// ---------------------------------------------------------------------------

export const deleteClosureResponse = z.object({ id: z.uuid() })

export type DeleteClosureResponse = z.infer<typeof deleteClosureResponse>

export const deleteClosureErrorCode = apiErrorCode.extract([
  'INVALID_REQUEST',
  'INTERNAL',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
])
export const deleteClosureError = errorBody(deleteClosureErrorCode)

export type DeleteClosureErrorCode = z.infer<typeof deleteClosureErrorCode>
export type DeleteClosureError = z.infer<typeof deleteClosureError>
