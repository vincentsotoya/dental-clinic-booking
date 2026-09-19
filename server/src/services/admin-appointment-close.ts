// The front desk closing an appointment out: `COMPLETED` or `NO_SHOW`.
//
// One writer for both outcomes, mirroring `cancellation.ts`'s own transaction
// shape — the status the read decided on sits in the UPDATE's WHERE clause,
// so a second writer (a patient's own cancellation racing the front desk's
// close-out) blocks, re-evaluates against what committed, and matches
// nothing rather than overwriting it silently.

import type { AppointmentOutcome } from '@dental/shared'
import type { Prisma, PrismaClient } from '../../generated/prisma/client'
import { ApiError } from '../errors'
import { ADMIN_APPOINTMENT_SELECT, type AdminAppointmentRow } from './admin-appointments'
import { type Actor, recordAppointmentEvent } from './appointment-events'
import { refusalToClose } from './appointment-state'

export type CloseAppointmentDb = Pick<PrismaClient, 'appointment' | '$transaction'>

export type CloseAppointmentRequest = {
  appointmentId: string
  outcome: AppointmentOutcome
  actor: Actor
  now?: Date
}

const NO_SUCH_APPOINTMENT = 'No such appointment.'

/**
 * Close it out, or explain why not.
 *
 * Throws `NOT_FOUND` if the row went missing after the guard cleared it, and
 * `NOT_CLOSEABLE` for an appointment whose own state forbids it.
 *
 * Closing an appointment with the outcome it already has succeeds and
 * changes nothing — a double tap and a retried request both asked for a
 * state the row is already in, the same idempotence `cancelAppointment`
 * gives a repeat cancel.
 */
export async function closeAppointment(
  db: CloseAppointmentDb,
  request: CloseAppointmentRequest,
): Promise<AdminAppointmentRow> {
  const { appointmentId, outcome, actor, now = new Date() } = request

  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const read = async () =>
      tx.appointment.findUnique({
        where: { id: appointmentId },
        select: ADMIN_APPOINTMENT_SELECT,
      })

    const found = (await read()) ?? raise('NOT_FOUND', NO_SUCH_APPOINTMENT)

    if (found.status === outcome) return found

    const reason = refusalToClose(found, now)
    if (reason) throw new ApiError('NOT_CLOSEABLE', reason)

    const { count } = await tx.appointment.updateMany({
      where: { id: appointmentId, status: 'CONFIRMED' },
      data: { status: outcome },
    })

    if (count === 1) {
      // Only on the write that actually changed something — the idempotent
      // return above writes nothing, or asking twice would log twice.
      await recordAppointmentEvent(tx, {
        appointmentId,
        actor,
        type: outcome,
        fromStatus: 'CONFIRMED',
        toStatus: outcome,
      })

      return { ...found, status: outcome }
    }

    // Somebody wrote first. Each statement takes a fresh snapshot at READ
    // COMMITTED, so this read sees what they committed.
    const after = (await read()) ?? raise('NOT_FOUND', NO_SUCH_APPOINTMENT)

    if (after.status === outcome) return after

    throw new ApiError(
      'NOT_CLOSEABLE',
      refusalToClose(after, now) ?? 'That appointment just changed. Please try again.',
    )
  })
}

/** Throws where an expression is needed. Keeps the null check on one line. */
function raise(code: 'NOT_FOUND', message: string): never {
  throw new ApiError(code, message)
}
