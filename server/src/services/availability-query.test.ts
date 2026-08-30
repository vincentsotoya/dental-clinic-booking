import { describe, expect, it } from 'vitest'
import { AvailabilityQueryError, datesInRange } from './availability-query'
import { iso } from './clinic-time'

// `findAvailability` itself is not unit-tested: it is five Prisma reads and a
// call, and a mocked client would only assert that the code says what it says.
// It is verified against the real seeded database instead — `npm run
// db:availability`, which is also what proves the CONFIRMED-only filter.
//
// What *is* worth testing here is the range expansion, which has real edge
// cases and no database in it.

const march = (day: number) => ({ year: 2026, month: 3, day })

describe('datesInRange', () => {
  it('includes both endpoints', () => {
    expect(datesInRange(march(9), march(13)).map(iso)).toEqual([
      '2026-03-09',
      '2026-03-10',
      '2026-03-11',
      '2026-03-12',
      '2026-03-13',
    ])
  })

  it('treats a single day as a range of one', () => {
    expect(datesInRange(march(9), march(9)).map(iso)).toEqual(['2026-03-09'])
  })

  it('rolls over a month boundary', () => {
    expect(datesInRange(march(30), { year: 2026, month: 4, day: 2 }).map(iso)).toEqual([
      '2026-03-30',
      '2026-03-31',
      '2026-04-01',
      '2026-04-02',
    ])
  })

  // The spring-forward day is 23 hours long. A range built by adding
  // 86,400,000ms would skip 2026-03-09 entirely; civil-date arithmetic has no
  // time-of-day for DST to act on.
  it('spans a DST transition without losing a day', () => {
    expect(datesInRange(march(7), march(10)).map(iso)).toEqual([
      '2026-03-07',
      '2026-03-08', // clocks go forward
      '2026-03-09',
      '2026-03-10',
    ])
  })

  it('rejects a reversed range', () => {
    expect(() => datesInRange(march(13), march(9))).toThrowError(
      expect.objectContaining({ code: 'RANGE_INVERTED' }),
    )
  })

  it('rejects a range longer than the maximum', () => {
    const error = (() => {
      try {
        datesInRange(march(1), { year: 2026, month: 12, day: 31 })
      } catch (thrown) {
        return thrown
      }
    })()

    expect(error).toBeInstanceOf(AvailabilityQueryError)
    expect((error as AvailabilityQueryError).code).toBe('RANGE_TOO_LONG')
  })

  it('allows a range of exactly the maximum', () => {
    expect(datesInRange(march(1), { year: 2026, month: 5, day: 29 })).toHaveLength(90)
  })
})
