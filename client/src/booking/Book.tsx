// The booking flow: service → provider → date → time → confirm.
//
// One availability request serves three of those steps. It is keyed by the
// service and the visible month, so choosing a provider or a day re-filters
// what is already in hand (see `slots.ts`) and only paging the calendar to
// another month asks the server anything.
//
// The flow is public up to the last step. Availability is public, so a visitor
// can see real times before being asked who they are; only the write needs a
// session, and that is where sign-in is asked for.

import { useState } from 'react'
import { Link } from 'react-router'
import { useAvailability, useServices } from '@/api/hooks'
import { LoadFailed } from '@/components/LoadFailed'
import { monthRange } from '@/lib/clinic-time'
import { ChooseService } from './ChooseService'
import { ChooseProvider } from './ChooseProvider'
import { ChooseDate } from './ChooseDate'
import { ChooseTime } from './ChooseTime'
import { Confirm } from './Confirm'
import { StepTrail } from './StepTrail'
import { useBookingParams } from './use-booking-params'

export default function Book() {
  const booking = useBookingParams()
  const { choices, step } = booking

  // Which month the calendar is showing. The only piece of flow state not in
  // the URL: it is a view of the answer, not part of it, and a patient who
  // shares a link means "this slot", not "I was looking at October".
  const [month, setMonth] = useState(() => new Date())

  const services = useServices()
  const service = services.data?.services.find((s) => s.slug === choices.service)

  // Not asked until a service is chosen — availability is meaningless without
  // one, and its duration is what decides which gaps are big enough.
  const range = monthRange(month)
  const availability = useAvailability(
    choices.service ? { service: choices.service, from: range.from, to: range.to } : null,
  )

  return (
    <div className="mx-auto max-w-3xl px-6 pt-12 pb-20">
      <h1 className="font-display text-3xl leading-tight font-extrabold tracking-[-0.03em] text-balance sm:text-4xl">
        Book an appointment
      </h1>

      <StepTrail booking={booking} service={service} availability={availability.data} />

      <div className="mt-8">
        {services.isError ? (
          <LoadFailed what="our treatments" onRetry={() => void services.refetch()} />
        ) : step === 'service' ? (
          <ChooseService
            services={services.data?.services ?? []}
            isPending={services.isPending}
            onChoose={(slug) => booking.choose('service', slug)}
          />
        ) : step === 'provider' ? (
          <ChooseProvider
            service={service}
            onChoose={(id) => booking.choose('provider', id)}
          />
        ) : step === 'date' ? (
          <ChooseDate
            availability={availability}
            provider={choices.provider}
            month={month}
            onMonthChange={setMonth}
            onChoose={(date) => booking.choose('date', date)}
          />
        ) : step === 'time' ? (
          <ChooseTime
            availability={availability}
            provider={choices.provider}
            date={choices.date ?? ''}
            onChoose={(at) => booking.choose('time', at)}
          />
        ) : (
          <Confirm
            booking={booking}
            service={service}
            availability={availability}
          />
        )}
      </div>

      {step === 'service' && (
        <p className="mt-10 text-sm text-muted-foreground">
          Prices and treatment times are on the{' '}
          <Link to="/services" className="font-medium text-primary hover:underline">
            treatments page
          </Link>
          .
        </p>
      )}
    </div>
  )
}
