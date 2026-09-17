import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdminWorkingHours from './AdminWorkingHours'

// Driven over a stubbed `fetch`. The server's own transaction and enum
// round-trip are proven for real by `npm run db:working-hours`; this suite
// holds down what the screen does with a week once it has one — which
// provider it defaults to, what an editable window looks like, that an
// overlap blocks Save before a request is even sent, and what a PATCH
// actually carries.

afterEach(cleanup)
afterEach(() => vi.unstubAllGlobals())

const OSEI = { id: '1b4e2d00-0000-4000-8000-000000000001', type: 'DENTIST', firstName: 'Amara', lastName: 'Osei', title: 'DDS', bio: null }
const CLARKE = { id: '1b4e2d00-0000-4000-8000-000000000004', type: 'HYGIENIST', firstName: 'Naomi', lastName: 'Clarke', title: 'RDH', bio: null }

const MORNING = { weekday: 'MONDAY', startMinute: 480, endMinute: 720 }
const AFTERNOON = { weekday: 'MONDAY', startMinute: 780, endMinute: 1020 }

let requests: { method: string; path: string; body: unknown }[] = []
let weekFor: Record<string, unknown[]> = {}

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    async (input: string, init: RequestInit = {}) => {
      const url = new URL(String(input), 'http://localhost')
      const method = init.method ?? 'GET'
      const body: unknown = init.body ? JSON.parse(String(init.body)) : undefined
      requests.push({ method, path: url.pathname, body })

      if (url.pathname === '/api/providers') {
        return new Response(JSON.stringify({ providers: [OSEI, CLARKE] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const match = /^\/api\/admin\/providers\/([^/]+)\/working-hours$/.exec(url.pathname)
      if (match) {
        const providerId = match[1]!
        if (method === 'PATCH') {
          weekFor[providerId] = (body as { workingHours: unknown[] }).workingHours
        }
        return new Response(
          JSON.stringify({ providerId, workingHours: weekFor[providerId] ?? [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }

      throw new Error(`unhandled request: ${method} ${url.pathname}`)
    },
  )
}

function at() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <AdminWorkingHours />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  requests = []
  weekFor = { [OSEI.id]: [MORNING, AFTERNOON] }
  stubFetch()
})

describe('loading a provider’s week', () => {
  it('defaults to the first provider the catalogue returns', async () => {
    at()
    const trigger = await screen.findByRole('combobox', { name: 'Provider' })
    expect(trigger.textContent).toBe('Dr Amara Osei')
  })

  it('shows a day’s windows, and says so when there are none', async () => {
    at()
    const monday = await screen.findByRole('region', { name: 'Monday' })
    expect(within(monday).getAllByLabelText(/window start/)).toHaveLength(2)

    const tuesday = screen.getByRole('region', { name: 'Tuesday' })
    expect(within(tuesday).getByText('Not working.')).toBeDefined()
  })

  it('renders each window as an editable clock time', async () => {
    at()
    const monday = await screen.findByRole('region', { name: 'Monday' })
    const starts = within(monday).getAllByLabelText(/window start/) as HTMLInputElement[]
    expect(starts.map((input) => input.value)).toEqual(['08:00', '13:00'])
  })
})

describe('editing', () => {
  it('the save button is disabled until something actually changes', async () => {
    at()
    await screen.findByRole('region', { name: 'Monday' })
    expect(screen.getByRole('button', { name: /^Save$/ })).toHaveProperty('disabled', true)
  })

  it('adding a window enables Save, and Save sends the whole week', async () => {
    at()
    const tuesday = await screen.findByRole('region', { name: 'Tuesday' })
    fireEvent.click(within(tuesday).getByRole('button', { name: 'Add window' }))

    const saveButton = screen.getByRole('button', { name: /^Save$/ })
    expect(saveButton).toHaveProperty('disabled', false)

    fireEvent.click(saveButton)

    await waitFor(() =>
      expect(requests.some((r) => r.method === 'PATCH' && r.path.endsWith('/working-hours'))).toBe(
        true,
      ),
    )
    const patch = requests.find((r) => r.method === 'PATCH')!
    const body = patch.body as { workingHours: unknown[] }
    expect(body.workingHours).toHaveLength(3)
    expect(await screen.findByText('Saved.')).toBeDefined()
  })

  it('removing every window on a day sends an empty day, not the old rows', async () => {
    at()
    const monday = await screen.findByRole('region', { name: 'Monday' })
    for (const button of within(monday).getAllByRole('button', { name: /Remove this/ })) {
      fireEvent.click(button)
    }
    expect(within(monday).getByText('Not working.')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }))

    await waitFor(() => expect(requests.some((r) => r.method === 'PATCH')).toBe(true))
    const patch = requests.find((r) => r.method === 'PATCH')!
    expect((patch.body as { workingHours: unknown[] }).workingHours).toHaveLength(0)
  })

  it('blocks Save on an overlap, and sends nothing', async () => {
    at()
    const monday = await screen.findByRole('region', { name: 'Monday' })
    const ends = within(monday).getAllByLabelText(/window end/) as HTMLInputElement[]

    // Stretch the morning window's end past the afternoon window's start.
    fireEvent.change(ends[0]!, { target: { value: '14:00' } })

    expect(screen.getByRole('button', { name: /^Save$/ })).toHaveProperty('disabled', true)
    expect(requests.some((r) => r.method === 'PATCH')).toBe(false)
  })
})
