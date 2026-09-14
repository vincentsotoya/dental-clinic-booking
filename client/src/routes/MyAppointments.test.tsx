import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MeResponse, MyAppointmentsResponse, PatientAppointment } from '@dental/shared'
import { queryKeys } from '../api/keys'
import MyAppointments from './MyAppointments'

afterEach(cleanup)
afterEach(() => vi.unstubAllGlobals())

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
  service: {
    ...EXAM.service,
    id: '3d604f00-0000-4000-8000-000000000006',
    slug: 'adult-cleaning',
    name: 'Adult Cleaning',
  },
}

function response(
  when: MyAppointmentsResponse['when'],
  appointments: PatientAppointment[],
): MyAppointmentsResponse {
  return { when, timeZone: 'America/New_York', appointments }
}

/** Both windows seeded, so switching tabs never touches the network. */
function renderList({
  upcoming = [EXAM, CLEANING],
  past = [],
}: {
  upcoming?: PatientAppointment[]
  past?: PatientAppointment[]
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, queryFn: () => new Promise(() => {}) } },
  })
  queryClient.setQueryData(queryKeys.me(), ME)
  queryClient.setQueryData(queryKeys.myAppointments('upcoming'), response('upcoming', upcoming))
  queryClient.setQueryData(queryKeys.myAppointments('past'), response('past', past))

  const router = createMemoryRouter([{ path: '/appointments', element: <MyAppointments /> }], {
    initialEntries: ['/appointments'],
  })

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return queryClient
}

function stubCancel(reply: () => Response) {
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const url = String(input)
    if (init?.method === 'PATCH' && url.includes('/cancel')) return reply()
    throw new Error(`unexpected request: ${url}`)
  })
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('the list', () => {
  it('shows each appointment in the clinic zone, not the browser one', async () => {
    renderList()

    // 13:15Z is 9:15 in New York — the machine running this test is not.
    expect(await screen.findByText('Routine Exam')).toBeDefined()
    expect(screen.getByText('9:15 AM', { exact: false })).toBeDefined()
    expect(screen.getAllByText('Dr Alice Okonkwo').length).toBeGreaterThan(0)
  })

  it('says nothing is booked, distinct from nothing being past', async () => {
    renderList({ upcoming: [], past: [] })

    expect(await screen.findByText('Nothing booked yet.')).toBeDefined()

    fireEvent.click(screen.getByRole('tab', { name: 'Past' }))
    expect(await screen.findByText('Nothing here yet.')).toBeDefined()
  })

  it('switches lists without asking the network for what it already has', async () => {
    renderList({ upcoming: [EXAM], past: [CLEANING] })

    await screen.findByText('Routine Exam')
    fireEvent.click(screen.getByRole('tab', { name: 'Past' }))

    expect(await screen.findByText('Adult Cleaning')).toBeDefined()
    expect(screen.queryByText('Routine Exam')).toBeNull()
  })

  it('offers no cancel button for a row that is not confirmed', async () => {
    renderList({ upcoming: [{ ...EXAM, status: 'CANCELLED' }] })

    await screen.findByText('Routine Exam')
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
    expect(screen.getByText('cancelled')).toBeDefined()
  })

  // Seen live: a row that stayed CONFIRMED past its own start time (the clinic
  // never marked it COMPLETED) still offers Cancel on the upcoming list, and
  // the server correctly refuses it as NOT_CANCELLABLE. The past list is
  // bounded by the same "already started" line the server enforces, so a
  // button there would always fail.
  it('offers no cancel button on the past list, even for a row still marked confirmed', async () => {
    renderList({ upcoming: [], past: [EXAM] })

    fireEvent.click(await screen.findByRole('tab', { name: 'Past' }))

    await screen.findByText('Routine Exam')
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
  })
})

describe('cancelling', () => {
  it('names the appointment being cancelled before asking to confirm', async () => {
    renderList({ upcoming: [EXAM] })

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))

    expect(await screen.findByRole('dialog')).toBeDefined()
    expect(screen.getByText(/Routine Exam with Dr Alice Okonkwo/)).toBeDefined()
  })

  it('changes nothing until the second, explicit press', async () => {
    stubCancel(() => {
      throw new Error('should not be called')
    })
    renderList({ upcoming: [EXAM] })

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }))

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes the dialog once the cancellation succeeds', async () => {
    stubCancel(() => jsonResponse({ appointment: { ...EXAM, status: 'CANCELLED' } }))
    renderList({ upcoming: [EXAM] })

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel appointment' }))

    await screen.findByRole('button', { name: 'Cancel' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  // NOT_CANCELLABLE's message is written for a patient — the race the server
  // guards against, seen here as the client's job to surface honestly.
  it('shows the clinic’s own reason when it refuses, and leaves the dialog open', async () => {
    stubCancel(() =>
      jsonResponse(
        { error: { code: 'NOT_CANCELLABLE', message: 'That appointment has already started.' } },
        409,
      ),
    )
    renderList({ upcoming: [EXAM] })

    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel appointment' }))

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'That appointment has already started.',
    )
    expect(screen.getByRole('dialog')).toBeDefined()
  })
})
