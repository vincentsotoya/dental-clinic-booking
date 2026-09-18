// Reading, creating and deleting one provider's dated ranges of unavailability
// — the rows `findAvailability` already subtracts (availability-query.ts).
// Unlike `WorkingHours`, a `TimeOff` row has its own id, so a write here is an
// insert or a delete, never a delete-and-recreate of the whole set.
//
// The contract speaks in civil dates; storage stays in instants, because that
// is what the engine and the schema's `timestamptz` columns already agree on.
// This module is the one seam between the two, the same job
// `availability-query.ts` does for a query's own date range.

import type { CreateTimeOffRequest, TimeOffRange } from '@dental/shared'
import type { Prisma, PrismaClient } from '../../generated/prisma/client'
import { ApiError } from '../errors'
import { createClinicCalendar } from './clinic-time'

export type AdminTimeOffDb = Pick<
  PrismaClient,
  'provider' | 'timeOff' | 'appointment' | '$transaction'
>

const NO_SUCH_PROVIDER = 'No such provider.'
const NO_SUCH_TIME_OFF = 'No such time off.'

const TIME_OFF_SELECT = { id: true, providerId: true, startsAt: true, endsAt: true, reason: true }

type StoredTimeOff = {
  id: string
  providerId: string
  startsAt: Date
  endsAt: Date
  reason: string | null
}

/** Deterministic, the same reasoning `sortWeek` gives `working-hours.ts`. */
function sortByStart(rows: StoredTimeOff[]): StoredTimeOff[] {
  return [...rows].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
}

async function findProviderOrThrow(
  tx: Prisma.TransactionClient,
  providerId: string,
): Promise<void> {
  const provider = await tx.provider.findUnique({ where: { id: providerId }, select: { id: true } })
  if (!provider) throw new ApiError('NOT_FOUND', NO_SUCH_PROVIDER)
}

/**
 * `startsAt`/`endsAt` back to the civil days an admin typed. `endsAt` is the
 * exclusive midnight that opens the day *after* the range, so the last real
 * day is one millisecond before it — the same half-open convention `blockedUntil` uses.
 */
function toRange(
  row: StoredTimeOff,
  calendar: ReturnType<typeof createClinicCalendar>,
): TimeOffRange {
  const fromDate = calendar.dateOf(row.startsAt)
  const toDate = calendar.dateOf(new Date(row.endsAt.getTime() - 1))
  return {
    id: row.id,
    providerId: row.providerId,
    fromDate: calendar.iso(fromDate),
    toDate: calendar.iso(toDate),
    reason: row.reason,
  }
}

export async function findTimeOff(
  db: AdminTimeOffDb,
  providerId: string,
  timeZone: string,
): Promise<TimeOffRange[]> {
  const calendar = createClinicCalendar(timeZone)

  const rows = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await findProviderOrThrow(tx, providerId)
    return tx.timeOff.findMany({ where: { providerId }, select: TIME_OFF_SELECT })
  })

  return sortByStart(rows).map((row) => toRange(row, calendar))
}

/**
 * A time off row and every CONFIRMED appointment it would leave stranded.
 *
 * Overlap against the appointment's own clinical window, not `blockedUntil` —
 * the buffer is room turnover (ADR-0004), a fact about the operatory, not
 * about whether the provider is present. Checked whichever direction time
 * runs: a retroactive entry that contradicts a kept visit is as real a
 * conflict as one that would strand a future booking.
 */
export async function createTimeOff(
  db: AdminTimeOffDb,
  providerId: string,
  timeZone: string,
  input: CreateTimeOffRequest,
): Promise<TimeOffRange> {
  const calendar = createClinicCalendar(timeZone)
  const startsAt = calendar.clinicInstant(input.fromDate, 0)
  const endsAt = calendar.clinicInstant(calendar.addDays(input.toDate, 1), 0)

  const created = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await findProviderOrThrow(tx, providerId)

    const conflicts = await tx.appointment.count({
      where: {
        providerId,
        status: 'CONFIRMED',
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
    })

    if (conflicts > 0) {
      throw new ApiError(
        'TIME_OFF_CONFLICT',
        `This overlaps ${conflicts} confirmed appointment${conflicts === 1 ? '' : 's'} for this provider. Reschedule or cancel ${conflicts === 1 ? 'it' : 'them'} first.`,
      )
    }

    return tx.timeOff.create({
      data: { providerId, startsAt, endsAt, reason: input.reason ?? null },
      select: TIME_OFF_SELECT,
    })
  })

  return toRange(created, calendar)
}

export async function deleteTimeOff(db: AdminTimeOffDb, id: string): Promise<string> {
  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const found = await tx.timeOff.findUnique({ where: { id }, select: { id: true } })
    if (!found) throw new ApiError('NOT_FOUND', NO_SUCH_TIME_OFF)
    await tx.timeOff.delete({ where: { id } })
  })

  return id
}
