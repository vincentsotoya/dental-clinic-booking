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
- [x] `.env.example` at repo root

## Current Task

- [ ] **(V)** Copy `.env.example` to `.env` and fill in your Postgres password

## Next

- [ ] **(C)** Install and initialize Prisma — **pin `prisma` and `@prisma/client` to 7.10.0**;
      the `latest` tag on `prisma` is an 8.0 release candidate
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
