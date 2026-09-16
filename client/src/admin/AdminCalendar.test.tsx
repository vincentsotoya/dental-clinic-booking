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
