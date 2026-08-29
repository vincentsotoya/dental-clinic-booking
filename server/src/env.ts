import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { z } from 'zod'

// One .env at the repo root, shared by the server and later by Prisma.
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) })

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  CLINIC_TIMEZONE: z.string().default('America/New_York'),
})

const parsed = envSchema.safeParse(process.env)

// Fail at startup with a readable message rather than at the first query with
// an obscure one.
if (!parsed.success) {
  console.error('Invalid environment. Check your .env against .env.example:')
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.') || '(root)'} — ${issue.message}`)
  }
  process.exit(1)
}

export const env = parsed.data
