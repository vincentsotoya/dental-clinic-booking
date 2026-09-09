import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Book from './Book'
import { localDateToCivil } from '@/lib/clinic-time'
import { safeNext } from '@/auth/next-location'

// The flow driven end to end over a stubbed `fetch` rather than a seeded cache.
// The stub is the wire, so these exercise the real query keys, the real
// `request()` and the real schema parsing — a seeded cache would skip all three,
// which is where a contract drift would actually show up.

afterEach(cleanup)

const OSEI = '1b4e2d00-0000-4000-8000-000000000001'
const RAMAN = '1b4e2d00-0000-4000-8000-000000000002'

// Inside the month the flow asks for, whatever month the suite runs in.
const DAY = localDateToCivil(new Date(new Date().getFullYear(), new Date().getMonth(), 15))
// 13:00Z is 9:00 in New York during daylight saving, and never 13:00 anywhere
// the test might run — which is the point.
const NINE_AM = `${DAY}T13:00:00.000Z`
const TEN_AM = `${DAY}T14:00:00.000Z`

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
  slots: [slot(NINE_AM, OSEI), slot(NINE_AM, RAMAN), slot(TEN_AM, RAMAN)],
}

const ANONYMOUS = { user: null, patient: null }
const SIGNED_IN = {
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

type Options = { me?: unknown; availability?: unknown }

let booked: unknown = null

function stubFetch({ me = ANONYMOUS, availability = AVAILABILITY }: Options = {}) {
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const url = String(input)

    if (init?.method === 'POST' && url.includes('/api/appointments')) {
      booked = JSON.parse(String(init.body))
      return json({ appointment: { id: 'appt_1' } })
    }
    if (url.includes('/api/services')) return json(SERVICES)
    if (url.includes('/api/providers')) return json(PROVIDERS)
    if (url.includes('/api/availability')) return json(availability)
    if (url.includes('/api/me')) return json(me)

    throw new Error(`unexpected request: ${url}`)
  })
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

// `from` puts an entry the flow does not own behind it, which is what the
// sign-in round trip leaves in history.
function at(url: string, from?: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(
    [
      { path: '/book', element: <Book /> },
      { path: '/sign-in', element: <p>Sign in</p> },
    ],
    { initialEntries: from ? [from, url] : [url] },
  )

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return router
}

beforeEach(() => {
  booked = null
  stubFetch()
})

afterEach(() => vi.unstubAllGlobals())

describe('walking the flow', () => {
  it('asks for a treatment, then who, and records both in the URL', async () => {
    const router = at('/book')

    fireEvent.click(await screen.findByRole('button', { name: /Routine Exam/ }))
    expect(router.state.location.search).toContain('service=routine-exam')

    fireEvent.click(await screen.findByRole('button', { name: /Anyone available/ }))
    expect(router.state.location.search).toContain('provider=any')
  })

  it('shows the times in the clinic zone, not the browser one', async () => {
    at(`/book?service=routine-exam&provider=any&date=${DAY}`)

    // 13:00Z. Rendered with the browser's zone this would say something else on
    // every machine that is not New York — including the one running this test.
    expect(await screen.findByRole('button', { name: '9:00 AM' })).toBeDefined()
    expect(screen.getByRole('button', { name: '10:00 AM' })).toBeDefined()
  })

  // Two dentists are free at 9:00; a patient sees one 9:00.
  it('offers each start time once however many providers have it', async () => {
    at(`/book?service=routine-exam&provider=any&date=${DAY}`)

    await screen.findByRole('button', { name: '9:00 AM' })
    expect(screen.getAllByRole('button', { name: '9:00 AM' })).toHaveLength(1)
  })

  it('carries the chosen time into the URL and onto the summary', async () => {
    const router = at(`/book?service=routine-exam&provider=any&date=${DAY}`)

    fireEvent.click(await screen.findByRole('button', { name: '9:00 AM' }))

    expect(router.state.location.search).toContain(encodeURIComponent(NINE_AM))
    expect(await screen.findByText('Does this look right?')).toBeDefined()
    // Twice by design: once in the trail as a way back to the choice, once in
    // the summary as the thing being confirmed.
    expect(screen.getAllByText('Routine Exam')).toHaveLength(2)
    expect(screen.getByText('$85')).toBeDefined()
  })
})

