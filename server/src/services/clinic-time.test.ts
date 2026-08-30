import { describe, expect, it } from 'vitest'
import { addDays, createClinicCalendar, iso, weekdayOf } from './clinic-time'

// The clinic's zone, hardcoded rather than read from env: these assertions are
// about America/New_York's actual DST rules, and a machine configured
// differently must not change the answer.
const clinic = createClinicCalendar('America/New_York')

const date = (year: number, month: number, day: number) => ({ year, month, day })

describe('clinicInstant', () => {
  it('resolves 08:00 to 13:00Z in winter, when New York is on EST (UTC-5)', () => {
    expect(clinic.clinicInstant(date(2026, 1, 14), 480).toISOString()).toBe(
      '2026-01-14T13:00:00.000Z',
    )
  })

  it('resolves the same 08:00 to 12:00Z in summer, on EDT (UTC-4)', () => {
    expect(clinic.clinicInstant(date(2026, 7, 14), 480).toISOString()).toBe(
      '2026-07-14T12:00:00.000Z',
    )
  })

  // The one that matters. A hardcoded -04:00 offset passes the summer case and
  // fails this one by an hour, which is exactly how the bug hides: correct from
  // March to November, wrong all winter.
  it('gives different instants for the same wall clock either side of a DST change', () => {
    const beforeSpringForward = clinic.clinicInstant(date(2026, 3, 6), 480)
    const afterSpringForward = clinic.clinicInstant(date(2026, 3, 13), 480)

    expect(beforeSpringForward.toISOString()).toBe('2026-03-06T13:00:00.000Z')
    expect(afterSpringForward.toISOString()).toBe('2026-03-13T12:00:00.000Z')
  })

  it('resolves a wall clock on the transition day itself', () => {
    // 2026-03-08 is the spring-forward Sunday: 02:00 never happens. The clinic
    // is shut then, but the two-pass offset correction is what stops a working
    // hour later that day resolving against the pre-transition offset.
    expect(clinic.clinicInstant(date(2026, 3, 8), 480).toISOString()).toBe(
      '2026-03-08T12:00:00.000Z',
    )
    // 2026-11-01 falls back: 01:00-01:59 happens twice.
    expect(clinic.clinicInstant(date(2026, 11, 1), 480).toISOString()).toBe(
      '2026-11-01T13:00:00.000Z',
    )
  })

  it('treats minute 1440 as midnight the next day — how a full-day closure is built', () => {
    expect(clinic.clinicInstant(date(2026, 7, 14), 1440).toISOString()).toBe(
      '2026-07-15T04:00:00.000Z',
    )
  })

  it('places the lunch gap where the schema says it is', () => {
    const morningEnd = clinic.clinicInstant(date(2026, 7, 14), 720)
    const afternoonStart = clinic.clinicInstant(date(2026, 7, 14), 780)
    expect(afternoonStart.getTime() - morningEnd.getTime()).toBe(60 * 60_000)
  })
})

describe('addDays', () => {
  it('rolls across a month boundary', () => {
    expect(addDays(date(2026, 8, 27), 8)).toEqual(date(2026, 9, 4))
  })

  it('rolls across a year boundary', () => {
    expect(addDays(date(2026, 12, 30), 3)).toEqual(date(2027, 1, 2))
  })

  it('handles a leap day', () => {
    expect(addDays(date(2028, 2, 28), 1)).toEqual(date(2028, 2, 29))
  })

  it('does not drift across a DST change, because a civil date has no clock', () => {
    // Seven days after the spring-forward Sunday is the following Sunday, not
    // the Saturday a naive `+ 7 * 86400000` on a local Date would produce.
    expect(addDays(date(2026, 3, 8), 7)).toEqual(date(2026, 3, 15))
  })

  it('goes backwards', () => {
    expect(addDays(date(2026, 3, 1), -1)).toEqual(date(2026, 2, 28))
  })
})

describe('weekdayOf', () => {
  it('names the schema enum value', () => {
    expect(weekdayOf(date(2026, 8, 31))).toBe('MONDAY')
    expect(weekdayOf(date(2026, 9, 5))).toBe('SATURDAY')
    expect(weekdayOf(date(2026, 9, 6))).toBe('SUNDAY')
  })
})

describe('iso', () => {
  it('zero-pads', () => {
    expect(iso(date(2026, 9, 7))).toBe('2026-09-07')
  })
})
