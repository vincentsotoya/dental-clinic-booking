import { describe, expect, it } from 'vitest'
import {
  type AvailabilityRequest,
  type BookedRange,
  getAvailableSlots,
  type ProviderSchedule,
  type ServiceSpec,
  type Slot,
} from './availability'
import { createClinicCalendar } from './clinic-time'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
//
// Shaped like the seed: two weekday windows with a lunch gap between them, and
// three interchangeable rooms. Named Room A/B/C rather than the seed's
// "Operatory One/Two/Three" because these tests assert on *name order*, and
// alphabetically "One" sorts before "Three" before "Two" — true, and a terrible
// thing to read in an assertion.

const TZ = 'America/New_York'
const clinic = createClinicCalendar(TZ)

const MONDAY_SUMMER = { year: 2026, month: 7, day: 13 } // EDT, UTC-4
const MONDAY_WINTER = { year: 2026, month: 1, day: 12 } // EST, UTC-5
const SATURDAY = { year: 2026, month: 9, day: 5 }

const MORNING = { weekday: 'MONDAY', startMinute: 480, endMinute: 720 } as const // 08:00–12:00
const AFTERNOON = { weekday: 'MONDAY', startMinute: 780, endMinute: 1020 } as const // 13:00–17:00

const dentist: ProviderSchedule = {
  id: 'provider-dentist',
  type: 'DENTIST',
  workingHours: [MORNING, AFTERNOON],
}

const hygienist: ProviderSchedule = {
  id: 'provider-hygienist',
  type: 'HYGIENIST',
  workingHours: [MORNING, AFTERNOON],
}

const rooms = [
  { id: 'room-a', name: 'Room A' },
  { id: 'room-b', name: 'Room B' },
  { id: 'room-c', name: 'Room C' },
]

const checkup: ServiceSpec = { durationMins: 30, bufferMins: 0, providerType: 'DENTIST' }

/** A wall-clock time on a date in the clinic's zone. `at(MONDAY, '09:30')`. */
function at(date: { year: number; month: number; day: number }, hhmm: string): Date {
  const [hours = '0', minutes = '0'] = hhmm.split(':')
  return clinic.clinicInstant(date, Number(hours) * 60 + Number(minutes))
}

/** An appointment on the books. Buffer is added to `endsAt` to get the blocked range. */
function booking(args: {
  date?: { year: number; month: number; day: number }
  from: string
  to: string
  bufferMins?: number
  providerId?: string
  operatoryId?: string
}): BookedRange {
  const date = args.date ?? MONDAY_SUMMER
  const endsAt = at(date, args.to)
  return {
    providerId: args.providerId ?? dentist.id,
    operatoryId: args.operatoryId ?? rooms[0]!.id,
    startsAt: at(date, args.from),
    blockedUntil: new Date(endsAt.getTime() + (args.bufferMins ?? 0) * 60_000),
  }
}

/**
 * A request with everything empty, ready to be overridden per test.
 *
 * `leadTimeMins: 0` by default so that only the lead-time tests have to think
 * about it; `now` sits a week before the fixture dates.
 */
function request(overrides: Partial<AvailabilityRequest> = {}): AvailabilityRequest {
  return {
    service: checkup,
    providers: [dentist],
    operatories: rooms,
    appointments: [],
    timeOff: [],
    closures: [],
    dates: [MONDAY_SUMMER],
    now: new Date('2026-01-01T00:00:00.000Z'),
    timeZone: TZ,
    leadTimeMins: 0,
    gridMins: 15,
    ...overrides,
  }
}

/** Slot start times as clinic wall clock — what the assertions actually read. */
const wallClock = (slots: Slot[]): string[] =>
  slots.map((slot) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(slot.startsAt),
  )

// ---------------------------------------------------------------------------

describe('an empty day', () => {
  it('offers the grid across both windows, stopping where treatment no longer fits', () => {
    const times = wallClock(getAvailableSlots(request()))

    expect(times[0]).toBe('08:00')
    // 11:30 + 30 minutes lands exactly on 12:00, which is allowed — the window
    // is half-open, so treatment ending at the boundary is inside it.
    expect(times).toContain('11:30')
    // 11:45 + 30 would run into lunch.
    expect(times).not.toContain('11:45')
    expect(times).toContain('13:00')
    expect(times.at(-1)).toBe('16:30')
    expect(times).toHaveLength(30)
  })

  it('never offers a time during lunch', () => {
    const times = wallClock(getAvailableSlots(request()))
    expect(times).not.toContain('12:00')
    expect(times).not.toContain('12:30')
  })

  it('returns nothing on a weekday the provider does not work', () => {
    expect(getAvailableSlots(request({ dates: [SATURDAY] }))).toEqual([])
  })
})

