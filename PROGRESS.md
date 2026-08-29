# Progress

Reference: `CONTEXT.md` (domain language) · `docs/database-design.md` (schema rules) ·
`docs/roadmap.md` (all phases) · `docs/concepts.md` · `docs/adr/`

Working mode: Claude writes the code and explains the reasoning inline; Vincent reads and
questions. **(S)** marks a task driven by a skill session.

## Current Phase

Phase 2 — Availability engine. Goal: given a service and a date range, compute which slots are
genuinely bookable. Pure functions first, no UI.

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
- [x] `schema.prisma` — 8 models, 3 enums, snake_case mapped
- [x] Migration `20260829145823_init` applied, hand-edited with `btree_gist`, both `EXCLUDE`
      constraints and 6 `CHECK` constraints
- [x] 🎯 Constraints proven against the real schema: provider overlap, operatory overlap,
      buffer-only overlap, dishonest `blocked_until` and reversed times all rejected;
      back-to-back accepted
- [x] `prisma/seed.ts` — 5 providers, 10 services, 3 operatories, 47 working-hours rows,
      1 time off, 1 closure, 10 appointments. Idempotent: wipe-then-insert on fixed UUIDs
- [x] 🎯 Postgres session pinned to UTC in `server/src/db.ts` — see `database-design.md`
- [x] **Phase 1 complete**

- [x] Vitest installed in `server/`; `npm test` runs from the repo root
- [x] `server/src/services/intervals.ts` — the interval algebra, 41 tests green

## Current Task

- [ ] ADR-0005 for the two availability rules settled in conversation, then
      `getAvailableSlots()` as a pure function

## Next
- [ ] Tests: closed day · fully booked · buffer edges · lead-time cutoff · a DST date ·
      service longer than any remaining gap
- [ ] DB-loading wrapper feeding the pure function
- [ ] `GET /api/availability`

## Active Blockers

- None

## Recent Decisions

- Availability: treatment must fit inside a working window, but the **buffer may overrun** it —
  the blocked range only has to avoid other appointments. ADR-0005 pending
- Candidate start times are a 15-minute grid **plus the start of every free interval**, so a
  buffer ending off-grid still offers a back-to-back slot. ADR-0005 pending
- Vitest is the test runner — shares the toolchain the Vite client already uses
- Prisma's Postgres session is pinned to UTC — it sends `DateTime` as a naive timestamp and
  Postgres resolved it in the machine's zone. Details in `docs/database-design.md`
- Seeded appointments anchor to the Monday after today, so the data never goes stale; the UUIDs
  stay fixed so fixtures written against them keep working
- `server/tsconfig.json` includes `prisma/` — `seed.ts` was escaping `npm run typecheck`
- `blockedUntil` is a stored column, not a computed expression — see ADR-0004
- Insurance is recorded, not adjudicated — see ADR-0003
- Cleaning and dentist exam are separate bookable services — see ADR-0002
- Postgres enforces no-double-booking via `EXCLUDE USING gist` — see ADR-0001
- Development runs on local Postgres 17; hosted Neon deferred to Phase 11
- Prisma pinned to the 7.x line — `prisma`'s `latest` tag is an 8.0 release candidate
- `npm audit` reports 3 high (deepmerge-ts) via the Prisma **CLI**, a devDependency. Not fixed:
  the only fix downgrades to Prisma 6. Dev-time only, no untrusted input. Revisit when Prisma
  ships a patched `@prisma/config`.
