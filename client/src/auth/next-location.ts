// Where the patient was going before they were asked who they are.
//
// It rides in the query string rather than in `location.state` because a
// half-finished booking already lives in a URL, and the round trip has to
// survive the same things that URL does: a refresh of the sign-in screen, and
// the hop between sign-in and sign-up. `state` survives neither, and the
// failure is silent — the patient signs in and lands on an empty list with the
// slot they chose forgotten.
//
// The cost of putting it in the URL is that anyone can write it, which is what
// `safeNext` is for.

/** Where a patient goes when nothing said otherwise: their own appointments. */
export const DEFAULT_LANDING = '/appointments'

/** The screens that ask who you are. Sending someone back to one is a loop. */
const AUTH_PATHS = ['/sign-in', '/sign-up']

/**
 * The destination, or the default if it is anything other than a path on this
 * site.
 *
 * An unvalidated `?next=` is an open redirect: `?next=https://evil.example`
 * turns the clinic's own sign-in screen into a credible way to land a patient
 * on someone else's page. Three spellings are rejected rather than one, because
 * "starts with a slash" is not the same as "is a local path" —
 * `//evil.example` is protocol-relative and `/\evil.example` is treated as one
 * by some parsers.
 */
export function safeNext(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_LANDING
  if (!raw.startsWith('/')) return DEFAULT_LANDING
  if (raw.startsWith('//') || raw.startsWith('/\\')) return DEFAULT_LANDING

  // Signing in only to be asked to sign in again. Reachable by hand, and by a
  // guard that ever redirects one auth screen to the other.
  const path = raw.split(/[?#]/)[0] ?? raw
  if (AUTH_PATHS.includes(path)) return DEFAULT_LANDING

  return raw
}

/**
 * A link to an auth screen carrying the destination with it.
 *
 * Used by the guard, by the booking flow's confirm step, and by the link each
 * auth screen offers to the other — which is what keeps a chosen slot through
 * "actually, I don't have an account yet".
 */
export function authPath(screen: '/sign-in' | '/sign-up', next: string): string {
  if (next === DEFAULT_LANDING) return screen
  return `${screen}?next=${encodeURIComponent(next)}`
}
