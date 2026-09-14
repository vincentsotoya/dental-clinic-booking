// Where the booking flow lands: the one artifact a confirmed appointment can
// leave without email (Phase 10), and a dedicated screen for it rather than a
// banner squeezed atop the list.
//
// `:id` is a URL anyone can type or bookmark, so it proves nothing on its own
// — the confirmation appears only when that id is one of the patient's own
// CONFIRMED rows, read from `useMyAppointments()` rather than trusted from the
// param. A stranger's id and a cancelled one look identical here on purpose.

import { useEffect, useRef } from 'react'
import { Link, useParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { LoadFailed } from '@/components/LoadFailed'
import { Skeleton } from '@/components/ui/skeleton'
import { SummaryList, SummaryRow } from '@/components/SummaryList'
import { useMyAppointments } from '@/api/hooks'
import { civilDateOf, formatCivilDate, formatClinicTime } from '@/lib/clinic-time'
import { formatDuration, providerName } from '@/lib/format'
import { downloadIcs } from '@/lib/ics'

export default function BookingConfirmed() {
  const { id } = useParams<{ id: string }>()
  const appointments = useMyAppointments()

  const appointment = appointments.data?.appointments.find(
    (candidate) => candidate.id === id && candidate.status === 'CONFIRMED',
  )

  // A client-side navigation does not move focus or reset the title the way a
  // page load would — the same reason `Book.tsx` moves focus between steps.
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (!appointment) return
    document.title = 'You’re booked — Quillon Dental'
    headingRef.current?.focus()
  }, [appointment])

  if (appointments.isError) {
    return <LoadFailed what="your booking" onRetry={() => void appointments.refetch()} />
  }

  if (appointments.isPending) {
    return <Skeleton className="mx-auto mt-12 h-80 w-full max-w-3xl rounded-card" />
  }

  if (!appointment) {
    return (
      <div className="mx-auto max-w-3xl px-6 pt-12 pb-20">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          We can&rsquo;t find that confirmation
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The link may be old, or that booking may have been cancelled.
        </p>
        <Button asChild className="mt-6 rounded-pill">
          <Link to="/appointments">See your appointments</Link>
        </Button>
      </div>
    )
  }

  const timeZone = appointments.data?.timeZone
  const date = timeZone ? civilDateOf(appointment.startsAt, timeZone) : null

  return (
    <div className="mx-auto max-w-3xl px-6 pt-12 pb-20">
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-2xl font-bold tracking-tight sm:text-3xl"
      >
        You&rsquo;re booked
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        We don&rsquo;t send confirmation emails yet, so nothing is coming to your inbox. This is
        your record — add it to your own calendar, or find it under your appointments whenever
        you sign in.
      </p>

      <SummaryList className="mt-6">
        <SummaryRow label="Treatment" value={appointment.service.name} />
        <SummaryRow label="With" value={providerName(appointment.provider)} />
        <SummaryRow label="When" value={date ? formatCivilDate(date) : '—'} />
        <SummaryRow
          label="Time"
          value={timeZone ? formatClinicTime(appointment.startsAt, timeZone) : '—'}
          note={`${formatDuration(appointment.service.durationMins)} in the chair`}
        />
      </SummaryList>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button size="lg" className="rounded-pill" onClick={() => downloadIcs(appointment)}>
          Add to calendar
        </Button>
        <Button asChild variant="outline" size="lg" className="rounded-pill">
          <Link to="/appointments">See all your appointments</Link>
        </Button>
      </div>
    </div>
  )
}
