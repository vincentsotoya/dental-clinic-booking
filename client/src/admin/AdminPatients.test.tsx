import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdminPatients from './AdminPatients'

// Driven over a stubbed `fetch`. Whether the server's match is right — case,
// several words, a literal `%` — is proven for real by `npm run db:patients`;
// this suite holds down what the screen asks for and what it does with the
// answer: one request per pause rather than per keystroke, a truncated list
// that says so, and a list that stays up while the next one loads.

afterEach(cleanup)
afterEach(() => vi.unstubAllGlobals())

const MARSH = {
  id: '2c5f3e00-0000-4000-8000-000000000001',
  firstName: 'Elena',
  lastName: 'Marsh',
  email: 'elena.marsh@example.com',
  hasAccount: true,
}
const OKAFOR = {
  id: '2c5f3e00-0000-4000-8000-000000000002',
  firstName: 'Marcus',
  lastName: 'Okafor',
  email: 'marcus.okafor@example.com',
  hasAccount: false,
}

type Answer = { patients: unknown[]; truncated: boolean }

let requests: { q: string | null }[] = []
let answer: (q: string | null) => Answer | Promise<Answer>
let failNext = false

function stubFetch() {
  vi.stubGlobal('fetch', async (input: string) => {
    const url = new URL(String(input), 'http://localhost')
    if (url.pathname !== '/api/admin/patients') throw new Error(`unhandled request: ${url.pathname}`)

    const q = url.searchParams.get('q')
    requests.push({ q })

    if (failNext) {
      failNext = false
      return new Response(JSON.stringify({ error: { code: 'INTERNAL', message: 'x' } }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify(await answer(q)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
}

function at() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <AdminPatients />
    </QueryClientProvider>,
  )
}

const search = (value: string) =>
  fireEvent.change(screen.getByLabelText('Search patients'), { target: { value } })

beforeEach(() => {
  requests = []
  failNext = false
  answer = () => ({ patients: [MARSH, OKAFOR], truncated: false })
  stubFetch()
})

describe('the directory', () => {
  it('lists everyone, and asks with no search at all', async () => {
    at()
    expect(await screen.findByText('Elena Marsh')).toBeDefined()
    expect(screen.getByText('Marcus Okafor')).toBeDefined()
    expect(screen.getByText('2 patients')).toBeDefined()
    expect(requests).toEqual([{ q: null }])
  })

  it('marks a chart with no login, and only that one', async () => {
    at()
    await screen.findByText('Elena Marsh')
    expect(screen.getAllByText('No account')).toHaveLength(1)
  })

  it('says so when there is no one on file', async () => {
    answer = () => ({ patients: [], truncated: false })
    at()
    expect(await screen.findByText('No patients on file.')).toBeDefined()
  })

  it('offers a retry when the list cannot load', async () => {
    failNext = true
    at()
    expect(await screen.findByText(/couldn.t load the patient directory/)).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Elena Marsh')).toBeDefined()
  })
})

describe('searching', () => {
  it('sends the trimmed search once the typing pauses, not on each keystroke', async () => {
    at()
    await screen.findByText('Elena Marsh')

    // Real pauses, each shorter than the delay: keystrokes fired back to back
    // would collapse into one timer even with no debounce at all.
    const pause = () => new Promise((resolve) => setTimeout(resolve, 100))
    search('m')
    await pause()
    search('ma')
    await pause()
    search('  mar ')

    await waitFor(() => expect(requests.at(-1)).toEqual({ q: 'mar' }))
    expect(requests).toEqual([{ q: null }, { q: 'mar' }])
  })

  it('names what it searched for when nothing matches', async () => {
    answer = (q) => (q === null ? { patients: [MARSH], truncated: false } : { patients: [], truncated: false })
    at()
    await screen.findByText('Elena Marsh')

    search('zzz')
    expect(await screen.findByText('No patients match “zzz”.')).toBeDefined()
  })

  it('says a capped list is not everyone, and how to narrow it', async () => {
    answer = () => ({ patients: [MARSH], truncated: true })
    at()
    expect(await screen.findByText(/Showing the first 25\. Search by name or email/)).toBeDefined()
  })

  it('keeps the last list on screen while the next one loads', async () => {
    let release: () => void = () => {}
    answer = (q) =>
      q === null
        ? { patients: [MARSH, OKAFOR], truncated: false }
        : new Promise((resolve) => {
            release = () => resolve({ patients: [OKAFOR], truncated: false })
          })
    at()
    await screen.findByText('Elena Marsh')

    search('okafor')
    await waitFor(() => expect(requests.at(-1)).toEqual({ q: 'okafor' }))

    expect(screen.getByText('Elena Marsh')).toBeDefined()

    release()
    await waitFor(() => expect(screen.queryByText('Elena Marsh')).toBeNull())
    expect(screen.getByText('1 patient')).toBeDefined()
  })
})
