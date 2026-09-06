import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import type { ProvidersResponse, ServicesResponse } from '@dental/shared'
import { queryKeys } from '../api/keys'
import Dentists from './Dentists'
import Services from './Services'

// Both pages are driven over a seeded cache rather than a stubbed hook, for the
// same reason the guard's tests are: what matters is what a visitor ends up
// reading, and a stubbed hook proves a branch was taken without proving that.

afterEach(cleanup)

const SERVICES: ServicesResponse = {
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
    {
      id: '3d604f00-0000-4000-8000-000000000001',
      slug: 'routine-cleaning',
      name: 'Routine Cleaning',
      description: null,
      durationMins: 60,
      priceCents: 12_000,
      providerType: 'HYGIENIST',
    },
  ],
}

const PROVIDERS: ProvidersResponse = {
  providers: [
    {
      id: '4d604f00-0000-4000-8000-000000000001',
      type: 'DENTIST',
      firstName: 'Amara',
      lastName: 'Osei',
      title: 'DDS',
      bio: 'General and restorative dentistry.',
    },
    {
      id: '4d604f00-0000-4000-8000-000000000004',
      type: 'HYGIENIST',
      firstName: 'Naomi',
      lastName: 'Clarke',
      title: null,
      bio: null,
    },
  ],
}

/**
 * A seeded cache answers the query immediately. 'failed' seeds nothing, so the
 * hook really fetches, really fails in jsdom, and the page takes its error path.
 */
function renderPage(
  Page: () => React.ReactNode,
  seed: { key: readonly unknown[]; data: unknown } | 'failed',
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  if (typeof seed === 'object') queryClient.setQueryData(seed.key, seed.data)

  const router = createMemoryRouter([{ path: '/', element: <Page /> }], {
    initialEntries: ['/'],
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('Services', () => {
  it('lists the treatments the API returned, grouped by who performs them', () => {
    renderPage(Services, { key: queryKeys.services(), data: SERVICES })

    expect(screen.getByText('Routine Exam')).toBeDefined()
    expect(screen.getByText('Routine Cleaning')).toBeDefined()
    expect(screen.getByRole('heading', { name: 'With a hygienist' })).toBeDefined()
    expect(screen.getByRole('heading', { name: 'With a dentist' })).toBeDefined()
  })

  // The count used to be written into the markup, so retiring a treatment left
  // the page advertising one that could not be booked.
  it('counts the treatments rather than asserting a number', () => {
    renderPage(Services, { key: queryKeys.services(), data: SERVICES })

    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading.textContent).toBe('two treatments, one honest price list')
  })

  it('prices in dollars and durations in words', () => {
    renderPage(Services, { key: queryKeys.services(), data: SERVICES })

    expect(screen.getByText('$85')).toBeDefined()
    expect(screen.getByText('30 min')).toBeDefined()
    expect(screen.getByText('1 hr')).toBeDefined()
  })

  // A group with nothing in it is hidden: "with a hygienist" over a blank card
  // reads as a fault rather than as a clinic that employs none.
  it('hides a group the clinic currently has no treatments for', () => {
    renderPage(Services, {
      key: queryKeys.services(),
      data: { services: SERVICES.services.filter((s) => s.providerType === 'DENTIST') },
    })

    expect(screen.getByRole('heading', { name: 'With a dentist' })).toBeDefined()
    expect(screen.queryByRole('heading', { name: 'With a hygienist' })).toBeNull()
  })

  it('offers a retry, and no invented number, when the catalogue cannot be read', async () => {
    renderPage(Services, 'failed')

    expect(await screen.findByRole('button', { name: 'Try again' })).toBeDefined()
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading.textContent).toBe('Our treatments, one honest price list')
  })
})

describe('Dentists', () => {
  it('addresses a dentist as Dr and a hygienist by name', () => {
    renderPage(Dentists, { key: queryKeys.providers(), data: PROVIDERS })

    expect(screen.getByRole('heading', { name: 'Dr Amara Osei' })).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Naomi Clarke' })).toBeDefined()
  })

  it('counts each kind of provider in its heading', () => {
    renderPage(Dentists, { key: queryKeys.providers(), data: PROVIDERS })

    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading.textContent).toBe('one dentist, one hygienist')
  })

  // Both columns are nullable, and a provider the front desk added in a hurry
  // has neither. The separator must not dangle and "null" must not appear.
  it('renders a provider with no title and no biography', () => {
    renderPage(Dentists, { key: queryKeys.providers(), data: PROVIDERS })

    expect(screen.getByText('Hygienist')).toBeDefined()
    expect(screen.getByText('DDS · Dentist')).toBeDefined()
    expect(screen.queryByText(/null/)).toBeNull()
  })
})
