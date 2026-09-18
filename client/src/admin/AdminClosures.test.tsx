import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdminClosures from './AdminClosures'

// Driven over a stubbed `fetch`. The server's own transaction, the
// instant/civil-date round trip and the conflict check against a real
// CONFIRMED appointment are proven for real by `npm run db:closures`; this
// suite holds down what the screen does with a list of dated ranges once it
// has one — what an add and a remove actually send, and that a bad range or
// a 409 stops a request rather than crashing.

afterEach(cleanup)
afterEach(() => vi.unstubAllGlobals())

const TRAINING_DAY = {
  id: '4b6f2e00-0000-4000-8000-000000000010',
  fromDate: '2026-09-29',
  toDate: '2026-09-29',
  reason: 'Staff training day',
}

let requests: { method: string; path: string; body: unknown }[] = []
let closures: unknown[] = []
let nextConflict = false

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    async (input: string, init: RequestInit = {}) => {
      const url = new URL(String(input), 'http://localhost')
      const method = init.method ?? 'GET'
      const body: unknown = init.body ? JSON.parse(String(init.body)) : undefined
      requests.push({ method, path: url.pathname, body })

      if (url.pathname === '/api/admin/closures' && method === 'GET') {
        return new Response(JSON.stringify({ closures }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      if (url.pathname === '/api/admin/closures' && method === 'POST') {
        if (nextConflict) {
          return new Response(
            JSON.stringify({
              error: {
                code: 'CLOSURE_CONFLICT',
                message: 'This overlaps 1 confirmed appointment. Reschedule or cancel it first.',
              },
            }),
            { status: 409, headers: { 'Content-Type': 'application/json' } },
          )
        }
        const created = { id: '5c7a1d00-0000-4000-8000-000000000099', ...(body as Record<string, unknown>) }
        closures = [...closures, created]
        return new Response(JSON.stringify({ closure: created }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      const deleteMatch = /^\/api\/admin\/closures\/([^/]+)$/.exec(url.pathname)
      if (deleteMatch && method === 'DELETE') {
        const id = deleteMatch[1]!
        closures = closures.filter((row) => (row as { id: string }).id !== id)
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
      <AdminClosures />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  requests = []
  closures = [TRAINING_DAY]
  nextConflict = false
  stubFetch()
})

describe('loading the clinic’s closures', () => {
  it('lists an existing range with its reason', async () => {
    at()
    expect(await screen.findByText('Staff training day')).toBeDefined()
  })

  it('says so when there are none', async () => {
    closures = []
    at()
    expect(await screen.findByText('No closures on file.')).toBeDefined()
  })
})

describe('adding a range', () => {
  it('is disabled until both dates are filled', async () => {
    at()
    await screen.findByText('Staff training day')
    expect(screen.getByRole('button', { name: 'Add' })).toHaveProperty('disabled', true)
  })

  it('posts the typed range and reason, then clears the form', async () => {
    at()
    await screen.findByText('Staff training day')

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-26' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-27' } })
    fireEvent.change(screen.getByLabelText('Reason (optional)'), { target: { value: 'Thanksgiving' } })

    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() =>
      expect(requests.some((r) => r.method === 'POST' && r.path.endsWith('/closures'))).toBe(true),
    )
    const post = requests.find((r) => r.method === 'POST')!
    expect(post.body).toEqual({ fromDate: '2026-11-26', toDate: '2026-11-27', reason: 'Thanksgiving' })

    await waitFor(() => expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe(''))
  })

  it('rejects a range that ends before it starts, and sends nothing', async () => {
    at()
    await screen.findByText('Staff training day')

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-27' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-26' } })

    expect(screen.getByRole('button', { name: 'Add' })).toHaveProperty('disabled', true)
    expect(requests.some((r) => r.method === 'POST')).toBe(false)
  })

  it('shows the server’s own conflict message on a 409, unedited', async () => {
    nextConflict = true
    at()
    await screen.findByText('Staff training day')

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-26' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-26' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(
      await screen.findByText('This overlaps 1 confirmed appointment. Reschedule or cancel it first.'),
    ).toBeDefined()
  })
})

describe('removing a range', () => {
  it('asks first, then sends the delete and drops the row', async () => {
    at()
    await screen.findByText('Staff training day')

    fireEvent.click(screen.getByRole('button', { name: /Remove closure/ }))
    expect(screen.getByText('Remove this closure?')).toBeDefined()
    // Not sent until confirmed.
    expect(requests.some((r) => r.method === 'DELETE')).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(requests.some((r) => r.method === 'DELETE')).toBe(true))
    expect(await screen.findByText('No closures on file.')).toBeDefined()
  })
})
