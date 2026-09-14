import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MyAppointmentsResponse, PatientAppointment } from '@dental/shared'
import { queryKeys } from '../api/keys'
import { downloadIcs } from '../lib/ics'
import BookingConfirmed from './BookingConfirmed'

vi.mock('../lib/ics', () => ({ downloadIcs: vi.fn() }))

afterEach(cleanup)

const EXAM: PatientAppointment = {
  id: '5f2b8c00-0000-4000-8000-000000000001',
  status: 'CONFIRMED',
  startsAt: '2026-10-06T13:15:00.000Z',
  endsAt: '2026-10-06T13:45:00.000Z',
  notes: null,
  service: {
    id: '3d604f00-0000-4000-8000-000000000005',
    slug: 'routine-exam',
    name: 'Routine Exam',
    durationMins: 30,
  },
  provider: {
    id: '1b4e2d00-0000-4000-8000-000000000001',
    type: 'DENTIST',
    firstName: 'Amara',
    lastName: 'Osei',
    title: 'DDS',
  },
}

function renderAt(id: string, appointments: PatientAppointment[] = [EXAM]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, queryFn: () => new Promise(() => {}) } },
  })
  queryClient.setQueryData<MyAppointmentsResponse>(queryKeys.myAppointments(), {
    when: 'upcoming',
    timeZone: 'America/New_York',
    appointments,
  })

  const router = createMemoryRouter(
    [{ path: '/appointments/:id/confirmed', element: <BookingConfirmed /> }],
    { initialEntries: [`/appointments/${id}/confirmed`] },
  )

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('the dedicated confirmation screen', () => {
  it('names the treatment, the provider and when, in the clinic zone', async () => {
    renderAt(EXAM.id)

    expect(await screen.findByRole('heading', { name: 'You’re booked' })).toBeDefined()
    expect(screen.getByText('Routine Exam')).toBeDefined()
    expect(screen.getByText('Dr Amara Osei')).toBeDefined()
    // 13:15Z is 9:15 in New York — the browser running this test is not.
    expect(screen.getByText('9:15 AM')).toBeDefined()
  })

  it('moves focus to the heading, the way a page load would', async () => {
    renderAt(EXAM.id)

    const heading = await screen.findByRole('heading', { name: 'You’re booked' })
    expect(document.activeElement).toBe(heading)
  })

  it('names the page in the title', async () => {
    renderAt(EXAM.id)

    await screen.findByRole('heading', { name: 'You’re booked' })
    expect(document.title).toContain('You’re booked')
  })

  it('offers the appointment as a calendar file on request, not automatically', async () => {
    renderAt(EXAM.id)

    await screen.findByRole('heading', { name: 'You’re booked' })
    expect(downloadIcs).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Add to calendar' }))
    expect(downloadIcs).toHaveBeenCalledWith(EXAM)
  })

  // The id is a URL anyone can type; the row is the evidence.
  it('confirms nothing for an id that is not one of their rows', async () => {
    renderAt('5f2b8c00-0000-4000-8000-00000000dead')

    expect(await screen.findByRole('heading', { name: /can.t find/ })).toBeDefined()
    expect(screen.queryByText('Routine Exam')).toBeNull()
  })

  // A bookmarked confirmation outlives the booking it confirmed.
  it('confirms nothing once that booking is cancelled', async () => {
    renderAt(EXAM.id, [{ ...EXAM, status: 'CANCELLED' }])

    expect(await screen.findByRole('heading', { name: /can.t find/ })).toBeDefined()
  })
})
