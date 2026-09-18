import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdminTimeOff from './AdminTimeOff'

// Driven over a stubbed `fetch`. The server's own transaction, the
// instant/civil-date round trip and the conflict check against a real
// CONFIRMED appointment are proven for real by `npm run db:time-off`; this
// suite holds down what the screen does with a list of dated ranges once it
// has one — which provider it defaults to, what an add and a remove actually
// send, and that a bad range or a 409 stops a request rather than crashing.

afterEach(cleanup)
afterEach(() => vi.unstubAllGlobals())

const OSEI = { id: '1b4e2d00-0000-4000-8000-000000000001', type: 'DENTIST', firstName: 'Amara', lastName: 'Osei', title: 'DDS', bio: null }
const CLARKE = { id: '1b4e2d00-0000-4000-8000-000000000004', type: 'HYGIENIST', firstName: 'Naomi', lastName: 'Clarke', title: 'RDH', bio: null }

const THURSDAY = {
  id: '2c5f3e00-0000-4000-8000-000000000009',
  providerId: OSEI.id,
  fromDate: '2026-09-10',
  toDate: '2026-09-10',
  reason: 'Continuing education',
}

let requests: { method: string; path: string; body: unknown }[] = []
let timeOffFor: Record<string, unknown[]> = {}
let nextConflict = false

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

      const listMatch = /^\/api\/admin\/providers\/([^/]+)\/time-off$/.exec(url.pathname)
      if (listMatch && method === 'GET') {
        const providerId = listMatch[1]!
        return new Response(
          JSON.stringify({ providerId, timeOff: timeOffFor[providerId] ?? [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }

      if (listMatch && method === 'POST') {
        const providerId = listMatch[1]!
        if (nextConflict) {
          return new Response(
            JSON.stringify({ error: { code: 'TIME_OFF_CONFLICT', message: 'This overlaps 1 confirmed appointment for this provider. Reschedule or cancel it first.' } }),
            { status: 409, headers: { 'Content-Type': 'application/json' } },
          )
        }
        const created = {
          id: '3a1e5c00-0000-4000-8000-000000000099',
          providerId,
          ...(body as Record<string, unknown>),
        }
        timeOffFor[providerId] = [...(timeOffFor[providerId] ?? []), created]
        return new Response(JSON.stringify({ timeOff: created }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const deleteMatch = /^\/api\/admin\/time-off\/([^/]+)$/.exec(url.pathname)
      if (deleteMatch && method === 'DELETE') {
        const id = deleteMatch[1]!
        for (const providerId of Object.keys(timeOffFor)) {
          timeOffFor[providerId] = (timeOffFor[providerId] ?? []).filter(
            (row) => (row as { id: string }).id !== id,
          )
        }
        return new Response(JSON.stringify({ id }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      throw new Error(`unhandled request: ${method} ${url.pathname}`)
    },
  )
}

function at() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <AdminTimeOff />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  requests = []
  timeOffFor = { [OSEI.id]: [THURSDAY] }
  nextConflict = false
  stubFetch()
})

describe('loading a provider’s time off', () => {
  it('defaults to the first provider the catalogue returns', async () => {
    at()
    const trigger = await screen.findByRole('combobox', { name: 'Provider' })
    expect(trigger.textContent).toBe('Dr Amara Osei')
  })

  it('lists an existing range with its reason', async () => {
    at()
    expect(await screen.findByText('Continuing education')).toBeDefined()
  })

  it('says so when a provider has none', async () => {
    timeOffFor = {}
    at()
    expect(await screen.findByText('No time off on file for this provider.')).toBeDefined()
  })
})

describe('adding a range', () => {
  it('is disabled until both dates are filled', async () => {
    at()
    await screen.findByText('Continuing education')
    expect(screen.getByRole('button', { name: 'Add' })).toHaveProperty('disabled', true)
  })

  it('posts the typed range and reason, then clears the form', async () => {
    at()
    await screen.findByText('Continuing education')

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-01' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-10-03' } })
    fireEvent.change(screen.getByLabelText('Reason (optional)'), { target: { value: 'Conference' } })

    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() =>
      expect(requests.some((r) => r.method === 'POST' && r.path.endsWith('/time-off'))).toBe(true),
    )
    const post = requests.find((r) => r.method === 'POST')!
    expect(post.body).toEqual({ fromDate: '2026-10-01', toDate: '2026-10-03', reason: 'Conference' })

    await waitFor(() => expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe(''))
  })

  it('rejects a range that ends before it starts, and sends nothing', async () => {
    at()
    await screen.findByText('Continuing education')

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-03' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-10-01' } })

    expect(screen.getByRole('button', { name: 'Add' })).toHaveProperty('disabled', true)
    expect(requests.some((r) => r.method === 'POST')).toBe(false)
  })

  it('shows the server’s own conflict message on a 409, unedited', async () => {
    nextConflict = true
    at()
    await screen.findByText('Continuing education')

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-01' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-10-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(
      await screen.findByText(
        'This overlaps 1 confirmed appointment for this provider. Reschedule or cancel it first.',
      ),
    ).toBeDefined()
  })
})

describe('removing a range', () => {
  it('asks first, then sends the delete and drops the row', async () => {
    at()
    await screen.findByText('Continuing education')

    fireEvent.click(screen.getByRole('button', { name: /Remove time off/ }))
    expect(screen.getByText('Remove this time off?')).toBeDefined()
    // Not sent until confirmed.
    expect(requests.some((r) => r.method === 'DELETE')).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(requests.some((r) => r.method === 'DELETE')).toBe(true))
    expect(
      await screen.findByText('No time off on file for this provider.'),
    ).toBeDefined()
  })
})
