import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'
import { env } from './env'

// Prisma 7 requires a driver adapter — `new PrismaClient()` with no arguments
// throws, and the old `datasourceUrl` option is gone.
//
// `timezone=UTC` is not optional. Prisma sends a DateTime to Postgres as a
// naive timestamp built from the value's UTC components — no offset attached —
// so Postgres interprets it in the *session* timezone, which it inherits from
// the machine. On a laptop set to Asia/Tokyo, writing 12:00Z stored 03:00Z,
// and reading it back applied the same shift in reverse, so the application
// looked perfectly consistent while every row on disk was nine hours wrong.
// psql, a reporting tool, or a hand-written query would all disagree with the
// app. Pinning the session to UTC makes the naive timestamp mean what it says.
//
// Worth noting for Phase 11: a hosted Postgres defaults to UTC, so this bug
// disappears in production and only bites locally — the worst way round.
const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL,
  options: '-c timezone=UTC',
})

export const prisma = new PrismaClient({ adapter })

/** Cheap round-trip that proves the connection is actually alive. */
export async function databaseIsReachable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch {
    return false
  }
}
