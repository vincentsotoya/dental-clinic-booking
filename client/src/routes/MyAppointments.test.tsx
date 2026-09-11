import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import type { MeResponse, MyAppointmentsResponse, PatientAppointment } from '@dental/shared'
import { queryKeys } from '../api/keys'
import MyAppointments from './MyAppointments'

afterEach(cleanup)

const ME: MeResponse = {
  user: {
    id: 'user_1',
    email: 'elena.marsh@example.com',
    firstName: 'Elena',
    lastName: 'Marsh',
    role: 'PATIENT',
  },
  patient: {
    id: '2c5f3e00-0000-4000-8000-000000000001',
    firstName: 'Elena',
    lastName: 'Marsh',
    email: 'elena.marsh@example.com',
  },
}

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
    firstName: 'Alice',
    lastName: 'Okonkwo',
    title: 'DDS',
  },
}

const CLEANING: PatientAppointment = {
  ...EXAM,
  id: '5f2b8c00-0000-4000-8000-000000000002',
  startsAt: '2026-10-20T18:00:00.000Z',
  endsAt: '2026-10-20T19:00:00.000Z',
  service: { ...EXAM.service, id: '3d604f00-0000-4000-8000-000000000006', slug: 'adult-cleaning', name: 'Adult Cleaning' },
}

/** Both queries seeded, so the screen renders its answer without the network. */
function renderAt(url: string, appointments: PatientAppointment[] = [EXAM, CLEANING]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, queryFn: () => new Promise(() => {}) } },
  })
  queryClient.setQueryData(queryKeys.me(), ME)
  queryClient.setQueryData<MyAppointmentsResponse>(queryKeys.myAppointments(), {
    when: 'upcoming',
    appointments,
  })

  const router = createMemoryRouter([{ path: '/appointments', element: <MyAppointments /> }], {
    initialEntries: [url],
  })

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('MyAppointments, arriving from the booking flow', () => {
  it('confirms the booking by name and says no email is coming', async () => {
    renderAt(`/appointments?booked=${EXAM.id}`)

    const confirmation = await screen.findByRole('status')
    expect(confirmation.textContent).toContain('You’re booked')
    expect(confirmation.textContent).toContain('Routine Exam with Alice Okonkwo, DDS')
    expect(confirmation.textContent).toContain('nothing is coming to your inbox')
  })

  it('marks the new row, and only that one, in words', async () => {
    renderAt(`/appointments?booked=${EXAM.id}`)

    await screen.findByRole('status')
    const [marked, ...others] = screen.getAllByText('Just booked')
    expect(others).toHaveLength(0)
    expect(marked?.closest('li')?.textContent).toContain('Routine Exam')
  })

  // The confirm button unmounted on the way here; left alone, focus is on
  // `<body>` and the next Tab lands on Sign out.
  it('moves focus to the confirmation', async () => {
    renderAt(`/appointments?booked=${EXAM.id}`)

    const confirmation = await screen.findByRole('status')
    expect(document.activeElement).toBe(confirmation)
  })

  it('confirms nothing without the parameter', async () => {
    renderAt('/appointments')

    await screen.findByText('Routine Exam')
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByText('Just booked')).toBeNull()
  })

  // The parameter is a URL anyone can type; the row is the evidence.
  it('confirms nothing for an id that is not one of their rows', async () => {
    renderAt('/appointments?booked=5f2b8c00-0000-4000-8000-00000000dead')

    await screen.findByText('Routine Exam')
    expect(screen.queryByRole('status')).toBeNull()
  })

  // A bookmarked confirmation outlives the booking it confirmed.
  it('confirms nothing once that booking is cancelled', async () => {
    renderAt(`/appointments?booked=${EXAM.id}`, [{ ...EXAM, status: 'CANCELLED' }, CLEANING])

    await screen.findByText('Routine Exam')
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByText('cancelled')).toBeDefined()
  })
})
