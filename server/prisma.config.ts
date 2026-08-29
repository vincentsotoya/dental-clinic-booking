import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import { defineConfig, env } from 'prisma/config'

// Prisma 7 does not read .env on its own, and ours lives at the repo root —
// one level above this workspace — so load it explicitly.
config({ path: fileURLToPath(new URL('../.env', import.meta.url)) })

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // In v7 the connection URL lives here, not in the datasource block of
    // schema.prisma. `env()` is resolved lazily, after the load above.
    url: env('DATABASE_URL'),
  },
})
