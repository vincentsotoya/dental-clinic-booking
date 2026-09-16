// The clinic's own read of the schedule: appointments across every patient,
// over a civil-date range.
//
// `availability-query.ts` answers "what is bookable" and computes an answer
// per provider per day. This answers "what is already on the books", which is
// one indexed read — `@@index([status, startsAt])` in schema.prisma — not a
// computation, and that difference is why its range ceiling
// (`MAX_ADMIN_RANGE_DAYS`) is generous rather than cost-driven.
//
// Filtered by `startsAt` alone, not by overlap the way availability's
// collision window is. A day view wants "what starts today", the same
// convention an availability slot's own `date` field already uses — not
// "what is still blocked into today from yesterday's buffer", which is a
// bookability question, not a display one.

import type { AdminAppointment } from '@dental/shared'
import type { PrismaClient } from '../../generated/prisma/client'
import { MAX_ADMIN_RANGE_DAYS } from '../config'
import { ApiError } from '../errors'
import { type ClinicDate, createClinicCalendar, iso } from './clinic-time'

export type AdminAppointmentsDb = Pick<PrismaClient, 'appointment'>

export type AdminAppointmentsQuery = {
  /** First civil date to include, inclusive. */
  from: ClinicDate
  /** Last civil date to include, inclusive. */
  to: ClinicDate
  timeZone: string
}

const DAY = 86_400_000

/** A civil date as a UTC midnight, purely so two of them can be compared and subtracted. */
const ordinal = (date: ClinicDate): number => Date.UTC(date.year, date.month - 1, date.day)

export const ADMIN_APPOINTMENT_SELECT = {
  id: true,
  status: true,
  startsAt: true,
  endsAt: true,
  notes: true,
  patient: { select: { id: true, firstName: true, lastName: true } },
  service: { select: { id: true, slug: true, name: true, durationMins: true } },
  provider: { select: { id: true, type: true, firstName: true, lastName: true, title: true } },
  operatory: { select: { id: true, name: true } },
} as const

/** What that select returns: the contract, with the two instants still Dates. */
export type AdminAppointmentRow = Omit<AdminAppointment, 'startsAt' | 'endsAt'> & {
  startsAt: Date
  endsAt: Date
}

export function toAdminAppointment(row: AdminAppointmentRow): AdminAppointment {
  return { ...row, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString() }
}

export async function findAdminAppointments(
  db: AdminAppointmentsDb,
  query: AdminAppointmentsQuery,
): Promise<AdminAppointmentRow[]> {
  const { from, to, timeZone } = query
  const span = (ordinal(to) - ordinal(from)) / DAY

  if (span < 0) {
    throw new ApiError('RANGE_INVERTED', `Range ends before it starts: ${iso(from)} to ${iso(to)}.`)
  }
  if (span + 1 > MAX_ADMIN_RANGE_DAYS) {
    throw new ApiError(
      'RANGE_TOO_LONG',
      `Range covers ${span + 1} days; the maximum is ${MAX_ADMIN_RANGE_DAYS}.`,
    )
  }

  const calendar = createClinicCalendar(timeZone)
  const windowStart = calendar.clinicInstant(from, 0)
  // Minute 1440 on the last date is midnight the day after — Date.UTC-style
  // normalisation inside clinicInstant, the same idiom availability-query.ts
  // uses for the same reason.
  const windowEnd = calendar.clinicInstant(to, 1440)

  return db.appointment.findMany({
    where: { startsAt: { gte: windowStart, lt: windowEnd } },
    orderBy: [{ startsAt: 'asc' }, { providerId: 'asc' }],
    select: ADMIN_APPOINTMENT_SELECT,
  })
}
