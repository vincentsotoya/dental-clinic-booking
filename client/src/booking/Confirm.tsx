// Step five: confirm, and the only step that needs to know who the patient is.
//
// SIGNING IN HERE RATHER THAN AT THE START
//
// Availability is public, so a visitor can reach a real time before being asked
// for anything. Asking first would make them take on an account to find out
// whether the clinic has a Thursday — and the answer is public.
//
// It works because the whole booking is in the URL: the guard's `from` carries
// the query string, so signing in returns them to this screen with the slot
// still chosen rather than to an empty flow. The slot may of course be gone by
// then, which is the same thing that can happen while they read the page, and
// is handled the same way.

import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import type { UseQueryResult } from '@tanstack/react-query'
import type { AvailabilityResponse, CatalogueService } from '@dental/shared'
import { useBookAppointment } from '@/api/hooks'
import { ApiRequestError } from '@/api/errors'
import { authPath } from '@/auth/next-location'
import { useSession } from '@/auth/use-session'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCivilDate, formatClinicTime } from '@/lib/clinic-time'
import { formatDuration, formatPrice } from '@/lib/format'
import { providerForSlot } from './slots'
import { ANY_PROVIDER, type useBookingParams } from './use-booking-params'

type Props = {
  booking: ReturnType<typeof useBookingParams>
  service: CatalogueService | undefined
  availability: UseQueryResult<AvailabilityResponse, Error>
}

export function Confirm({ booking, service, availability }: Props) {
  const { choices, releaseSlot } = booking
  const session = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const book = useBookAppointment()

  const [notes, setNotes] = useState('')

  const at = choices.at ?? ''
  const timeZone = availability.data?.timeZone

  // Recomputed from whatever availability currently says, not from what it said
  // when the slot was picked. With "anyone", this is also where the choice of
  // provider is actually made.
  const providerId = providerForSlot(availability.data, choices.provider, at)

  if (availability.isPending || !service) {
    return <Skeleton className="h-64 w-full rounded-card" />
  }

  // The slot went while they were on this screen, or while they were signing
  // in. Not an error — a slot was never a reservation.
  if (providerId === null) {
    return (
      <Alert>
        <AlertTitle className="font-display font-bold">That time has just gone</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span>Someone booked it first. Nothing was held, and nothing has been charged.</span>
          <Button variant="outline" size="sm" className="rounded-pill" onClick={releaseSlot}>
            See what else is free
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  const provider = availability.data?.providers[providerId]

  function onBook() {
    if (!choices.service || !providerId) return

    // `mutate`, not `mutateAsync`: the failure is already rendered from
    // `book.error`, and awaiting it would reject a second time with nothing to
    // catch it.
    book.mutate(
      {
        service: choices.service,
        providerId,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        startsAt: at,
      },
      {
        onSuccess: (result) => {
          navigate(`/appointments?booked=${result.appointment.id}`, { replace: true })
        },
      },
    )
  }

  return (
    <section aria-labelledby="confirm-booking">
      <h2 id="confirm-booking" className="font-display text-xl font-bold tracking-tight">
        Does this look right?
      </h2>

      <dl className="mt-6 divide-y divide-border overflow-hidden rounded-card border border-border bg-card">
        <Row label="Treatment" value={service.name} />
        <Row
          label="With"
          value={
            provider
              ? `${provider.type === 'DENTIST' ? 'Dr ' : ''}${provider.firstName} ${provider.lastName}`
              : 'A member of the team'
          }
          // The patient asked for anyone and this is who they got. Naming them
          // now rather than in the confirmation email is the difference between
          // a booking and a surprise.
          note={choices.provider === ANY_PROVIDER ? 'Chosen for you — whoever was free' : undefined}
        />
        <Row label="When" value={`${formatCivilDate(choices.date ?? '')}`} />
        <Row
          label="Time"
          value={timeZone ? formatClinicTime(at, timeZone) : '—'}
          note={`${formatDuration(service.durationMins)} in the chair`}
        />
        <Row
          label="Price"
          value={formatPrice(service.priceCents)}
          note="List price before insurance — we record your plan, we don't estimate what it pays"
        />
      </dl>

      {session.status === 'anonymous' ? (
        <div className="mt-6 rounded-card border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">
            One more thing — we need to know who you are before we can hold this.
          </p>
          <Button asChild className="mt-4 rounded-pill">
            {/* `next` is this exact URL, slot and all, so signing in — or
                signing up, which carries it across the hop — returns them here
                rather than to an empty booking flow. */}
            <Link to={authPath('/sign-in', location.pathname + location.search)}>
              Sign in to book
            </Link>
          </Button>
        </div>
      ) : session.status === 'loading' ? (
        <Skeleton className="mt-6 h-24 w-full rounded-card" />
      ) : session.patient === null ? (
        // An admin, or ADR-0007's window: a login with no chart cannot be the
        // patient. The server answers 403; saying so here is kinder than a
        // button that always fails.
        <Alert className="mt-6">
          <AlertTitle className="font-display font-bold">This account can&rsquo;t book</AlertTitle>
          <AlertDescription>
            It has no patient record attached. The front desk can book on your behalf.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="mt-6">
          <Label htmlFor="notes">Anything we should know? (optional)</Label>
          <textarea
            id="notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={500}
            rows={3}
            placeholder="I'm nervous about the drill."
            className="mt-2 w-full rounded-card border border-input bg-background p-3 text-sm"
          />

          {book.isError && <BookingFailure error={book.error} onPickAgain={releaseSlot} />}

          <Button
            className="mt-4 rounded-pill"
            size="lg"
            disabled={book.isPending}
            onClick={onBook}
          >
            {book.isPending ? 'Booking…' : 'Confirm booking'}
          </Button>
        </div>
      )}
    </section>
  )
}

/**
 * What a refused booking means, by code rather than by message.
 *
 * Both 409s mean the same thing to the patient — the time is not theirs — and
 * the mutation has already invalidated availability, so the times behind this
 * message are being refetched as it renders.
 */
function BookingFailure({ error, onPickAgain }: { error: Error; onPickAgain: () => void }) {
  const code = error instanceof ApiRequestError ? error.code : 'INTERNAL'
  const lost = code === 'SLOT_TAKEN' || code === 'SLOT_UNAVAILABLE'

  return (
    <Alert className="mt-4" variant={lost ? 'default' : 'destructive'}>
      <AlertTitle className="font-display font-bold">
        {lost ? 'That time went while you were deciding' : 'We could not book that'}
      </AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span>
          {code === 'SLOT_TAKEN'
            ? 'Someone confirmed it a moment before you. Nothing has been charged.'
            : code === 'SLOT_UNAVAILABLE'
              ? 'It is no longer being offered. The clinic may have changed its hours.'
              : 'Something went wrong at our end. Nothing has been booked.'}
        </span>
        {lost && (
          <Button variant="outline" size="sm" className="rounded-pill" onClick={onPickAgain}>
            Pick another time
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 p-5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 flex-col items-end text-right">
        <span className="font-display font-bold tracking-tight">{value}</span>
        {note && <span className="mt-0.5 text-sm text-muted-foreground">{note}</span>}
      </dd>
    </div>
  )
}
