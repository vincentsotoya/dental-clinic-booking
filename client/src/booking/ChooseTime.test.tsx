import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { UseQueryResult } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AvailabilityResponse } from '@dental/shared'
import { ChooseTime } from './ChooseTime'

// Rendered directly with a hand-built response: the grouping is a function of
// what the clinic's day looks like, and the shapes worth asserting — a day that
// is all afternoon, a day with two times — are ones a fixture would have to be
// bent to produce anyway.

afterEach(cleanup)

const DAY = '2026-09-10'
const PROVIDER = '1b4e2d00-0000-4000-8000-000000000001'

// 13:00Z is 9:00 in New York on this date. The suite's own machine is not in
// New York, which is the point: a browser-zone split would group these wrong.
function at(hourUtc: number, minute = 0) {
  return `${DAY}T${String(hourUtc).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`
}

function response(instants: string[]): AvailabilityResponse {
  return {
    service: {
      id: '3d604f00-0000-4000-8000-000000000005',
      slug: 'routine-exam',
      name: 'Routine Exam',
      durationMins: 30,
      bufferMins: 10,
      providerType: 'DENTIST',
    },
    timeZone: 'America/New_York',
    range: { from: DAY, to: DAY },
    providers: {
      [PROVIDER]: {
        id: PROVIDER,
        type: 'DENTIST',
        firstName: 'Amara',
        lastName: 'Osei',
        title: 'DDS',
      },
    },
    slots: instants.map((startsAt) => ({
      date: DAY,
      startsAt,
      endsAt: startsAt,
      blockedUntil: startsAt,
      providerId: PROVIDER,
      operatoryId: '0a3d1c00-0000-4000-8000-000000000002',
    })),
  } as AvailabilityResponse
}

function show(instants: string[]) {
  const onChoose = vi.fn()
  const query = {
    data: response(instants),
    isError: false,
    isPending: false,
    refetch: vi.fn(),
  } as unknown as UseQueryResult<AvailabilityResponse, Error>

  render(<ChooseTime availability={query} provider={null} date={DAY} onChoose={onChoose} />)
  return onChoose
}

// 9:00 through 11:30 in New York, then 13:00 through 16:30: a real clinic day
// with the two-hour lunch in the middle. Twelve times, both groups over the fold.
const FULL_DAY = [
  ...[13, 14, 15].flatMap((h) => [at(h, 0), at(h, 30)]),
  ...[17, 18, 19].flatMap((h) => [at(h, 0), at(h, 30)]),
]

function labels() {
  return screen.getAllByRole('button').map((button) => button.textContent ?? '')
}

describe('splitting the day', () => {
  it('divides at the clinic noon, not the browser one', () => {
    show(FULL_DAY)

    expect(screen.getByRole('heading', { name: 'Morning' })).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Afternoon' })).toBeDefined()

    // 11:30 AM is the last before lunch; 1:00 PM the first after it.
    expect(screen.getByRole('button', { name: '11:30 AM' })).toBeDefined()
    expect(screen.getByRole('button', { name: '1:00 PM' })).toBeDefined()
  })

  it('hides a group the clinic is not open for', () => {
    show([at(17), at(18), at(19)])

    expect(screen.getByRole('heading', { name: 'Afternoon' })).toBeDefined()
    expect(screen.queryByRole('heading', { name: 'Morning' })).toBeNull()
  })
})

describe('the shortcut', () => {
  it('books the first time of the day in one press', () => {
    const onChoose = show(FULL_DAY)

    fireEvent.click(screen.getByRole('button', { name: /Earliest/ }))

    expect(onChoose).toHaveBeenCalledWith(at(13))
  })

  it('names the time it would take, so it is not a blind button', () => {
    show(FULL_DAY)

    expect(screen.getByRole('button', { name: 'Earliest — 9:00 AM' })).toBeDefined()
  })

  // With a short list the shortcut is one more thing to read, not a saving.
  it('stays away when the whole day already fits on the screen', () => {
    show([at(13), at(14)])

    expect(screen.queryByRole('button', { name: /Earliest/ })).toBeNull()
    expect(screen.getByRole('button', { name: '9:00 AM' })).toBeDefined()
  })
})

describe('the collapsed groups', () => {
  // Nine in the afternoon, so the group is over the fold on its own.
  const LONG_AFTERNOON = [17, 18, 19, 20].flatMap((h) => [at(h, 0), at(h, 30)]).concat(at(21))

  it('says how many times it is holding back', () => {
    show(LONG_AFTERNOON)

    expect(screen.getByRole('button', { name: 'Show all 9 afternoon times' })).toBeDefined()
  })

  it('shows six until asked, then all of them', () => {
    show(LONG_AFTERNOON)

    // A bare time, so the "Earliest — 1:00 PM" shortcut is not counted as a slot.
    const pills = () => labels().filter((text) => /^\d{1,2}:\d{2} PM$/.test(text))

    expect(pills()).toHaveLength(6)

    fireEvent.click(screen.getByRole('button', { name: /Show all 9/ }))

    expect(pills()).toHaveLength(9)
  })

  it('tells a screen reader the list grew, rather than only redrawing it', () => {
    show(LONG_AFTERNOON)

    const disclosure = screen.getByRole('button', { name: /Show all 9/ })
    expect(disclosure.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(disclosure)

    expect(
      screen.getByRole('button', { name: /Show fewer/ }).getAttribute('aria-expanded'),
    ).toBe('true')
  })

  it('leaves a short group alone', () => {
    show([at(17), at(18), at(19)])

    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull()
  })
})
