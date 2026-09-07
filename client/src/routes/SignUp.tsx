// Create an account.
//
// Signing up is also how a patient gets a chart: the server's user-create hook
// gives every new PATIENT login one, so "signed up" and "can book" are the same
// state (ADR-0007). That is why this screen can send someone straight back to a
// half-finished booking rather than to a "your record is being set up" page.

import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { PASSWORD_MIN_LENGTH, signUpInput, type SignUpInput } from '@dental/shared'
import { signUp } from '@/auth/auth-client'
import { signUpErrorMessage } from '@/auth/auth-errors'
import { AuthShell } from '@/auth/AuthShell'
import { authPath, safeNext } from '@/auth/next-location'
import { useRefreshSession, useSession } from '@/auth/use-session'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'

export default function SignUp() {
  const [searchParams] = useSearchParams()
  const next = safeNext(searchParams.get('next'))

  const session = useSession()
  const navigate = useNavigate()
  const refreshSession = useRefreshSession()

  const [attemptError, setAttemptError] = useState<string | null>(null)

  const form = useForm<SignUpInput>({
    resolver: zodResolver(signUpInput),
    defaultValues: { firstName: '', lastName: '', email: '', password: '', confirmPassword: '' },
  })

  if (session.status === 'authenticated') {
    return <Navigate to={next} replace />
  }

  async function onSubmit(values: SignUpInput) {
    setAttemptError(null)

    const result = await signUp.email({
      email: values.email,
      password: values.password,
      // Better Auth wants one display name; the clinic keeps the two parts it
      // was given. The join goes this way and never the other way — the same
      // rule `server/prisma/seed.ts` follows.
      name: `${values.firstName} ${values.lastName}`,
      firstName: values.firstName,
      lastName: values.lastName,
    })

    if (result.error) {
      setAttemptError(signUpErrorMessage(result.error))
      form.resetField('password')
      form.resetField('confirmPassword')
      return
    }

    // Signup signs them in, so this is the same round trip sign-in makes.
    await refreshSession()
    navigate(next, { replace: true })
  }

  return (
    <AuthShell
      title="Create your account"
      intro="It takes a moment, and it is what lets us hold an appointment in your name."
      next={next}
      footer={
        <>
          Already registered?{' '}
          <Link to={authPath('/sign-in', next)} className="text-primary underline">
            Sign in
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

          {/* Two fields rather than one, because a clinic reads a name back to
              the person it belongs to. See shared/src/credentials.ts. */}
          <div className="flex flex-col gap-5 sm:flex-row">
            <FormField
              control={form.control}
              name="firstName"
              render={({ field }) => (
                <FormItem className="flex-1">
                  <FormLabel>First name</FormLabel>
                  <FormControl>
                    <Input autoComplete="given-name" autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="lastName"
              render={({ field }) => (
                <FormItem className="flex-1">
                  <FormLabel>Last name</FormLabel>
                  <FormControl>
                    <Input autoComplete="family-name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="email" {...field} />
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
                  <Input type="password" autoComplete="new-password" {...field} />
                </FormControl>
                {/* The rule stated before it is broken. The number is the
                    server's own constant, so this line cannot go stale. */}
                <FormDescription>
                  At least {PASSWORD_MIN_LENGTH} characters. A passphrase is easier to remember than
                  a short password is to guess.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm password</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="new-password" {...field} />
                </FormControl>
                {/* Asked for because there is no way back: with verification
                    off until Phase 10 there is no password reset either, so a
                    typo here is an account nobody can sign in to. */}
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
            {form.formState.isSubmitting ? 'Creating your account…' : 'Create account'}
          </Button>
        </form>
      </Form>
    </AuthShell>
  )
}
