// The wire contract for the patient's own profile: phone, date of birth, and
// insurance — the schema's most sensitive fields, and the ones `me.ts`
// deliberately keeps off `/api/me` because that route is called on every cold
// load. This is the dedicated endpoint that gap named.
//
// One shape serves both directions. A PATCH here states every field, not a
// merge patch: the screen has one save button over one form, so there is
// never a field the caller means to leave alone. Clearing a field is a real
// edit and is spelled the same way everything else is — `null`.

import { z } from 'zod'
import { apiErrorCode, errorBody } from './errors'

export const PHONE_MAX_LENGTH = 30
export const INSURANCE_PROVIDER_MAX_LENGTH = 100
export const INSURANCE_MEMBER_ID_MAX_LENGTH = 50

/** Loose on purpose — a clinic records however a patient writes their own number. */
const phone = z.string().trim().max(PHONE_MAX_LENGTH, 'That number is longer than we can store').nullable()

const insuranceProvider = z
  .string()
  .trim()
  .max(INSURANCE_PROVIDER_MAX_LENGTH, 'That name is longer than we can store')
  .nullable()

const insuranceMemberId = z
  .string()
  .trim()
  .max(INSURANCE_MEMBER_ID_MAX_LENGTH, 'That id is longer than we can store')
  .nullable()

/**
 * A calendar date, never a timestamp — the schema's own `@db.Date`.
 * `z.iso.date()` already rejects `2026-02-30`; the refinement below is a loose
 * sanity check against a mistyped year, not a precise clinic-time boundary, so
 * it compares against the server's own UTC date rather than reaching for
 * `clinic-time.ts`.
 */
export const dateOfBirth = z
  .iso.date()
  .refine(
    (value) => value <= new Date().toISOString().slice(0, 10),
    'Date of birth cannot be in the future.',
  )
  .nullable()

export const patientProfile = z.object({
  phone,
  dateOfBirth,
  insuranceProvider,
  insuranceMemberId,
})

export type PatientProfile = z.infer<typeof patientProfile>

// ---------------------------------------------------------------------------
// GET /api/me/profile
// ---------------------------------------------------------------------------

export const getProfileResponse = z.object({ profile: patientProfile })

export type GetProfileResponse = z.infer<typeof getProfileResponse>

/**
 * The base four and nothing else: the route is addressed by the session, not
 * by an id in the path, so there is no stranger's row to hide behind
 * `NOT_FOUND` (same reasoning as `myAppointmentsErrorCode`).
 */
export const getProfileErrorCode = apiErrorCode.extract([
  'INVALID_REQUEST',
  'INTERNAL',
  'UNAUTHENTICATED',
  'FORBIDDEN',
])
export const getProfileError = errorBody(getProfileErrorCode)

export type GetProfileErrorCode = z.infer<typeof getProfileErrorCode>
export type GetProfileError = z.infer<typeof getProfileError>

// ---------------------------------------------------------------------------
// PATCH /api/me/profile
// ---------------------------------------------------------------------------

export const updateProfileRequest = patientProfile

export type UpdateProfileRequest = z.infer<typeof updateProfileRequest>

export const updateProfileResponse = getProfileResponse

export type UpdateProfileResponse = z.infer<typeof updateProfileResponse>

export const updateProfileErrorCode = apiErrorCode.extract([
  'INVALID_REQUEST',
  'INTERNAL',
  'UNAUTHENTICATED',
  'FORBIDDEN',
])
export const updateProfileError = errorBody(updateProfileErrorCode)

export type UpdateProfileErrorCode = z.infer<typeof updateProfileErrorCode>
export type UpdateProfileError = z.infer<typeof updateProfileError>
