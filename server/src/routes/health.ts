import { healthResponse } from '@dental/shared'
import { Router } from 'express'

/**
 * Injected rather than imported from `../db`.
 *
 * Importing the real client here would pull `db.ts` and `env.ts` into anything
 * that builds the app — including the route tests, which would then need a
 * `.env` on disk (env.ts calls `process.exit(1)` without one) to test a
 * handler that never queries anything.
 */
export type HealthDeps = {
  databaseIsReachable: () => Promise<boolean>
  timeZone: string
}

export function createHealthRouter(deps: HealthDeps): Router {
  const router = Router()

  router.get('/health', async (_req, res) => {
    // Parsed on the way out, so drift between this handler and the shared
    // schema surfaces here rather than in the browser.
    const body = healthResponse.parse({
      status: 'ok',
      database: (await deps.databaseIsReachable()) ? 'up' : 'down',
      clinicTimezone: deps.timeZone,
      serverTime: new Date().toISOString(),
    })

    res.json(body)
  })

  return router
}
