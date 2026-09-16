// The reschedule flow's last step: review the new time and commit the move.
//
// Unlike booking/Confirm.tsx there is no sign-in gate — this screen sits under
// `RequireAuth` already — and no notes field: notes belong to the original
// booking, and a move does not get to rewrite what the patient told the clinic
// when they made it.

import type { UseQueryResult } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import type { AvailabilityResponse, CatalogueService, PatientAppointment } from '@dental/shared'
import { ApiRequestError } from '@/api/errors'
import { useRescheduleAppointment } from '@/api/hooks'
import { providerForSlot } from '@/booking/slots'
import { ANY_PROVIDER } from '@/booking/use-booking-params'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { SummaryList, SummaryRow } from '@/components/SummaryList'
import { civilDateOf, formatCivilDate, formatClinicTime } from '@/lib/clinic-time'
import { formatDuration, providerName } from '@/lib/format'
import type { useRescheduleParams } from './use-reschedule-params'

type Props = {
  appointment: PatientAppointment
  reschedule: ReturnType<typeof useRescheduleParams>
  service: CatalogueService | undefined
  availability: UseQueryResult<AvailabilityResponse, Error>
}

export function RescheduleConfirm({ appointment, reschedule, service, availability }: Props) {
  const { choices, releaseSlot } = reschedule
  const navigate = useNavigate()
  const move = useRescheduleAppointment()

  const at = choices.at ?? ''
  const timeZone = availability.data?.timeZone

  // Recomputed from whatever availability currently says, not from what it
  // said when the slot was picked. With "anyone", this is also where the
  // choice of provider is actually made.
  const providerId = providerForSlot(availability.data, choices.provider, at)

  if (availability.isPending || !service) {
    return <Skeleton className="h-64 w-full rounded-card" />
  }

  // The slot went while they were on this screen. Not an error — a slot was
  // never a reservation, and nothing about the appointment has moved yet.
  if (providerId === null) {
    return (
      <Alert>
        <AlertTitle className="font-display font-bold">That time has just gone</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span>Somebody else was booked into it. Your appointment is still where it was.</span>
          <Button variant="outline" size="sm" className="rounded-pill" onClick={releaseSlot}>
            See what else is free
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  const provider = availability.data?.providers[providerId]

  function onMove() {
    if (!providerId) return

    move.mutate(
      { appointmentId: appointment.id, body: { providerId, startsAt: at } },
      { onSuccess: () => navigate('/appointments', { replace: true }) },
    )
  }

  return (
    <section aria-labelledby="confirm-reschedule">
      <h2 id="confirm-reschedule" className="font-display text-xl font-bold tracking-tight">
        Does this look right?
      </h2>

      <SummaryList className="mt-6">
        <SummaryRow
          label="Currently"
          value={
            timeZone
              ? `${formatCivilDate(civilDateOf(appointment.startsAt, timeZone))} · ${formatClinicTime(appointment.startsAt, timeZone)}`
              : '—'
          }
        />
        <SummaryRow
          label="With"
          value={provider ? providerName(provider) : 'A member of the team'}
          note={choices.provider === ANY_PROVIDER ? 'Chosen for you — whoever was free' : undefined}
        />
        <SummaryRow label="New day" value={formatCivilDate(choices.date ?? '')} />
        <SummaryRow
          label="New time"
          value={timeZone ? formatClinicTime(at, timeZone) : '—'}
          note={`${formatDuration(service.durationMins)} in the chair`}
        />
      </SummaryList>

      {move.isError && <RescheduleFailure error={move.error} onPickAgain={releaseSlot} />}

      <Button className="mt-6 rounded-pill" size="lg" disabled={move.isPending} onClick={onMove}>
        {move.isPending ? 'Moving…' : 'Confirm new time'}
      </Button>
    </section>
  )
}

/**
 * What a refused move means, by code rather than by message.
 *
 * `NOT_RESCHEDULABLE` carries its own patient-readable message from the
 * server — the same appointment-state refusal cancel shows — so it is shown
 * as sent rather than replaced with a fixed sentence.
 */
function RescheduleFailure({ error, onPickAgain }: { error: Error; onPickAgain: () => void }) {
  const code = error instanceof ApiRequestError ? error.code : 'INTERNAL'
  const lost = code === 'SLOT_TAKEN' || code === 'SLOT_UNAVAILABLE'

  return (
    <Alert className="mt-4" variant={lost ? 'default' : 'destructive'}>
      <AlertTitle className="font-display font-bold">
        {lost
          ? 'That time went while you were deciding'
          : code === 'NOT_RESCHEDULABLE'
            ? 'This appointment can’t be moved'
            : 'We could not move it'}
      </AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span>
          {code === 'SLOT_TAKEN'
            ? 'Someone was booked into it a moment before you. Your appointment is unchanged.'
            : code === 'SLOT_UNAVAILABLE'
              ? 'It is no longer being offered. The clinic may have changed its hours.'
              : code === 'NOT_RESCHEDULABLE'
                ? error.message
                : 'Something went wrong at our end. Nothing has changed.'}
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
