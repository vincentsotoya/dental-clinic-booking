// The Express app, built from its dependencies and never started.
//
// Separated from `index.ts` so a test can build an app over a stub database
// and drive it in-process. A module that calls `app.listen` at import time
// cannot be imported by anything that does not want a socket.

import express from 'express'
import { type AvailabilityDeps, createAvailabilityRouter } from './routes/availability'
import { errorHandler } from './routes/errors'
import { createHealthRouter, type HealthDeps } from './routes/health'

export type AppDeps = HealthDeps & AvailabilityDeps

export function createApp(deps: AppDeps): express.Express {
  const app = express()

  app.use(express.json())

  app.use('/api', createHealthRouter(deps))
  app.use('/api', createAvailabilityRouter(deps))

  // Last, and after the routes: Express picks error middleware by its four
  // arguments and only consults what was registered after the thrower.
  app.use(errorHandler)

  return app
}
