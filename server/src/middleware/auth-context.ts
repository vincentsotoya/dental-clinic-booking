// What the session middleware attaches, and the only two ways to read it back.
//
// `req.auth` is three-valued — undefined means no middleware ran, null means
// nobody is signed in — and the accessors below throw INTERNAL on the first.
// Why that distinction is worth the extra state: see ADR-0008.

import type { Role } from '@dental/shared'
import type { Request } from 'express'
import { ApiError } from '../errors'

/** The caller, resolved once per request. Handlers scope by `patientId` — ADR-0007. */
export type SessionContext = {
  user: {
    id: string
    email: string
    firstName: string
    lastName: string
    role: Role
  }
  /** Null for an admin, and in the ADR-0007 window where a login has no chart. */
  patientId: string | null
}

declare global {
  namespace Express {
    interface Request {
      auth?: SessionContext | null
    }
  }
}

function assertMiddlewareRan(req: Request): void {
  if (req.auth === undefined) {
    throw new ApiError(
      'INTERNAL',
      'Route read the session without attachSession or requireAuth in front of it.',
    )
  }
}

/** For a route that serves anonymous callers too. `/api/me` is the only one today. */
export function getSession(req: Request): SessionContext | null {
  assertMiddlewareRan(req)
  return req.auth ?? null
}

/** For a route behind `requireAuth`. No session here means a missing guard, so it is a 500. */
export function getAuth(req: Request): SessionContext {
  assertMiddlewareRan(req)

  if (!req.auth) {
    throw new ApiError('INTERNAL', 'Route read an authenticated session without requireAuth.')
  }

  return req.auth
}

/**
 * The caller's own chart, for a route that is only meaningful against one.
 *
 * An admin has no chart, and nor does a login in ADR-0007's gap where signup
 * created one and the hook failed. Both are `FORBIDDEN` rather than an empty
 * answer: "you have no appointments" is a different claim from "this kind of
 * account cannot have any", and only one of them is true.
 *
 * FORBIDDEN does not contradict ADR-0007 either — no id was supplied, so there
 * is no row being probed for and nothing for an honest status to leak.
 */
export function getChartId(req: Request): string {
  const { patientId } = getAuth(req)

  if (!patientId) {
    throw new ApiError('FORBIDDEN', 'This account has no patient chart.')
  }

  return patientId
}
