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

## Time

- Clinic timezone is `America/New_York`, in config as `CLINIC_TIMEZONE`. Never inherited from the
  server locale.
- All instants are `timestamptz`.
- **Working hours are two rows per weekday** (08:00–12:00, 13:00–17:00) — the clinic closes for
  lunch. Deliberate: it forces the interval-subtraction model in Phase 2 rather than naive
  start/end arithmetic.
