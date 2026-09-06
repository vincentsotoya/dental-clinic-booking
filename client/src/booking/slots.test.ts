import type { AvailabilityResponse, AvailabilitySlot } from '@dental/shared'
import { describe, expect, it } from 'vitest'
import {
  bookableDates,
  isStillOffered,
  providerForSlot,
  providersWhoPerform,
  slotsFor,
  startTimesOn,
} from './slots'
import { ANY_PROVIDER } from './use-booking-params'

const OSEI = '4d604f00-0000-4000-8000-000000000001'
const RAMAN = '4d604f00-0000-4000-8000-000000000002'
const ROOM = '5d604f00-0000-4000-8000-000000000001'

function slot(date: string, startsAt: string, providerId: string): AvailabilitySlot {
  return {
    date,
    startsAt,
    endsAt: startsAt,
    blockedUntil: startsAt,
    providerId,
    operatoryId: ROOM,
  }
}

function response(slots: AvailabilitySlot[]): AvailabilityResponse {
  return {
    service: {
      id: '3d604f00-0000-4000-8000-000000000005',
      slug: 'routine-exam',
      name: 'Routine Exam',
      durationMins: 30,
      bufferMins: 15,
      providerType: 'DENTIST',
    },
    timeZone: 'America/New_York',
    range: { from: '2026-09-10', to: '2026-09-11' },
    providers: {},
    slots,
  }
}

const WEEK = response([
  slot('2026-09-10', '2026-09-10T13:00:00.000Z', OSEI),
  slot('2026-09-10', '2026-09-10T13:00:00.000Z', RAMAN),
  slot('2026-09-10', '2026-09-10T14:00:00.000Z', RAMAN),
  slot('2026-09-11', '2026-09-11T13:00:00.000Z', OSEI),
])

describe('slotsFor', () => {
  it('narrows to one provider without asking the server again', () => {
    expect(slotsFor(WEEK, OSEI)).toHaveLength(2)
    expect(slotsFor(WEEK, RAMAN)).toHaveLength(2)
  })

  it('keeps every slot for "anyone"', () => {
    expect(slotsFor(WEEK, ANY_PROVIDER)).toHaveLength(4)
  })

  it('is empty rather than throwing before the response arrives', () => {
    expect(slotsFor(undefined, OSEI)).toEqual([])
  })
})

describe('bookableDates', () => {
  // The calendar disables everything not in this set, so closures, lunch, the
  // lead time and a full book all arrive through one mechanism.
  it('is the civil dates carried by the slots, not dates derived from instants', () => {
    expect(bookableDates(WEEK.slots)).toEqual(new Set(['2026-09-10', '2026-09-11']))
  })

  it('drops a date once its provider is filtered out', () => {
    expect(bookableDates(slotsFor(WEEK, RAMAN))).toEqual(new Set(['2026-09-10']))
  })
})

describe('startTimesOn', () => {
  // Two dentists free at 9:00 is one 9:00 to a patient. Offering it twice asks
  // them to choose between two things they cannot tell apart.
  it('collapses two providers at the same instant into one time', () => {
    expect(startTimesOn(WEEK.slots, '2026-09-10')).toEqual([
      '2026-09-10T13:00:00.000Z',
      '2026-09-10T14:00:00.000Z',
    ])
  })

  it('ignores other days', () => {
    expect(startTimesOn(WEEK.slots, '2026-09-11')).toEqual(['2026-09-11T13:00:00.000Z'])
  })
})

describe('providerForSlot', () => {
  it('is the named provider when one was chosen', () => {
    expect(providerForSlot(WEEK, RAMAN, '2026-09-10T13:00:00.000Z')).toBe(RAMAN)
  })

  // Deterministic, so the confirm screen names the same person the booking
  // request will carry — not whichever object the filter reached first.
  it('settles "anyone" the same way every time', () => {
    const chosen = providerForSlot(WEEK, ANY_PROVIDER, '2026-09-10T13:00:00.000Z')

    expect(chosen).toBe(OSEI)
    expect(providerForSlot(WEEK, ANY_PROVIDER, '2026-09-10T13:00:00.000Z')).toBe(chosen)
  })

  // The signal the confirm step uses to say "that time has just gone" — a
  // selection that outlived the availability it was made against.
  it('is null when the instant is no longer offered', () => {
    expect(providerForSlot(WEEK, OSEI, '2026-09-10T14:00:00.000Z')).toBeNull()
    expect(isStillOffered(WEEK, OSEI, '2026-09-10T14:00:00.000Z')).toBe(false)
    expect(isStillOffered(WEEK, RAMAN, '2026-09-10T14:00:00.000Z')).toBe(true)
  })
})

describe('providersWhoPerform', () => {
  const TEAM = [
    { id: OSEI, type: 'DENTIST' as const },
    { id: RAMAN, type: 'DENTIST' as const },
    { id: 'c1', type: 'HYGIENIST' as const },
  ]

  it('offers only the providers who perform the treatment (ADR-0002)', () => {
    expect(providersWhoPerform(TEAM, 'HYGIENIST')).toEqual([{ id: 'c1', type: 'HYGIENIST' }])
  })

  // Built from the catalogue on purpose: availability names only providers with
  // a free slot, so a fully-booked dentist would vanish rather than show as busy.
  it('lists a provider the availability window has no slots for', () => {
    expect(providersWhoPerform(TEAM, 'DENTIST').map((p) => p.id)).toEqual([OSEI, RAMAN])
  })

  it('offers nobody until a service says who performs it', () => {
    expect(providersWhoPerform(TEAM, undefined)).toEqual([])
  })
})
