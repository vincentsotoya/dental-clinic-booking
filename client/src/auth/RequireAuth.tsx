// The route guard. Wraps the routes only a signed-in patient may reach.
//
// It guards the *interface*, never the data. Every one of these routes is
// already refused by the server for anyone who should not have it, and this
// exists so a patient is sent somewhere useful instead of watching a screen
// fill with 401s. Removing it would leak nothing; it would only be rude.

import { Navigate, Outlet, useLocation } from 'react-router'
import type { Role } from '@dental/shared'
import { useSession } from './use-session'

type Props = {
  /** When set, the signed-in caller must also hold one of these roles. */
  roles?: Role[]
}

export function RequireAuth({ roles }: Props) {
  const session = useSession()
  const location = useLocation()

  // Not "signed out" — not known yet. Redirecting here would bounce a
  // signed-in patient to the sign-in screen and back a moment later.
  if (session.status === 'loading') {
    return <PendingSession />
  }

  if (session.status === 'anonymous') {
    // `replace`, so the back button does not return to the guard and bounce
    // again. `from` is how the sign-in screen sends them where they meant to go.
    return <Navigate to="/sign-in" replace state={{ from: location.pathname + location.search }} />
  }

  if (roles && !roles.includes(session.user.role)) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}

/**
 * Deliberately quiet. This is visible for one request on a cold load, and a
 * spinner that appears and vanishes that fast reads as a flicker.
 */
function PendingSession() {
  return <div className="min-h-dvh bg-ground" aria-busy="true" aria-live="polite" />
}
