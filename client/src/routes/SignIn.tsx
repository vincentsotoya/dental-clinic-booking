// A working stand-in, not the screen.
//
// The designed sign-in and sign-up screens are their own task. This exists so
// the guard, the redirect and the session refresh can be exercised end to end,
// the same way `db:authz`'s /probe routes stood in for the appointment routes
// before they were written. Replace the markup; the three calls it makes are
// the real ones.
//
// It is also the first screen built on shadcn components, which makes it the
// proof that the token adapter works on a real path rather than a specimen.

import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { signIn } from '../auth/auth-client'
import { useRefreshSession } from '../auth/use-session'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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
    <main className="flex min-h-dvh items-center justify-center bg-background p-6 text-foreground">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-card border border-border bg-card p-6"
      >
        <h1 className="font-display text-lg font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Stand-in screen. The designed one is a later task.
        </p>

        <div className="mt-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          {/* role="alert" so the failure is announced, not only shown. */}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" disabled={pending} className="active:translate-y-px">
            {pending ? 'Signing in' : 'Sign in'}
          </Button>
        </div>
      </form>
    </main>
  )
}
