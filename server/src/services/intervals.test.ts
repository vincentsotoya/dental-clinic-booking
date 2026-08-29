import { describe, expect, it } from 'vitest'
import {
  atLeastMinutes,
  contains,
  durationMinutes,
  intersect,
  isEmpty,
  normalize,
  overlaps,
  subtract,
  type Interval,
} from './intervals'

// These tests are written in UTC on a single arbitrary day. That is deliberate:
// this module works on instants and knows nothing about the clinic's timezone,
// so the tests must not depend on the machine's either. Turning clinic
// wall-clock times into instants is a separate concern, tested separately.

const DAY = '2026-08-31'

const at = (hhmm: string): Date => new Date(`${DAY}T${hhmm}:00.000Z`)
const span = (from: string, to: string): Interval => ({ start: at(from), end: at(to) })

/** Render intervals as "08:00-12:00" so a failure is readable at a glance. */
const show = (intervals: Interval[]): string[] =>
  intervals.map((i) => `${i.start.toISOString().slice(11, 16)}-${i.end.toISOString().slice(11, 16)}`)

// The clinic's standard weekday, used in several tests below.
const weekday = [span('08:00', '12:00'), span('13:00', '17:00')]

describe('isEmpty', () => {
  it('is false for a real span', () => {
    expect(isEmpty(span('08:00', '09:00'))).toBe(false)
  })

  it('is true for a zero-length span, because the end is excluded', () => {
    expect(isEmpty(span('09:00', '09:00'))).toBe(true)
  })

  it('is true for a reversed span', () => {
    expect(isEmpty(span('10:00', '09:00'))).toBe(true)
  })
})

describe('durationMinutes', () => {
  it('measures a span', () => {
    expect(durationMinutes(span('08:00', '09:30'))).toBe(90)
  })

  it('is zero for an empty span', () => {
    expect(durationMinutes(span('09:00', '09:00'))).toBe(0)
  })
})

describe('overlaps', () => {
  it('is true when the spans share time', () => {
    expect(overlaps(span('08:00', '10:00'), span('09:00', '11:00'))).toBe(true)
  })

  it('is FALSE when the spans merely touch', () => {
    // The rule the whole schema rests on: an appointment starting exactly when
    // another's buffer ends is legal. If this ever returns true, the engine
    // and the EXCLUDE constraints have diverged.
    expect(overlaps(span('08:00', '09:00'), span('09:00', '10:00'))).toBe(false)
  })

  it('is false when the spans are apart', () => {
    expect(overlaps(span('08:00', '09:00'), span('10:00', '11:00'))).toBe(false)
  })

  it('does not care which argument comes first', () => {
    expect(overlaps(span('09:00', '11:00'), span('08:00', '10:00'))).toBe(true)
  })
})

describe('contains', () => {
  it('accepts a span strictly inside', () => {
    expect(contains(span('08:00', '12:00'), span('09:00', '10:00'))).toBe(true)
  })

  it('accepts a span flush with both edges', () => {
    expect(contains(span('08:00', '12:00'), span('08:00', '12:00'))).toBe(true)
  })

  it('rejects a span that runs past the end', () => {
    // This is the buffer-overrun case: treatment fits, blocked range does not.
    expect(contains(span('08:00', '12:00'), span('11:00', '12:15'))).toBe(false)
  })
})

describe('normalize', () => {
  it('returns nothing for no input', () => {
    expect(normalize([])).toEqual([])
  })

  it('sorts out-of-order spans', () => {
    expect(show(normalize([span('13:00', '17:00'), span('08:00', '12:00')]))).toEqual([
      '08:00-12:00',
      '13:00-17:00',
    ])
  })

  it('drops empty and reversed spans', () => {
    expect(show(normalize([span('09:00', '09:00'), span('11:00', '10:00')]))).toEqual([])
  })

  it('merges overlapping spans', () => {
    expect(show(normalize([span('08:00', '10:00'), span('09:00', '11:00')]))).toEqual([
      '08:00-11:00',
    ])
  })

  it('merges touching spans, because their union has no hole', () => {
    expect(show(normalize([span('08:00', '09:00'), span('09:00', '10:00')]))).toEqual([
      '08:00-10:00',
    ])
  })

  it('swallows a span nested inside another', () => {
    expect(show(normalize([span('08:00', '12:00'), span('09:00', '10:00')]))).toEqual([
      '08:00-12:00',
    ])
  })

  it('preserves the lunch gap', () => {
    // The reason working hours are two rows. If normalize ever closed this,
    // the engine would happily book straight through lunch.
    expect(show(normalize(weekday))).toEqual(['08:00-12:00', '13:00-17:00'])
  })
})

