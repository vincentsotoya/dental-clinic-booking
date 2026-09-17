// The wire contract for `GET`/`PATCH /api/admin/providers/:providerId/working-hours`
// — the clinic's own edit of the recurring weekly window `WorkingHours` stores
// (schema.prisma), and the input Phase 2's availability engine subtracts from.
//
// A PATCH states the whole week, not a merge patch — the same rule
// `profile.ts` set for one row, extended to a table: the screen has one save
// button over one week, so there is never a window the caller means to leave
// untouched. The server replaces every row for the provider in one
// transaction rather than diffing additions and removals.
//
// Guarded by role, not by ownership: nothing here is addressed by "mine" —
// any admin may edit any provider's hours — so `requireRole('ADMIN')` is the
// whole guard, the same shape `admin.ts` already uses.

import { z } from 'zod'
import { apiErrorCode, errorBody } from './errors'

export const weekday = z.enum([
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
])

export type Weekday = z.infer<typeof weekday>

/** Monday first — the week every calendar and seed script in this app already starts on. */
export const WEEKDAY_ORDER: readonly Weekday[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
]

const MINUTES_PER_DAY = 1440

/**
 * One row of `working_hours`: minutes from midnight, not a timestamp — see
 * schema.prisma. `working_hours_valid_window` is this same rule in Postgres;
 * restating it here rejects a bad window before it reaches the database.
 */
export const workingHoursWindow = z
  .object({
    weekday,
    startMinute: z.int().min(0),
    endMinute: z.int().max(MINUTES_PER_DAY),
  })
  .refine((window) => window.endMinute > window.startMinute, {
    message: 'A window must end after it starts.',
    path: ['endMinute'],
  })

export type WorkingHoursWindow = z.infer<typeof workingHoursWindow>

/**
 * The whole week. `working_hours_valid_window` proves each row sane on its
 * own but has no way to compare two rows, so nothing in Postgres stops two
 * overlapping windows on the same weekday — the engine would just union them
 * silently (`subtract`/`intersect` in `availability.ts`). Rejecting the
 * overlap here, at the one place both directions of this contract pass
 * through, is the app-level half of the honesty guard ADR-0004 already
 * argued for `blocked_until`.
 */
export const workingHoursWeek = z.array(workingHoursWindow).superRefine((windows, ctx) => {
  for (const day of WEEKDAY_ORDER) {
    const onDay = windows
      .map((window, index) => ({ window, index }))
      .filter((entry) => entry.window.weekday === day)
      .sort((a, b) => a.window.startMinute - b.window.startMinute)

    // Sorted by start, so overlap is exactly "the next one starts before the
    // last one (of everything seen so far) ends" — the same interval-sweep
    // `subtract`/`intersect` use server-side, run here instead to fail fast.
    let latestEnd = -1
    for (const entry of onDay) {
      if (entry.window.startMinute < latestEnd) {
        ctx.addIssue({
          code: 'custom',
          message: `Two windows on ${day} overlap.`,
          path: [entry.index, 'startMinute'],
        })
      }
      latestEnd = Math.max(latestEnd, entry.window.endMinute)
    }
  }
})

export type WorkingHoursWeek = z.infer<typeof workingHoursWeek>

// ---------------------------------------------------------------------------
// GET /api/admin/providers/:providerId/working-hours
// ---------------------------------------------------------------------------

export const getWorkingHoursResponse = z.object({
  providerId: z.uuid(),
  workingHours: workingHoursWeek,
})

export type GetWorkingHoursResponse = z.infer<typeof getWorkingHoursResponse>

export const getWorkingHoursErrorCode = apiErrorCode.extract([
  'INVALID_REQUEST',
  'INTERNAL',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
])
export const getWorkingHoursError = errorBody(getWorkingHoursErrorCode)

export type GetWorkingHoursErrorCode = z.infer<typeof getWorkingHoursErrorCode>
export type GetWorkingHoursError = z.infer<typeof getWorkingHoursError>

// ---------------------------------------------------------------------------
// PATCH /api/admin/providers/:providerId/working-hours
// ---------------------------------------------------------------------------

export const updateWorkingHoursRequest = z.object({ workingHours: workingHoursWeek })

export type UpdateWorkingHoursRequest = z.infer<typeof updateWorkingHoursRequest>

export const updateWorkingHoursResponse = getWorkingHoursResponse

export type UpdateWorkingHoursResponse = z.infer<typeof updateWorkingHoursResponse>

export const updateWorkingHoursErrorCode = getWorkingHoursErrorCode
export const updateWorkingHoursError = getWorkingHoursError

export type UpdateWorkingHoursErrorCode = GetWorkingHoursErrorCode
export type UpdateWorkingHoursError = GetWorkingHoursError
