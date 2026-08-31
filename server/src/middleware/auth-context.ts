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
