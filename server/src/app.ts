// The Express app, built from its dependencies and never started.
//
// Separated from `index.ts` so a test can build an app over a stub database
// and drive it in-process. A module that calls `app.listen` at import time
// cannot be imported by anything that does not want a socket.

import express from 'express'
import { toNodeHandler } from 'better-auth/node'
import { type AuthDeps, createAuthMiddleware } from './middleware/auth'
import { type AppointmentsDeps, createAppointmentsRouter } from './routes/appointments'
import { type AvailabilityDeps, createAvailabilityRouter } from './routes/availability'
import { errorHandler } from './routes/errors'
import { createHealthRouter, type HealthDeps } from './routes/health'
import { createMeRouter } from './routes/me'

export type AppDeps = HealthDeps & AvailabilityDeps & AuthDeps & Omit<AppointmentsDeps, 'requireAuth'>

export function createApp(deps: AppDeps): express.Express {
  const app = express()
  const { attachSession, requireAuth } = createAuthMiddleware(deps)

  // Above express.json(), and that ordering is load-bearing: a body parser consumes
  // the stream, and Better Auth would then read an empty one. `*splat` rather than
  // `*` — Express 5's path-to-regexp rejects a bare wildcard. These routes keep
  // Better Auth's own error dialect, not our envelope; the seam is the prefix
  // (docs/adr/0006).
  app.all('/api/auth/*splat', toNodeHandler(deps.auth))

  app.use(express.json())

  app.use('/api', createHealthRouter(deps))
  app.use('/api', createAvailabilityRouter(deps))
  app.use('/api', createMeRouter({ ...deps, attachSession }))
  app.use('/api', createAppointmentsRouter({ ...deps, requireAuth }))

  // Last, and after the routes: Express picks error middleware by its four
  // arguments and only consults what was registered after the thrower.
  app.use(errorHandler)

  return app
}
