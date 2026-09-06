import { act, cleanup, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { useBookingParams } from './use-booking-params'

// The hook is driven through a real router rather than a stubbed
// `useSearchParams`: what is being tested is that the URL carries the booking,
// and a stub would prove the reducer worked while proving nothing about the URL.

afterEach(cleanup)

let latest: ReturnType<typeof useBookingParams>

function Probe() {
  latest = useBookingParams()
  return <output>{latest.step}</output>
}

function at(url: string) {
  const router = createMemoryRouter([{ path: '/book', element: <Probe /> }], {
    initialEntries: [url],
  })
  render(<RouterProvider router={router} />)
  return router
}

describe('the step is derived from the choices', () => {
  it('asks for a service first', () => {
    at('/book')
    expect(screen.getByRole('status').textContent).toBe('service')
  })

  it('walks forward as each answer arrives', () => {
    at('/book?service=routine-exam')
    expect(latest.step).toBe('provider')

    cleanup()
    at('/book?service=routine-exam&provider=any')
    expect(latest.step).toBe('date')

    cleanup()
    at('/book?service=routine-exam&provider=any&date=2026-09-10')
    expect(latest.step).toBe('time')

    cleanup()
    at('/book?service=routine-exam&provider=any&date=2026-09-10&at=2026-09-10T13:00:00.000Z')
    expect(latest.step).toBe('confirm')
  })

  // "I have not chosen" and "I do not mind who" are different answers, and only
  // one of them should stop the flow to ask.
  it('treats "any" as an answer, not as an absent one', () => {
    at('/book?service=routine-exam&provider=any')
    expect(latest.choices.provider).toBe('any')
    expect(latest.step).not.toBe('provider')
  })

  // A URL that has been edited by hand, or truncated in a chat client.
  it('lands on the first unanswered question when the URL skips one', () => {
    at('/book?service=routine-exam&at=2026-09-10T13:00:00.000Z')
    expect(latest.step).toBe('provider')
  })
})

describe('changing an answer forgets what depended on it', () => {
  // A 9:00 that was free for a thirty-minute exam is not necessarily free for a
  // two-hour root canal. Carrying the instant forward would send a stale one to
  // the confirm step.
  it('drops provider, date and slot when the service changes', () => {
    at('/book?service=routine-exam&provider=any&date=2026-09-10&at=2026-09-10T13:00:00.000Z')

    act(() => latest.choose('service', 'root-canal'))

    expect(latest.choices).toEqual({
      service: 'root-canal',
      provider: null,
      date: null,
      at: null,
    })
    expect(latest.step).toBe('provider')
  })

  it('keeps the service but drops the slot when the day changes', () => {
    at('/book?service=routine-exam&provider=any&date=2026-09-10&at=2026-09-10T13:00:00.000Z')

    act(() => latest.choose('date', '2026-09-11'))

    expect(latest.choices.service).toBe('routine-exam')
    expect(latest.choices.provider).toBe('any')
    expect(latest.choices.date).toBe('2026-09-11')
    expect(latest.choices.at).toBeNull()
  })

  it('sends the patient back to a question and forgets its dependants', () => {
    at('/book?service=routine-exam&provider=any&date=2026-09-10&at=2026-09-10T13:00:00.000Z')

    act(() => latest.revise('provider'))

    expect(latest.step).toBe('provider')
    expect(latest.choices.service).toBe('routine-exam')
    expect(latest.choices.date).toBeNull()
    expect(latest.choices.at).toBeNull()
  })
})

// What a lost race needs: everything about the booking is still true except the
// one instant somebody else took.
describe('releaseSlot', () => {
  it('drops the instant and nothing else', () => {
    at('/book?service=routine-exam&provider=any&date=2026-09-10&at=2026-09-10T13:00:00.000Z')

    act(() => latest.releaseSlot())

    expect(latest.step).toBe('time')
    expect(latest.choices.date).toBe('2026-09-10')
    expect(latest.choices.at).toBeNull()
  })
})

// The reason the flow can be public up to the last step: the guard's `from`
// carries the query string, so signing in returns to the chosen slot.
describe('the booking survives a round trip through the URL', () => {
  it('restores every choice from a link', () => {
    const url = '/book?service=root-canal&provider=abc&date=2026-09-10&at=2026-09-10T13:00:00.000Z'
    at(url)

    expect(latest.choices).toEqual({
      service: 'root-canal',
      provider: 'abc',
      date: '2026-09-10',
      at: '2026-09-10T13:00:00.000Z',
    })
    expect(latest.step).toBe('confirm')
  })

  it('puts a new choice in the browser history so back undoes it', () => {
    const router = at('/book?service=routine-exam')

    act(() => latest.choose('provider', 'any'))
    expect(latest.step).toBe('date')

    act(() => void router.navigate(-1))
    expect(latest.step).toBe('provider')
  })
})
