# Progress — Dental Clinic Booking

Living checklist for a project built in short sessions over many weeks.
**Read the top section first when you sit back down.**

Task tags: **(V)** you write it · **(C)** Claude writes it · **(S)** a skill session drives it

Full architecture and reasoning: `~/.claude/plans/i-am-about-to-splendid-micali.md`
Domain reference (once it exists): `CONTEXT.md`

---

## 📍 Where I left off

**Last updated:** 2026-08-29 (session 2)

**Done last session:** Installed `mattpocock-skills` and ran a full `/grill-with-docs` session —
16 domain questions across 4 rounds. Produced `CONTEXT.md` (the glossary) and three ADRs in
`docs/adr/`. The domain model is now settled and written down.

**Currently:** Phase 0 — nearly done. Still no `server/`, no `client/`, no database, zero commits.

### ▶️ Next up — do these in order

1. **(V)** Create a Neon account → new project → copy the connection string *(starts Phase 1)*
2. **(V)** In Neon's SQL editor, settle blocker #8 before any schema is written — 10 minutes
3. **(C)** Root `package.json` with npm workspaces, then scaffold `server/`, `client/`, `shared/`

Impeccable is still uninstalled, but it isn't needed until Phase 5 — don't let it block you.

**Nothing is half-finished right now.** Clean place to stop and start.

### ⚠️ Read before writing the Prisma schema

The grilling session changed the model in ways the phase lists below don't fully reflect:

- **`Dentist` is now `Provider`**, with `type: DENTIST | HYGIENIST`. Every `dentistId` in the old
  plan — including the one in the exclusion constraint — is `providerId`.
- **No `PENDING` status.** Booking confirms instantly. Statuses are `CONFIRMED`, `CANCELLED`,
  `COMPLETED`, `NO_SHOW`, so the constraint's `WHERE` clause is `status = 'CONFIRMED'`.
