import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { localDateToCivil } from '@/lib/clinic-time'
import Reschedule from './Reschedule'

// Driven over a stubbed `fetch`, the same reasoning as booking/Book.test.tsx:
// the stub is the wire, so this exercises the real query keys, `request()` and
// schema parsing rather than a cache seeded past all three.

afterEach(cleanup)

const OSEI = '1b4e2d00-0000-4000-8000-000000000001'
const RAMAN = '1b4e2d00-0000-4000-8000-000000000002'
const APPT_ID = '5f2b8c00-0000-4000-8000-000000000001'

const DAY = localDateToCivil(new Date(new Date().getFullYear(), new Date().getMonth(), 15))
const OLD_DAY = localDateToCivil(new Date(new Date().getFullYear(), new Date().getMonth(), 3))
const NINE_AM = `${DAY}T13:00:00.000Z`
const TEN_AM = `${DAY}T14:00:00.000Z`

const EXAM = {
  id: APPT_ID,
  status: 'CONFIRMED',
  startsAt: `${OLD_DAY}T13:00:00.000Z`,
  endsAt: `${OLD_DAY}T13:30:00.000Z`,
  notes: null,
  service: {
    id: '3d604f00-0000-4000-8000-000000000005',
    slug: 'routine-exam',
    name: 'Routine Exam',
    durationMins: 30,
  },
  provider: { id: OSEI, type: 'DENTIST', firstName: 'Amara', lastName: 'Osei', title: 'DDS' },
}

const SERVICES = {
  services: [
    {
      id: '3d604f00-0000-4000-8000-000000000005',
      slug: 'routine-exam',
      name: 'Routine Exam',
      description: 'A dentist checks teeth, gums and existing work.',
      durationMins: 30,
      priceCents: 8_500,
      providerType: 'DENTIST',
    },
  ],
}

const PROVIDERS = {
  providers: [
    {
      id: OSEI,
      type: 'DENTIST',
      firstName: 'Amara',
      lastName: 'Osei',
      title: 'DDS',
      bio: 'General and restorative dentistry.',
    },
  ],
}

function slot(startsAt: string, providerId: string) {
  return {
    date: DAY,
    startsAt,
    endsAt: startsAt,
    blockedUntil: startsAt,
    providerId,
    operatoryId: '0a3d1c00-0000-4000-8000-000000000002',
  }
}

const AVAILABILITY = {
  service: {
    id: '3d604f00-0000-4000-8000-000000000005',
    slug: 'routine-exam',
    name: 'Routine Exam',
    durationMins: 30,
    bufferMins: 10,
    providerType: 'DENTIST',
  },
  timeZone: 'America/New_York',
  range: { from: DAY, to: DAY },
  providers: {
    [OSEI]: { id: OSEI, type: 'DENTIST', firstName: 'Amara', lastName: 'Osei', title: 'DDS' },
    [RAMAN]: { id: RAMAN, type: 'DENTIST', firstName: 'Priya', lastName: 'Raman', title: 'DDS' },
  },
  slots: [slot(NINE_AM, OSEI), slot(TEN_AM, RAMAN)],
}

type Options = { appointments?: unknown[]; availability?: unknown }

let moved: { url: string; body: unknown } | null = null

function stubFetch({ appointments = [EXAM], availability = AVAILABILITY }: Options = {}) {
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const url = String(input)

    if (init?.method === 'PATCH' && url.includes('/reschedule')) {
      moved = { url, body: JSON.parse(String(init.body)) }
      return json({ appointment: { ...EXAM, id: APPT_ID, startsAt: NINE_AM } })
    }
    if (url.includes('/api/appointments/me')) {
      return json({ when: 'upcoming', timeZone: 'America/New_York', appointments })
    }
    if (url.includes('/api/services')) return json(SERVICES)
    if (url.includes('/api/providers')) return json(PROVIDERS)
    if (url.includes('/api/availability')) return json(availability)

    throw new Error(`unexpected request: ${url}`)
  })
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function at(id: string, search = '') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [{ path: '/appointments/:id/reschedule', element: <Reschedule /> }],
    { initialEntries: [`/appointments/${id}/reschedule${search}`] },
  )

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return router
}

