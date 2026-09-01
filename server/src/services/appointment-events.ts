// Recording what happened to an appointment, and who did it.
//
// One writer, called by booking, cancellation and rescheduling from inside the
// transaction that makes the change. Inside, because a log that can be written
// after a commit is a log that can be missing: the row and its event land
// together or neither does.
//
// A move is an event here and not a status change, which is why this is a log
// of events. The appointment row carries only its current state, so the time a
// booking moved *from* survives nowhere else.

import type { AppointmentStatus } from '@dental/shared'
import type { Prisma } from '../../generated/prisma/client'

/** Who caused it. `SYSTEM` is the seed, and any later job with nobody behind it. */
export type Actor = {
  /** Null for `SYSTEM`, and after the login that acted has been deleted. */
  userId: string | null
  role: 'PATIENT' | 'ADMIN' | 'SYSTEM'
}

/** The seed and any future job act as nobody in particular. */
export const SYSTEM_ACTOR: Actor = { userId: null, role: 'SYSTEM' }

type Booked = {
  type: 'BOOKED'
  toStatus: AppointmentStatus
  toStartsAt: Date
  toProviderId: string
}

type StatusChanged = {
  type: 'CANCELLED' | 'COMPLETED' | 'NO_SHOW'
  fromStatus: AppointmentStatus
  toStatus: AppointmentStatus
}

type Rescheduled = {
  type: 'RESCHEDULED'
  fromStartsAt: Date
  toStartsAt: Date
  fromProviderId: string
  toProviderId: string
}

/**
 * A union rather than one wide optional shape, so each event carries exactly
 * the fields that mean something for it. A `BOOKED` row with a `fromStatus`
 * would be a lie the type system can refuse cheaply.
 */
export type AppointmentEventInput = (Booked | StatusChanged | Rescheduled) & {
  appointmentId: string
  actor: Actor
}

/**
 * Append one event. Takes the transaction client, never the root client — the
 * caller is always mid-change, and this must not be able to commit on its own.
 */
export async function recordAppointmentEvent(
  tx: Prisma.TransactionClient,
  event: AppointmentEventInput,
): Promise<void> {
  const { appointmentId, actor, ...change } = event

  await tx.appointmentEvent.create({
    data: {
      appointmentId,
      actorUserId: actor.userId,
      actorRole: actor.role,
      ...change,
    },
  })
}
