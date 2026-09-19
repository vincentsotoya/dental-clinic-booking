import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addCivilDays } from '@/lib/clinic-time'
import AdminCalendar from './AdminCalendar'

// Driven over a stubbed `fetch` that echoes back whatever range it was asked
// for — the server's own date-window logic is proven for real by
// `npm run db:admin-calendar`; what this suite holds down is what the screen
// does with a range once it has one: which day it asks for, how it groups a
// week, and what an empty day says.

afterEach(cleanup)
afterEach(() => vi.unstubAllGlobals())

const OSEI = { id: '1b4e2d00-0000-4000-8000-000000000001', type: 'DENTIST', firstName: 'Amara', lastName: 'Osei', title: 'DDS' }
const CLARKE = { id: '1b4e2d00-0000-4000-8000-000000000004', type: 'HYGIENIST', firstName: 'Naomi', lastName: 'Clarke', title: 'RDH' }

function row(n: number, date: string, firstName: string, provider: typeof OSEI) {
  const suffix = String(n).padStart(12, '0')
  return {
    id: `5f2b8c00-0000-4000-8000-${suffix}`,
    status: 'CONFIRMED',
    startsAt: `${date}T13:00:00.000Z`,
    endsAt: `${date}T13:30:00.000Z`,
    notes: null,
    patient: {
      id: `2c5f3e00-0000-4000-8000-${suffix}`,
      firstName,
      lastName: 'Test',
    },
    service: {
      id: '3d604f00-0000-4000-8000-000000000005',
      slug: 'routine-exam',
      name: 'Routine Exam',
      durationMins: 30,
    },
    provider,
    operatory: { id: '0a3d1c00-0000-4000-8000-000000000001', name: 'Operatory 1' },
  }
}

let requested: string[] = []

/** Elena on the requested `from`, and Victor two days later — present only when the range reaches that far. */
function stubFetch() {
  vi.stubGlobal('fetch', async (input: string) => {
    const url = new URL(String(input), 'http://localhost')
    requested.push(url.search)

    const from = url.searchParams.get('from') ?? ''
    const to = url.searchParams.get('to') ?? from
    const plusTwo = addCivilDays(from, 2)

    const rows = [row(1, from, 'Elena', OSEI)]
    if (plusTwo <= to) rows.push(row(2, plusTwo, 'Victor', CLARKE))

    return new Response(
      JSON.stringify({ range: { from, to }, timeZone: 'America/New_York', appointments: rows }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  })
}

function at() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <AdminCalendar />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  requested = []
  stubFetch()
})

describe('day view', () => {
  it('shows today’s appointment, not the one two days out', async () => {
    at()
    expect(await screen.findByText('Elena Test')).toBeDefined()
    expect(screen.queryByText('Victor Test')).toBeNull()
  })

  it('names the treatment, the provider and the status', async () => {
    at()
    await screen.findByText('Elena Test')
    expect(screen.getByText(/Routine Exam/)).toBeDefined()
    expect(screen.getByText(/Dr Amara Osei/)).toBeDefined()
    expect(screen.getByText('confirmed')).toBeDefined()
  })

  it('says so when there is nothing on the day', async () => {
    vi.stubGlobal('fetch', async (input: string) => {
      const url = new URL(String(input), 'http://localhost')
      const from = url.searchParams.get('from') ?? ''
      return new Response(
        JSON.stringify({
          range: { from, to: from },
          timeZone: 'America/New_York',
          appointments: [],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })

    at()
    expect(await screen.findByText('Nothing on the schedule.')).toBeDefined()
  })

  it('moves the requested day forward, and the day named on screen with it', async () => {
    at()
    await screen.findByText('Elena Test')
    const before = requested.at(-1)

    fireEvent.click(screen.getByRole('button', { name: /Next day/ }))

    await waitFor(() => expect(requested.at(-1)).not.toBe(before))
  })
})

describe('week view', () => {
  it('groups each appointment under the day it falls on, and shows an empty day as empty', async () => {
    at()
    fireEvent.click(screen.getByRole('tab', { name: 'Week' }))

    expect(await screen.findByText('Elena Test')).toBeDefined()
    expect(screen.getByText('Victor Test')).toBeDefined()
    // Five of the seven days have nothing in this fixture.
    expect(screen.getAllByText('Nothing on the schedule.').length).toBe(5)
  })

  it('counts what it found, not a number written into the markup', async () => {
    at()
    fireEvent.click(screen.getByRole('tab', { name: 'Week' }))

    await screen.findByText('Elena Test')
    expect(screen.getAllByText('1 appointment')).toHaveLength(2)
  })
})

describe('when it fails to load', () => {
  it('offers a retry rather than an empty screen', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 500 }))

    at()
    expect(await screen.findByText(/couldn.t load/)).toBeDefined()
  })
})

