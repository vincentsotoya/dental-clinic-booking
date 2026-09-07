// Sign in.
//
// The screen the guard sends an anonymous visitor to, and the one the booking
// flow's confirm step links to. Both carry `?next=`, so this screen's job is
// to take a password and then put the patient back exactly where they were.

import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { signInInput, type SignInInput } from '@dental/shared'
import { signIn } from '@/auth/auth-client'
import { signInErrorMessage } from '@/auth/auth-errors'
import { AuthShell } from '@/auth/AuthShell'
import { authPath, safeNext } from '@/auth/next-location'
import { useRefreshSession, useSession } from '@/auth/use-session'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'

export default function SignIn() {
  const [searchParams] = useSearchParams()
  const next = safeNext(searchParams.get('next'))

  const session = useSession()
  const navigate = useNavigate()
  const refreshSession = useRefreshSession()

  // The library's failure, not a field's. A field error belongs to the input it
  // came from and is rendered there; this one belongs to the attempt.
  const [attemptError, setAttemptError] = useState<string | null>(null)

  const form = useForm<SignInInput>({
    resolver: zodResolver(signInInput),
    defaultValues: { email: '', password: '' },
  })

  // Already signed in and asked for the form anyway — a bookmark, or the back
  // button after signing in. Sending them on is what they wanted; showing the
  // form would ask for a password to reach a page they can already open.
  if (session.status === 'authenticated') {
    return <Navigate to={next} replace />
  }

  async function onSubmit(values: SignInInput) {
    setAttemptError(null)

    const result = await signIn.email({ email: values.email, password: values.password })

    if (result.error) {
      setAttemptError(signInErrorMessage(result.error))
      // Cleared, not kept. A wrong password left in the field is a patient
      // hunting for the character they mistyped in a row of dots.
      form.resetField('password')
      return
    }

    // The cookie exists now, but the cached answer to "who am I" predates it.
    // Awaited, so the destination is not rendered by the guard against a stale
    // session and bounced straight back here.
    await refreshSession()
    navigate(next, { replace: true })
  }

  return (
    <AuthShell
      title="Welcome back"
      intro="Sign in to see your appointments, or to finish booking one."
      next={next}
      footer={
        <>
          New here?{' '}
          {/* Carries `next`, so someone who came from a chosen slot and finds
              they have no account keeps the slot through the hop. */}
          <Link to={authPath('/sign-up', next)} className="text-primary underline">
            Create an account
          </Link>
        </>
      }
    >
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          noValidate
          className="flex flex-col gap-5 rounded-card border border-border bg-card p-6"
        >
          {attemptError && (
            <Alert variant="destructive">
              <AlertDescription>{attemptError}</AlertDescription>
            </Alert>
          )}

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="email" autoFocus {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="current-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            size="lg"
            className="rounded-pill"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </Form>
    </AuthShell>
  )
}
