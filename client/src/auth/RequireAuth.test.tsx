import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import type { MeResponse } from '@dental/shared'
import { queryKeys } from '../api/keys'
import { RequireAuth } from './RequireAuth'

// The guard is driven through a real router over a seeded query cache, rather
// than by stubbing `useSession`: what is being tested is the redirect, and a
// stubbed hook would prove the branch was taken without proving anyone moved.

// `globals: false`, so Testing Library's own afterEach never registers and each
// render would otherwise pile up in the same document.
afterEach(cleanup)

const PATIENT: MeResponse = {
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

const ADMIN: MeResponse = {
  user: {
    id: 'user_2',
    email: 'dana.whitfield@example.com',
    firstName: 'Dana',
    lastName: 'Whitfield',
    role: 'ADMIN',
  },
  patient: null,
}

/**
 * `session` seeds the cache so `/api/me` is already answered; `undefined`
 * leaves the query pending, which is the cold-load state.
 */
function renderGuard(session: MeResponse | null | undefined, roles?: ('PATIENT' | 'ADMIN')[]) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        // Nothing may reach the network in a test. A pending query is exactly
        // the state we want for the loading case.
        queryFn: () => new Promise(() => {}),
      },
    },
  })

  if (session !== undefined) queryClient.setQueryData(queryKeys.me(), session)

  const router = createMemoryRouter(
    [
      { path: '/sign-in', element: <p>sign-in screen</p> },
      { path: '/', element: <p>home</p> },
      { element: <RequireAuth roles={roles} />, children: [{ path: '/private', element: <p>private page</p> }] },
    ],
    { initialEntries: ['/private'] },
  )

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return router
}

describe('RequireAuth', () => {
  it('renders the route for a signed-in patient', async () => {
    renderGuard(PATIENT)
    expect(await screen.findByText('private page')).toBeDefined()
  })

  it('sends an anonymous visitor to sign-in', async () => {
    const router = renderGuard(null)

    expect(await screen.findByText('sign-in screen')).toBeDefined()
    expect(router.state.location.pathname).toBe('/sign-in')
  })

  // The whole reason the session has three states. Treating "not answered yet"
  // as "signed out" bounces a signed-in patient to sign-in and back, which on a
  // slow connection is a visible redirect rather than a flicker.
  it('does not redirect while the session is still unknown', () => {
    const router = renderGuard(undefined)

    expect(screen.queryByText('sign-in screen')).toBeNull()
    expect(screen.queryByText('private page')).toBeNull()
    expect(router.state.location.pathname).toBe('/private')
  })

  it('remembers where the visitor was going', async () => {
    const router = renderGuard(null)

    await screen.findByText('sign-in screen')
    expect((router.state.location.state as { from?: string }).from).toBe('/private')
  })

  // `replace`, so the back button does not land on the guard and bounce again.
  it('replaces rather than pushes, so back does not bounce', async () => {
    const router = renderGuard(null)

    await screen.findByText('sign-in screen')
    expect(router.state.historyAction).toBe('REPLACE')
  })

  describe('with a role requirement', () => {
    it('admits the named role', async () => {
      renderGuard(ADMIN, ['ADMIN'])
      expect(await screen.findByText('private page')).toBeDefined()
    })

    // Home, not sign-in: they are signed in, so sending them to sign in again
    // would be a loop with nothing to fix at the end of it.
    it('sends a signed-in caller without the role home', async () => {
      const router = renderGuard(PATIENT, ['ADMIN'])

      expect(await screen.findByText('home')).toBeDefined()
      expect(router.state.location.pathname).toBe('/')
    })
  })
})
