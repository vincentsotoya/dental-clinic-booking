# Concepts

A record of what can be **explained**, not just what was typed — which is what an interview tests.
Add to it as things click.

## Postgres and the booking invariant

- **Why Postgres beats MongoDB for booking** — Postgres enforces "no two appointments overlap for
  the same provider" *in the database itself*, via an `EXCLUDE` constraint over a time range. Mongo
  has no equivalent, so the invariant lives in application-level locking. The database becomes the
  referee instead of your code.
- **Buffers can be enforced by the same constraint that prevents double-booking** — if the row
  stores `blockedUntil` (`endsAt` + buffer) alongside the truthful clinical `endsAt`, the
  constraint ranges over the *blocked* interval and turnover time becomes impossible to violate.
  Folding the buffer into `endsAt` would work too, but `endsAt` would then lie about when treatment
  finished.
- **A partial exclusion constraint is what makes cancellation mean anything** — with
  `WHERE (status = 'CONFIRMED')`, a cancelled row is physically absent from the index, so it stops
  blocking its slot the instant it's cancelled. No cleanup job, no deletion, and the appointment
  survives for history.
- **Volatility is a property of the operator, not of the value** — `timestamptz + interval` is
  `STABLE` because an `interval` *can* carry days and months, and adding a day resolves DST against
  the session `TimeZone`. It stays `STABLE` even when the interval is plainly 15 minutes, because
  Postgres reasons about the signature, never the runtime value.
- **Postgres enforces immutability at three strictness levels** — index and `EXCLUDE` expressions
  are checked at DDL time and hard-refuse a `STABLE` operator; `GENERATED … STORED` columns
  likewise; a `CHECK` constraint is merely *assumed* immutable and never verified. Same operator,
  three answers. That gap is the only reason the `blockedUntil` honesty guard exists.
- **`timestamptz` stores an instant, not wall-clock text** — inserting `'09:00-04'` and getting
  `22:00+09` back isn't a bug, it's the session timezone formatting a stored point in time. Hence
  `CLINIC_TIMEZONE` in config rather than whatever locale the server runs under.

## The availability engine

- **The engine must be stricter than the constraint, never looser** — the `EXCLUDE` constraints
  know nothing about working hours, so they would happily accept an appointment at 03:00. The
  engine offers a strict subset of what the database permits. That direction is the safe one: every
  slot offered is insertable, and the `23P01` catch in Phase 4 stays a genuine concurrency race
  rather than the routine way bookings fail. Looser would mean patients regularly picking a time
  the database then refuses.
- **Turnover time and treatment time obey different rules** — the buffer may run past closing
  because nobody is being treated during it, but it must still clear other appointments, because
  that is a physical claim on a room. So the check cannot collapse into
  `atLeastMinutes(free, duration + buffer)`: two spans, two different sets to check against
  (ADR-0005). Folding them together silently deletes the last slot of every day and every lunch.
- **A fixed grid quietly loses time after every off-grid buffer** — a 30-minute cleaning with a
  5-minute buffer at 09:30 frees the room at 09:35, and a pure 15-minute grid offers 10:15. Ten
  minutes gone, and again after the next one. Offering each free interval's start *in addition to*
  the grid is what makes back-to-back booking reachable rather than merely legal.
- **A Slot is a candidate, not a reservation** — with no PENDING status, nothing is held. Two
  dentists free at 08:00 are both offered the same room, and that is correct: whoever books first
  takes it. Allocating rooms across providers in advance would be inventing a reservation the
  system does not have, and would be wrong the moment either patient walked away.
- **Purity is what makes the hard cases testable at all** — `now` is a parameter and there is no
  database call, so the lead-time cutoff can be tested at the exact boundary minute and DST can be
  tested on a January date and a July date from a machine in neither zone. A function that reads
  the clock and the database can only be tested by arranging a database and waiting.
- **Step the grid in wall-clock minutes, then convert** — generating candidates as minute 480, 495,
  510 and resolving each against the zone is not the same as adding 15 minutes of elapsed time to
  the first slot. Patients read the clinic's clock. In a zone with a half-hour offset the two
  disagree, and across a DST boundary the elapsed-time version drifts off the grid entirely.
- **Wall-clock rules do not belong in `timestamptz`** — `WorkingHours` stores minutes from midnight
  because "we open at 08:00" is a rule, not an instant; it stays true on both sides of a DST
  change, which a stored timestamp would not. All the timezone arithmetic then collects in one
  small module instead of being smeared across the schema.

## Domain modelling

- **A lunch break is what makes an availability engine real** — one unbroken 08:00–17:00 window
  yields to naive start/end arithmetic that passes every obvious test. Two windows a day force
  availability to be modelled as a *set of free intervals* you subtract from and walk in order,
  which is the actual algorithm.
- **The strongest answer to a domain edge case can be a documented "no"** — the dentist's exam
  during a hygienist's cleaning is one visit, one chair, two providers, overlapping. Supporting it
  would mean weakening the exclusion constraint. ADR-0002 records the refusal and the reasoning,
  which is a better interview answer than either ignoring the case or half-building it.

## Method

- **A test that can't fail for the reason you think proves nothing** — the first cancellation test
  reused a range that also collided with a *different* appointment, so its failure said nothing
  about cancellation. Re-running against an isolated `provider_id` is what actually proved the
  partial constraint. Worth remembering for the Phase 4 concurrency test.

## Tooling

- **`.agents/skills` vs `.claude/skills`** — the first holds the real files (a cross-tool
  convention other AI editors read), the second is symlinks so Claude Code can find them. One copy
  on disk, two names.
