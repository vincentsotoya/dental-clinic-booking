// The admin console's entry point.
//
// Gated by role, not by ownership: nothing here is addressed by an id, so
// `RequireAuth`'s `roles` prop is the whole guard (router.tsx) — the same
// shape `getChartId` gives Profile, without the id-addressed machinery
// `requireOwnership` exists for (ADR-0007).
//
// Deliberately minimal. Phase 7's remaining tasks — the calendar, working
// hours, time off, clinic closures, confirm/complete/no-show — add their own
// sections here; this is only the shell and the proof that the guard works.

import { Link } from 'react-router'
import { useSession, useSignOut } from '@/auth/use-session'
import { Button } from '@/components/ui/button'

export default function AdminHome() {
  const session = useSession()
  const signOut = useSignOut()

  return (
    <div className="mx-auto max-w-2xl px-6 pt-12 pb-20">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Admin</h1>
          {session.status === 'authenticated' && (
            <p className="mt-1 text-sm text-muted-foreground">
              {session.user.firstName} {session.user.lastName}
            </p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => void signOut()}>
          Sign out
        </Button>
      </header>

      <Button asChild className="mt-8 rounded-pill">
        <Link to="/admin/calendar">Calendar</Link>
      </Button>
    </div>
  )
}
