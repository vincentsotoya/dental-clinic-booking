// A working stand-in for the appointments screen, behind the guard.
//
// It exists to prove three things at once: the guard admits a signed-in
// patient, the session resolves their chart, and the typed client reads their
// own rows and nobody else's. The designed screen is Phase 6.

import { useMyAppointments } from '../api/hooks'
import { useSession, useSignOut } from '../auth/use-session'

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

export default function MyAppointments() {
  const session = useSession()
  const appointments = useMyAppointments()
  const signOut = useSignOut()

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

        {appointments.isPending && <p className="text-sm text-muted-foreground">Loading&hellip;</p>}

        {appointments.isError && (
          <p className="text-sm text-destructive">{appointments.error.message}</p>
        )}

        {appointments.data?.appointments.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing booked. Booking is the next screen.</p>
        )}

        <ul className="flex flex-col gap-2">
          {appointments.data?.appointments.map((appointment) => (
            <li
              key={appointment.id}
              className="flex items-baseline justify-between gap-4 rounded-card border border-border bg-card p-4"
            >
              <div>
                <p className="font-medium">{appointment.service.name}</p>
                <p className="text-sm text-muted-foreground">
                  {appointment.provider.title
                    ? `${appointment.provider.firstName} ${appointment.provider.lastName}, ${appointment.provider.title}`
                    : `${appointment.provider.firstName} ${appointment.provider.lastName}`}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm tabular-nums">{when.format(new Date(appointment.startsAt))}</p>
                <p className="text-sm text-muted-foreground">{appointment.status.toLowerCase()}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}
