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
