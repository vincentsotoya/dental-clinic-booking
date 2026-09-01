# Roadmap

Phase plan for the project. `PROGRESS.md` tracks current state; this file holds the whole arc.

Task tags: **(V)** Vincent writes it · **(C)** Claude writes it · **(S)** a skill session drives it

Phase 5 is the first shippable portfolio state.

---

## Phase 0 — Setup ✅

Skills installed and pruned, `git init`, domain model settled via `/grill-with-docs` →
`CONTEXT.md` + ADRs 0001–0003.

## Phase 1 — Foundation ✅

Goal: a real database with a schema that makes double-booking impossible.

- [x] **(V)** PostgreSQL 17 installed, running as a service on 5432
- [x] **(V)** `CREATE DATABASE dental_clinic`
- [x] **(V)** Buffer constraint design settled in `psql` — ADR-0004
- [x] **(C)** Root `package.json` with npm workspaces: `server`, `client`, `shared`
- [x] **(C)** Scaffold `server/` — Express 5 + TypeScript + `tsx` for dev
- [x] **(C)** Scaffold `client/` — Vite + React 19 + TypeScript + Tailwind 4
- [x] **(C)** Scaffold `shared/` — TypeScript package for zod schemas
- [x] **(C)** `.env.example`, then **(V)** real `.env` — never commit it
- [x] **(C)** Install and initialize Prisma against local Postgres — pinned to 7.10.0
- [x] Write `prisma/schema.prisma` — see `database-design.md`
- [x] First migration with `--create-only`
- [x] Hand-edit migration SQL: `btree_gist` + both `EXCLUDE` constraints
- [x] `prisma migrate dev` applied
- [x] 🎯 Overlapping insert rejected with `23P01` against the real schema — provider *and*
      operatory constraints both proven, plus the `blocked_until` honesty check
- [x] **(C)** `prisma/seed.ts` — 3 dentists + 2 hygienists, 10 services, 3 operatories,
      two-window weekday hours + one Saturday provider, 2 patients, plus time off, a closure and
      10 appointments placed on the edges Phase 2 has to get right
- [x] 🎯 Pinned the Postgres session to UTC — Prisma was writing every `timestamptz` nine hours
      off and reading it back shifted the same way, so only `psql` could see it

## Phase 2 — Availability engine

Goal: given a service and a date range, compute which slots are genuinely bookable. No UI.

- [x] **(C)** Explain interval-subtraction; write the type signatures
- [x] **(C)** Interval helpers in `server/src/services/intervals.ts` — `normalize`, `subtract`,
      `intersect`, `atLeastMinutes`, plus `overlaps` / `contains` / `durationMinutes`
- [x] **(C)** Vitest installed; 41 unit tests, including the seeded week run through the algebra
- [x] **(C)** ADR-0005 — treatment must fit the working window, the buffer may overrun it;
      candidate starts are a 15-min grid **plus** each free interval's start
- [x] **(C)** Clinic-time helpers extracted from `seed.ts` into `src/services/clinic-time.ts` —
      wall-clock minutes resolved to instants against the zone, never a hardcoded offset
- [x] **(C)** `getAvailableSlots()` as a **pure function** — no DB calls, `now` is a parameter
- [x] **(C)** 34 tests: closed day · fully booked · buffer edges · lead-time cutoff · **a DST
      date** · service longer than any remaining gap
- [x] **(C)** DB-loading wrapper feeding the pure function
- [x] **(C)** Zod request/response schemas in `shared/`, split one module per endpoint
- [x] **(C)** `GET /api/availability` + verify with curl

## Phase 3 — Auth ✅

Server only. The session hook and protected routes moved to Phase 5, where the router and the
typed API client they depend on are built — see ADR-0006 and ADR-0007 for what was settled.

- [x] **(C)** Better Auth against Prisma/Postgres; `role` as an `additionalFields` with
      `input: false`; `BETTER_AUTH_SECRET` through `env.ts`
- [x] **(C)** `Patient.userId` nullable + unique, and the signup hook that creates a fresh chart
- [x] **(C)** Seed grows logins — two patients and an admin, via `auth.api.signUpEmail`
- [x] **(C)** Error envelope generalised into `shared/src/errors.ts` — auth codes are not
      availability codes
- [x] **(C)** `/api/auth/*` mounted, `attachSession` / `requireAuth` / `requireRole`, and
      `GET /api/me` — see ADR-0008. `requireOwnership` moved to Phase 4, where its first
      callers are
- [x] **(C)** Authz tests — the stubbed permission matrix, plus 🎯 `npm run db:authz` proving
      patient A cannot touch patient B's anything over real cookies

## Phase 4 — Booking API

Opened with `POST` rather than `requireOwnership`: nothing here is addressed by an id, so the
middleware had no first caller. Cancel and reschedule dictate its signature.

- [x] **(C)** `POST /api/appointments` — validate → re-check → insert → catch `23P01` → 409
- [x] **(C)** 🎯 Concurrency: the losing insert held on the index, released into a real `23P01`
- [x] **(C)** `GET /api/appointments/me` — `?when=upcoming|past|all`, scoped by a WHERE clause
- [x] **(C)** `requireOwnership` — built here because cancel and reschedule are the routes that
      need it. A pure guard: it clears an id, never hands over a row
- [x] **(C)** `PATCH /api/appointments/:id/cancel` — a status change guarded twice: a legality
      check for the clock, and the status repeated in the UPDATE's WHERE clause for the race
- [ ] **(C)** `PATCH /api/appointments/:id/reschedule` — one transaction
- [ ] **(C)** `AppointmentStatusHistory` written on every status change

## Phase 5 — Patient frontend ⭐ first shippable portfolio piece

- [ ] **(V)** Install Impeccable plugin — first needed here
- [ ] **(S)** `/design-taste-frontend` — visual direction before building
- [ ] **(S)** `/pick-ui-library`
- [ ] **(C)** Typed API client + TanStack Query
- [ ] **(C)** Session hook over `GET /api/me` + protected routes — moved from Phase 3, which had
      no router to protect
- [ ] **(V)** Home, Services, Dentists pages
- [ ] **(V)** Booking flow: ServicePicker → DentistPicker → Calendar → SlotGrid → Confirm
- [ ] **(V)** Handle `SLOT_TAKEN` 409 gracefully — refetch and explain
- [ ] **(V)** Signup and login screens
- [ ] **(S)** `/impeccable init` → `critique`, then `/review-animations`
- [ ] **(V)** 🎯 Deploy

## Phase 6 — Patient account

My appointments · cancel · reschedule · profile and insurance details.

## Phase 7 — Admin

Day/week calendar · working hours · time off · clinic closures · confirm/complete/no-show.

## Phase 8 — Clinical records

Treatment records · patient history · tooth chart · audit logging of record access.

## Phase 9 — Payments

Invoices in integer cents · Stripe Checkout test mode · webhook marks invoices paid.

## Phase 10 — Reminders

node-cron worker · Resend email · idempotent sends.

## Phase 11 — Polish & ship

Design passes · accessibility (Lighthouse ≥ 95, keyboard-only booking) · README · deploy.

**Database goes hosted here, not before.** Development runs on local Postgres 17. Provision Neon
on **Postgres 17** (same major version, no migration drift), run `prisma migrate deploy` and the
seed against it, then point the deployed API at it. Migrations applying cleanly to a brand-new
database is itself the proof they're sound.