- **`Appointment` carries three timestamps**, not two: `startsAt`, `endsAt` (clinical truth, shown
  to the patient) and `blockedUntil` (= `endsAt` + the service's buffer). The exclusion constraint
  runs over `tstzrange(startsAt, blockedUntil)` so buffers are enforced by the database for free.
  ⚠️ Open question: whether Postgres accepts a computed expression there or `blockedUntil` must be
  a plain stored column. Assume stored column; verify in Phase 1.
- **Clinic timezone is `America/New_York`**, in config as `CLINIC_TIMEZONE`.
- **Working hours are two rows per weekday** (08:00–12:00, 13:00–17:00) — the clinic closes for
  lunch. This is deliberate: it forces the interval-subtraction model in Phase 2.

---

## Phase 0 — Setup

- [x] **(C)** Install Emil Kowalski's motion pack — 12 skills
- [x] **(C)** Install Taste — `design-taste-frontend`
- [x] **(C)** Prune `write-swift` + `animate-expo` → 11 skills, `skills-lock.json` in sync
- [x] **(C)** `git init` on `main`, write `.gitignore`
- [x] **(C)** Create this `PROGRESS.md`
- [x] **(V)** Install `mattpocock-skills` plugin (grill-with-docs)
- [x] **(C)** Research real dental durations and hygiene scheduling — done by Claude during grilling
- [x] **(S)** `/grill-with-docs` session → `CONTEXT.md` + ADRs 0001–0003
- [ ] **(V)** Install Impeccable plugin — *not needed until Phase 5, deferred*
- [x] **(C)** First commit: `.gitignore`, `skills-lock.json`, `PROGRESS.md`, `CONTEXT.md`, `docs/adr/`

Note: the plugin loaded without a Claude Code restart, so that step turned out to be unnecessary.

---

## Phase 1 — Foundation

Goal: a real database with a schema that makes double-booking impossible.

- [ ] **(V)** Create Neon account → new project → copy the connection string
- [ ] **(C)** Root `package.json` with npm workspaces: `server`, `client`, `shared`
- [ ] **(C)** Scaffold `server/` — Express + TypeScript + `tsx` for dev
- [ ] **(C)** Scaffold `client/` — Vite + React + TypeScript + Tailwind
- [ ] **(C)** Scaffold `shared/` — TypeScript package for zod schemas
- [ ] **(C)** Write `.env.example`
- [ ] **(V)** Create your real `.env` with the Neon URL — **never commit this**
- [ ] **(C)** Install and initialize Prisma, pointed at Neon
- [ ] **(V)** Write `prisma/schema.prisma` — Claude explains each model, you type it
- [ ] **(C)** Generate first migration with `--create-only`
- [ ] **(C)** Hand-edit the migration SQL: `btree_gist` extension + the two `EXCLUDE` constraints
- [ ] **(V)** Run `prisma migrate dev`, confirm tables exist in the Neon console
- [ ] **(V)** Write `prisma/seed.ts` — 3 dentists + 2 hygienists, the 10 services from `CONTEXT.md`,
      3 interchangeable operatories, two-window weekday hours + one Saturday provider, 2 patients
- [ ] **(V)** 🎯 **Proof it works:** in Neon's SQL editor, try inserting an appointment that
      overlaps an existing one. The database must reject it. *This is the moment the project
      becomes interview material.*

---

## Phase 2 — Availability engine

Goal: given a service and a date range, correctly compute which slots are genuinely bookable.
No UI in this phase at all.

- [ ] **(C)** Explain the interval-subtraction model; write the type signatures
- [ ] **(V)** Write interval helpers in `server/src/services/intervals.ts` — subtract, merge
- [ ] **(V)** Unit tests for the interval helpers
- [ ] **(C)** Explain the timezone strategy — clinic TZ, `timestamptz`, DST traps
- [ ] **(V)** Write `getAvailableSlots()` as a **pure function** (no DB calls inside)
- [ ] **(V)** Tests: closed day · fully booked · buffer edges · lead-time cutoff · **a DST date** ·
      service longer than any remaining gap
- [ ] **(C)** Write the DB-loading wrapper that feeds data into the pure function
- [ ] **(V)** `GET /api/availability` route + check it by hand with curl

---

## Phase 3 — Auth

- [ ] **(C)** Install and configure Better Auth against Prisma/Postgres
- [ ] **(V)** Add `role` to User + migration
- [ ] **(V)** `requireAuth` middleware
- [ ] **(V)** `requireRole(...)` middleware
- [ ] **(V)** `requireOwnership` middleware
- [ ] **(V)** Authz tests — patient A cannot read or modify patient B's anything
- [ ] **(C)** Client session hook + protected routes

---

## Phase 4 — Booking API

- [ ] **(C)** Explain optimistic insert + catching Postgres error `23P01`
- [ ] **(V)** `POST /api/appointments` — validate → re-check server-side → insert → catch → 409
- [ ] **(V)** `GET /api/appointments/me`
- [ ] **(V)** `PATCH /api/appointments/:id/cancel`
- [ ] **(V)** `PATCH /api/appointments/:id/reschedule` — inside one transaction
- [ ] **(V)** 🎯 **Concurrency test:** two simultaneous bookings for one slot, exactly one wins
- [ ] **(V)** Write `AppointmentStatusHistory` on every status change

---

## Phase 5 — Patient frontend ⭐ first shippable portfolio piece

- [ ] **(S)** `/design-taste-frontend` — visual direction only, before building
- [ ] **(S)** `/pick-ui-library` — choose component primitives
- [ ] **(C)** Typed API client + TanStack Query setup
- [ ] **(V)** Home and Services pages
- [ ] **(V)** Dentists page
- [ ] **(V)** Booking flow: ServicePicker → DentistPicker → Calendar → SlotGrid → Confirm
- [ ] **(V)** Handle the `SLOT_TAKEN` 409 gracefully — refetch and explain, don't just error
- [ ] **(V)** Signup and login screens
- [ ] **(S)** `/impeccable init`, then `critique`
- [ ] **(S)** `/review-animations`
- [ ] **(V)** 🎯 Deploy it. **You now have something to show.**

---

## Phase 6 — Patient account

My appointments list · cancel · reschedule · profile and insurance details.
*Expand into tasks when we get here.*

## Phase 7 — Admin

Day/week calendar · manage working hours · time off · clinic closures · confirm/complete/no-show.
*Expand into tasks when we get here.*

## Phase 8 — Clinical records

Treatment records · patient history · tooth chart · audit logging of record access.
*Expand into tasks when we get here.*

## Phase 9 — Payments

Invoices in integer cents · Stripe Checkout in test mode · webhook marks invoices paid.
*Expand into tasks when we get here.*

## Phase 10 — Reminders

node-cron worker · Resend email · idempotent sends so nobody gets reminded twice.
*Expand into tasks when we get here.*

## Phase 11 — Polish & ship

Design skill passes · accessibility (Lighthouse ≥ 95, keyboard-only booking) · README · deploy.
*Expand into tasks when we get here.*

---

## 🚧 Blockers & open questions

| # | Item | Status |
|---|---|---|
| 1 | `grill-with-docs` needs a `/plugin` command only you can type | ✅ Resolved — installed |
| 2 | Skills don't load until Claude Code restarts | ✅ Not true in practice — loaded live |
| 3 | Do hygienists book independently of dentists, or always alongside one? | ✅ Independently — see `CONTEXT.md` |
| 4 | Are cleaning + exam one appointment or two bookable services? | ✅ Two — see ADR-0002 |
| 5 | How many operatories should the seed data assume? | ✅ Three, interchangeable |
| 6 | Which timezone is the fictional clinic in? | ✅ `America/New_York` (needs DST for the Phase 2 test) |
| 7 | Impeccable plugin still uninstalled | Open — not needed until Phase 5 |
| 8 | Can a GiST exclusion constraint use a computed `endsAt + buffer` expression? | Open — verify in Phase 1 |

---

## 💡 Concepts I've learned

Add to this as things click. It's a record of what you can **explain**, not just what you typed —
which is exactly what an interview tests.

- **Why Postgres beats MongoDB for booking** — Postgres can enforce "no two appointments overlap
  for the same dentist" *in the database itself*, via an `EXCLUDE` constraint over a time range.
  Mongo has no equivalent, so you'd be writing application-level locking and hoping. The database
  becomes the referee instead of your code.
- **`.agents/skills` vs `.claude/skills`** — the first holds the real files (a cross-tool
  convention other AI editors also read), the second is just symlinks so Claude Code can find
  them. One copy on disk, two names. Not duplicates.
- **Skills load at session start** — installing one mid-session puts it on disk but doesn't make
  it usable. Restart required. *(Turned out not to hold for `/plugin install` — that one was live
  immediately.)*
- **Buffers can be enforced by the same constraint that prevents double-booking** — if the
  appointment row stores `blockedUntil` (`endsAt` + the service's buffer) alongside the truthful
  clinical `endsAt`, the exclusion constraint runs over the *blocked* range and turnover time
  becomes impossible to violate. No extra application code. Folding the buffer into `endsAt`
  instead would work too, but `endsAt` would then be lying about when treatment finished.
- **A lunch break is what makes an availability engine real** — one unbroken 08:00–17:00 window
  can be handled with naive start/end arithmetic that passes every obvious test. Two windows a day
  force you to model availability as a *set of free intervals* you subtract from and walk in order,
  which is the actual algorithm.
- **The strongest answer to a domain edge case can be a documented "no"** — the dentist's exam
  during a hygienist's cleaning is one visit, one chair, two providers, overlapping. Supporting it
  would mean weakening the exclusion constraint. ADR-0002 records the refusal and the reasoning,
  which is a better interview answer than either ignoring the case or half-building it.
