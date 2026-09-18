// Reading, creating and deleting the whole clinic's dated closures — the rows
// `findAvailability` already subtracts (availability-query.ts). The same
// shape `admin-time-off.ts` already argued for `TimeOff`, minus the provider
// dimension: a closure has no `providerId` to scope a read by or check exists
// before a write, and its conflict check spans every provider, not one.

import type { ClosureRange, CreateClosureRequest } from '@dental/shared'
import type { Prisma, PrismaClient } from '../../generated/prisma/client'
import { ApiError } from '../errors'
import { createClinicCalendar } from './clinic-time'

export type AdminClosuresDb = Pick<PrismaClient, 'clinicClosure' | 'appointment' | '$transaction'>

const NO_SUCH_CLOSURE = 'No such closure.'

const CLOSURE_SELECT = { id: true, startsAt: true, endsAt: true, reason: true }

type StoredClosure = { id: string; startsAt: Date; endsAt: Date; reason: string | null }

/** Deterministic, the same reasoning `sortByStart` gives `admin-time-off.ts`. */
function sortByStart(rows: StoredClosure[]): StoredClosure[] {
  return [...rows].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
}

/**
 * `startsAt`/`endsAt` back to the civil days an admin typed. `endsAt` is the
 * exclusive midnight that opens the day *after* the range, so the last real
 * day is one millisecond before it — the same half-open convention `blockedUntil` uses.
 */
function toRange(row: StoredClosure, calendar: ReturnType<typeof createClinicCalendar>): ClosureRange {
  const fromDate = calendar.dateOf(row.startsAt)
  const toDate = calendar.dateOf(new Date(row.endsAt.getTime() - 1))
  return {
    id: row.id,
    fromDate: calendar.iso(fromDate),
    toDate: calendar.iso(toDate),
    reason: row.reason,
  }
}

export async function findClosures(db: AdminClosuresDb, timeZone: string): Promise<ClosureRange[]> {
  const calendar = createClinicCalendar(timeZone)
  const rows = await db.clinicClosure.findMany({ select: CLOSURE_SELECT })
  return sortByStart(rows).map((row) => toRange(row, calendar))
}

/**
 * A closure and every CONFIRMED appointment, any provider, it would leave
 * stranded. Overlap against the appointment's own clinical window, not
 * `blockedUntil` — the same reasoning `admin-time-off.ts` gives: the buffer is
 * room turnover (ADR-0004), not a fact about who is present. Checked
 * whichever direction time runs, for the same reason time off's own check is.
 */
export async function createClosure(
  db: AdminClosuresDb,
  timeZone: string,
  input: CreateClosureRequest,
): Promise<ClosureRange> {
  const calendar = createClinicCalendar(timeZone)
  const startsAt = calendar.clinicInstant(input.fromDate, 0)
  const endsAt = calendar.clinicInstant(calendar.addDays(input.toDate, 1), 0)

  const created = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const conflicts = await tx.appointment.count({
      where: { status: 'CONFIRMED', startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
    })

    if (conflicts > 0) {
      throw new ApiError(
        'CLOSURE_CONFLICT',
        `This overlaps ${conflicts} confirmed appointment${conflicts === 1 ? '' : 's'}. Reschedule or cancel ${conflicts === 1 ? 'it' : 'them'} first.`,
      )
    }

    return tx.clinicClosure.create({
      data: { startsAt, endsAt, reason: input.reason ?? null },
      select: CLOSURE_SELECT,
    })
  })

  return toRange(created, calendar)
}

export async function deleteClosure(db: AdminClosuresDb, id: string): Promise<string> {
  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const found = await tx.clinicClosure.findUnique({ where: { id }, select: { id: true } })
    if (!found) throw new ApiError('NOT_FOUND', NO_SUCH_CLOSURE)
    await tx.clinicClosure.delete({ where: { id } })
  })

  return id
}
