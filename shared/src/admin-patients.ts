// The wire contract for `GET /api/admin/patients` — the front desk's way to
// find a patient, and the door the clinical records (Phase 8) are reached
// through.
//
// A fourth projection of a person, for the narrowest audience yet: enough to
// tell two people apart and pick one, nothing more. Phone, date of birth and
// insurance stay off the list and are read on the per-patient page, the same
// "sensitive fields get their own route" reasoning `profile.ts` gives.
//
// Search is the server's job. A directory that ships every patient's name to
// the browser and filters there discloses the whole list on every load.

import { z } from 'zod'
import { apiErrorCode, errorBody } from './errors'

/** A page is a cap, not a cursor: a longer list is answered by narrowing the search. */
export const PATIENT_DIRECTORY_PAGE_SIZE = 25

export const PATIENT_SEARCH_MAX_LENGTH = 100

/**
 * `?q=elena marsh`. Absent or blank is "no search": the first page,
 * alphabetically. Each whitespace-separated word must match somewhere in the
 * name or email, so "elena marsh" finds Elena Marsh and not every Elena.
 */
export const adminPatientsQuery = z
  .object({ q: z.string().max(PATIENT_SEARCH_MAX_LENGTH).optional() })
  .transform((query) => ({ q: (query.q ?? '').trim() }))

export type AdminPatientsQuery = z.infer<typeof adminPatientsQuery>

export const adminPatient = z.object({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  /** Contact detail, not identity — see `Patient.email` in schema.prisma. */
  email: z.string(),
  /** False for a chart the clinic keeps for someone who never registered. */
  hasAccount: z.boolean(),
})

export type AdminPatient = z.infer<typeof adminPatient>

/** Alphabetical by surname, then first name; ties broken by id so the order is stable. */
export const adminPatientsResponse = z.object({
  patients: z.array(adminPatient),
  /** More matched than fit on the page. The client says so instead of implying this is everyone. */
  truncated: z.boolean(),
})

export type AdminPatientsResponse = z.infer<typeof adminPatientsResponse>

export const adminPatientsErrorCode = apiErrorCode.extract([
  'INVALID_REQUEST',
  'INTERNAL',
  'UNAUTHENTICATED',
  'FORBIDDEN',
])

export const adminPatientsError = errorBody(adminPatientsErrorCode)

export type AdminPatientsErrorCode = z.infer<typeof adminPatientsErrorCode>
export type AdminPatientsError = z.infer<typeof adminPatientsError>
