// Step three: which day.
//
// A day is offered only if the engine returned a slot on it, so closures,
// lunch, the 24-hour lead time and a fully-booked provider all disable a date
// through one mechanism rather than four rules restated on the client. The
// client knows nothing about clinic hours and should not.

import type { UseQueryResult } from '@tanstack/react-query'
import type { AvailabilityResponse } from '@dental/shared'
import { Calendar } from '@/components/ui/calendar'
import { LoadFailed } from '@/components/LoadFailed'
import { Skeleton } from '@/components/ui/skeleton'
import { civilToLocalDate, localDateToCivil } from '@/lib/clinic-time'
import { bookableDates, slotsFor } from './slots'

type Props = {
  availability: UseQueryResult<AvailabilityResponse, Error>
  provider: string | null
  month: Date
  onMonthChange: (month: Date) => void
  onChoose: (date: string) => void
}

export function ChooseDate({ availability, provider, month, onMonthChange, onChoose }: Props) {
  if (availability.isError) {
    return <LoadFailed what="available times" onRetry={() => void availability.refetch()} />
  }

  const offered = bookableDates(slotsFor(availability.data, provider))

  return (
    <section aria-labelledby="choose-date">
      <h2 id="choose-date" className="font-display text-xl font-bold tracking-tight">
        Pick a day
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Days we can&rsquo;t offer are greyed out. Bookings open 24 hours ahead.
      </p>

      <div className="mt-6 rounded-card border border-border bg-card p-2 sm:p-4">
        {availability.isPending ? (
          <Skeleton className="h-80 w-full rounded-card" />
        ) : (
          <Calendar
            mode="single"
            month={month}
            onMonthChange={onMonthChange}
            // A local-midnight Date per civil date, never an instant. Comparing
            // through `new Date(slot.startsAt)` here would file a late slot
            // under the wrong day for a patient in another zone.
            disabled={(day) => !offered.has(localDateToCivil(day))}
            onSelect={(day) => day && onChoose(localDateToCivil(day))}
            modifiers={{ offered: [...offered].map(civilToLocalDate) }}
            modifiersClassNames={{ offered: 'font-bold text-primary' }}
            className="mx-auto"
          />
        )}
      </div>

      {!availability.isPending && offered.size === 0 && (
        <p className="mt-4 rounded-card border border-border bg-card p-5 text-sm text-muted-foreground">
          Nothing free this month for that choice. Try the next month, or go back and pick{' '}
          <em>anyone available</em>.
        </p>
      )}
    </section>
  )
}
