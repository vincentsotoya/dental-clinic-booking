// The API's error vocabulary, and the one envelope it travels in.
//
// WHY THIS IS NOT JUST A BIGGER ENUM
//
// Every failure under `/api/` comes back as `{ error: { code, message } }` —
// one shape, `INTERNAL` included, so a client parses a single thing rather
// than a happy path, an error path, and a third thing for when the server
// falls over. The code is what a client switches on; prose is for humans and
// changes without warning.
//
// But "one envelope" must not become "one enum". If auth codes were added to
// `availabilityErrorCode`, the availability contract would declare it can
// return `FORBIDDEN` — false, and a client would still have to handle the
// case. So the vocabulary lives here as one registry, and each endpoint
// declares the subset it can actually produce.
//
// `.extract()` is what makes that safe: it is a compile-time proof that a
// subset is drawn from the registry, so an invented or misspelled code fails
// the build here rather than escaping into a route.
//
// `/api/auth/*` is outside all of this — it speaks Better Auth's dialect, and
// the seam is the URL prefix. See docs/adr/0006.

import { z } from 'zod'

export const apiErrorCode = z.enum([
  // Any endpoint, whatever it does.
  /** A request that failed its schema — query string or body, the caller's fault either way. */
  'INVALID_REQUEST',
  /** A bug or an outage. Always carries a fixed message; the real one can name a table. */
  'INTERNAL',

  // Any endpoint behind a guard.
  'UNAUTHENTICATED',
  'FORBIDDEN',
  /** Nothing here *for you* — a stranger's row and a deleted row are the same answer. ADR-0007. */
  'NOT_FOUND',

  // Availability.
  'SERVICE_NOT_FOUND',
  'RANGE_INVERTED',
  'RANGE_TOO_LONG',

  // Booking. Two codes because the client does two different things with them.
  /** The time is not on offer at all — closed, too soon, no such provider. Refetch. */
  'SLOT_UNAVAILABLE',
  /** It was on offer and somebody else took it first. Refetch and say so. */
  'SLOT_TAKEN',

  // Acting on an appointment that is no longer in the state the caller thinks.
  /** Already over, or the clinic has closed it out. The message says which. */
  'NOT_CANCELLABLE',
])

export type ApiErrorCode = z.infer<typeof apiErrorCode>

/** What any endpoint can produce. The floor every other set is built on. */
export const baseErrorCode = apiErrorCode.extract(['INVALID_REQUEST', 'INTERNAL'])

/**
 * The floor plus what a route behind `requireAuth` adds.
 *
 * Spelled out rather than spread from `baseErrorCode.options` so the members
 * stay literal types and `.extract` can check every one of them.
 */
export const guardedErrorCode = apiErrorCode.extract([
  'INVALID_REQUEST',
  'INTERNAL',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
])

export type BaseErrorCode = z.infer<typeof baseErrorCode>
export type GuardedErrorCode = z.infer<typeof guardedErrorCode>

/**
 * The envelope, narrowed to one endpoint's codes.
 *
 * A function rather than a single exported schema so the shape is written once
 * while each endpoint still gets a type that refuses codes it cannot return.
 */
export function errorBody<C extends z.ZodEnum<Record<string, ApiErrorCode>>>(code: C) {
  return z.object({
    error: z.object({
      code,
      message: z.string(),
    }),
  })
}

/** The permissive form: any code the API can produce. For a client's catch-all parse. */
export const apiError = errorBody(apiErrorCode)

export type ApiErrorBody = z.infer<typeof apiError>
