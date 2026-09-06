// Step four: which time.
//
// Times are formatted in the clinic's zone, which the response echoes for
// exactly this reason. A patient in California must read 8:00 AM for an 8:00 AM
// Austin appointment — showing them their own 6:00 AM would be accurate about
// the instant and wrong about the appointment.

import type { UseQueryResult } from '@tanstack/react-query'
import type { AvailabilityResponse } from '@dental/shared'
import { LoadFailed } from '@/components/LoadFailed'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCivilDate, formatClinicTime } from '@/lib/clinic-time'
import { slotsFor, startTimesOn } from './slots'

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

  const times = startTimesOn(slotsFor(availability.data, provider), date)

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
        <div className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} className="h-11 rounded-pill" />
          ))}
        </div>
      ) : times.length === 0 ? (
        // Reachable without anything being broken: the day was offered when the
        // calendar rendered and the last slot went while the patient was
        // reading it.
        <p className="mt-6 rounded-card border border-border bg-card p-5 text-sm text-muted-foreground">
          Nothing free on this day any more. Go back and pick another.
        </p>
      ) : (
        <ul className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {times.map((at) => (
            <li key={at}>
              <button
                type="button"
                onClick={() => onChoose(at)}
                className="w-full rounded-pill border border-border bg-card px-3 py-2.5 text-sm font-medium tabular-nums transition-colors hover:border-primary hover:bg-accent"
              >
                {formatClinicTime(at, availability.data?.timeZone ?? 'UTC')}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* A slot is a candidate, not a reservation — the same thing the API says
          about it. Saying so here is what makes a lost race make sense later. */}
      {times.length > 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          Nothing is held until you confirm.
        </p>
      )}
    </section>
  )
}
