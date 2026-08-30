# Treatment fits the window; the buffer may overrun it

The availability engine turns a provider's free time into a list of start times. Two questions had
no obvious answer, and both change which slots patients are offered.

**1. Must the buffer fit inside the working window, or only the treatment?**
Only the treatment. A candidate is bookable when `[start, start + duration)` lies entirely inside
one free stretch of a working window. The blocked range `[start, start + duration + buffer)` is
held to a weaker rule: it must not overlap another appointment's blocked range — for the same
provider, or for the same operatory — and is otherwise free to run past the end of the window,
past the lunch gap, and past the start of a clinic closure.

**2. Where do candidate start times come from?**
A `gridMins` grid measured from the top of the hour, **plus the start instant of every free
interval**, deduplicated.

## Why the buffer is allowed to overrun

The buffer is turnover and sterilisation (`CONTEXT.md`), not care. Nobody is being treated during
it and the patient has left. Requiring it to fit inside the window would mean a clinic that closes
at 17:00 could not book a 16:45 checkup, because the room is not clean again until 17:15 — and the
consequence of that is silently losing the last appointment of every single day, and the last one
before every lunch break. The clinic's own answer is that the assistant stays five minutes late,
which is exactly what "may overrun" encodes.

What the buffer must still respect is other bookings, because that is a physical claim on a room
and a person rather than a scheduling preference. That is also the rule the database enforces: the
`EXCLUDE USING gist` constraints from [ADR-0001](./0001-postgres-exclusion-constraint-for-double-booking.md)
range over `tstzrange(starts_at, blocked_until)` and know nothing about working hours. Keeping the
engine's buffer rule identical to the constraint's is what stops the two disagreeing.

## Why the grid needs the free-interval starts as well

A pure 15-minute grid looks right until a buffer ends off-grid. A 30-minute cleaning with a
5-minute buffer starting at 09:30 is blocked until 10:05. The provider and the room are genuinely
free from 10:05, but a grid offers 10:15 — so ten minutes evaporate, and they evaporate again after
every appointment that day. Worse, the loss compounds: each off-grid buffer pushes the next
available grid point further out.

Adding the start of every free interval fixes it without abandoning the grid. Patients still see
tidy times in an empty schedule, and back-to-back booking — the thing the `[)` range bounds were
chosen to permit — stays actually reachable rather than merely legal.

## Considered options

**Fold the buffer into the treatment for window-fitting purposes.** Simplest rule, one span to
check. Rejected: it is the "lose the last slot of every day" behaviour above, and it makes the
engine's notion of an appointment's length disagree with `endsAt`, which ADR-0004 went out of its
way to keep truthful.

**Drop the grid; offer only free-interval starts.** Correct and minimal, and on an empty Monday it
offers exactly one slot per window — 08:00 and 13:00 — because the free interval has one start.
A grid is what turns a free stretch into a list of choices.

**Snap the grid to each free interval's start rather than the hour.** Equivalent to the chosen rule
in the common case and stranger in the rare one: after a 10:05 buffer every later slot that day
becomes 10:20, 10:35, 10:50. Anchoring to the hour keeps the schedule readable and adds the
off-grid start as an extra, not a replacement.

## Consequences

The engine is **stricter than the database, never looser**. Every slot it offers satisfies both
exclusion constraints by construction, while some instants the constraints would accept — outside
working hours, inside a closure — are never offered. That asymmetry is the safe direction: the
`23P01` catch in Phase 4 stays a genuine concurrency race, rather than the routine way bookings
fail.

The rule cannot be expressed as a single interval subtraction. Treatment is checked against the
free intervals, the blocked range against the appointment ranges alone — two different sets, so the
candidate loop cannot be collapsed into `atLeastMinutes(free, duration + buffer)`.

Slots are not uniformly spaced, and tests must not assume they are.
