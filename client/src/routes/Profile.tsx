// Phone, date of birth and insurance — the fields `/api/me` deliberately
// leaves out (Phase 6's profile endpoint) and the one screen that edits them.

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import {
  INSURANCE_MEMBER_ID_MAX_LENGTH,
  INSURANCE_PROVIDER_MAX_LENGTH,
  PHONE_MAX_LENGTH,
  type PatientProfile,
} from '@dental/shared'
import { ApiRequestError } from '@/api/errors'
import { useProfile, useUpdateProfile } from '@/api/hooks'
import { LoadFailed } from '@/components/LoadFailed'
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
import { Skeleton } from '@/components/ui/skeleton'

type ProfileFormValues = {
  phone: string
  dateOfBirth: string
  insuranceProvider: string
  insuranceMemberId: string
}

const EMPTY_FORM_VALUES: ProfileFormValues = {
  phone: '',
  dateOfBirth: '',
  insuranceProvider: '',
  insuranceMemberId: '',
}

const todayIso = () => new Date().toISOString().slice(0, 10)

/**
 * A client-side mirror of `patientProfile`'s rules, over plain strings rather
 * than the wire shape's nullables. A text input's natural empty value is
 * `''`; the boundary that turns a blank field into `null` is the submit
 * handler below, not this schema.
 */
const profileFormSchema = z.object({
  phone: z.string().trim().max(PHONE_MAX_LENGTH, 'That number is longer than we can store'),
  dateOfBirth: z
    .string()
    .refine(
      (value) => value === '' || value <= todayIso(),
      'Date of birth cannot be in the future.',
    ),
  insuranceProvider: z
    .string()
    .trim()
    .max(INSURANCE_PROVIDER_MAX_LENGTH, 'That name is longer than we can store'),
  insuranceMemberId: z
    .string()
    .trim()
    .max(INSURANCE_MEMBER_ID_MAX_LENGTH, 'That id is longer than we can store'),
})

const toFormValues = (profile: PatientProfile): ProfileFormValues => ({
  phone: profile.phone ?? '',
  dateOfBirth: profile.dateOfBirth ?? '',
  insuranceProvider: profile.insuranceProvider ?? '',
  insuranceMemberId: profile.insuranceMemberId ?? '',
})

/** A blank field means "nothing on file" — the same thing the server calls `null`. */
const orNull = (value: string): string | null => (value.trim() === '' ? null : value.trim())

export default function Profile() {
  const profile = useProfile()
  const updateProfile = useUpdateProfile()

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    values: profile.data ? toFormValues(profile.data.profile) : EMPTY_FORM_VALUES,
    // The query can refetch under the patient — a tab regaining focus, say —
    // and that must not overwrite a field they are mid-edit on.
    resetOptions: { keepDirtyValues: true },
  })

  // `mutate`, not `mutateAsync`: the failure is already rendered from
  // `updateProfile.error`, and awaiting it would reject a second time with
  // nothing to catch it (same reasoning as `Confirm.tsx`'s `onBook`).
  function onSubmit(values: ProfileFormValues) {
    updateProfile.mutate({
      phone: orNull(values.phone),
      dateOfBirth: values.dateOfBirth === '' ? null : values.dateOfBirth,
      insuranceProvider: orNull(values.insuranceProvider),
      insuranceMemberId: orNull(values.insuranceMemberId),
    })
  }

  return (
    <div className="mx-auto max-w-2xl px-6 pt-12 pb-20">
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight">Profile &amp; insurance</h1>
      </header>

      <div className="mt-6">
        {profile.isError && (
          <LoadFailed what="your profile" onRetry={() => void profile.refetch()} />
        )}

        {profile.isPending && (
          <div className="flex flex-col gap-5 rounded-card border border-border bg-card p-6">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        )}

        {profile.data && (
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              noValidate
              className="flex flex-col gap-5 rounded-card border border-border bg-card p-6"
            >
              {/* `role="alert"` on both, from the shared component — a screen
                  reader announces either the moment it appears. */}
              {updateProfile.isSuccess && !form.formState.isDirty && (
                <Alert>
                  <AlertDescription>Saved.</AlertDescription>
                </Alert>
              )}

              {updateProfile.isError && (
                <Alert variant="destructive">
                  <AlertDescription>{saveFailureMessage(updateProfile.error)}</AlertDescription>
                </Alert>
              )}

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input type="tel" autoComplete="tel" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="dateOfBirth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date of birth</FormLabel>
                    <FormControl>
                      <Input type="date" autoComplete="bday" max={todayIso()} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="insuranceProvider"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Insurance provider</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" {...field} />
                    </FormControl>
                    {/* Same voice as Services.tsx and Home.tsx — one line of
                        this reasoning, said once per screen it appears on. */}
                    <FormDescription>
                      We record your plan on your chart. We don&rsquo;t verify coverage or estimate
                      what it will cover — every treatment has one cash price.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="insuranceMemberId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Member id</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                size="lg"
                className="rounded-pill"
                disabled={updateProfile.isPending || !form.formState.isDirty}
              >
                {updateProfile.isPending ? 'Saving…' : 'Save'}
              </Button>
            </form>
          </Form>
        )}
      </div>
    </div>
  )
}

/**
 * `INVALID_REQUEST`'s message is written for a patient (same reasoning as
 * `cancelFailureMessage` in `MyAppointments.tsx`), and the client's own schema
 * should have caught it first — reaching this means the two rules drifted.
 * Anything else carries no message meant for this screen.
 */
function saveFailureMessage(error: Error): string {
  if (error instanceof ApiRequestError && error.code === 'INVALID_REQUEST') return error.message
  return 'Something went wrong at our end. Nothing was saved.'
}
