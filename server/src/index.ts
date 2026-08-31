import { createApp } from './app'
import { auth } from './auth'
import { databaseIsReachable, prisma } from './db'
import { env } from './env'

// The only place the real client, auth instance and environment are wired in.
const app = createApp({
  db: prisma,
  auth,
  databaseIsReachable,
  timeZone: env.CLINIC_TIMEZONE,
})

app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`)
})
