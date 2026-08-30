import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { z } from 'zod'

// One .env at the repo root, shared by the server and later by Prisma.
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) })

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  CLINIC_TIMEZONE: z.string().default('America/New_York'),

  // Signs session cookies. Required and long on purpose: Better Auth will fall
  // back to a generated value if this is missing, which works — until the next
  // restart generates a different one and silently logs everybody out. A
  // startup failure is a better bug than an intermittent one.
  BETTER_AUTH_SECRET: z.string().min(32),

  // The API's own origin, used to build callback URLs and to validate that a
  // request arrived where the cookie was issued.
  BETTER_AUTH_URL: z.string().url().default('http://localhost:3000'),

  // The browser's origin in dev. Vite proxies /api to Express, so requests are
  // same-origin and this is belt-and-braces — but it has to be right the moment
  // the client is served from anywhere other than the proxy.
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
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