describe('a closed day', () => {
  it('returns nothing when a clinic closure spans the date', () => {
    const slots = getAvailableSlots(
      request({
        closures: [{ startsAt: at(MONDAY_SUMMER, '00:00'), endsAt: at(MONDAY_SUMMER, '24:00') }],
      }),
    )
    expect(slots).toEqual([])
  })

  it('returns nothing when the provider is on time off all day', () => {
    const slots = getAvailableSlots(
      request({
        timeOff: [
          {
            providerId: dentist.id,
            startsAt: at(MONDAY_SUMMER, '00:00'),
            endsAt: at(MONDAY_SUMMER, '24:00'),
          },
        ],
      }),
    )
    expect(slots).toEqual([])
  })

  it('keeps the afternoon when a closure only covers the morning', () => {
    const times = wallClock(
      getAvailableSlots({
        ...request(),
        closures: [{ startsAt: at(MONDAY_SUMMER, '00:00'), endsAt: at(MONDAY_SUMMER, '12:00') }],
      }),
    )
    expect(times[0]).toBe('13:00')
    expect(times).toHaveLength(15)
  })
})

describe('a fully booked day', () => {
  it('returns nothing when the provider is booked across both windows', () => {
    const slots = getAvailableSlots(
      request({
        appointments: [
          booking({ from: '08:00', to: '12:00' }),
          booking({ from: '13:00', to: '17:00' }),
        ],
      }),
    )
    expect(slots).toEqual([])
  })

  it('still offers the day when only one of three rooms is booked', () => {
    const slots = getAvailableSlots(
      request({
        appointments: [
          booking({ from: '09:00', to: '10:00', operatoryId: 'room-a', providerId: 'someone-else' }),
        ],
      }),
    )
    // The dentist is free; Room A is not. Rooms B and C cover it.
    expect(wallClock(slots)).toContain('09:00')
    expect(slots.find((slot) => wallClock([slot])[0] === '09:00')?.operatoryId).toBe('room-b')
  })
})

describe('buffer edges', () => {
  it('offers the instant a previous appointment stops blocking — back-to-back is legal', () => {
    // 09:00–09:30 treatment with a 5-minute buffer blocks until 09:35.
    const times = wallClock(
      getAvailableSlots(
        request({
          operatories: [rooms[0]!],
          appointments: [booking({ from: '09:00', to: '09:30', bufferMins: 5 })],
        }),
      ),
    )

    // ADR-0005 rule 2: the off-grid free-interval start is a candidate, so the
    // ten minutes between 09:35 and the next grid point are not lost.
    expect(times).toContain('09:35')
    expect(times).toContain('08:00')
    expect(times).not.toContain('09:00') // taken
    expect(times).not.toContain('09:30') // inside the buffer
    expect(times).not.toContain('09:15') // treatment would run into the booking
  })

  it('offers a start whose buffer overruns the end of the day', () => {
    // ADR-0005 rule 1: treatment must fit the window; the buffer need not.
    const times = wallClock(
      getAvailableSlots(
        request({
          service: { durationMins: 15, bufferMins: 15, providerType: 'DENTIST' },
        }),
      ),
    )

    // 16:45 + 15 treatment ends exactly at 17:00; the buffer runs to 17:15.
    expect(times.at(-1)).toBe('16:45')
  })

  it('refuses a start whose treatment overruns the end of the day', () => {
    const times = wallClock(
      getAvailableSlots(
        request({
          service: { durationMins: 30, bufferMins: 15, providerType: 'DENTIST' },
        }),
      ),
    )

    expect(times.at(-1)).toBe('16:30')
    expect(times).not.toContain('16:45')
  })

  it('refuses a start whose buffer would run into the next appointment', () => {
    // Free from 08:00; the next booking starts at 09:00. A 30-minute service
    // with a 15-minute buffer starting at 08:45 would be blocked until 09:30 —
    // treatment fits, the buffer does not clear the booking.
    const times = wallClock(
      getAvailableSlots(
        request({
          operatories: [rooms[0]!],
          service: { durationMins: 30, bufferMins: 15, providerType: 'DENTIST' },
          appointments: [booking({ from: '09:00', to: '10:00' })],
        }),
      ),
    )

    expect(times).not.toContain('08:45')
    expect(times).toContain('08:15') // 08:15–08:45, blocked to 09:00 — touching is fine
  })
})

describe('the lead-time cutoff', () => {
  const now = at(MONDAY_SUMMER, '08:00')

  it('drops everything inside the notice period and keeps the boundary itself', () => {
    const times = wallClock(getAvailableSlots(request({ now, leadTimeMins: 120 })))

    expect(times).not.toContain('09:45')
    expect(times[0]).toBe('10:00') // exactly at the cutoff — offered
  })

  it('empties today but not tomorrow at a full day of notice', () => {
    const tuesday = clinic.addDays(MONDAY_SUMMER, 1)
    const tuesdayHours: ProviderSchedule = {
      ...dentist,
      workingHours: [
        { ...MORNING, weekday: 'TUESDAY' },
        { ...AFTERNOON, weekday: 'TUESDAY' },
      ],
    }

    const slots = getAvailableSlots(
      request({
        providers: [tuesdayHours],
        dates: [MONDAY_SUMMER, tuesday],
        now,
        leadTimeMins: 24 * 60,
      }),
    )

    // Monday has no working hours for this provider and Tuesday is beyond the
    // cutoff, so every slot returned is Tuesday's.
    expect(slots).toHaveLength(30)
    expect(slots[0]!.startsAt.getTime()).toBeGreaterThanOrEqual(
      now.getTime() + 24 * 60 * 60_000,
    )
  })
})

