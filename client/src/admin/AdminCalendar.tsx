// The clinic's own view of its schedule: an agenda, day or week, across every
// patient. `GET /api/admin/appointments` answers "what is happening", a
// different question from what a patient's own list answers — see
// shared/src/admin.ts.
//
// One row component serves both densities. Week is the day view repeated
// seven times under a heading, not a second layout to build and test.

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { AdminAppointment } from '@dental/shared'
import { useAdminAppointments } from '@/api/hooks'
import { LoadFailed } from '@/components/LoadFailed'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  addCivilDays,
  civilDateOf,
  formatCivilDate,
  formatCivilDateShort,
  formatClinicTime,
  localDateToCivil,
  weekRange,
} from '@/lib/clinic-time'
import { providerName } from '@/lib/format'
import { cn } from '@/lib/utils'

type Mode = 'day' | 'week'

const MODES: { key: Mode; label: string }[] = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
]

export default function AdminCalendar() {
  const [mode, setMode] = useState<Mode>('day')
  // Not in the URL: an admin's own view state, not something worth a link —
  // the same reasoning MyAppointments' own tab takes.
  const [anchor, setAnchor] = useState(() => new Date())

  const anchorCivil = localDateToCivil(anchor)
  const range = mode === 'day' ? { from: anchorCivil, to: anchorCivil } : weekRange(anchor)
  const calendar = useAdminAppointments(range)

  function shift(days: number) {
    setAnchor((current) => {
      const next = new Date(current)
      next.setDate(next.getDate() + days)
      return next
    })
  }

  const step = mode === 'day' ? 1 : 7

  return (
    <div className="mx-auto max-w-2xl px-6 pt-12 pb-20">
      <h1 className="font-display text-2xl font-bold tracking-tight">Calendar</h1>

      <div
        role="tablist"
        aria-label="Day or week"
        className="mt-6 inline-flex gap-1 rounded-pill border border-border p-1"
      >
        {MODES.map((option) => (
          <button
            key={option.key}
            type="button"
            role="tab"
            aria-selected={mode === option.key}
            onClick={() => setMode(option.key)}
            className={cn(
              'min-h-9 rounded-pill px-4 text-sm font-medium pressable',
              mode === option.key ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1">
        <Button variant="ghost" size="sm" onClick={() => shift(-step)}>
          <ChevronLeft aria-hidden="true" />
          {mode === 'day' ? 'Previous day' : 'Previous week'}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setAnchor(new Date())}>
          Today
        </Button>
        <Button variant="ghost" size="sm" onClick={() => shift(step)}>
          {mode === 'day' ? 'Next day' : 'Next week'}
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>

      <p className="mt-3 text-sm font-medium text-muted-foreground">
        {mode === 'day'
          ? formatCivilDate(anchorCivil)
          : `${formatCivilDateShort(range.from)} – ${formatCivilDateShort(range.to)}`}
      </p>

      <div className="mt-6">
        {calendar.isError && (
          <LoadFailed what="the schedule" onRetry={() => void calendar.refetch()} />
        )}

        {calendar.isPending && (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-20 w-full rounded-card" />
            <Skeleton className="h-20 w-full rounded-card" />
          </div>
        )}

        {calendar.data && mode === 'day' && (
          <DayAgenda appointments={calendar.data.appointments} timeZone={calendar.data.timeZone} />
        )}

        {calendar.data && mode === 'week' && (
          <WeekAgenda
            appointments={calendar.data.appointments}
            timeZone={calendar.data.timeZone}
            from={range.from}
          />
        )}
      </div>
    </div>
  )
}

function DayAgenda({
  appointments,
  timeZone,
}: {
  appointments: AdminAppointment[]
  timeZone: string
}) {
  if (appointments.length === 0) {
    return (
      <p className="rounded-card border border-border bg-card p-5 text-sm text-muted-foreground">
        Nothing on the schedule.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {appointments.map((appointment) => (
        <CalendarRow key={appointment.id} appointment={appointment} timeZone={timeZone} />
      ))}
    </ul>
  )
}

function WeekAgenda({
  appointments,
  timeZone,
  from,
}: {
  appointments: AdminAppointment[]
  timeZone: string
  from: string
}) {
  const days = Array.from({ length: 7 }, (_, i) => addCivilDays(from, i))

  return (
    <div className="flex flex-col gap-6">
      {days.map((day) => {
        const onDay = appointments.filter((a) => civilDateOf(a.startsAt, timeZone) === day)

        return (
          <section key={day} aria-labelledby={`day-${day}`}>
            <h2 id={`day-${day}`} className="font-display text-sm font-bold tracking-tight">
              {formatCivilDateShort(day)}
              {onDay.length > 0 && (
                <span className="ml-2 font-normal text-muted-foreground">
                  {onDay.length} {onDay.length === 1 ? 'appointment' : 'appointments'}
                </span>
              )}
            </h2>

            {onDay.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Nothing on the schedule.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-3">
                {onDay.map((appointment) => (
                  <CalendarRow key={appointment.id} appointment={appointment} timeZone={timeZone} />
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}

function CalendarRow({
  appointment,
  timeZone,
}: {
  appointment: AdminAppointment
  timeZone: string
}) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-4 rounded-card border border-border bg-card p-4">
      <div>
        <p className="font-display font-bold tracking-tight tabular-nums">
          {formatClinicTime(appointment.startsAt, timeZone)}
        </p>
        <p className="text-sm">
          {appointment.patient.firstName} {appointment.patient.lastName}
        </p>
        <p className="text-sm text-muted-foreground">
          {appointment.service.name} — {providerName(appointment.provider)}
        </p>
      </div>
      {/* Said in words, not colour alone — the same reason MyAppointments marks status this way. */}
      <p className="text-sm text-muted-foreground">{appointment.status.toLowerCase()}</p>
    </li>
  )
}
