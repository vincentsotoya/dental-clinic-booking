import { createApp } from './app'
import { databaseIsReachable, prisma } from './db'
import { env } from './env'

// The only place the real client and the real environment are wired in.
const app = createApp({
  db: prisma,
  databaseIsReachable,
  timeZone: env.CLINIC_TIMEZONE,
})

app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`)
})
