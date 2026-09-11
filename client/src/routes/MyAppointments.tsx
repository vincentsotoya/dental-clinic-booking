// A working stand-in for the appointments screen, behind the guard.
//
// It exists to prove three things at once: the guard admits a signed-in
// patient, the session resolves their chart, and the typed client reads their
// own rows and nobody else's. The designed screen is Phase 6.

import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router'
import type { PatientAppointment } from '@dental/shared'
import { useMyAppointments } from '../api/hooks'
import { useSession, useSignOut } from '../auth/use-session'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { cn } from '@/lib/utils'

const when = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  // The clinic's zone, not the browser's: a patient in another timezone must
  // still read the time they will physically turn up at.
  timeZone: 'America/New_York',
})

const providerName = ({ provider }: PatientAppointment) =>
  provider.title
    ? `${provider.firstName} ${provider.lastName}, ${provider.title}`
    : `${provider.firstName} ${provider.lastName}`

export default function MyAppointments() {
  const session = useSession()
  const appointments = useMyAppointments()
  const signOut = useSignOut()
  const [params] = useSearchParams()

  // Where the booking flow lands. `?booked=` alone proves nothing — it is a
  // URL anyone can type — so the confirmation needs a confirmed row to name.
  const bookedId = params.get('booked')
  const justBooked = appointments.data?.appointments.find(
    (appointment) => appointment.id === bookedId && appointment.status === 'CONFIRMED',
  )

  // The confirm button unmounted on the way here, so focus fell to `<body>`;
  // the same reason `Book.tsx` moves focus between steps.
  const confirmationRef = useRef<HTMLDivElement>(null)
  const justBookedId = justBooked?.id
  useEffect(() => {
    if (justBookedId) confirmationRef.current?.focus()
  }, [justBookedId])

  return (
    <main className="min-h-dvh bg-background p-6 text-foreground">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <header className="flex items-baseline justify-between gap-4">
          <div>
            <h1 className="font-display text-xl font-semibold">Your appointments</h1>
            {session.status === 'authenticated' && (
              <p className="mt-1 text-sm text-muted-foreground">
                {session.user.firstName} {session.user.lastName}
                {session.patient === null && ' — no chart on this account'}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded-pill border border-border px-4 py-2 text-sm font-medium active:translate-y-px"
          >
            Sign out
          </button>
        </header>

        {justBooked && (
          <Alert ref={confirmationRef} tabIndex={-1} role="status" className="border-primary">
            <AlertTitle className="font-display text-base font-bold">You&rsquo;re booked</AlertTitle>
            <AlertDescription>
              <p className="text-foreground">
                {justBooked.service.name} with {providerName(justBooked)},{' '}
                {when.format(new Date(justBooked.startsAt))}.
              </p>
              {/* Email is not provisioned until Phase 10, and a patient left
                  waiting for one assumes the booking failed. */}
              <p>
                We don&rsquo;t send confirmation emails yet, so nothing is coming to your inbox.
                This list is your record, and it&rsquo;s here whenever you sign in.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {appointments.isPending && <p className="text-sm text-muted-foreground">Loading&hellip;</p>}

        {appointments.isError && (
          <p className="text-sm text-destructive">{appointments.error.message}</p>
        )}

        {appointments.data?.appointments.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing booked yet.</p>
        )}

        <ul className="flex flex-col gap-2">
          {appointments.data?.appointments.map((appointment) => (
            <li
              key={appointment.id}
              className={cn(
                'flex items-baseline justify-between gap-4 rounded-card border border-border bg-card p-4',
                appointment === justBooked && 'border-primary ring-1 ring-primary',
              )}
            >
              <div>
                <p className="font-medium">{appointment.service.name}</p>
                <p className="text-sm text-muted-foreground">{providerName(appointment)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm tabular-nums">{when.format(new Date(appointment.startsAt))}</p>
                {/* Said in words as well as drawn, so the mark is not colour alone. */}
                <p className="text-sm text-muted-foreground">
                  {appointment === justBooked ? (
                    <span className="font-medium text-primary">Just booked</span>
                  ) : (
                    appointment.status.toLowerCase()
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}
