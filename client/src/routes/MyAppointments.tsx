// The real appointments screen: upcoming and past, with cancel wired in.
// Reschedule and the profile/insurance screen are later Phase 6 sessions.

import { useState } from 'react'
import { Link } from 'react-router'
import type { AppointmentWindow, PatientAppointment } from '@dental/shared'
import { ApiRequestError } from '@/api/errors'
import { useCancelAppointment, useMyAppointments } from '@/api/hooks'
import { useSession, useSignOut } from '@/auth/use-session'
import { LoadFailed } from '@/components/LoadFailed'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { civilDateOf, formatCivilDateShort, formatClinicTime } from '@/lib/clinic-time'
import { providerName } from '@/lib/format'
import { cn } from '@/lib/utils'

const TABS: { key: AppointmentWindow; label: string }[] = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
]

export default function MyAppointments() {
  const [when, setWhen] = useState<AppointmentWindow>('upcoming')
  const session = useSession()
  const appointments = useMyAppointments(when)
  const signOut = useSignOut()

  return (
    <div className="mx-auto max-w-2xl px-6 pt-12 pb-20">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Your appointments</h1>
          {session.status === 'authenticated' && (
            <p className="mt-1 text-sm text-muted-foreground">
              {session.user.firstName} {session.user.lastName}
              {session.patient === null && ' — no chart on this account'}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button asChild variant="ghost" size="sm">
            <Link to="/profile">Profile</Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </header>

      <div
        role="tablist"
        aria-label="Which appointments"
        className="mt-6 inline-flex gap-1 rounded-pill border border-border p-1"
      >
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={when === tab.key}
            onClick={() => setWhen(tab.key)}
            className={cn(
              'min-h-9 rounded-pill px-4 text-sm font-medium pressable',
              when === tab.key ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {appointments.isError && (
          <LoadFailed what="your appointments" onRetry={() => void appointments.refetch()} />
        )}

        {appointments.isPending && (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-24 w-full rounded-card" />
            <Skeleton className="h-24 w-full rounded-card" />
          </div>
        )}

        {appointments.data?.appointments.length === 0 && (
          <p className="rounded-card border border-border bg-card p-5 text-sm text-muted-foreground">
            {when === 'upcoming' ? 'Nothing booked yet.' : 'Nothing here yet.'}
          </p>
        )}

        {appointments.data && appointments.data.appointments.length > 0 && (
          <ul className="flex flex-col gap-3">
            {appointments.data.appointments.map((appointment) => (
              <AppointmentRow
                key={appointment.id}
                appointment={appointment}
                timeZone={appointments.data.timeZone}
                // Cancel offered only on the list bounded by "has not started
                // yet" — the same boundary the server's own refusal enforces,
                // so a button here is never one the server is going to refuse.
                cancellable={when === 'upcoming'}
              />
            ))}
          </ul>
        )}
      </div>

      <Button asChild className="mt-8 rounded-pill">
        <Link to="/book">Book an appointment</Link>
      </Button>
    </div>
  )
}

function AppointmentRow({
  appointment,
  timeZone,
  cancellable,
}: {
  appointment: PatientAppointment
  timeZone: string
  cancellable: boolean
}) {
  const day = formatCivilDateShort(civilDateOf(appointment.startsAt, timeZone))
  const time = formatClinicTime(appointment.startsAt, timeZone)

  return (
    <li className="flex flex-wrap items-start justify-between gap-4 rounded-card border border-border bg-card p-4">
      <div>
        <p className="font-display font-bold tracking-tight">{appointment.service.name}</p>
        <p className="text-sm text-muted-foreground">{providerName(appointment.provider)}</p>
        <p className="mt-1 text-sm tabular-nums">
          {day} · {time}
        </p>
        {/* Said in words, not colour alone — the same reason the confirmation
            screen marks a just-booked row by name rather than by a border. */}
        <p className="text-sm text-muted-foreground">{appointment.status.toLowerCase()}</p>
      </div>

      {cancellable && appointment.status === 'CONFIRMED' && (
        <CancelButton appointment={appointment} />
      )}
    </li>
  )
}

function CancelButton({ appointment }: { appointment: PatientAppointment }) {
  const [open, setOpen] = useState(false)
  const cancel = useCancelAppointment()

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        // A retry after a failed attempt should not open onto the last
        // attempt's error.
        if (next) cancel.reset()
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-pill">
          Cancel
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel this appointment?</DialogTitle>
          <DialogDescription>
            {appointment.service.name} with {providerName(appointment.provider)}. The clinic keeps
            the record; this only frees the slot.
          </DialogDescription>
        </DialogHeader>

        {cancel.isError && (
          <p role="alert" className="text-sm text-destructive">
            {cancelFailureMessage(cancel.error)}
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={cancel.isPending}>
            Keep it
          </Button>
          <Button
            variant="destructive"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate(appointment.id, { onSuccess: () => setOpen(false) })}
          >
            {cancel.isPending ? 'Cancelling…' : 'Cancel appointment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * `NOT_CANCELLABLE`'s message is written for a patient to read (see
 * `appointment-state.ts`), so it is shown as sent. Anything else — `INTERNAL`,
 * a dropped connection — carries no message meant for this screen, and gets a
 * fixed one instead of leaking server or network detail.
 */
function cancelFailureMessage(error: Error): string {
  if (error instanceof ApiRequestError && error.code === 'NOT_CANCELLABLE') return error.message
  return 'Something went wrong at our end. Nothing was changed.'
}
