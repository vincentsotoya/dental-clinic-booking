import { describe, expect, it } from 'vitest'
import {
  availabilityError,
  availabilityErrorCode,
  availabilityQuery,
  availabilityResponse,
  toIsoDate,
} from './availability'

describe('availabilityQuery', () => {
  it('parses a range into civil dates, never instants', () => {
    const parsed = availabilityQuery.parse({
      service: 'routine-exam',
      from: '2026-08-31',
      to: '2026-09-05',
    })

    expect(parsed).toEqual({
      serviceSlug: 'routine-exam',
      from: { year: 2026, month: 8, day: 31 },
      to: { year: 2026, month: 9, day: 5 },
    })
  })

  // The whole point of the transform: no Date object is produced, so there is
  // nothing carrying a UTC midnight that the clinic's zone would read as the
  // previous evening.
  it('produces plain numbers, not Dates', () => {
    const { from } = availabilityQuery.parse({ service: 'routine-exam', from: '2026-08-31' })
    expect(from).not.toBeInstanceOf(Date)
    expect(Object.values(from).every((value) => typeof value === 'number')).toBe(true)
  })

  it('collapses a missing `to` onto `from`', () => {
    const parsed = availabilityQuery.parse({ service: 'child-cleaning', from: '2026-08-31' })
    expect(parsed.to).toEqual(parsed.from)
  })

  it('rejects a date that does not exist', () => {
    expect(availabilityQuery.safeParse({ service: 'x', from: '2026-02-30' }).success).toBe(false)
  })

  it('accepts a real leap day', () => {
    expect(availabilityQuery.parse({ service: 'x', from: '2024-02-29' }).from).toEqual({
      year: 2024,
      month: 2,
      day: 29,
    })
  })

  it.each(['2026-8-31', '31-08-2026', '2026-08-31T00:00:00Z', 'today'])(
    'rejects %s as a date',
    (value) => {
      expect(availabilityQuery.safeParse({ service: 'x', from: value }).success).toBe(false)
    },
  )

  it.each(['Routine-Exam', 'routine exam', 'routine--exam', '-routine', 'routine-'])(
    'rejects %s as a slug',
    (service) => {
      expect(availabilityQuery.safeParse({ service, from: '2026-08-31' }).success).toBe(false)
    },
  )

  it('requires a service and a from', () => {
    expect(availabilityQuery.safeParse({ from: '2026-08-31' }).success).toBe(false)
    expect(availabilityQuery.safeParse({ service: 'routine-exam' }).success).toBe(false)
  })
})

describe('toIsoDate', () => {
  it('pads month and day', () => {
    expect(toIsoDate({ year: 2026, month: 9, day: 5 })).toBe('2026-09-05')
  })

  it('round-trips through the query parser', () => {
    const iso = '2026-01-02'
    const { from } = availabilityQuery.parse({ service: 'x', from: iso })
    expect(toIsoDate(from)).toBe(iso)
  })
})

// ---------------------------------------------------------------------------

const provider = {
  id: '1b4e2d00-0000-4000-8000-000000000001',
  type: 'DENTIST',
  firstName: 'Amara',
  lastName: 'Osei',
  title: 'DDS',
}

const response = {
  service: {
    id: '3d604f00-0000-4000-8000-000000000005',
    slug: 'routine-exam',
    name: 'Routine Exam',
    durationMins: 30,
    bufferMins: 10,
    providerType: 'DENTIST',
  },
  timeZone: 'America/New_York',
  range: { from: '2026-08-31', to: '2026-08-31' },
  providers: { [provider.id]: provider },
  slots: [
    {
      date: '2026-08-31',
      startsAt: '2026-08-31T12:00:00.000Z',
      endsAt: '2026-08-31T12:30:00.000Z',
      blockedUntil: '2026-08-31T12:40:00.000Z',
      providerId: provider.id,
      operatoryId: '0a3d1c00-0000-4000-8000-000000000001',
    },
  ],
}

describe('availabilityResponse', () => {
  it('accepts a well-formed body', () => {
    expect(availabilityResponse.parse(response)).toEqual(response)
  })

  it('accepts a provider with no title', () => {
    const body = {
      ...response,
      providers: { [provider.id]: { ...provider, title: null } },
    }
    expect(availabilityResponse.safeParse(body).success).toBe(true)
  })

  it('accepts an empty day', () => {
    expect(availabilityResponse.safeParse({ ...response, slots: [] }).success).toBe(true)
  })

  // `date` is a civil date and the three timestamps are instants. Swapping the
  // two formats is the mistake this endpoint is most likely to make, so the
  // schema has to catch it in both directions.
  it('rejects an instant where a civil date belongs', () => {
    const slots = [{ ...response.slots[0], date: '2026-08-31T12:00:00.000Z' }]
    expect(availabilityResponse.safeParse({ ...response, slots }).success).toBe(false)
  })

  it('rejects a civil date where an instant belongs', () => {
    const slots = [{ ...response.slots[0], startsAt: '2026-08-31' }]
    expect(availabilityResponse.safeParse({ ...response, slots }).success).toBe(false)
  })

  it('rejects a non-uuid provider id', () => {
    const slots = [{ ...response.slots[0], providerId: 'osei' }]
    expect(availabilityResponse.safeParse({ ...response, slots }).success).toBe(false)
  })

  it('rejects a negative duration', () => {
    const service = { ...response.service, durationMins: 0 }
    expect(availabilityResponse.safeParse({ ...response, service }).success).toBe(false)
  })

  it('allows a zero buffer but not a negative one', () => {
    const zero = { ...response.service, bufferMins: 0 }
    const negative = { ...response.service, bufferMins: -5 }
    expect(availabilityResponse.safeParse({ ...response, service: zero }).success).toBe(true)
    expect(availabilityResponse.safeParse({ ...response, service: negative }).success).toBe(false)
  })
})

describe('availabilityError', () => {
  it('accepts every code the contract declares', () => {
    for (const code of availabilityErrorCode.options) {
      expect(availabilityError.safeParse({ error: { code, message: 'nope' } }).success).toBe(true)
    }
  })

  it('rejects an unknown code', () => {
    expect(availabilityError.safeParse({ error: { code: 'TEAPOT', message: 'x' } }).success).toBe(
      false,
    )
  })
})
