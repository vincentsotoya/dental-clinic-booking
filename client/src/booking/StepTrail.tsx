// The breadcrumb across the top: what has been chosen, and a way back to any of
// it.
//
// Each answered step is a button rather than a label, because revising one is
// the common case — a patient picks a day, sees the times, and wants a
// different day. A jump clears every answer that depended on the one it lands
// on, so going back to the service cannot leave a slot chosen for a treatment
// of a different length.
//
// It no longer does that silently. A jump that would discard other answers says
// which ones first; one that would discard none goes straight there, which is
// always the most recent choice. See `docs/booking-composition.md`.

import { useEffect, useId, useRef, useState } from 'react'
import type { AvailabilityResponse, CatalogueService } from '@dental/shared'
import { ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCivilDateShort, formatClinicTime } from '@/lib/clinic-time'
import { ANSWER_NOUN } from './questions'
import { ANY_PROVIDER, type Question, type useBookingParams } from './use-booking-params'

type Props = {
  booking: ReturnType<typeof useBookingParams>
  service: CatalogueService | undefined
  availability: AvailabilityResponse | undefined
}

export function StepTrail({ booking, service, availability }: Props) {
  const { choices, revise, discards } = booking

  const [asking, setAsking] = useState<Question | null>(null)
  const panelId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const crumbButtons = useRef(new Map<Question, HTMLButtonElement | null>())

  // The question is on screen but nothing has been said, and the buttons that
  // answer it are past the crumb the patient just pressed.
  useEffect(() => {
    if (asking) panel.current?.focus()
  }, [asking])

  type Crumb = { key: Question; label: string }
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

  function press(key: Question) {
    if (discards(key).length === 0) {
      revise(key)
      return
    }
    setAsking((open) => (open === key ? null : key))
  }

  // Focus goes back to the crumb that opened this. Confirming does not need the
  // same care: the step changes, and `Book.tsx` moves focus onto it.
  function keep() {
    const opener = asking
    setAsking(null)
    if (opener) crumbButtons.current.get(opener)?.focus()
  }

  return (
    <nav aria-label="Your choices so far" className="mt-6">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 text-sm">
        {crumbs.map((crumb, index) => {
          const asks = discards(crumb.key).length > 0
          const open = asking === crumb.key

          return (
            <li key={crumb.key} className="flex items-center gap-1">
              {index > 0 && (
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground"
                />
              )}
              <button
                type="button"
                ref={(node) => {
                  crumbButtons.current.set(crumb.key, node)
                }}
                onClick={() => press(crumb.key)}
                // On the attribute rather than in an `sr-only` span: the name
                // computation joins across the boundary without the space.
                aria-label={`${crumb.label} — change this`}
                aria-expanded={asks ? open : undefined}
                aria-controls={open ? panelId : undefined}
                className="inline-flex min-h-11 items-center rounded-pill bg-accent px-4 font-medium text-accent-foreground pressable hover:bg-accent/60"
              >
                {crumb.label}
              </button>
            </li>
          )
        })}
      </ol>

      {asking && (
        <div
          id={panelId}
          ref={panel}
          tabIndex={-1}
          role="group"
          aria-labelledby={`${panelId}-question`}
          onKeyDown={(event) => {
            if (event.key === 'Escape') keep()
          }}
          className="mt-3 rounded-card border border-border bg-card p-4"
        >
          <p id={`${panelId}-question`} className="font-medium">
            Change {ANSWER_NOUN[asking]}?
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            This clears {sentenceList(discards(asking).map((key) => ANSWER_NOUN[key]))}.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => revise(asking)} className="h-11">
              Change {ANSWER_NOUN[asking]}
            </Button>
            <Button variant="ghost" onClick={keep} className="h-11">
              Keep it
            </Button>
          </div>
        </div>
      )}
    </nav>
  )
}

function sentenceList(items: string[]): string {
  const last = items.pop()
  if (items.length === 0) return last ?? ''
  return `${items.join(', ')} and ${last}`
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