describe('daylight saving time', () => {
  // The test the whole clinic-time module exists for. A hardcoded -04:00 offset
  // passes the July case and fails the January one by an hour.
  it('resolves the same 08:00 window to a different instant in winter and summer', () => {
    const summer = getAvailableSlots(request({ dates: [MONDAY_SUMMER] }))

    const winterProvider: ProviderSchedule = dentist // same MONDAY rows
    const winter = getAvailableSlots(
      request({ providers: [winterProvider], dates: [MONDAY_WINTER] }),
    )

    expect(summer[0]!.startsAt.toISOString()).toBe('2026-07-13T12:00:00.000Z')
    expect(winter[0]!.startsAt.toISOString()).toBe('2026-01-12T13:00:00.000Z')

    // Same clinic, same rules: the wall clock and the count are identical even
    // though the instants are an hour apart.
    expect(wallClock(winter)).toEqual(wallClock(summer))
  })
})

describe('a service longer than any remaining gap', () => {
  it('returns nothing when free time exists but no stretch is long enough', () => {
    // Bookings leave 60-minute holes; the service needs 90.
    const slots = getAvailableSlots(
      request({
        operatories: [rooms[0]!],
        service: { durationMins: 90, bufferMins: 0, providerType: 'DENTIST' },
        appointments: [
          booking({ from: '09:00', to: '11:00' }),
          booking({ from: '14:00', to: '16:00' }),
        ],
      }),
    )

    // Free: 08:00–09:00, 11:00–12:00, 13:00–14:00, 16:00–17:00 — four hours of
    // it, and not one bookable minute.
    expect(slots).toEqual([])
  })

  it('offers the gap when the service is exactly its length', () => {
    const slots = getAvailableSlots(
      request({
        operatories: [rooms[0]!],
        service: { durationMins: 60, bufferMins: 0, providerType: 'DENTIST' },
        appointments: [
          booking({ from: '09:00', to: '11:00' }),
          booking({ from: '14:00', to: '16:00' }),
        ],
      }),
    )

    expect(wallClock(slots)).toEqual(['08:00', '11:00', '13:00', '16:00'])
  })
})

describe('provider and room selection', () => {
  it('never offers a dentist for a hygienist service', () => {
    const slots = getAvailableSlots(
      request({
        providers: [dentist, hygienist],
        service: { durationMins: 30, bufferMins: 0, providerType: 'HYGIENIST' },
      }),
    )

    expect(slots).not.toHaveLength(0)
    expect(slots.every((slot) => slot.providerId === hygienist.id)).toBe(true)
  })

  it('names one room per start time, deterministically the first free by name', () => {
    const slots = getAvailableSlots(request({ operatories: [...rooms].reverse() }))

    expect(slots.every((slot) => slot.operatoryId === 'room-a')).toBe(true)
    // One slot per time, not one per room.
    expect(new Set(wallClock(slots)).size).toBe(slots.length)
  })

  it('returns both providers when both are free, sorted by time', () => {
    const second: ProviderSchedule = { ...dentist, id: 'provider-dentist-2' }
    const slots = getAvailableSlots(request({ providers: [second, dentist] }))

    expect(slots).toHaveLength(60)
    expect(slots[0]!.providerId).toBe('provider-dentist')
    expect(slots[1]!.providerId).toBe('provider-dentist-2')

    // Both name Room A, and that is correct: a Slot is a candidate, not a
    // reservation. Nothing is held — there is no PENDING status — so whoever
    // books first takes Room A and the next query offers the other provider
    // Room B. Allocating rooms across providers here would be inventing a
    // reservation the system does not have.
    expect(slots[0]!.operatoryId).toBe('room-a')
    expect(slots[1]!.operatoryId).toBe('room-a')

    const startTimes = slots.map((slot) => slot.startsAt.getTime())
    expect(startTimes).toEqual([...startTimes].sort((a, b) => a - b))
  })
})

describe('the returned slot', () => {
  it('carries the three timestamps a booking needs', () => {
    const slot = getAvailableSlots(
      request({ service: { durationMins: 45, bufferMins: 15, providerType: 'DENTIST' } }),
    )[0]!

    expect(slot.endsAt.getTime() - slot.startsAt.getTime()).toBe(45 * 60_000)
    expect(slot.blockedUntil.getTime() - slot.endsAt.getTime()).toBe(15 * 60_000)
  })
})
