// Interval algebra — the arithmetic the availability engine is built on.
//
// WHY THIS MODULE EXISTS
//
// The tempting way to compute availability is to reason about a day as a
// start and an end and do sums on them. That model breaks the moment the day
// has a hole in it, and this clinic's days always do: working hours are two
// rows per weekday because the clinic closes for lunch (docs/database-design.md
// deliberately made it so). Add a clinic closure, a provider's time off, and
// four existing appointments, and "the free time" is no longer a span. It is a
// *set* of spans.
//
// So availability is set subtraction, done in one direction:
//
//   working hours                    [08:00–12:00) [13:00–17:00)
//     minus clinic closures
//     minus that provider's time off
//     minus the blocked range of every CONFIRMED appointment
//   = the intervals in which this provider could actually treat someone
//
// Every one of those steps is the same operation: take a set of intervals,
// remove another set of intervals, get a set of intervals back. That is what
// `subtract` does, and it is the only non-obvious function here.
//
// A second operation shows up once rooms enter the picture. A Slot names a
// Provider *and* an Operatory (CONTEXT.md), so a time is only bookable where
// the provider is free AND some room is free — the *intersection* of two sets
// of intervals. That is `intersect`.
//
// HALF-OPEN, ALWAYS
//
// Every interval here is [start, end): start is inside, end is not. This is
// not a stylistic choice. The database's exclusion constraints range over
// `tstzrange(starts_at, blocked_until)`, whose bounds default to '[)', so an
// appointment beginning exactly when another's buffer ends does not overlap it
// and is legal. If this module used closed intervals it would disagree with
// the constraint that has the final say, and the engine would offer slots the
// database then rejected — or, worse, hide slots that were genuinely free.
//
// Consequences of [start, end) worth holding onto:
//   · [08:00, 09:00) and [09:00, 10:00) do NOT overlap; they touch.
//   · Touching intervals merge into one, because their union has no hole.
//   · A zero-length interval [09:00, 09:00) is empty and is discarded.
//
// Dates are treated as immutable throughout. Nothing here mutates an input.

/** A half-open span of time: `start` is included, `end` is not. */
export type Interval = {
  readonly start: Date
  readonly end: Date
}

const ms = (date: Date): number => date.getTime()

/** True when the interval contains at least one instant. */
export function isEmpty(interval: Interval): boolean {
  return ms(interval.end) <= ms(interval.start)
}

/** Length in whole minutes. Fractional milliseconds are truncated. */
export function durationMinutes(interval: Interval): number {
  return Math.trunc((ms(interval.end) - ms(interval.start)) / 60_000)
}

/**
 * True when the two intervals share at least one instant.
 *
 * Touching intervals do not overlap: [08:00, 09:00) and [09:00, 10:00) return
 * false. This is the same rule the `EXCLUDE USING gist` constraints apply, and
 * it is what makes back-to-back booking legal.
 */
export function overlaps(a: Interval, b: Interval): boolean {
  return ms(a.start) < ms(b.end) && ms(b.start) < ms(a.end)
}

/** True when `inner` fits entirely inside `outer`, edges allowed to touch. */
export function contains(outer: Interval, inner: Interval): boolean {
  return ms(inner.start) >= ms(outer.start) && ms(inner.end) <= ms(outer.end)
}

/**
 * Canonical form: sorted by start, overlapping and touching spans merged,
 * empty spans dropped.
 *
 * Every function below normalises its inputs, so callers never have to think
 * about order or duplication. Note that touching spans merge — [08:00, 12:00)
 * and [12:00, 13:00) become [08:00, 13:00) — because their union really is one
 * unbroken stretch. The clinic's two weekday windows are 12:00 and 13:00, an
 * hour apart, so lunch survives this untouched. That gap is the whole point of
 * modelling working hours as two rows.
 */