describe('the confirm step', () => {
  const CHOSEN = `/book?service=routine-exam&provider=any&date=${DAY}&at=${NINE_AM}`

  // Availability's own ordering settles it, so the summary names the person the
  // request will actually carry.
  it('names who "anyone" turned out to be', async () => {
    at(CHOSEN)

    expect(await screen.findByText('Dr Amara Osei')).toBeDefined()
    expect(screen.getByText(/Chosen for you/)).toBeDefined()
  })

  // The whole reason the flow can be public until here. The destination is in
  // the href rather than in router state, so this asserts the round trip
  // instead of trusting it — and `safeNext` is what reads it back.
  it('sends an anonymous patient to sign in, and back to this exact slot', async () => {
    at(CHOSEN)

    const link = await screen.findByRole('link', { name: 'Sign in to book' })
    const href = link.getAttribute('href') ?? ''

    expect(href.startsWith('/sign-in?next=')).toBe(true)
    expect(safeNext(new URL(href, 'https://quillon.example').searchParams.get('next'))).toBe(CHOSEN)
  })

  it('books with the three fields the contract allows, and no more', async () => {
    stubFetch({ me: SIGNED_IN })
    at(CHOSEN)

    fireEvent.click(await screen.findByRole('button', { name: 'Confirm booking' }))

    await waitFor(() => expect(booked).not.toBeNull())
    expect(booked).toEqual({
      service: 'routine-exam',
      providerId: OSEI,
      startsAt: NINE_AM,
    })
  })

  it('sends the note when one is written', async () => {
    stubFetch({ me: SIGNED_IN })
    at(CHOSEN)

    fireEvent.change(await screen.findByLabelText(/Anything we should know/), {
      target: { value: 'Nervous' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm booking' }))

    await waitFor(() => expect(booked).not.toBeNull())
    expect(booked).toMatchObject({ notes: 'Nervous' })
  })

  // A slot was never a reservation. This is the selection outliving the
  // availability it was made against — a refetch, or a sign-in round trip.
  it('says the time has gone when it is no longer offered', async () => {
    stubFetch({ me: SIGNED_IN, availability: { ...AVAILABILITY, slots: [slot(TEN_AM, RAMAN)] } })
    at(CHOSEN)

    expect(await screen.findByText('That time has just gone')).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Confirm booking' })).toBeNull()
  })

  it('drops only the time when the patient goes back for another', async () => {
    stubFetch({ me: SIGNED_IN, availability: { ...AVAILABILITY, slots: [slot(TEN_AM, RAMAN)] } })
    const router = at(CHOSEN)

    fireEvent.click(await screen.findByRole('button', { name: 'See what else is free' }))

    expect(router.state.location.search).toContain(`date=${DAY}`)
    expect(router.state.location.search).not.toContain('at=')
    expect(await screen.findByRole('button', { name: '10:00 AM' })).toBeDefined()
  })

  // An admin, or ADR-0007's window: a login with no chart cannot be the patient.
  it('refuses a login with no chart before it can press the button', async () => {
    stubFetch({ me: { user: { ...SIGNED_IN.user, role: 'ADMIN' }, patient: null } })
    at(CHOSEN)

    expect(await screen.findByText(/This account can/)).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Confirm booking' })).toBeNull()
  })
})

// A step change is a navigation with no page load: without this the pressed
// button unmounts, focus lands on `<body>` and nothing is announced.
describe('moving between steps', () => {
  it('leaves focus alone on the first render', async () => {
    at('/book')

    await screen.findByRole('heading', { name: 'What do you need?' })
    expect(document.activeElement).toBe(document.body)
  })

  it('moves focus onto the step that replaced the one just answered', async () => {
    at('/book')

    fireEvent.click(await screen.findByRole('button', { name: /Routine Exam/ }))

    const heading = await screen.findByRole('heading', { name: 'Who would you like to see?' })
    expect(document.activeElement).not.toBe(document.body)
    expect(document.activeElement?.contains(heading)).toBe(true)
  })

  it('says which step the patient has arrived at, somewhere that announces', async () => {
    at('/book')

    fireEvent.click(await screen.findByRole('button', { name: /Routine Exam/ }))

    // Found by the live attribute rather than by its text: text a screen reader
    // never announces is the failure this is guarding against.
    await waitFor(() => {
      const live = document.querySelector('[aria-live="polite"]')
      expect(live?.textContent).toBe('Step 2 of 5. Who would you like to see?')
    })
  })

  it('names the step in the document title', async () => {
    at(`/book?service=routine-exam&provider=any&date=${DAY}`)

    await screen.findByRole('button', { name: '9:00 AM' })
    expect(document.title).toContain('Pick a time')
  })
})

// Position and revision were one control until `docs/booking-composition.md`
// split them: a filled crumb was the only way backwards, and pressing one
// discarded every answer downstream without saying so.
describe('position, Back and the trail', () => {
  const CHOSEN = `/book?service=routine-exam&provider=any&date=${DAY}&at=${NINE_AM}`

  function saidOutLoud(text: RegExp) {
    return screen.getAllByText(text).filter((el) => !el.closest('[aria-hidden="true"]'))
  }

  it('draws the position without saying it twice', async () => {
    at(`/book?service=routine-exam&provider=any&date=${DAY}`)
    await screen.findByRole('button', { name: '9:00 AM' })

    // Drawn for eyes, and announced once — by the live region, which is the
    // half that was already there.
    expect(screen.getByText('Step 4 of 5')).toBeDefined()
    const spoken = saidOutLoud(/Step 4 of 5/)
    expect(spoken).toHaveLength(1)
    expect(spoken[0]?.getAttribute('aria-live')).toBe('polite')
  })

  it('offers no way back from the first question', async () => {
    at('/book')

    await screen.findByRole('button', { name: /Routine Exam/ })
    expect(screen.queryByRole('button', { name: /^Back/ })).toBeNull()
  })

  it('names what Back goes back to, and clears only that answer', async () => {
    const router = at(`/book?service=routine-exam&provider=any&date=${DAY}`)

    fireEvent.click(await screen.findByRole('button', { name: 'Back to the day' }))

    await screen.findByRole('heading', { name: 'Pick a day' })
    expect(router.state.location.search).toContain('service=routine-exam')
    expect(router.state.location.search).toContain('provider=any')
    expect(router.state.location.search).not.toContain('date=')
  })

  it('says what a jump will clear, and clears nothing until it is confirmed', async () => {
    const router = at(CHOSEN)

    await screen.findByText('Dr Amara Osei')
    const before = router.state.location.search
    fireEvent.click(screen.getByRole('button', { name: 'Routine Exam — change this' }))

    expect(screen.getByText('Change the treatment?')).toBeDefined()
    expect(screen.getByText(/This clears who you're seeing, the day and the time\./)).toBeDefined()
    expect(router.state.location.search).toBe(before)
    // The question is below the crumb that was pressed, so being told about it
    // is the point of moving focus here. Asserted as the element, not as text:
    // `document.body` contains that text too, and would pass without a move.
    expect(document.activeElement).toBe(screen.getByRole('group', { name: 'Change the treatment?' }))
  })

  it('makes the jump once it is confirmed', async () => {
    const router = at(CHOSEN)

    await screen.findByText('Dr Amara Osei')
    fireEvent.click(screen.getByRole('button', { name: 'Routine Exam — change this' }))
    fireEvent.click(screen.getByRole('button', { name: 'Change the treatment' }))

    await screen.findByRole('heading', { name: 'What do you need?' })
    expect(router.state.location.search).not.toContain('service=')
    expect(router.state.location.search).not.toContain('at=')
  })

  it('leaves the booking untouched when the answer is kept', async () => {
    const router = at(CHOSEN)

    await screen.findByText('Dr Amara Osei')
    const crumb = screen.getByRole('button', { name: 'Routine Exam — change this' })
    fireEvent.click(crumb)
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }))

    expect(screen.queryByText('Change the treatment?')).toBeNull()
    expect(router.state.location.search).toBe(CHOSEN.split('?')[1] ? `?${CHOSEN.split('?')[1]}` : '')
    expect(document.activeElement).toBe(crumb)
  })

  // The reason Back is derived from the step and not from history: after
  // signing in, the entry behind the flow is the sign-in screen.
  it('goes back a question, not a history entry', async () => {
    const router = at(CHOSEN, `/sign-in?next=${encodeURIComponent(CHOSEN)}`)

    await screen.findByText('Dr Amara Osei')
    fireEvent.click(screen.getByRole('button', { name: 'Back to the time' }))

    expect(await screen.findByRole('button', { name: '10:00 AM' })).toBeDefined()
    expect(router.state.location.pathname).toBe('/book')
    expect(router.state.location.search).toContain(`date=${DAY}`)
    expect(router.state.location.search).not.toContain('at=')
  })

  // Nothing depends on it, so there is nothing to warn about.
  it('jumps straight to the most recent choice without asking', async () => {
    const router = at(CHOSEN)

    fireEvent.click(await screen.findByRole('button', { name: '9:00 AM — change this' }))

    // Back on the times for that day, which is what the crumb pointed at.
    expect(await screen.findByRole('button', { name: '10:00 AM' })).toBeDefined()
    expect(screen.queryByText(/^Change /)).toBeNull()
    expect(router.state.location.search).toContain(`date=${DAY}`)
    expect(router.state.location.search).not.toContain('at=')
  })
})
