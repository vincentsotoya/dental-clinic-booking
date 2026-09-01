// Who is using the app, in three states rather than two.
//
// WHY LOADING IS NOT ANONYMOUS
//
// On a cold load `GET /api/me` has not answered yet. Collapsing that into
// "signed out" is the tempting simplification and the expensive one: a guard
// would bounce a signed-in patient to the sign-in screen, the answer would
// arrive a moment later, and it would bounce them back. They would see a flash
// of a screen they did not need and, on a slow connection, a real redirect.
//
// This is the same trichotomy the server keeps for `req.auth` — undefined,
// null, a session — and for the same reason (ADR-0008). Not knowing yet is a
// distinct state from knowing there is nobody.

import { useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { MePatient, MeUser } from '@dental/shared'
import { useMe } from '../api/hooks'
import { queryKeys } from '../api/keys'
import { signOut as signOutRequest } from './auth-client'

export type Session =
  /** `/api/me` has not answered. Render nothing that depends on the answer. */
  | { status: 'loading'; user: null; patient: null; isAdmin: false }
  /** Answered, and nobody is signed in. A real state, not a failure. */
  | { status: 'anonymous'; user: null; patient: null; isAdmin: false }
  | {
      status: 'authenticated'
      user: MeUser
      /** Null for an admin, and in ADR-0007's window where a login has no chart. */
      patient: MePatient | null
      isAdmin: boolean
    }

/**
 * The session, derived from the one query that knows both halves of it.
 *
 * A failed `/api/me` reads as `anonymous` on purpose: the route answers a
 * stranger with `200 { user: null }` and only fails when it is genuinely
 * broken, and an app that cannot ask who you are should show the signed-out
 * interface rather than a blank page.
 */
export function useSession(): Session {
  const me = useMe()

  return useMemo(() => {
    if (me.isPending) {
      return { status: 'loading', user: null, patient: null, isAdmin: false }
    }

    const user = me.data?.user ?? null
    if (!user) {
      return { status: 'anonymous', user: null, patient: null, isAdmin: false }
    }

    return {
      status: 'authenticated',
      user,
      patient: me.data?.patient ?? null,
      isAdmin: user.role === 'ADMIN',
    }
  }, [me.isPending, me.data])
}

/**
 * Sign out, then forget everything the previous session could see.
 *
 * `removeQueries`, not `invalidateQueries`: invalidating leaves the old
 * patient's appointments in the cache while they refetch, and the next person
 * at a shared machine would see them.
 */
export function useSignOut() {
  const queryClient = useQueryClient()

  return async () => {
    await signOutRequest()
    queryClient.removeQueries({ queryKey: queryKeys.appointments() })
    await queryClient.invalidateQueries({ queryKey: queryKeys.me() })
  }
}

/** Re-read the session after a sign-in or sign-up. */
export function useRefreshSession() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.me() })
}
