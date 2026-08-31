// The guards. Resolving a session and enforcing one are separate, so `/api/me`
// can answer a stranger while every other route refuses them — see ADR-0008.

import type { Role } from '@dental/shared'
import { fromNodeHeaders } from 'better-auth/node'
import type { Request, RequestHandler } from 'express'
import type { PrismaClient } from '../../generated/prisma/client'
import type { Auth } from '../auth'
import { ApiError } from '../errors'
import { getAuth, type SessionContext } from './auth-context'

/**
 * The slice of Better Auth this app needs, named like `AvailabilityDb`.
 * `import type` keeps `auth.ts` — and so `env.ts` — out of the test path.
 */
export type AuthLike = Pick<Auth, 'handler' | 'api'>

export type AuthDeps = {
  auth: AuthLike
  db: Pick<PrismaClient, 'patient'>
}

export type AuthMiddleware = {
  attachSession: RequestHandler
  requireAuth: RequestHandler
  requireRole: (...roles: Role[]) => RequestHandler
}

export function createAuthMiddleware(deps: AuthDeps): AuthMiddleware {
  const { auth, db } = deps

  // The only call to Better Auth's session API. The second round trip is the
  // price of ADR-0006: the library will not join our tables.
  async function resolve(req: Request): Promise<SessionContext | null> {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) })

    if (!session) return null

    const patient = await db.patient.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })

    return {
      user: {
        id: session.user.id,
        email: session.user.email,
        firstName: session.user.firstName,
        lastName: session.user.lastName,
        role: session.user.role as Role,
      },
      patientId: patient?.id ?? null,
    }
  }

  const attachSession: RequestHandler = async (req, _res, next) => {
    // Explicitly null, never left undefined. Express 5 forwards the rejection
    // if `resolve` throws, so an unreachable session store is a 500 rather
    // than a silent downgrade to anonymous.
    req.auth = await resolve(req)
    next()
  }

  const requireAuth: RequestHandler = async (req, _res, next) => {
    req.auth = await resolve(req)

    if (!req.auth) {
      next(new ApiError('UNAUTHENTICATED', 'Sign in to continue.'))
      return
    }

    next()
  }

  /** Role only. Whether a row belongs to the caller is scoping — ADR-0007. */
  const requireRole =
    (...roles: Role[]): RequestHandler =>
    async (req, res, next) => {
      // Composed, so a role can never be checked on an unresolved request.
      await requireAuth(req, res, (error?: unknown) => {
        if (error) {
          next(error)
          return
        }

        if (!roles.includes(getAuth(req).user.role)) {
          next(new ApiError('FORBIDDEN', 'Your account cannot access this.'))
          return
        }

        next()
      })
    }

  return { attachSession, requireAuth, requireRole }
}
