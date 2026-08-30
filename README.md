# Dental Clinic Booking

A single-location dental practice's appointment system: patients browse treatments, book a
genuinely available slot online, and the clinic manages the schedule behind it.

Built as a portfolio project on a PERN stack — PostgreSQL, Express, React, Node — with a
deliberate emphasis on getting the hard part right rather than the visible part first.

> **Status: in progress.** Phase 2 of 12. The database and the availability engine are done and
> tested; there is no UI yet and nothing is deployed. See [Status](#status) for exactly what
> works today. All patient data in this repository is fictional and seeded.

---

## The interesting part: the database refuses to double-book

Most booking systems prevent overlapping appointments in application code — read the schedule,
check for a clash, insert. That check and that insert are two separate operations, so two requests
arriving together can both pass the check and both insert. The usual fixes are a lock, a queue, or
a unique constraint on a time slot that only works if slots are fixed-width.

This project pushes the invariant into Postgres instead:

```sql
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_provider_no_overlap"
  EXCLUDE USING gist (
    "provider_id" WITH =,
    tstzrange("starts_at", "blocked_until") WITH &&
  ) WHERE ("status" = 'CONFIRMED');
```

Read it as: *no two confirmed appointments may share a provider **and** have overlapping time
ranges.* A second constraint says the same for the operatory, because a room is a finite physical
resource and a free dentist with no free chair is not a bookable slot.

Three details make this more than a party trick:

- **`tstzrange` bounds default to `[)`** — half-open. An appointment starting exactly when another
  one stops blocking does not overlap it, so back-to-back bookings stay legal. Closed intervals
  would leak a gap after every visit.
- **The constraint is partial** (`WHERE status = 'CONFIRMED'`). A cancelled row is physically
  absent from the index, so it stops blocking its slot the instant it is cancelled — no cleanup
  job, no deletion, and the appointment survives for history.
- **The range covers `blocked_until`, not `ends_at`.** `blocked_until` is `ends_at` plus the
  service's turnover and sterilisation buffer, so the same constraint that prevents double-booking
  also enforces cleaning time. `ends_at` stays clinically truthful about when treatment finished.

This is why the project uses Postgres rather than MongoDB, and it is the thing I would most like to
be asked about. The reasoning behind each choice is written up in
[`docs/adr/`](docs/adr/) — including
[why `blocked_until` has to be a stored column](docs/adr/0004-blocked-until-is-a-stored-column.md)
rather than a generated one, which turns on Postgres enforcing immutability at three different
strictness levels for index expressions, generated columns, and `CHECK` constraints.

Prisma cannot express any of this — `prisma db pull` reports that it cannot represent exclusion or
check constraints at all — so the migration SQL is hand-edited and the constraints were proven
against the real schema before anything was built on top of them.

## The availability engine

Given a service and a range of dates, which start times can a patient actually book?

The naive model treats a day as a start and an end and does arithmetic on them. That breaks as soon
as the day has a hole in it, and this clinic's days always do: working hours are stored as *two*
rows per weekday because the clinic closes for lunch. Add a clinic closure, a provider's time off
and four existing appointments, and free time is no longer a span — it is a *set* of spans.

So availability is set subtraction:

```
working hours                    [08:00–12:00) [13:00–17:00)
  minus clinic closures
  minus that provider's time off
  minus the blocked range of every confirmed appointment
  intersected with a free operatory
= the times this provider could actually treat someone
```

Two things it gets right that are easy to get wrong:

- **Treatment must fit inside the working window; the buffer may overrun it.** A clinic closing at
  17:00 can still book a 16:45 checkup even though the room is not clean again until 17:15. Holding
  the buffer to the same rule as the treatment silently deletes the last appointment of every day
  and every lunch break. ([ADR-0005](docs/adr/0005-availability-rules.md))
- **Working hours are wall-clock rules, not instants.** They are stored as minutes from midnight,
  so "we open at 08:00" stays true on both sides of a daylight-saving change. The conversion to
  real instants happens in one small module, against the clinic's IANA timezone — never a hardcoded
  `-04:00`, which is correct for eight months of the year and quietly wrong for the other four.

`getAvailableSlots()` is a pure function: no database access, and `now` is a parameter rather than
a call to the clock. That is not tidiness — it is the only reason the lead-time cutoff can be
tested at its exact boundary minute and DST can be tested against a January date and a July date
from a machine in neither zone.

## Status

| Phase | | |
|---|---|---|
| 0 | Domain model, ADRs, repo setup | ✅ |
| 1 | Schema, migration, exclusion constraints, seed | ✅ |
| 2 | Availability engine | 🔨 engine done; HTTP endpoint next |
| 3 | Auth (Better Auth) | ⬜ |
| 4 | Booking API | ⬜ |
| 5 | Patient frontend — *first shippable state* | ⬜ |
| 6–12 | Account, admin, clinical records, payments, reminders, polish | ⬜ |

What runs today: the schema and its constraints, a seeded fictional clinic, `GET /api/health`, and
75 passing tests covering interval algebra, timezone handling and the availability engine. There is
no booking endpoint and no user interface yet.

Full plan in [`docs/roadmap.md`](docs/roadmap.md); current state in
[`PROGRESS.md`](PROGRESS.md).

## Stack

| | |
|---|---|
| **Database** | PostgreSQL 17 with `btree_gist` · Prisma 7 |
| **API** | Node 22+ · Express 5 · TypeScript · zod |
| **Client** | React 19 · Vite · Tailwind 4 |
| **Tests** | Vitest |
| **Layout** | npm workspaces — `server` / `client` / `shared` |

Neon is planned for hosting in Phase 11. Development deliberately runs against local Postgres until
then: migrations applying cleanly to a brand-new database is itself the proof they are sound.

## Getting started

**Prerequisites:** Node 22 or newer, and PostgreSQL 17 running locally.

```bash
git clone https://github.com/vincentsotoya/dental-clinic-booking.git
cd dental-clinic-booking
npm install
```

Create the database — the `btree_gist` extension is required by the exclusion constraints and is
created by the first migration:

```bash
createdb dental_clinic
```

Copy the environment template and fill in your Postgres password:

```bash
cp .env.example .env
```

```ini
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/dental_clinic"
PORT=3000
CLINIC_TIMEZONE="America/New_York"
```

`CLINIC_TIMEZONE` is explicit on purpose and is never inherited from the machine locale.

Apply the migration, generate the client and seed the clinic:

```bash
npm run db:migrate  --workspace=@dental/server
npm run db:generate --workspace=@dental/server
npm run db:seed     --workspace=@dental/server
```

The seed is idempotent — it wipes and re-inserts on fixed UUIDs — and anchors its week to the
Monday after today, so the data never goes stale.

Then:

```bash
npm run dev        # API on :3000, client on :5173
npm test           # 75 tests
npm run typecheck  # all three workspaces
```

Verify the API and its database connection:

```bash
curl http://localhost:3000/api/health
# {"status":"ok","database":"up","clinicTimezone":"America/New_York","serverTime":"..."}
```

### A local-only gotcha

Prisma sends a `DateTime` to Postgres as a naive timestamp built from the value's UTC components,
with no offset attached, and Postgres then resolves it against the *session* timezone — which it
inherits from the machine. On a laptop set to `Asia/Tokyo` every row lands nine hours off, and
reading it back applies the same shift in reverse, so the application looks perfectly consistent
while the data on disk is wrong.

`server/src/db.ts` pins the session with `options: '-c timezone=UTC'`. Hosted Postgres defaults to
UTC, so this bug disappears in production and only ever bites locally — the worst way round. Any
second connection path added later needs the same option.

## Layout

```
server/
  prisma/
    schema.prisma          8 models, 3 enums, snake_case mapped
    migrations/            hand-edited: btree_gist, 2 EXCLUDE, 6 CHECK
    seed.ts                the fictional clinic
  src/
    services/
      intervals.ts         interval algebra — subtract, intersect, normalize
      clinic-time.ts       wall-clock minutes → instants, against the zone
      availability.ts      getAvailableSlots() — pure
    config.ts              clinic policy: lead time, slot grid
    db.ts  env.ts  index.ts
client/                    React + Vite (scaffolded; UI is Phase 5)
shared/                    zod schemas shared by both ends
docs/
  adr/                     five architecture decision records
  roadmap.md               all 12 phases
  database-design.md       schema rules and timezone strategy
  concepts.md              what I can explain, not just what I typed
CONTEXT.md                 domain language — the words this project uses
```

The clinic is deliberately awkward: a lunch gap every weekday, a part-time hygienist, a
Saturday-only window with no lunch, a fully booked day, and a pair of appointments touching exactly
at a buffer boundary. A tidy clinic would let naive arithmetic pass every test.

## Documentation

The write-ups are part of the point, not an afterthought:

- **[`CONTEXT.md`](CONTEXT.md)** — the domain language, including the words this project refuses to
  use. A *Provider* is anyone who delivers care; a *Dentist* is never a synonym for it.
- **[`docs/adr/`](docs/adr/)** — five decision records, each with the alternatives that were
  rejected and why. [ADR-0002](docs/adr/0002-no-overlapping-hygiene-exam.md) is a documented *no*:
  supporting a dentist's exam during a hygienist's cleaning would mean weakening the exclusion
  constraint, so the case is refused on the record instead of half-built.
- **[`docs/database-design.md`](docs/database-design.md)** — the rules `schema.prisma` has to
  satisfy, and the timezone strategy.
- **[`docs/concepts.md`](docs/concepts.md)** — a running record of what I can *explain*, which is
  what an interview actually tests.

## Notes

`.agents/` and `.claude/skills/` are gitignored — they are per-machine AI tooling used while
building this, not part of the project, and nothing here needs them to run. `skills-lock.json`
records the 12 that were in play, from
[`emilkowalski/skill`](https://github.com/emilkowalski/skill),
[`Leonxlnx/taste-skill`](https://github.com/Leonxlnx/taste-skill) and
[`pbakaus/impeccable`](https://github.com/pbakaus/impeccable).

## License

No license yet — all rights reserved. Ask if you want to use any of it.