beforeEach(() => {
  moved = null
  stubFetch()
})

afterEach(() => vi.unstubAllGlobals())

describe('finding the appointment', () => {
  it('starts on who, not on the treatment — the service is already fixed', async () => {
    at(APPT_ID)
    expect(await screen.findByRole('heading', { name: 'Who would you like to see?' })).toBeDefined()
    expect(screen.getByText(/Routine Exam/)).toBeDefined()
  })

  // The id is a URL anyone can type; the row is the evidence, same as
  // BookingConfirmed.
  it('refuses an id that is not one of their own CONFIRMED rows', async () => {
    at('5f2b8c00-0000-4000-8000-00000000dead')
    expect(await screen.findByRole('heading', { name: /can.t find/ })).toBeDefined()
  })

  it('refuses an appointment that is already cancelled', async () => {
    stubFetch({ appointments: [{ ...EXAM, status: 'CANCELLED' }] })
    at(APPT_ID)
    expect(await screen.findByRole('heading', { name: /can.t find/ })).toBeDefined()
  })
})

describe('walking the flow', () => {
  it('offers a provider chosen for this appointment’s own service type', async () => {
    at(APPT_ID)
    expect(await screen.findByRole('button', { name: /Amara Osei/ })).toBeDefined()
  })

  it('records the choice in the URL and moves to the day', async () => {
    const router = at(APPT_ID)

    fireEvent.click(await screen.findByRole('button', { name: /Anyone available/ }))

    expect(router.state.location.search).toContain('provider=any')
    expect(await screen.findByRole('heading', { name: 'Pick a day' })).toBeDefined()
  })
})

describe('the confirm step', () => {
  // Driven straight to a URL with a chosen day, the same shortcut
  // booking/Book.test.tsx takes: react-day-picker's own cell markup is not
  // what these tests are proving, the flow state derived from it is.
  const CHOSEN = `?provider=any&date=${DAY}`

  it('offers a time once a day is chosen', async () => {
    at(APPT_ID, CHOSEN)
    expect(await screen.findByRole('button', { name: '9:00 AM' })).toBeDefined()
  })

  it('moves with only the provider and the new time the contract allows', async () => {
    at(APPT_ID, `${CHOSEN}&at=${NINE_AM}`)

    fireEvent.click(await screen.findByRole('button', { name: 'Confirm new time' }))

    await waitFor(() => expect(moved).not.toBeNull())
    expect(moved?.url).toContain(`/appointments/${APPT_ID}/reschedule`)
    expect(moved?.body).toEqual({ providerId: OSEI, startsAt: NINE_AM })
  })

  it('names who "anyone" turned out to be', async () => {
    at(APPT_ID, `${CHOSEN}&at=${NINE_AM}`)
    expect(await screen.findByText('Dr Amara Osei')).toBeDefined()
    expect(screen.getByText(/Chosen for you/)).toBeDefined()
  })

  it('says the time has gone when it is no longer offered', async () => {
    stubFetch({ availability: { ...AVAILABILITY, slots: [slot(TEN_AM, RAMAN)] } })
    at(APPT_ID, `${CHOSEN}&at=${NINE_AM}`)

    expect(await screen.findByText('That time has just gone')).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Confirm new time' })).toBeNull()
  })
})

describe('Back', () => {
  it('offers no way back from the first question', async () => {
    at(APPT_ID)
    await screen.findByRole('button', { name: /Anyone available/ })
    expect(screen.queryByRole('button', { name: /^Back/ })).toBeNull()
  })

  it('names what it goes back to, and clears only that answer', async () => {
    const router = at(APPT_ID)

    fireEvent.click(await screen.findByRole('button', { name: /Anyone available/ }))
    await screen.findByRole('heading', { name: 'Pick a day' })

    fireEvent.click(screen.getByRole('button', { name: "Back to who you're seeing" }))

    await screen.findByRole('heading', { name: 'Who would you like to see?' })
    expect(router.state.location.search).not.toContain('provider=')
  })
})
