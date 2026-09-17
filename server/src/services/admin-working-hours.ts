// Reading and replacing one provider's recurring weekly window — the input
// `availability.ts` subtracts from. `WorkingHours` has no natural key beyond
// its own row (two windows on the same weekday are only distinguished by
// where they fall), so a write here is not an update to existing rows: it
// deletes every row for the provider and recreates the submitted week, in one
// transaction. Same shape as `profile.ts`'s "states everything" rule, over a
// table instead of a column list.

import type { WorkingHoursWindow } from '@dental/shared'
import type { Prisma, PrismaClient } from '../../generated/prisma/client'
import { ApiError } from '../errors'

export type AdminWorkingHoursDb = Pick<PrismaClient, 'provider' | 'workingHours' | '$transaction'>

const NO_SUCH_PROVIDER = 'No such provider.'

const WORKING_HOURS_SELECT = { weekday: true, startMinute: true, endMinute: true } as const

const WEEKDAY_ORDER: Record<WorkingHoursWindow['weekday'], number> = {
  MONDAY: 0,
  TUESDAY: 1,
  WEDNESDAY: 2,
  THURSDAY: 3,
  FRIDAY: 4,
  SATURDAY: 5,
  SUNDAY: 6,
}

/** Deterministic, not whatever order Postgres happens to return — the same convention every list here follows. */
function sortWeek(windows: WorkingHoursWindow[]): WorkingHoursWindow[] {
  return [...windows].sort(
    (a, b) => WEEKDAY_ORDER[a.weekday] - WEEKDAY_ORDER[b.weekday] || a.startMinute - b.startMinute,
  )
}

async function findProviderOrThrow(
  tx: Prisma.TransactionClient,
  providerId: string,
): Promise<void> {
  const provider = await tx.provider.findUnique({ where: { id: providerId }, select: { id: true } })
  if (!provider) throw new ApiError('NOT_FOUND', NO_SUCH_PROVIDER)
}

export async function findWorkingHours(
  db: AdminWorkingHoursDb,
  providerId: string,
): Promise<WorkingHoursWindow[]> {
  // A transaction of one read still goes through `tx`, so this and the write
  // below share the exact same "does this provider exist" check rather than
  // two copies of it drifting.
  const rows = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await findProviderOrThrow(tx, providerId)
    return tx.workingHours.findMany({ where: { providerId }, select: WORKING_HOURS_SELECT })
  })

  // Sorted here rather than trusted to `orderBy: { weekday: 'asc' }` — that
  // would depend on Postgres enum labels happening to be declared Monday
  // first, which `WEEKDAY_ORDER` should not be reading through by accident.
  return sortWeek(rows)
}

export async function replaceWorkingHours(
  db: AdminWorkingHoursDb,
  providerId: string,
  windows: WorkingHoursWindow[],
): Promise<WorkingHoursWindow[]> {
  // The existence check and the write share one transaction — the same
  // reasoning `requireOwnership`'s own comment gives for never reading a row
  // outside the transaction that acts on it: a provider deleted between the
  // two would otherwise recreate `working_hours` rows for an id nothing
  // references any more.
  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await findProviderOrThrow(tx, providerId)
    await tx.workingHours.deleteMany({ where: { providerId } })
    await tx.workingHours.createMany({
      data: windows.map((window) => ({ providerId, ...window })),
    })
  })

  return sortWeek(windows)
}
