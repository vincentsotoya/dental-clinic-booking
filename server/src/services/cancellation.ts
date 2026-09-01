// Cancelling an appointment the caller has already been cleared to act on.
//
// WHY THE STATUS IS IN THE UPDATE'S WHERE CLAUSE
//
// Reading the row and then writing it are two statements, and the front desk
// marking the same appointment COMPLETED sits in the gap. A plain update would
// overwrite that judgement with the patient's cancellation and report success.
//
// So the status the read decided on is repeated in the UPDATE's WHERE clause.
// Unlike booking, there is a row here to lock: the second writer blocks, then
// re-evaluates the clause against the committed value and matches nothing. The
// same trick, one level down — the database settles it, not a check we hope
// nobody outran (ADR-0001's cousin).
//
// The check before it is not redundant, and neither covers the other. Delete
// the WHERE clause and a cancellation quietly overwrites the clinic's
// COMPLETED; delete the check and a patient can cancel a visit that already
// started, because "too late" is a fact about the clock that no WHERE clause
// on `status` can express. Both proven by deleting them — see `db:cancel`.

import type { Prisma, PrismaClient } from '../../generated/prisma/client'
import { ApiError } from '../errors'
import { type Actor, recordAppointmentEvent } from './appointment-events'
import { refusalToChange } from './appointment-state'
import { type AppointmentRow, PATIENT_APPOINTMENT_SELECT } from './appointment-view'

export type CancellationDb = Pick<PrismaClient, 'appointment' | '$transaction'>

export type CancellationRequest = {
  /** From `requireOwnership`, which has already settled whether this caller may. */
  appointmentId: string
  /** The patient, or the front desk doing it for them. The log keeps which. */
  actor: Actor
  now?: Date
}

const NO_SUCH_APPOINTMENT = 'No such appointment.'

/**
 * Cancel it, or explain why not.
 *
 * Throws `NOT_FOUND` if the row went missing after the guard cleared it, and
 * `NOT_CANCELLABLE` for an appointment whose own state forbids it.
 *
 * Cancelling an already-cancelled appointment succeeds and changes nothing: a
 * double tap and a retried request both asked for a state the row is already
 * in, and reporting a conflict for the outcome the caller wanted would be a
 * lie about what happened.
 */
export async function cancelAppointment(
  db: CancellationDb,
  request: CancellationRequest,
): Promise<AppointmentRow> {
  const { appointmentId, actor, now = new Date() } = request

  // One transaction for the read, the write, the event and the row that gets
  // sent back, so a response cannot describe a different state from the one
  // written and no cancellation can happen unlogged.
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const read = async () =>
      tx.appointment.findUnique({
        where: { id: appointmentId },
        select: PATIENT_APPOINTMENT_SELECT,
      })

    // The guard cleared an id, not a row, and a row can go between the two.
    const found = (await read()) ?? raise('NOT_FOUND', NO_SUCH_APPOINTMENT)

    if (found.status === 'CANCELLED') return found

    const reason = refusalToChange(found, now)
    if (reason) throw new ApiError('NOT_CANCELLABLE', reason)

    const { count } = await tx.appointment.updateMany({
      where: { id: appointmentId, status: 'CONFIRMED' },
      data: { status: 'CANCELLED' },
    })

    if (count === 1) {
      // Only on the write that actually changed something. The idempotent
      // return above writes nothing, or asking twice would log twice.
      await recordAppointmentEvent(tx, {
        appointmentId,
        actor,
        type: 'CANCELLED',
        fromStatus: 'CONFIRMED',
        toStatus: 'CANCELLED',
      })

      return { ...found, status: 'CANCELLED' as const }
    }

    // Somebody wrote first. Each statement takes a fresh snapshot at READ
    // COMMITTED, so this read sees what they committed — answer from what is
    // true now rather than from what was true a statement ago.
    const after = (await read()) ?? raise('NOT_FOUND', NO_SUCH_APPOINTMENT)

    if (after.status === 'CANCELLED') return after

    throw new ApiError(
      'NOT_CANCELLABLE',
      refusalToChange(after, now) ?? 'That appointment just changed. Please try again.',
    )
  })
}

/** Throws where an expression is needed. Keeps the null check on one line. */
function raise(code: 'NOT_FOUND', message: string): never {
  throw new ApiError(code, message)
}
