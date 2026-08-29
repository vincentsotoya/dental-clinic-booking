# Progress

Reference: `CONTEXT.md` (domain language) · `docs/database-design.md` (schema rules) ·
`docs/roadmap.md` (all phases) · `docs/concepts.md` · `docs/adr/`

Task tags: **(V)** Vincent writes it · **(C)** Claude writes it · **(S)** a skill session drives it

## Current Phase

Phase 1 — Foundation. Goal: a database schema that makes double-booking impossible.

## Completed

- [x] Phase 0 — repo, skills, domain model settled → `CONTEXT.md`, ADR-0001–0003
- [x] PostgreSQL 17 installed, running as a service on 5432
- [x] `dental_clinic` database created, `btree_gist` available
- [x] Resolve appointment buffer constraint design — see ADR-0004

## Current Task

- [ ] **(C)** Scaffold the monorepo — root `package.json` with npm workspaces, then `server/`
      (Express + TS + tsx), `client/` (Vite + React + TS + Tailwind), `shared/` (zod schemas)

## Next

- [ ] **(C)** `.env.example` → **(V)** real `.env`, `postgresql://…@localhost:5432/dental_clinic`
- [ ] **(C)** Install and initialize Prisma
- [ ] **(V)** Write `prisma/schema.prisma` — follow `docs/database-design.md`
- [ ] **(C)** Migration with `--create-only`, hand-edited to add `btree_gist` + both `EXCLUDE`
      constraints (Prisma cannot express them — ADR-0001)
- [ ] **(V)** `prisma/seed.ts`, then confirm an overlapping insert is rejected with `23P01`

## Active Blockers

- None

## Recent Decisions

- `blockedUntil` is a stored column, not a computed expression — see ADR-0004
- Insurance is recorded, not adjudicated — see ADR-0003
- Cleaning and dentist exam are separate bookable services — see ADR-0002
- Postgres enforces no-double-booking via `EXCLUDE USING gist` — see ADR-0001
- Development runs on local Postgres 17; hosted Neon deferred to Phase 11
