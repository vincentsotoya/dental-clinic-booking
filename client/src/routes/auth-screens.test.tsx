import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { queryKeys } from '@/api/keys'
import SignIn from './SignIn'
import SignUp from './SignUp'

// Better Auth's client is the one thing stubbed: it owns a cookie and a network
// call, and neither belongs in jsdom. Everything else is real — a real router, a
// real form, the real shared schemas — because what these screens are for is
// putting the patient back where they came from, and only a router shows that.

const signInEmail = vi.fn()
const signUpEmail = vi.fn()

vi.mock('@/auth/auth-client', () => ({
  signIn: { email: (...args: unknown[]) => signInEmail(...args) },
  signUp: { email: (...args: unknown[]) => signUpEmail(...args) },
  signOut: vi.fn(),
}))

afterEach(cleanup)
beforeEach(() => {
  signInEmail.mockReset()
  signUpEmail.mockReset()
  signInEmail.mockResolvedValue({ data: {}, error: null })
  signUpEmail.mockResolvedValue({ data: {}, error: null })
})

const BOOKING = '/book?service=routine-exam&provider=any&at=2026-09-10T12%3A30%3A00.000Z'

/**
 * Both screens over a real router, with `/api/me` already answered as "nobody".
 * The destinations are stubs that render their own name, so a redirect is
 * asserted by what is on the screen rather than by a spy.
 */
function renderAuth(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, queryFn: () => new Promise(() => {}) } },
  })
  queryClient.setQueryData(queryKeys.me(), { user: null, patient: null })

  const router = createMemoryRouter(
    [
      { path: '/sign-in', element: <SignIn /> },
      { path: '/sign-up', element: <SignUp /> },
      { path: '/book', element: <p>booking flow</p> },
      { path: '/appointments', element: <p>appointments</p> },
    ],
    { initialEntries: [initialEntry] },
  )

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return router
}

function type(label: RegExp | string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

describe('SignIn', () => {
  it('signs in and returns the patient to where they were going', async () => {
    const router = renderAuth(`/sign-in?next=${encodeURIComponent(BOOKING)}`)

    type('Email', 'elena.marsh@example.com')
    type('Password', 'correct-horse-battery')
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('booking flow')).toBeDefined()
    // The whole query string, not just the path: the slot is in it.
    expect(router.state.location.pathname + router.state.location.search).toBe(BOOKING)
    // `replace`, so back does not return to a sign-in form already used.
    expect(router.state.historyAction).toBe('REPLACE')
  })

  it('lands a patient who came from nowhere on their appointments', async () => {
    const router = renderAuth('/sign-in')

    type('Email', 'elena.marsh@example.com')
    type('Password', 'correct-horse-battery')
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await screen.findByText('appointments')
    expect(router.state.location.pathname).toBe('/appointments')
  })

  // The destination is a query parameter, so anyone can write it.
  it('will not be talked into sending a patient off-site', async () => {
    const router = renderAuth('/sign-in?next=%2F%2Fevil.example')

    type('Email', 'elena.marsh@example.com')
    type('Password', 'correct-horse-battery')
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await screen.findByText('appointments')
    expect(router.state.location.pathname).toBe('/appointments')
  })

  it('says the same thing whether the email or the password was wrong', async () => {
    signInEmail.mockResolvedValue({
      data: null,
      error: { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' },
    })

    renderAuth('/sign-in')

    type('Email', 'nobody@example.com')
    type('Password', 'correct-horse-battery')
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    const alert = await screen.findByRole('alert')
    // Naming which half was wrong tells a stranger whether an address is a
    // patient here. The message must stay ambiguous.
    expect(alert.textContent).toBe('That email and password do not match an account.')
    expect(alert.textContent).not.toMatch(/no account|not registered|password is wrong/i)
  })

  it('clears the password after a refusal but keeps the email', async () => {
    signInEmail.mockResolvedValue({ data: null, error: { code: 'INVALID_EMAIL_OR_PASSWORD' } })

    renderAuth('/sign-in')

    type('Email', 'elena.marsh@example.com')
    type('Password', 'wrong-password-here')
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await screen.findByRole('alert')
    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe(
      'elena.marsh@example.com',
    )
  })

  it('never reaches the network for a request the form can already refuse', async () => {
    renderAuth('/sign-in')

    type('Email', 'not-an-email')
    type('Password', 'correct-horse-battery')
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    await screen.findByText(/Enter an email address/)
    expect(signInEmail).not.toHaveBeenCalled()
  })

  // The hop that loses the slot if the link is written by hand.
  it('carries the destination across to sign-up', async () => {
    const router = renderAuth(`/sign-in?next=${encodeURIComponent(BOOKING)}`)

    fireEvent.click(screen.getByRole('link', { name: 'Create an account' }))

    await screen.findByRole('heading', { name: 'Create your account' })
    expect(router.state.location.search).toBe(`?next=${encodeURIComponent(BOOKING)}`)
  })
})

describe('SignUp', () => {
  function fillValidSignUp() {
    type('First name', 'Elena')
    type('Last name', 'Marsh')
    type('Email', 'elena.marsh@example.com')
    type('Password', 'correct-horse-battery')
    type(/Confirm password/, 'correct-horse-battery')
  }

  it('sends the two name parts and the joined display name', async () => {
    renderAuth('/sign-up')

    fillValidSignUp()
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    await waitFor(() => expect(signUpEmail).toHaveBeenCalled())
    expect(signUpEmail).toHaveBeenCalledWith({
      email: 'elena.marsh@example.com',
      password: 'correct-horse-battery',
      // Better Auth needs one string; the clinic keeps the two it was given.
      name: 'Elena Marsh',
      firstName: 'Elena',
      lastName: 'Marsh',
    })
  })

  it('signs the new patient in and returns them to their slot', async () => {
    const router = renderAuth(`/sign-up?next=${encodeURIComponent(BOOKING)}`)

    fillValidSignUp()
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('booking flow')).toBeDefined()
    expect(router.state.location.pathname + router.state.location.search).toBe(BOOKING)
  })

  // With verification off there is no password reset, so a typo here is an
  // account nobody can ever sign in to. Catching it is the field's whole job.
  it('refuses a mistyped confirmation without asking the server', async () => {
    renderAuth('/sign-up')

    type('First name', 'Elena')
    type('Last name', 'Marsh')
    type('Email', 'elena.marsh@example.com')
    type('Password', 'correct-horse-battery')
    type(/Confirm password/, 'correct-horse-batteru')
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    await screen.findByText('This does not match the password above')
    expect(signUpEmail).not.toHaveBeenCalled()
  })

  // The rule is the server's own constant, so this fails if the two come apart.
  it('enforces the server password rule before submitting', async () => {
    renderAuth('/sign-up')

    type('First name', 'Elena')
    type('Last name', 'Marsh')
    type('Email', 'elena.marsh@example.com')
    type('Password', 'short')
    type(/Confirm password/, 'short')
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    await screen.findByText('At least 12 characters')
    expect(signUpEmail).not.toHaveBeenCalled()
  })

  it('points a returning patient at sign-in when the email is taken', async () => {
    signUpEmail.mockResolvedValue({
      data: null,
      error: { code: 'USER_ALREADY_EXISTS', message: 'User already exists.' },
    })

    renderAuth('/sign-up')

    fillValidSignUp()
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/already an account with that email/)
  })
})
