// A working stand-in, not the screen.
//
// The designed sign-in and sign-up screens are their own task. This exists so
// the guard, the redirect and the session refresh can be exercised end to end,
// the same way `db:authz`'s /probe routes stood in for the appointment routes
// before they were written. Replace the markup; the three calls it makes are
// the real ones.

import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { signIn } from '../auth/auth-client'
import { useRefreshSession } from '../auth/use-session'

type LocationState = { from?: string } | null

export default function SignIn() {
  const navigate = useNavigate()
  const location = useLocation()
  const refreshSession = useRefreshSession()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  // Where the guard wanted them to be, before it sent them here.
  const from = (location.state as LocationState)?.from ?? '/appointments'

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)

    const result = await signIn.email({ email, password })

    if (result.error) {
      // Better Auth speaks its own dialect here, by design (ADR-0006), so this
      // message comes from the library rather than the shared error registry.
      setError(result.error.message ?? 'Could not sign in.')
      setPending(false)
      return
    }

    // The cookie exists now, but the cached answer to "who am I" predates it.
    await refreshSession()
    navigate(from, { replace: true })
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-ground p-6 text-ink">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-card border border-edge bg-surface p-6">
        <h1 className="font-display text-lg font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-muted">Stand-in screen. The designed one is a later task.</p>

        <div className="mt-5 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              className="rounded-input border border-edge bg-surface px-3 py-2 text-ink"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete="current-password"
              className="rounded-input border border-edge bg-surface px-3 py-2 text-ink"
            />
          </label>

          {error && <p className="text-sm text-accent">{error}</p>}

          <button
            type="submit"
            disabled={pending}
            className="rounded-pill bg-accent px-5 py-2.5 font-display text-sm font-semibold text-accent-ink active:translate-y-px disabled:opacity-45"
          >
            {pending ? 'Signing in' : 'Sign in'}
          </button>
        </div>
      </form>
    </main>
  )
}