// The eligibility rule itself (cancelled, too early, already closed the other
// way) is proven server-side by admin.test.ts and against real Postgres by
// `npm run db:complete-no-show`; this suite holds down what the calendar does
// with it — which appointments offer the actions, and what a click sends.
describe('closing an appointment out', () => {
  const started = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const notStarted = new Date(Date.now() + 60 * 60 * 1000).toISOString()

  /** One row, mutated by a PATCH the way the real server would be, and read back by the next GET. */
  function stubCloseFlow(status: string, startsAt: string) {
    let current = { ...row(1, '2026-01-01', 'Elena', OSEI), status, startsAt }

    vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body)) as { outcome: string }
        current = { ...current, status: body.outcome }
        return new Response(JSON.stringify({ appointment: current }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const url = new URL(String(input), 'http://localhost')
      const from = url.searchParams.get('from') ?? ''
      return new Response(
        JSON.stringify({
          range: { from, to: url.searchParams.get('to') ?? from },
          timeZone: 'America/New_York',
          appointments: [current],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })
  }

  it('offers Complete and No-show once the appointment has started', async () => {
    stubCloseFlow('CONFIRMED', started)
    at()

    await screen.findByText('Elena Test')
    expect(screen.getByRole('button', { name: 'Complete' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'No-show' })).toBeDefined()
  })

  it('withholds both actions until the appointment starts', async () => {
    stubCloseFlow('CONFIRMED', notStarted)
    at()

    await screen.findByText('Elena Test')
    expect(screen.queryByRole('button', { name: 'Complete' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'No-show' })).toBeNull()
  })

  it('withholds both actions once the clinic has already closed it out', async () => {
    stubCloseFlow('COMPLETED', started)
    at()

    await screen.findByText('Elena Test')
    expect(screen.queryByRole('button', { name: 'Complete' })).toBeNull()
  })

  it('Complete needs no confirmation, and the row reflects it', async () => {
    stubCloseFlow('CONFIRMED', started)
    at()

    await screen.findByText('Elena Test')
    fireEvent.click(screen.getByRole('button', { name: 'Complete' }))

    expect(await screen.findByText('completed')).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Complete' })).toBeNull()
  })

  it('No-show asks first, and does nothing until confirmed', async () => {
    stubCloseFlow('CONFIRMED', started)
    at()

    await screen.findByText('Elena Test')
    fireEvent.click(screen.getByRole('button', { name: 'No-show' }))

    expect(await screen.findByText('Mark this a no-show?')).toBeDefined()
    expect(screen.getByText('confirmed')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Not yet' }))
    expect(screen.getByText('confirmed')).toBeDefined()
  })

  it('confirming No-show closes it out', async () => {
    stubCloseFlow('CONFIRMED', started)
    at()

    await screen.findByText('Elena Test')
    fireEvent.click(screen.getByRole('button', { name: 'No-show' }))
    await screen.findByText('Mark this a no-show?')
    fireEvent.click(screen.getByRole('button', { name: 'Mark no-show' }))

    expect(await screen.findByText('no_show')).toBeDefined()
  })
})
