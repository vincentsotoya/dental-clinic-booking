import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'
import { env } from './env'

// Prisma 7 requires a driver adapter — `new PrismaClient()` with no arguments
// throws, and the old `datasourceUrl` option is gone.
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL })

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
