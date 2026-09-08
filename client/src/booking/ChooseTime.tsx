// Step four: which time.
//
// Times are formatted in the clinic's zone, which the response echoes for
// exactly this reason. A patient in California must read 8:00 AM for an 8:00 AM
// Austin appointment — showing them their own 6:00 AM would be accurate about
// the instant and wrong about the appointment.
//
// Grouped rather than listed: a popular service returns twenty-six start times,
// and the clinic's own lunch break is the division a patient already thinks in.
// See `docs/booking-composition.md`.

import { useId, useState } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import type { AvailabilityResponse } from '@dental/shared'
import { LoadFailed } from '@/components/LoadFailed'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { clinicHour, formatCivilDate, formatClinicTime } from '@/lib/clinic-time'
import { slotsFor, startTimesOn } from './slots'

// Enough to see the shape of the morning without scrolling it.
const VISIBLE = 6

type Props = {
  availability: UseQueryResult<AvailabilityResponse, Error>
  provider: string | null
  date: string
  onChoose: (at: string) => void
}

export function ChooseTime({ availability, provider, date, onChoose }: Props) {
  if (availability.isError) {
    return <LoadFailed what="available times" onRetry={() => void availability.refetch()} />
  }

  const zone = availability.data?.timeZone ?? 'UTC'
  const times = startTimesOn(slotsFor(availability.data, provider), date)

  // Noon is where the clinic's two-hour lunch actually falls, so the split is
  // the day the patient would describe rather than an arbitrary halving.
  const morning = times.filter((at) => clinicHour(at, zone) < 12)
  const afternoon = times.filter((at) => clinicHour(at, zone) >= 12)

  // Only worth a shortcut when there is a list to skip.
  const earliest = times.length > VISIBLE ? times[0] : undefined

  return (
    <section aria-labelledby="choose-time">
      <h2 id="choose-time" className="font-display text-xl font-bold tracking-tight">
        {formatCivilDate(date)}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {availability.data
          ? `Times shown in the clinic's timezone (${availability.data.timeZone.replace('_', ' ')}).`
          : 'Loading times.'}
      </p>

      {availability.isPending ? (
        <Loading />
      ) : times.length === 0 ? (
        // Reachable without anything being broken: the day was offered when the
        // calendar rendered and the last slot went while the patient was
        // reading it.
        <p className="mt-6 rounded-card border border-border bg-card p-5 text-sm text-muted-foreground">
          Nothing free on this day any more. Go back and pick another.
        </p>
      ) : (
        <>
          {earliest && (
            <Button
              size="lg"
              onClick={() => onChoose(earliest)}
              // h-11 over the variant's h-10: the primary action of the step,
              // on a screen a patient reaches one-handed.
              className="mt-6 h-11 w-full tabular-nums sm:w-auto"
            >
              Earliest — {formatClinicTime(earliest, zone)}
            </Button>
          )}

          <Group title="Morning" times={morning} zone={zone} onChoose={onChoose} />
          <Group title="Afternoon" times={afternoon} zone={zone} onChoose={onChoose} />
        </>
      )}

      {/* A slot is a candidate, not a reservation — the same thing the API says
          about it. Saying so here is what makes a lost race make sense later. */}
      {times.length > 0 && (
        <p className="mt-6 text-sm text-muted-foreground">Nothing is held until you confirm.</p>
      )}
    </section>
  )
}

function Group({
  title,
  times,
  zone,
  onChoose,
}: {
  title: string
  times: string[]
  zone: string
  onChoose: (at: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const listId = useId()

  if (times.length === 0) return null

  const shown = expanded ? times : times.slice(0, VISIBLE)
  const period = title.toLowerCase()

  return (
    <div className="mt-6">
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>

      <ul id={listId} className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {shown.map((at) => (
          <li key={at}>
            <button
              type="button"
              onClick={() => onChoose(at)}
              className="min-h-11 w-full rounded-pill border border-border bg-card px-3 text-sm font-medium tabular-nums transition-colors hover:border-primary hover:bg-accent"
            >
              {formatClinicTime(at, zone)}
            </button>
          </li>
        ))}
      </ul>

      {times.length > VISIBLE && (
        // `aria-expanded` is what says the list grew; a count in the label is
        // what stops the collapse from hiding an unknown quantity.
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((open) => !open)}
          className="mt-3 inline-flex min-h-11 items-center rounded-pill px-3 text-sm font-medium text-primary hover:underline"
        >
          {expanded ? `Show fewer ${period} times` : `Show all ${times.length} ${period} times`}
        </button>
      )}
    </div>
  )
}

function Loading() {
  return (
    <div className="mt-6">
      <Skeleton className="h-11 w-full rounded-pill sm:w-56" />
      {['a', 'b'].map((group) => (
        <div key={group} className="mt-6">
          <Skeleton className="h-5 w-24 rounded-input" />
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {Array.from({ length: VISIBLE }, (_, i) => (
              <Skeleton key={i} className="h-11 rounded-pill" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
