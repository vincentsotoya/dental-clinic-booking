import { act, cleanup, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { useRescheduleParams } from './use-reschedule-params'

// Same reasoning as booking/use-booking-params.test.tsx: driven through a real
// router, because what is being proven is that the URL carries the move.

afterEach(cleanup)

let latest: ReturnType<typeof useRescheduleParams>

function Probe() {
  latest = useRescheduleParams()
  return <output>{latest.step}</output>
}

function at(url: string) {
  const router = createMemoryRouter([{ path: '/appointments/:id/reschedule', element: <Probe /> }], {
    initialEntries: [url],
  })
  render(<RouterProvider router={router} />)
  return router
}

describe('the step is derived from the choices', () => {
  it('asks who first — there is no service question here', () => {
    at('/appointments/appt_1/reschedule')
    expect(screen.getByRole('status').textContent).toBe('provider')
  })

  it('walks forward as each answer arrives', () => {
    at('/appointments/appt_1/reschedule?provider=any')
    expect(latest.step).toBe('date')

    cleanup()
    at('/appointments/appt_1/reschedule?provider=any&date=2026-09-10')
    expect(latest.step).toBe('time')

    cleanup()
    at('/appointments/appt_1/reschedule?provider=any&date=2026-09-10&at=2026-09-10T13:00:00.000Z')
    expect(latest.step).toBe('confirm')
  })

  it('lands on the first unanswered question when the URL skips one', () => {
    at('/appointments/appt_1/reschedule?at=2026-09-10T13:00:00.000Z')
    expect(latest.step).toBe('provider')
  })
})

describe('changing an answer forgets what depended on it', () => {
  // A new provider's Thursday may not be free at the time chosen for the old one.
  it('keeps nothing past the question that changed', () => {
    at('/appointments/appt_1/reschedule?provider=any&date=2026-09-10&at=2026-09-10T13:00:00.000Z')

    act(() => latest.choose('provider', 'abc'))

    expect(latest.choices).toEqual({ provider: 'abc', date: null, at: null })
    expect(latest.step).toBe('date')
  })

  it('keeps the provider but drops the slot when the day changes', () => {
    at('/appointments/appt_1/reschedule?provider=any&date=2026-09-10&at=2026-09-10T13:00:00.000Z')

    act(() => latest.choose('date', '2026-09-11'))

    expect(latest.choices.provider).toBe('any')
    expect(latest.choices.date).toBe('2026-09-11')
    expect(latest.choices.at).toBeNull()
  })
})

describe('releaseSlot', () => {
  it('drops the instant and nothing else', () => {
    at('/appointments/appt_1/reschedule?provider=any&date=2026-09-10&at=2026-09-10T13:00:00.000Z')

    act(() => latest.releaseSlot())

    expect(latest.step).toBe('time')
    expect(latest.choices.date).toBe('2026-09-10')
    expect(latest.choices.at).toBeNull()
  })
})

describe('back', () => {
  it('has nowhere to go from the first question', () => {
    at('/appointments/appt_1/reschedule')
    expect(latest.previous).toBeNull()
  })

  it('clears one answer and leaves everything before it alone', () => {
    at('/appointments/appt_1/reschedule?provider=any&date=2026-09-10')

    expect(latest.previous).toBe('date')
    act(() => latest.back())

    expect(latest.step).toBe('date')
    expect(latest.choices.provider).toBe('any')
    expect(latest.choices.date).toBeNull()
  })

  it('drops only the instant when pressed from the confirm step', () => {
    at('/appointments/appt_1/reschedule?provider=any&date=2026-09-10&at=2026-09-10T13:00:00.000Z')

    act(() => latest.back())

    expect(latest.step).toBe('time')
    expect(latest.choices.date).toBe('2026-09-10')
    expect(latest.choices.at).toBeNull()
  })
})
