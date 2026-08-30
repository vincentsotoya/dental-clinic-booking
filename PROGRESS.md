# Progress

Reference: `CONTEXT.md` (domain language) · `docs/database-design.md` (schema rules) ·
`docs/roadmap.md` (all phases) · `docs/concepts.md` · `docs/adr/`

Working mode: Claude writes the code and explains the reasoning inline; Vincent reads and
questions. **(S)** marks a task driven by a skill session.

## Current Phase

Phase 3 — Auth. Goal: Better Auth against Prisma/Postgres, a `role` on User, and middleware
that makes "patient A cannot touch patient B's anything" a tested property rather than a hope.

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

- [x] `server/src/services/intervals.ts` — the interval algebra, 41 tests
- [x] ADR-0005 — the two availability rules written down
- [x] `server/src/services/clinic-time.ts` — clinic-calendar helpers extracted out of `seed.ts`;
      `seed.ts` imports them and reseeds identically
- [x] `server/src/config.ts` — `LEAD_TIME_MINS`, `SLOT_GRID_MINS`, `MAX_AVAILABILITY_DAYS` as
      clinic policy, not env
- [x] 🎯 The engine in three layers: `availability.ts` decides (pure, `now` injected),
      `availability-query.ts` loads, `availability-response.ts` serialises
- [x] `shared/src/` — one module per endpoint; request, response and error schemas for
      availability
- [x] `server/src/app.ts` + `server/src/routes/` — `createApp(deps)` separated from `listen`,
      routers take their dependencies as arguments, one error-mapping module
- [x] 🎯 `GET /api/availability` verified with curl against the seeded week: 378 slots over six
      days, first slot 08:00 EDT → `2026-08-31T12:00:00.000Z` in Operatory 2, closure day 200
      with an empty list, all five error codes returning their statuses
- [x] 🎯 `npm run db:availability` — cancelling the seeded 08:00 cleaning frees 08:00 and 08:15
      and restoring re-blocks them, proving the CONFIRMED-only filter against real rows
- [x] **Phase 2 complete** — 125 tests green

## Current Task

- [ ] Better Auth configured against Prisma/Postgres

## Next

- [ ] **(V)** `role` on User + migration
- [ ] **(V)** `requireAuth`, `requireRole(...)`, `requireOwnership` middleware

## Active Blockers

- None

## Recent Decisions

- Routers are factories taking `{ db, timeZone, now }` — the same injection the engine and the
  calendar already use. Route tests drive real routing and real schemas over a stub, needing
  neither Postgres nor a `.env`
- `createApp()` is separate from `app.listen()`; a module that opens a socket at import time
  cannot be imported by a test
- One error envelope for the endpoint, `INTERNAL` included, so the client parses one shape.
  A 500 never echoes the underlying message — it can name a table or a connection string
- Availability responses are `Cache-Control: no-store`. A cached slot list offers times that
  are already taken
- Dates cross the wire as `YYYY-MM-DD` and parse straight to `{year, month, day}` — never
  through a `Date`, which would be UTC midnight and so the previous evening in the clinic
- Each slot carries the clinic-zone civil `date` it falls under, so the client groups by a
  string instead of redoing timezone arithmetic the server already knows the answer to
- The response sends providers as a map keyed by id, and only those with a free slot — the
  name would otherwise repeat on hundreds of slots, and the full roster would leak which
  providers exist but are fully booked
- No operatory name on the wire. The room is not the patient's choice, so only the id travels
- `MAX_AVAILABILITY_DAYS` is enforced on the server only — one home for the number; the query
  layer rejects and the route maps it to a 400
- Services are addressed by `slug`, not id — stable, already unique, keeps UUIDs out of the
  public URL and makes a query readable in a log
- The loader fetches **every** CONFIRMED appointment in the window, not just the queried
  provider's: another provider's appointment occupies a room, and that room is unavailable to
  this one
- Availability reads are issued in parallel, not in a transaction — a Slot is a candidate and
  the exclusion constraints are the real guard. Phase 4's booking transaction is where a
  consistent read matters
- A Slot is a candidate, not a reservation: two providers free at the same instant are both
  offered the first free room, because nothing is held until a row is written
- Room choice is deterministic — operatories sorted by name, first free one wins
- Timezone conversion lives in one module and takes the zone as an argument, so tests run at
  `America/New_York` on any machine
- Vitest is the test runner — shares the toolchain the Vite client already uses
- Prisma's Postgres session is pinned to UTC — it sends `DateTime` as a naive timestamp and
  Postgres resolved it in the machine's zone. Details in `docs/database-design.md`
- Seeded appointments anchor to the Monday after today, so the data never goes stale; the UUIDs
  stay fixed so fixtures written against them keep working
- `server/tsconfig.json` includes `prisma/` and `scripts/` — files there were escaping
  `npm run typecheck`
- `blockedUntil` is a stored column, not a computed expression — see ADR-0004
- Insurance is recorded, not adjudicated — see ADR-0003
- Cleaning and dentist exam are separate bookable services — see ADR-0002
- Postgres enforces no-double-booking via `EXCLUDE USING gist` — see ADR-0001
- Development runs on local Postgres 17; hosted Neon deferred to Phase 11
- Prisma pinned to the 7.x line — `prisma`'s `latest` tag is an 8.0 release candidate
- `npm audit` reports 3 high (deepmerge-ts) via the Prisma **CLI**, a devDependency. Not fixed:
  the only fix downgrades to Prisma 6. Dev-time only, no untrusted input. Revisit when Prisma
  ships a patched `@prisma/config`.
