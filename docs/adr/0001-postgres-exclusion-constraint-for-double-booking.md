# Postgres enforces no-double-booking, not application code

A booking system's central invariant is that one Provider, and one Operatory, cannot be in two
appointments at once. We chose PostgreSQL specifically so this can be enforced by the database
itself, via `EXCLUDE USING gist` over a `tstzrange` — two simultaneous requests on different
servers with no shared lock will still produce exactly one winner, because the second insert is
physically refused.

MongoDB was the starting assumption and was rejected: it has no equivalent, so the invariant would
live in application-level locking that is hard to write, harder to test, and silently wrong under
load.

## Consequences

Prisma cannot express `EXCLUDE` in its schema language. Migrations touching this constraint are
generated with `prisma migrate dev --create-only` and then **hand-edited** to append the SQL. A
future contributor regenerating migrations from scratch will drop the constraint without noticing —
the seeded overlap test is what catches that.

Booking therefore inserts optimistically and catches Postgres error `23P01`
(`exclusion_violation`), returning `409 SLOT_TAKEN`. Do not add a check-then-insert guard in front
of it; that reintroduces the race this decision exists to remove.
