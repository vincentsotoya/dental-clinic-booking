// The reschedule flow: who → day → time → confirm, scoped to one appointment.
//
// The service is fixed to the row being moved — see use-reschedule-params.ts
// — so this flow starts one question later than booking's. `:id` is a URL
// anyone can type, so the appointment is read from `useMyAppointments()`
// rather than trusted from the param, the same guard BookingConfirmed.tsx
// uses for the same reason.

import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ChevronLeft } from 'lucide-react'
import { useAvailability, useMyAppointments, useServices } from '@/api/hooks'
import { ChooseDate } from '@/booking/ChooseDate'
import { ChooseProvider } from '@/booking/ChooseProvider'
import { ChooseTime } from '@/booking/ChooseTime'
import { LoadFailed } from '@/components/LoadFailed'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { monthRange } from '@/lib/clinic-time'
import { ANSWER_NOUN, QUESTION } from './questions'
import { RescheduleConfirm } from './RescheduleConfirm'
import { useRescheduleParams } from './use-reschedule-params'

export default function Reschedule() {
  const { id } = useParams<{ id: string }>()
  const reschedule = useRescheduleParams()
  const { choices, step, stepIndex, previous, back, ORDER } = reschedule

  // Not part of the flow's state, same reasoning as Book.tsx: a view of the
  // answer, not the answer itself.
  const [month, setMonth] = useState(() => new Date())

  // Upcoming is the same window `MyAppointments` links from, and the only one
  // a CONFIRMED, not-yet-started row can be found in.
  const appointments = useMyAppointments()
  const appointment = appointments.data?.appointments.find(
    (candidate) => candidate.id === id && candidate.status === 'CONFIRMED',
  )

  const services = useServices()
  const service = services.data?.services.find((s) => s.slug === appointment?.service.slug)

  const range = monthRange(month)
  const availability = useAvailability(
    appointment ? { service: appointment.service.slug, from: range.from, to: range.to } : null,
  )

  const announcement = `Step ${stepIndex + 1} of ${ORDER.length}. ${QUESTION[step]}`

  useEffect(() => {
    if (appointment) document.title = `${QUESTION[step]} — Reschedule · Quillon Dental`
  }, [step, appointment])

  // Same focus-management reasoning as Book.tsx: the step swaps in place, so
  // without this the button just pressed unmounts and focus falls to <body>.
  const stepRef = useRef<HTMLDivElement>(null)
  const focused = useRef(step)
  useEffect(() => {
    if (focused.current === step) return
    focused.current = step
    stepRef.current?.focus()
  }, [step])

  if (appointments.isError) {
    return <LoadFailed what="your appointment" onRetry={() => void appointments.refetch()} />
  }

  if (appointments.isPending) {
    return <Skeleton className="mx-auto mt-12 h-80 w-full max-w-3xl rounded-card" />
  }

  if (!appointment) {
    return (
      <div className="mx-auto max-w-3xl px-6 pt-12 pb-20">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          We can&rsquo;t find that appointment
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          It may already be cancelled, already started, or the link may be old.
        </p>
        <Button asChild className="mt-6 rounded-pill">
          <Link to="/appointments">See your appointments</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-6 pt-12 pb-20">
      <h1 className="font-display text-3xl leading-tight font-extrabold tracking-[-0.03em] text-balance sm:text-4xl">
        Reschedule
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {appointment.service.name} — moving it, not booking something different.
      </p>

      <div className="mt-6">
        <div className="flex items-center gap-4">
          {previous && (
            <Button
              variant="ghost"
              onClick={back}
              aria-label={`Back to ${ANSWER_NOUN[previous]}`}
              className="-ml-3 h-11 px-3"
            >
              <ChevronLeft aria-hidden="true" />
              Back
            </Button>
          )}
          <p
            aria-hidden="true"
            className="ml-auto text-sm font-medium tracking-tight text-muted-foreground tabular-nums"
          >
            Step {stepIndex + 1} of {ORDER.length}
          </p>
        </div>

        <div aria-hidden="true" className="mt-3 h-1 overflow-hidden rounded-pill bg-accent">
          <div
            className="h-full w-full origin-left bg-primary transition-transform duration-200 ease-out"
            style={{ transform: `scaleX(${(stepIndex + 1) / ORDER.length})` }}
          />
        </div>
      </div>

      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <div ref={stepRef} tabIndex={-1} className="mt-8">
        {step === 'provider' ? (
          <ChooseProvider service={service} onChoose={(providerId) => reschedule.choose('provider', providerId)} />
        ) : step === 'date' ? (
          <ChooseDate
            availability={availability}
            provider={choices.provider}
            month={month}
            onMonthChange={setMonth}
            onChoose={(date) => reschedule.choose('date', date)}
          />
        ) : step === 'time' ? (
          <ChooseTime
            availability={availability}
            provider={choices.provider}
            date={choices.date ?? ''}
            onChoose={(at) => reschedule.choose('time', at)}
          />
        ) : (
          <RescheduleConfirm
            appointment={appointment}
            reschedule={reschedule}
            service={service}
            availability={availability}
          />
        )}
      </div>
    </div>
  )
}
