// Moving an appointment: the same row, a new time.
//
// WHY THE ROW MOVES RATHER THAN BEING REPLACED
//
// A reschedule could be a cancellation and a fresh booking in one transaction.
// It is one UPDATE instead, because the appointment is the same commitment at a
// different hour: the id in a confirmation link stays valid, and the patient's
// list shows one booking rather than a cancellation they never asked for. The
// cost is that the original time is not kept anywhere — `AppointmentStatusHistory`
// is where that belongs, and a move is the reason that table needs to record
// more than a status.
//
// WHY THE ROW BEING MOVED IS EXCLUDED FROM ITS OWN RE-CHECK
//
// The engine is re-run to decide whether the new time is bookable, and the
// appointment sitting in the old slot is one of the bookings it reads. Left in,
// it blocks its own move: 09:00 could never shift to 09:15 for the same
// provider, because the row's own buffer covers 09:15. So the query is told to
// compute as if this one appointment did not exist — see `excludeAppointmentId`.
//
// That exclusion is scoped to the row the guard already cleared, and it is only
// a re-check. The exclusion constraints still see every CONFIRMED row including
// this one, and they are what actually settles the race — except that here the
// row cannot collide with itself, since `EXCLUDE` compares distinct rows.
//
// WHAT THE CHECKS BEFORE THE WRITE ACTUALLY EARN
//
// Only one of them is load-bearing on its own: an appointment that has already
// started is refused by the clock, which no WHERE clause on `status` can
// express. The other two — cancelled, and closed out by the clinic — are caught
// again by `status = 'CONFIRMED'` in the UPDATE, as `db:reschedule` shows by
// deleting them. They stay because they refuse before the engine runs and name
// the reason, not because the write would otherwise be wrong.

import type { Prisma, PrismaClient } from '../../generated/prisma/client'
import { ApiError } from '../errors'
import { refusalToChange } from './appointment-state'
import { type AppointmentRow, PATIENT_APPOINTMENT_SELECT } from './appointment-view'
import { type AvailabilityDb, findAvailability } from './availability-query'
import { isSlotTaken } from './booking'
import { createClinicCalendar } from './clinic-time'

/** Everything booking needs, for the same reason: the engine, plus a transaction. */
export type ReschedulingDb = AvailabilityDb & Pick<PrismaClient, '$transaction'>

export type RescheduleRequest = {
  /** From `requireOwnership`, which has already settled whether this caller may. */
  appointmentId: string
  providerId: string
  /** The exact instant an offered slot started at. */
  startsAt: Date
  timeZone: string
  now?: Date
}

const NO_SUCH_APPOINTMENT = 'No such appointment.'
const WAS_CANCELLED = 'That appointment was cancelled. Please book a new one.'
const CHANGED = 'That appointment just changed. Please try again.'

/**
 * Move it, or explain why not.
 *
 * Throws `NOT_FOUND` if the row went missing after the guard cleared it,
 * `NOT_RESCHEDULABLE` for an appointment whose own state forbids the move,
 * `SLOT_UNAVAILABLE` when the new time is not on the board, and `SLOT_TAKEN`
 * when it was and somebody else got there first.
 */
export async function rescheduleAppointment(
  db: ReschedulingDb,
  request: RescheduleRequest,
): Promise<AppointmentRow> {
  const { appointmentId, providerId, startsAt, timeZone, now = new Date() } = request

  // Which day's working hours apply is a question about the clinic's calendar,
  // not the server's or the caller's.
  const date = createClinicCalendar(timeZone).dateOf(startsAt)

  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const found = await tx.appointment.findUnique({
      where: { id: appointmentId },
      // The service comes from the row, never the body: moving an appointment
      // may not quietly turn a thirty-minute exam into a ninety-minute crown.
      select: { status: true, startsAt: true, service: { select: { slug: true } } },
    })

    if (!found) throw new ApiError('NOT_FOUND', NO_SUCH_APPOINTMENT)

    // Cancel treats this as the state the caller wanted; here it is a refusal.
    // Reviving a cancelled appointment by moving it would put a slot released an
    // hour ago back on the books without passing through booking.

    if (found.status === 'CANCELLED') throw new ApiError('NOT_RESCHEDULABLE', WAS_CANCELLED)

    const reason = refusalToChange(found, now)
    if (reason) throw new ApiError('NOT_RESCHEDULABLE', reason)

    const { service, slots } = await findAvailability(tx, {
      serviceSlug: found.service.slug,
      from: date,
      to: date,
      timeZone,
      now,
      excludeAppointmentId: appointmentId,
    })

    const slot = slots.find(
      (candidate) =>
        candidate.providerId === providerId && candidate.startsAt.getTime() === startsAt.getTime(),
    )

    // One answer for every way a time can be absent, as in booking: the engine
    // reports what is bookable, not why something is not.
    if (!slot) {
      throw new ApiError('SLOT_UNAVAILABLE', 'That time is not available. Please pick another.')
    }

    try {
      const { count } = await tx.appointment.updateMany({
        // The status is in the WHERE clause for the same reason cancel puts it
        // there: the front desk closing this appointment out mid-move wins.
        where: { id: appointmentId, status: 'CONFIRMED' },
        data: {
          providerId: slot.providerId,
          operatoryId: slot.operatoryId,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          blockedUntil: slot.blockedUntil,
          // Re-snapshotted, not carried over. The row is being placed afresh,
          // so it takes the buffer in force now exactly as a new booking would
          // — and `blockedUntil` above was computed with this one, which the
          // CHECK constraint insists on (ADR-0004).
          bufferMins: service.bufferMins,
        },
      })

      if (count === 0) {
        const after = await tx.appointment.findUnique({
          where: { id: appointmentId },
          select: { status: true, startsAt: true },
        })

        if (!after) throw new ApiError('NOT_FOUND', NO_SUCH_APPOINTMENT)
        if (after.status === 'CANCELLED') throw new ApiError('NOT_RESCHEDULABLE', WAS_CANCELLED)

        throw new ApiError('NOT_RESCHEDULABLE', refusalToChange(after, now) ?? CHANGED)
      }
    } catch (error) {
      // A move can lose the same race a booking can — and to a booking, since
      // both end up as one index entry on one operatory.
      if (isSlotTaken(error)) {
        throw new ApiError('SLOT_TAKEN', 'Somebody just booked that time. Please pick another.')
      }
      throw error
    }

    // Re-read rather than assembled by hand: the response is then the row as
    // written, joined to the names a confirmation needs.
    const moved = await tx.appointment.findUnique({
      where: { id: appointmentId },
      select: PATIENT_APPOINTMENT_SELECT,
    })

    if (!moved) throw new ApiError('NOT_FOUND', NO_SUCH_APPOINTMENT)

    return moved
  })
}
