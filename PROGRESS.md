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
- [x] Scaffold monorepo — npm workspaces `shared` / `server` / `client`; `GET /api/health`
      verified end to end, all three workspaces typecheck, client builds
- [x] `.env.example` at repo root, `.env` created locally
- [x] Prisma 7.10.0 installed and initialized in `server/` — connects to `dental_clinic`,
      `GET /api/health` reports `database: up`
- [x] Scratch table `scratch_appt` dropped; database is empty and ready for the first migration

## Current Task

- [ ] **(V)** Write `server/prisma/schema.prisma` — follow `docs/database-design.md`, and read
      the "Prisma 7" section there first; most tutorials online are v6 and will mislead you

## Next
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
- Prisma pinned to the 7.x line — `prisma`'s `latest` tag is an 8.0 release candidate
- `npm audit` reports 3 high (deepmerge-ts) via the Prisma **CLI**, a devDependency. Not fixed:
  the only fix downgrades to Prisma 6. Dev-time only, no untrusted input. Revisit when Prisma
  ships a patched `@prisma/config`.
