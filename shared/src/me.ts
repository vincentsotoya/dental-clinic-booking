// The wire contract for `GET /api/me`.
//
// Both halves are nullable and mean different things: `user: null` is nobody
// signed in; a user with `patient: null` is a login that owns no chart — an
// admin, or the ADR-0007 window — and so cannot book. See ADR-0008.

import { z } from 'zod'
import { baseErrorCode, errorBody } from './errors'
import { ROLES } from './roles'

/** `id` is a plain string: Better Auth mints its own ids and never promises UUIDs (ADR-0006). */
export const meUser = z.object({
  id: z.string().min(1),
  email: z.email(),
  firstName: z.string(),
  lastName: z.string(),
  role: z.enum(ROLES),
})

/**
 * Identity only, by decision. Date of birth, phone and insurance are the schema's
 * most sensitive fields and belong to Phase 6's profile endpoint — this route is
 * called on every cold load.
 */
export const mePatient = z.object({
  // Ours, so unlike `meUser.id` it really is a UUID.
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.email(),
})

export const meResponse = z.object({
  user: meUser.nullable(),
  patient: mePatient.nullable(),
})

/**
 * No input and no guard, so `INVALID_REQUEST` and `INTERNAL` are all this route can
 * honestly return — saying so stops a client writing a `FORBIDDEN` branch.
 */
export const meError = errorBody(baseErrorCode)

export type MeUser = z.infer<typeof meUser>
export type MePatient = z.infer<typeof mePatient>
export type MeResponse = z.infer<typeof meResponse>
