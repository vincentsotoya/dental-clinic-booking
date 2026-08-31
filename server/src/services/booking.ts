// Writing an appointment: re-decide, insert, and let the database win the race.
//
// WHY BOTH A RE-CHECK AND A CONSTRAINT
//
// They enforce different things and neither substitutes for the other.
//
// The exclusion constraints (ADR-0001) know exactly one rule: no two CONFIRMED
// appointments may overlap for a provider or a room. They do not know about
// working hours, lunch, time off, closures, lead time, or which provider type
// may deliver which service. Postgres would accept 3am on Christmas Day
// without complaint. So the engine is re-run here, and it is what decides
// whether the requested time is *bookable*.
//
// The engine, in turn, cannot decide whether the time is still *free*, because
// between deciding and writing there is a gap, and the answer can change
// inside it. No amount of re-checking closes that gap — the check and the
// write are two statements.
//
// WHY OPTIMISTIC, RATHER THAN LOCKING
//
// There is no row to lock: the conflict is with an appointment that does not
// exist yet, so `SELECT ... FOR UPDATE` has nothing to take. Locking the range
// instead would mean SERIALIZABLE (a retry loop on every booking) or an
// advisory lock per provider (application-level, and load-bearing in every
// route that ever writes an appointment).
//
// The exclusion constraint already *is* that predicate lock — a GiST index
// entry taken by the insert itself. So the cheapest correct thing is to insert
// and let it fail: one round trip on success, and a `23P01` on the loser.

import type { Prisma, PrismaClient } from '../../generated/prisma/client'
import { ApiError } from '../errors'
import type { AvailabilityDb } from './availability-query'
import { findAvailability } from './availability-query'
import { createClinicCalendar } from './clinic-time'

/** Availability's slice plus the one thing it never needed: a transaction. */
export type BookingDb = AvailabilityDb & Pick<PrismaClient, '$transaction'>

export type BookingRequest = {
  /** From the session, never the body — ADR-0007. */
  patientId: string
  serviceSlug: string
  providerId: string
  /** The exact instant an offered slot started at. */
  startsAt: Date
  notes?: string
  timeZone: string
  /** Injectable for the same reason the engine takes it: tests pin the lead-time cutoff. */
  now?: Date
}

/** The row as written, joined to the names a confirmation needs. */
export type BookingResult = {
  id: string
  status: 'CONFIRMED'
  startsAt: Date
  endsAt: Date
  notes: string | null
  service: { id: string; slug: string; name: string; durationMins: number }
  provider: {
    id: string
    type: 'DENTIST' | 'HYGIENIST'
    firstName: string
    lastName: string
    title: string | null
  }
}

/**
 * True for the one Postgres error this module expects: `23P01`, an exclusion
 * constraint violation.
 *
 * Matched on the underlying SQLSTATE, not on Prisma's `P2039`, which is a
 * generic "the driver adapter raised something" and would swallow unrelated
 * database failures as a polite 409. Prisma has no code of its own for an
 * exclusion violation, so the real one is dug out of the nested driver error.
 */
export function isSlotTaken(error: unknown): boolean {
  const cause = (error as { meta?: { driverAdapterError?: { cause?: { code?: unknown } } } })?.meta
    ?.driverAdapterError?.cause

  return cause?.code === '23P01'
}

/**
 * Book one appointment, or explain why not.
 *
 * Throws `SERVICE_NOT_FOUND` for a slug the clinic does not offer,
 * `SLOT_UNAVAILABLE` when the time is not on the board, and `SLOT_TAKEN` when
 * it was and somebody else got there first.
 */
export async function bookAppointment(
  db: BookingDb,
  request: BookingRequest,
): Promise<BookingResult> {
  const { patientId, serviceSlug, providerId, startsAt, notes, timeZone, now = new Date() } = request

  // Which day's working hours apply is a question about the clinic's calendar,
  // not the server's or the caller's.
  const date = createClinicCalendar(timeZone).dateOf(startsAt)

  // One transaction, so the five reads the engine needs come from a single
  // snapshot: the slot list we approve is the one that was true at one instant,
  // rather than working hours read before an admin's edit and appointments read
  // after it. It does not — and is not meant to — prevent the race below.
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const { service, slots, providers } = await findAvailability(tx, {
      serviceSlug,
      from: date,
      to: date,
      timeZone,
      now,
    })

    const slot = slots.find(
      (candidate) =>
        candidate.providerId === providerId && candidate.startsAt.getTime() === startsAt.getTime(),
    )

    // Deliberately one answer for every way a slot can be absent — closed day,
    // lunch, too soon, provider on leave, wrong provider type, already booked.
    // The engine reports what is bookable, not why something is not, and
    // inventing a reason here would mean re-deriving it from the same inputs
    // and getting it subtly wrong.
    if (!slot) {
      throw new ApiError(
        'SLOT_UNAVAILABLE',
        'That time is no longer available. Please pick another.',
      )
    }

    // Non-null: a slot names a provider drawn from this list.
    const provider = providers.find((candidate) => candidate.id === providerId) as NonNullable<
      (typeof providers)[number]
    >

    try {
      const created = await tx.appointment.create({
        // Every time comes from the engine's slot, not the request. `startsAt`
        // is the one the caller sent, but only because it matched.
        data: {
          patientId,
          providerId: slot.providerId,
          serviceId: service.id,
          operatoryId: slot.operatoryId,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          blockedUntil: slot.blockedUntil,
          // Snapshotted, so a later edit to the service cannot move the blocked
          // range of a booking already on the books (ADR-0004).
          bufferMins: service.bufferMins,
          notes,
        },
        select: { id: true, startsAt: true, endsAt: true, notes: true },
      })

      return {
        ...created,
        status: 'CONFIRMED' as const,
        service: {
          id: service.id,
          slug: service.slug,
          name: service.name,
          durationMins: service.durationMins,
        },
        provider,
      }
    } catch (error) {
      // The whole point of the phase: the loser of the race gets a name for
      // what happened rather than a 500.
      if (isSlotTaken(error)) {
        throw new ApiError('SLOT_TAKEN', 'Somebody just booked that time. Please pick another.')
      }
      throw error
    }
  })
}