export function normalize(intervals: readonly Interval[]): Interval[] {
  const sorted = intervals
    .filter((interval) => !isEmpty(interval))
    .sort((a, b) => ms(a.start) - ms(b.start))

  const merged: Interval[] = []

  for (const current of sorted) {
    const last = merged[merged.length - 1]

    // Sorted by start, so `current` can only ever extend the last span or
    // begin a new one — it can never reach back before it.
    if (last && ms(current.start) <= ms(last.end)) {
      if (ms(current.end) > ms(last.end)) {
        merged[merged.length - 1] = { start: last.start, end: current.end }
      }
      continue
    }

    merged.push({ start: current.start, end: current.end })
  }

  return merged
}

/**
 * Everything in `from` that is not in `remove`.
 *
 * This is the engine's workhorse: working hours minus closures minus time off
 * minus booked ranges. Removing a span from the middle of an interval splits
 * it in two, which is exactly the behaviour a naive start/end model cannot
 * express — and exactly what a lunch break, or an appointment at 10:00 on an
 * otherwise free morning, actually does to a schedule.
 *
 *   from   [08:00 ───────────────────────── 12:00)
 *   remove          [09:00 ── 10:00)
 *   result [08:00 ─ 09:00)      [10:00 ──── 12:00)
 */
export function subtract(from: readonly Interval[], remove: readonly Interval[]): Interval[] {
  const sources = normalize(from)
  const removals = normalize(remove)

  if (removals.length === 0) return sources

  return sources.flatMap((source) => subtractFromOne(source, removals))
}

/**
 * Subtract a normalised, sorted list of removals from a single interval.
 *
 * Walks left to right with a cursor marking how far along the source we have
 * accounted for. Anything between the cursor and the next removal is free and
 * gets emitted; the cursor then jumps past the removal. Because `removals` is
 * sorted and merged, one pass is enough — there is no need to re-examine
 * earlier removals, and none of them overlap each other.
 */
function subtractFromOne(source: Interval, removals: readonly Interval[]): Interval[] {
  const sourceEnd = ms(source.end)
  const free: Interval[] = []
  let cursor = ms(source.start)

  for (const removal of removals) {
    const removalStart = ms(removal.start)
    const removalEnd = ms(removal.end)

    if (removalEnd <= cursor) continue // entirely behind us
    if (removalStart >= sourceEnd) break // sorted, so everything after is too

    // A stretch of free time before this removal begins.
    if (removalStart > cursor) {
      free.push({ start: new Date(cursor), end: new Date(Math.min(removalStart, sourceEnd)) })
    }

    cursor = Math.max(cursor, removalEnd)
    if (cursor >= sourceEnd) return free
  }

  if (cursor < sourceEnd) {
    free.push({ start: new Date(cursor), end: new Date(sourceEnd) })
  }

  return free
}

/**
 * The instants present in both sets.
 *
 * Used to combine independent resources: a time is bookable only where the
 * provider is free *and* a room is free. Both lists are normalised first, then
 * swept together — advancing whichever side ends earlier, since that side can
 * have nothing further to contribute to the current position.
 */
export function intersect(a: readonly Interval[], b: readonly Interval[]): Interval[] {
  const left = normalize(a)
  const right = normalize(b)
  const shared: Interval[] = []

  let i = 0
  let j = 0

  while (i < left.length && j < right.length) {
    const l = left[i]
    const r = right[j]
    if (!l || !r) break

    const start = Math.max(ms(l.start), ms(r.start))
    const end = Math.min(ms(l.end), ms(r.end))

    if (start < end) {
      shared.push({ start: new Date(start), end: new Date(end) })
    }

    if (ms(l.end) < ms(r.end)) i += 1
    else j += 1
  }

  return shared
}

/**
 * Keep only the intervals long enough to hold `minutes`.
 *
 * The engine's last filter before generating start times: a free stretch
 * shorter than the service is not a candidate, however tidy its edges.
 */
export function atLeastMinutes(intervals: readonly Interval[], minutes: number): Interval[] {
  return normalize(intervals).filter((interval) => durationMinutes(interval) >= minutes)
}
