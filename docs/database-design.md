# Database design

Facts that must hold when `prisma/schema.prisma` is written. Terminology is defined in
`../CONTEXT.md`; the reasoning behind the constraints is in `adr/`.

## Naming

- **`Provider`, not `Dentist`** — one model with `type: DENTIST | HYGIENIST`. Every foreign key is
  `providerId`, including the one in the exclusion constraints.

## Appointment

One Patient, one Provider, one Service, one Operatory, one time range.

| Field | Purpose |
|---|---|
| `startsAt` | Clinical truth — treatment begins. Shown to the patient. |
| `endsAt` | Clinical truth — treatment ends. Shown to the patient. |
| `blockedUntil` | `endsAt` + buffer. What the exclusion constraints range over. |
| `bufferMins` | Snapshot of the Service's buffer at booking time. |

`status` is `CONFIRMED | CANCELLED | COMPLETED | NO_SHOW`. **There is no `PENDING`** — booking
confirms instantly.

## Constraints

Two `EXCLUDE USING gist` constraints, both partial:

```sql
EXCLUDE USING gist (provider_id  WITH =, tstzrange(starts_at, blocked_until) WITH &&)
  WHERE (status = 'CONFIRMED')
EXCLUDE USING gist (operatory_id WITH =, tstzrange(starts_at, blocked_until) WITH &&)
  WHERE (status = 'CONFIRMED')
```

Plus the honesty guard:

```sql
CHECK (blocked_until = ends_at + make_interval(mins => buffer_mins))
```

Requires the `btree_gist` extension — plain GiST has no `=` operator for integers.

Prisma cannot express `EXCLUDE`. Migrations touching these are generated with
`prisma migrate dev --create-only` and hand-edited — see ADR-0001.

`blockedUntil` is a stored column and cannot be computed by Postgres — see ADR-0004.

## Prisma 7

The version installed is 7.10.0, which differs from most tutorials and from v6 muscle memory:

- **`datasource` carries `provider` only.** The connection URL lives in
  `server/prisma.config.ts`, not in `schema.prisma`.
- **The generator is `prisma-client`**, not `prisma-client-js`, and `output` is mandatory. Ours
  writes to `server/generated/prisma`, which is gitignored — run `npm run db:generate` after any
  schema change.
- **A driver adapter is required.** `new PrismaClient()` with no arguments throws. See
  `server/src/db.ts`, which wires `PrismaPg` with the connection string.
- **Prisma does not load `.env` by itself.** `prisma.config.ts` loads the repo-root `.env`
  explicitly.

Introspection (`prisma db pull`) reports that it cannot represent check or exclusion constraints
at all — direct confirmation of why the migration SQL is hand-edited.

## Time

- Clinic timezone is `America/New_York`, in config as `CLINIC_TIMEZONE`. Never inherited from the
  server locale.
- All instants are `timestamptz`.
- **Working hours are two rows per weekday** (08:00–12:00, 13:00–17:00) — the clinic closes for
  lunch. Deliberate: it forces the interval-subtraction model in Phase 2 rather than naive
  start/end arithmetic.

### The Postgres session must be pinned to UTC

`server/src/db.ts` passes `options: '-c timezone=UTC'` to the driver adapter. This is required
for correctness, not tidiness.

Prisma sends a `DateTime` to Postgres as a **naive timestamp built from the value's UTC
components**, with no offset attached. Postgres then resolves it against the *session* timezone,
which it inherits from the machine. On a laptop set to `Asia/Tokyo`, writing `12:00Z` stored
`03:00Z` — and reading the row back applied the same shift in reverse, so Prisma returned
`12:00Z` and the application looked entirely consistent. Only `psql` disagreed:

```sql
SET TimeZone='UTC';
SELECT starts_at FROM appointments;   -- nine hours off, silently
```

The seed's own arithmetic was never wrong; the driver session was. Pinning it to UTC makes the
naive timestamp mean what it says.

Worth knowing before Phase 11: hosted Postgres defaults to UTC, so this bug **disappears in
production and only appears locally** — the worst way round. Any second connection path added
later (a worker, a migration script, a one-off) needs the same option.

### Verifying time in psql

`timestamptz` is rendered in the session timezone, so a bare `SELECT` proves nothing about what
is stored. Always set the zone you mean:

```sql
SET TimeZone='America/New_York';   -- what the clinic sees
SET TimeZone='UTC';                -- what is actually on disk
```

## Appointment events

`appointment_events` is append-only: one row per thing that happened to an appointment, written
inside the transaction that made the change. Not a status history — a reschedule changes no status
and is the event with the most to record, since the appointment row keeps only where it is now and
the time it moved *from* survives nowhere else.

| Column | Purpose |
|---|---|
| `type` | `BOOKED`, `CANCELLED`, `RESCHEDULED`, `COMPLETED`, `NO_SHOW` |
| `from_status` / `to_status` | The transition, when there is one. Both null on a move. |
| `from_starts_at` / `to_starts_at` | Set on a move. The only record of the original time. |
| `from_provider_id` / `to_provider_id` | Same, for a move that changes provider. |
| `actor_user_id` / `actor_role` | Who did it. `SYSTEM` is the seed, and has no user. |

`ON DELETE CASCADE` from the appointment: an event describes one appointment and means nothing
without it. `ON DELETE SET NULL` from the login: deleting an account forgets *who* acted, never
*what* happened.

A CHECK requires at least one of `from_status`, `to_status` or `to_starts_at`, so a row cannot
say merely that something occurred.

## A hazard in every future migration

Two foreign keys are hand-written, because both point at Better Auth's `user` table and the other
half of a Prisma relation would be a field on a model `npx auth generate` rewrites (ADR-0006):

- `patients.user_id` → `user.id`
- `appointment_events.actor_user_id` → `user.id`

Prisma cannot see them, so it reads them as drift and **emits a `DROP CONSTRAINT` for them in
every migration it generates**. Delete those lines by hand. Keeping one would silently remove the
rule that stops a chart, or an event, pointing at a login that no longer exists — and nothing in
the test suite would notice, because the columns would still hold the same values.
