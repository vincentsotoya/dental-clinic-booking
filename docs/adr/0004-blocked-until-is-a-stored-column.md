# `blockedUntil` is a stored column, not a computed expression

Enforcing turnover time means the exclusion constraint from
[ADR-0001](./0001-postgres-exclusion-constraint-for-double-booking.md) has to run over the
*blocked* range — `startsAt` to `endsAt + buffer` — rather than the clinical one. The open
question was whether Postgres could compute that end instant itself, keeping the buffer
arithmetic in a single place, or whether it must be resolved before the row is written.

It must be resolved first. `Appointment` carries `blockedUntil` as a plain `timestamptz` column,
written by the booking service.

Two independent reasons, either fatal on its own:

**The expression is not `IMMUTABLE`.** All functions and operators in an index definition must be
immutable, and an `EXCLUDE` constraint is backed by an index. `timestamptz + interval` is
`STABLE`: an `interval` can carry day and month components, and adding a *day* to a `timestamptz`
resolves DST against the session's `TimeZone`. Volatility is a property of the operator, not of
the value — that `make_interval(mins => 15)` happens to be a fixed offset doesn't help.

**The buffer lives on another table.** `Buffer` belongs to `Service`. A constraint sees only
columns of the row being written; there is no join available at constraint-check time. Even an
immutable operator would leave `endsAt + service.buffer` inexpressible.

## Considered options

`blockedUntil timestamptz GENERATED ALWAYS AS (endsAt + make_interval(mins => …)) STORED` is the
obvious escape and fails for both of the same reasons: generation expressions must be immutable,
and cannot reference other tables.

## Consequences

`blockedUntil` is application-written, so the application *can* write a value inconsistent with
`endsAt`. Two things close that hole:

- `Appointment` also stores `bufferMins`, snapshotted from the Service at booking time.
- `CHECK (blockedUntil = endsAt + make_interval(mins => bufferMins))`.

The `CHECK` is accepted where the exclusion constraint was refused, because Postgres *assumes*
CHECK conditions are immutable without verifying it at DDL time. That asymmetry between index
expressions, generated columns, and check constraints is the only reason the guard is available.

Snapshotting `bufferMins` is independently correct: editing a Service's buffer must not
retroactively shift the blocked range of appointments already booked.

## Verified

On PostgreSQL 17, against a throwaway table carrying both constraints:

- An appointment overlapping another's treatment time — rejected, `23P01`.
- An appointment starting *after* treatment ends but inside the buffer — rejected, `23P01`. This
  is the one that proves buffers are enforced by the database rather than by application code.
- An appointment starting exactly at a previous one's `blockedUntil` — accepted, because
  `tstzrange` bounds default to `[)`, so touching ranges do not overlap. Back-to-back bookings
  stay legal.
- After cancelling the blocking appointment, the same rejected insert succeeds — both exclusion
  constraints carry `WHERE (status = 'CONFIRMED')`.
- A `blockedUntil` that doesn't match `endsAt + bufferMins` — rejected, `23514`.
