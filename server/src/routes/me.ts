import { meResponse } from '@dental/shared'
import { Router } from 'express'
import type { PrismaClient } from '../../generated/prisma/client'
import type { AuthMiddleware } from '../middleware/auth'
import { getSession } from '../middleware/auth-context'

export type MeDeps = {
  /** `attachSession`, not `requireAuth` — see the handler. */
  attachSession: AuthMiddleware['attachSession']
  db: Pick<PrismaClient, 'patient'>
}

export function createMeRouter(deps: MeDeps): Router {
  const router = Router()

  // The one route deliberately not behind `requireAuth`: "nobody" is a true
  // answer, and a 401 on every cold load is an error the client would retry
  // and log. See ADR-0008.
  router.get('/me', deps.attachSession, async (req, res) => {
    const session = getSession(req)

    // Read, not derived from the login. The two records may diverge — a chart
    // the front desk made, a Phase 7 merge, a Phase 6 edit.
    const patient = session?.patientId
      ? await deps.db.patient.findUnique({
          where: { id: session.patientId },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : null

    // Parsed on the way out, as in every route here.
    const body = meResponse.parse({ user: session?.user ?? null, patient })

    // A cached identity is a signed-out browser still being told who it was.
    res.set('Cache-Control', 'no-store')
    res.json(body)
  })

  return router
}
