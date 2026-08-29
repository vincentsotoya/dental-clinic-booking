# Roadmap

Phase plan for the project. `PROGRESS.md` tracks current state; this file holds the whole arc.

Task tags: **(V)** Vincent writes it · **(C)** Claude writes it · **(S)** a skill session drives it

Phase 5 is the first shippable portfolio state.

---

## Phase 0 — Setup ✅

Skills installed and pruned, `git init`, domain model settled via `/grill-with-docs` →
`CONTEXT.md` + ADRs 0001–0003.

## Phase 1 — Foundation

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
- [ ] **(V)** Write `prisma/schema.prisma` — see `database-design.md`
- [ ] **(C)** First migration with `--create-only`
- [ ] **(C)** Hand-edit migration SQL: `btree_gist` + both `EXCLUDE` constraints
- [ ] **(V)** `prisma migrate dev`, confirm with `\dt`
- [ ] **(V)** `prisma/seed.ts` — 3 dentists + 2 hygienists, 10 services, 3 operatories,
      two-window weekday hours + one Saturday provider, 2 patients
- [ ] **(V)** 🎯 Overlapping insert rejected with `23P01` against the real schema

## Phase 2 — Availability engine

Goal: given a service and a date range, compute which slots are genuinely bookable. No UI.

- [ ] **(C)** Explain interval-subtraction; write the type signatures
- [ ] **(V)** Interval helpers in `server/src/services/intervals.ts` — subtract, merge
- [ ] **(V)** Unit tests for the helpers
- [ ] **(C)** Explain the timezone strategy — clinic TZ, `timestamptz`, DST traps
- [ ] **(V)** `getAvailableSlots()` as a **pure function** (no DB calls inside)
- [ ] **(V)** Tests: closed day · fully booked · buffer edges · lead-time cutoff · **a DST date** ·
      service longer than any remaining gap
- [ ] **(C)** DB-loading wrapper feeding the pure function
- [ ] **(V)** `GET /api/availability` + verify with curl

## Phase 3 — Auth

- [ ] **(C)** Better Auth configured against Prisma/Postgres
- [ ] **(V)** `role` on User + migration
- [ ] **(V)** `requireAuth`, `requireRole(...)`, `requireOwnership` middleware
- [ ] **(V)** Authz tests — patient A cannot touch patient B's anything
- [ ] **(C)** Client session hook + protected routes

## Phase 4 — Booking API

- [ ] **(C)** Explain optimistic insert + catching `23P01`
- [ ] **(V)** `POST /api/appointments` — validate → re-check → insert → catch → 409
- [ ] **(V)** `GET /api/appointments/me`
- [ ] **(V)** `PATCH /api/appointments/:id/cancel`
- [ ] **(V)** `PATCH /api/appointments/:id/reschedule` — one transaction
- [ ] **(V)** 🎯 Concurrency test: two simultaneous bookings, exactly one wins
- [ ] **(V)** `AppointmentStatusHistory` written on every status change

## Phase 5 — Patient frontend ⭐ first shippable portfolio piece

- [ ] **(V)** Install Impeccable plugin — first needed here
- [ ] **(S)** `/design-taste-frontend` — visual direction before building
- [ ] **(S)** `/pick-ui-library`
- [ ] **(C)** Typed API client + TanStack Query
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