describe('subtract', () => {
  it('returns the source untouched when there is nothing to remove', () => {
    expect(show(subtract(weekday, []))).toEqual(['08:00-12:00', '13:00-17:00'])
  })

  it('splits an interval when the removal sits in the middle', () => {
    expect(show(subtract([span('08:00', '12:00')], [span('09:00', '10:00')]))).toEqual([
      '08:00-09:00',
      '10:00-12:00',
    ])
  })

  it('trims the front', () => {
    expect(show(subtract([span('08:00', '12:00')], [span('07:00', '09:00')]))).toEqual([
      '09:00-12:00',
    ])
  })

  it('trims the back', () => {
    expect(show(subtract([span('08:00', '12:00')], [span('11:00', '13:00')]))).toEqual([
      '08:00-11:00',
    ])
  })

  it('removes everything when the removal covers the source', () => {
    expect(show(subtract([span('08:00', '12:00')], [span('07:00', '13:00')]))).toEqual([])
  })

  it('ignores a removal that only touches an edge', () => {
    // Half-open again: [12:00, 13:00) takes nothing from [08:00, 12:00).
    expect(show(subtract([span('08:00', '12:00')], [span('12:00', '13:00')]))).toEqual([
      '08:00-12:00',
    ])
  })

  it('applies several removals to one interval', () => {
    expect(
      show(
        subtract([span('08:00', '17:00')], [span('09:00', '10:00'), span('13:00', '14:00')]),
      ),
    ).toEqual(['08:00-09:00', '10:00-13:00', '14:00-17:00'])
  })

  it('handles a removal spanning two source intervals', () => {
    // A closure over the middle of the day eats the tail of the morning and
    // the head of the afternoon, and leaves lunch alone.
    expect(show(subtract(weekday, [span('11:00', '14:00')]))).toEqual([
      '08:00-11:00',
      '14:00-17:00',
    ])
  })

  it('copes with unsorted, overlapping removals', () => {
    expect(
      show(
        subtract(
          [span('08:00', '17:00')],
          [span('13:00', '14:00'), span('09:00', '11:00'), span('10:00', '12:00')],
        ),
      ),
    ).toEqual(['08:00-09:00', '12:00-13:00', '14:00-17:00'])
  })

  it('removes a whole day', () => {
    // A clinic closure runs local midnight to local midnight, so it swallows
    // both working windows.
    expect(show(subtract(weekday, [span('00:00', '23:59')]))).toEqual([])
  })
})

describe('intersect', () => {
  it('is empty when the sets are apart', () => {
    expect(show(intersect([span('08:00', '09:00')], [span('10:00', '11:00')]))).toEqual([])
  })

  it('is empty when the sets merely touch', () => {
    expect(show(intersect([span('08:00', '09:00')], [span('09:00', '10:00')]))).toEqual([])
  })

  it('keeps the shared middle', () => {
    expect(show(intersect([span('08:00', '10:00')], [span('09:00', '11:00')]))).toEqual([
      '09:00-10:00',
    ])
  })

  it('keeps the inner span when one contains the other', () => {
    expect(show(intersect([span('08:00', '12:00')], [span('09:00', '10:00')]))).toEqual([
      '09:00-10:00',
    ])
  })

  it('is empty when either side is empty', () => {
    expect(show(intersect([], weekday))).toEqual([])
    expect(show(intersect(weekday, []))).toEqual([])
  })

  it('sweeps many spans on both sides', () => {
    // Provider free mornings and late afternoon; the room free midday onward.
    const provider = [span('08:00', '12:00'), span('15:00', '17:00')]
    const room = [span('10:00', '16:00')]
    expect(show(intersect(provider, room))).toEqual(['10:00-12:00', '15:00-16:00'])
  })
})

describe('atLeastMinutes', () => {
  it('drops gaps too short to hold the service', () => {
    const gaps = [span('08:00', '08:30'), span('09:00', '11:00'), span('13:00', '13:45')]
    expect(show(atLeastMinutes(gaps, 60))).toEqual(['09:00-11:00'])
  })

  it('keeps a gap exactly the right size', () => {
    expect(show(atLeastMinutes([span('08:00', '09:00')], 60))).toEqual(['08:00-09:00'])
  })
})

// ---------------------------------------------------------------------------
// The seeded clinic, run through the algebra
// ---------------------------------------------------------------------------

// These reproduce the shapes prisma/seed.ts deliberately creates. They are the
// closest thing to an end-to-end check the pure algebra can have: if the claims
// written in the seed's comments are wrong, these fail.

describe('the seeded week', () => {
  it('leaves Reyes with nothing on Wednesday', () => {
    const booked = [
      span('08:00', '10:00'), // crown prep + 30 buffer
      span('10:00', '12:00'), // crown prep + 30 buffer
      span('13:00', '15:30'), // root canal + 30 buffer
      span('15:30', '17:00'), // extraction + 30 buffer
    ]
    expect(show(subtract(weekday, booked))).toEqual([])
  })

  it('leaves Osei three gaps on Tuesday', () => {
    const booked = [
      span('08:00', '10:30'), // root canal, 120 + 30
      span('14:00', '16:00'), // crown prep, 90 + 30
    ]
    const free = subtract(weekday, booked)
    expect(show(free)).toEqual(['10:30-12:00', '13:00-14:00', '16:00-17:00'])

    // The gap sizing the seed comments claim: a 30-minute service fits the
    // afternoon gaps, a 90-minute one does not.
    expect(show(atLeastMinutes(free, 90))).toEqual(['10:30-12:00'])
    expect(atLeastMinutes(free, 30)).toHaveLength(3)
  })

  it('leaves Clarke free from 10:15 on Monday, after two back-to-back cleanings', () => {
    const booked = [
      span('08:00', '09:15'), // routine cleaning, 60 + 15
      span('09:15', '10:15'), // child cleaning, 45 + 15 — starts as the buffer ends
    ]
    expect(show(subtract(weekday, booked))).toEqual(['10:15-12:00', '13:00-17:00'])
  })

  it('takes Thursday away from Raman entirely', () => {
    const timeOff = [span('00:00', '23:59')]
    expect(show(subtract(weekday, timeOff))).toEqual([])
  })
})
