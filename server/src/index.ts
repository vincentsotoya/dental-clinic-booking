import express from 'express'
import { healthResponse } from '@dental/shared'
import { databaseIsReachable } from './db'
import { env } from './env'

const app = express()

app.use(express.json())

app.get('/api/health', async (_req, res) => {
  // Parsed on the way out, so drift between this handler and the shared schema
  // surfaces here rather than in the browser.
  const body = healthResponse.parse({
    status: 'ok',
    database: (await databaseIsReachable()) ? 'up' : 'down',
    clinicTimezone: env.CLINIC_TIMEZONE,
    serverTime: new Date().toISOString(),
  })

  res.json(body)
})

app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`)
})
