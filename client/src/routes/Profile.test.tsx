import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GetProfileResponse } from '@dental/shared'
import { queryKeys } from '@/api/keys'
import Profile from './Profile'

afterEach(cleanup)
afterEach(() => vi.unstubAllGlobals())

const PROFILE: GetProfileResponse = {
  profile: {
    phone: '555-0142',
    dateOfBirth: '1988-04-17',
    insuranceProvider: 'Northlake Dental Plan',
    insuranceMemberId: 'NDP-4471902',
  },
}

const EMPTY: GetProfileResponse = {
  profile: { phone: null, dateOfBirth: null, insuranceProvider: null, insuranceMemberId: null },
}

/** Seeded directly, the same way `MyAppointments.test.tsx` seeds its lists — the
 * queryFn never runs, so what is on screen is only what this file put there. */
function renderProfile(profile: GetProfileResponse = PROFILE) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, queryFn: () => new Promise(() => {}) } },
  })
  queryClient.setQueryData(queryKeys.profile(), profile)

  const router = createMemoryRouter([{ path: '/profile', element: <Profile /> }], {
    initialEntries: ['/profile'],
  })

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return queryClient
}

/**
 * A background refetch on mount (staleTime is 0 on a fresh `QueryClient`) is
 * real and can land mid-test — `findByRole('alert')` polls long enough for
 * one to complete. It has to succeed quietly rather than fall into the
 * "unexpected request" branch, or an unrelated `LoadFailed` alert joins the
 * one the test is asserting on.
 */
function stubPatch(onPatch: () => Response, captured?: { body?: unknown }) {
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'

    if (method === 'GET' && url.endsWith('/me/profile')) {
      return jsonResponse(PROFILE)
    }

    if (method === 'PATCH' && url.endsWith('/me/profile')) {
      if (captured && typeof init?.body === 'string') captured.body = JSON.parse(init.body)
      return onPatch()
    }

    throw new Error(`unexpected request: ${url}`)
  })
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function type(label: RegExp | string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

describe('the form', () => {
  it('opens with the fields the query already has', async () => {
    renderProfile()

    expect(await screen.findByLabelText('Phone')).toHaveProperty('value', '555-0142')
    expect(screen.getByLabelText('Insurance provider')).toHaveProperty(
      'value',
      'Northlake Dental Plan',
    )
    expect(screen.getByLabelText('Member id')).toHaveProperty('value', 'NDP-4471902')
  })

  it('shows nothing on file as a blank field, not the word "null"', async () => {
    renderProfile(EMPTY)

    expect(await screen.findByLabelText('Phone')).toHaveProperty('value', '')
  })

  it('disables Save until a field actually changes', async () => {
    renderProfile()

    expect(await screen.findByRole('button', { name: 'Save' })).toHaveProperty('disabled', true)
    type('Phone', '555-0199')
    expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', false)
  })
})

describe('saving', () => {
  it('sends a field cleared to blank as null, not an empty string', async () => {
    const captured: { body?: unknown } = {}
    // The response has to echo the edit, not the original row — the same as a
    // real save — or the field stays dirty against a stale default and
    // "Saved." never has a state where it is true to show.
    stubPatch(() => jsonResponse({ profile: { ...PROFILE.profile, insuranceProvider: null } }), captured)
    renderProfile()

    type('Insurance provider', '')
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }))

    await screen.findByText('Saved.')
    expect(captured.body).toMatchObject({ insuranceProvider: null })
  })

  it('confirms the save and disables the button again once it lands', async () => {
    stubPatch(() => jsonResponse({ profile: { ...PROFILE.profile, insuranceMemberId: 'NDP-NEW' } }))
    renderProfile()

    type('Member id', 'NDP-NEW')
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Saved.')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true)
  })

  it('shows the server’s own message when it refuses, and keeps the edit on screen', async () => {
    stubPatch(() =>
      jsonResponse({ error: { code: 'INVALID_REQUEST', message: 'phone: too long' } }, 400),
    )
    renderProfile()

    type('Phone', '555-0199')
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'phone: too long')
    expect(screen.getByLabelText('Phone')).toHaveProperty('value', '555-0199')
  })

  // The client's own rule, checked before a request is ever sent — the same
  // one `patientProfile` enforces server-side.
  it('never calls the network for a date of birth in the future', async () => {
    stubPatch(() => {
      throw new Error('should not be called')
    })
    renderProfile()

    type('Date of birth', '2099-01-01')
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Date of birth cannot be in the future.')).toBeDefined()
  })
})
