// The breadcrumb across the top: what has been chosen, and a way back to it.
//
// Each answered step is a button rather than a label, because revising one is
// the common case — a patient picks a day, sees the times, and wants a
// different day. Pressing one clears every answer that depended on it
// (`revise`), so going back to the service cannot leave a slot chosen for a
// treatment of a different length.

import type { CatalogueService } from '@dental/shared'
import type { AvailabilityResponse } from '@dental/shared'
import { ChevronRight } from 'lucide-react'
import { formatCivilDateShort, formatClinicTime } from '@/lib/clinic-time'
import { ANY_PROVIDER, type useBookingParams } from './use-booking-params'

type Props = {
  booking: ReturnType<typeof useBookingParams>
  service: CatalogueService | undefined
  availability: AvailabilityResponse | undefined
}

export function StepTrail({ booking, service, availability }: Props) {
  const { choices, revise } = booking

  type Crumb = { key: 'service' | 'provider' | 'date' | 'time'; label: string }
  const crumbs: Crumb[] = []

  if (choices.service) {
    // The slug is the fallback: the catalogue may not have answered yet, and a
    // crumb that flickers from blank to a name is worse than one that starts
    // readable.
    crumbs.push({ key: 'service', label: service?.name ?? choices.service })
  }
  if (choices.provider) {
    crumbs.push({
      key: 'provider',
      label:
        choices.provider === ANY_PROVIDER
          ? 'Any provider'
          : providerLabel(availability, choices.provider),
    })
  }
  if (choices.date) {
    crumbs.push({ key: 'date', label: formatCivilDateShort(choices.date) })
  }
  // Only once availability has answered: the zone comes from the response, and
  // formatting the instant without it would print the browser's time.
  if (choices.at && availability) {
    crumbs.push({ key: 'time', label: formatClinicTime(choices.at, availability.timeZone) })
  }

  if (crumbs.length === 0) return null

  return (
    <nav aria-label="Your choices so far" className="mt-6">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 text-sm">
        {crumbs.map((crumb, index) => (
          <li key={crumb.key} className="flex items-center gap-1">
            {index > 0 && (
              <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            )}
            <button
              type="button"
              onClick={() => revise(crumb.key)}
              className="rounded-pill bg-accent px-3 py-1 font-medium text-accent-foreground transition-colors hover:bg-accent/60"
            >
              {crumb.label}
              <span className="sr-only"> — change this</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}

/**
 * Availability names only providers it offered a slot for, so a chosen one is
 * always in the map — but the request may not have answered yet, and "Provider"
 * is a better placeholder than an id.
 */
function providerLabel(availability: AvailabilityResponse | undefined, id: string): string {
  const provider = availability?.providers[id]
  if (!provider) return 'Provider'

  const prefix = provider.type === 'DENTIST' ? 'Dr ' : ''
  return `${prefix}${provider.firstName} ${provider.lastName}`
}
