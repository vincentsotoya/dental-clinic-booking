import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import type { MeResponse } from '@dental/shared'
import { RequireAuth } from '@/auth/RequireAuth'
import { queryKeys } from '@/api/keys'
import AdminHome from './AdminHome'

// RequireAuth.test.tsx proves the role mechanism generically; this proves the
// real wiring — that `/admin` is actually behind it with `roles={['ADMIN']}`,
// which a route added without that prop, or a path typo, would not be.

afterEach(cleanup)

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

function at(session: MeResponse | null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(queryKeys.me(), session)

  const router = createMemoryRouter(
    [
      { path: '/', element: <p>home</p> },
      { path: '/sign-in', element: <p>sign-in screen</p> },
      {
        element: <RequireAuth roles={['ADMIN']} />,
        children: [{ path: '/admin', element: <AdminHome /> }],
      },
    ],
    { initialEntries: ['/admin'] },
  )

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return router
}

describe('/admin', () => {
  it('opens for an admin, and names them', async () => {
    at(ADMIN)
    expect(await screen.findByRole('heading', { name: 'Admin' })).toBeDefined()
    expect(screen.getByText('Dana Whitfield')).toBeDefined()
  })

  it('sends a signed-in patient home, not to sign-in', async () => {
    const router = at(PATIENT)
    expect(await screen.findByText('home')).toBeDefined()
    expect(router.state.location.pathname).toBe('/')
  })

  it('sends an anonymous visitor to sign in', async () => {
    at(null)
    expect(await screen.findByText('sign-in screen')).toBeDefined()
  })
})
