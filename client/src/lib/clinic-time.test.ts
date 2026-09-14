import { describe, expect, it } from 'vitest'
import { civilDateOf } from './clinic-time'

// The one instant-to-civil-date conversion this module does not get for free
// from a slot's own `date` field — `/api/appointments/me` carries no civil
// date, only `startsAt`.

describe('civilDateOf', () => {
  it('reads the clinic day, not the UTC day', () => {
    // 9:30 PM UTC is 5:30 PM in New York, same calendar day.
    expect(civilDateOf('2026-10-06T21:30:00.000Z', 'America/New_York')).toBe('2026-10-06')
  })

  it('crosses midnight when the clinic zone does, even though UTC has not', () => {
    // 2:30 AM UTC on the 7th is 10:30 PM on the 6th in New York.
    expect(civilDateOf('2026-10-07T02:30:00.000Z', 'America/New_York')).toBe('2026-10-06')
  })

  it('disagrees with a naive UTC read — the bug this exists to prevent', () => {
    const instant = '2026-10-07T02:30:00.000Z'
    expect(civilDateOf(instant, 'America/New_York')).not.toBe(instant.slice(0, 10))
  })
})
