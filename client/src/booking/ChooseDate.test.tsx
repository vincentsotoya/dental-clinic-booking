import { cleanup, render, screen } from '@testing-library/react'
import type { UseQueryResult } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AvailabilityResponse } from '@dental/shared'
import { ChooseDate } from './ChooseDate'

// Rendered directly with a hand-built response: paging is this component's own
// decision, not the flow's.

afterEach(cleanup)

function response(): AvailabilityResponse {
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
    range: { from: '2026-09-01', to: '2026-09-30' },
    providers: {},
    slots: [],
  } as AvailabilityResponse
}

function show(month: Date) {
  const query = {
    data: response(),
    isError: false,
    isPending: false,
    refetch: vi.fn(),
  } as unknown as UseQueryResult<AvailabilityResponse, Error>

  render(
    <ChooseDate
      availability={query}
      provider={null}
      month={month}
      onMonthChange={vi.fn()}
      onChoose={vi.fn()}
    />,
  )
}

describe('paging the calendar', () => {
  // Without a floor a patient can page back to 2019, firing an availability
  // request per month that lands on copy blaming their choice rather than the
  // empty month they went looking in.
  it('will not go earlier than the current month', () => {
    show(new Date())

    const previous = screen.getByRole('button', { name: 'Go to the Previous Month' })
    expect(previous.getAttribute('aria-disabled')).toBe('true')
  })

  it('leaves a later month free to page back from', () => {
    const future = new Date()
    future.setMonth(future.getMonth() + 2)
    show(future)

    const previous = screen.getByRole('button', { name: 'Go to the Previous Month' })
    expect(previous.getAttribute('aria-disabled')).toBeNull()
  })
})
