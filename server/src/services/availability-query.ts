// The impure shell around the availability engine: it loads rows, the engine
// decides.
//
// `availability.ts` is pure and stays that way — no Prisma, no clock. This
// module is the other half of that split, and it exists to hold everything the
// pure function must not know: which tables the inputs live in, how a date
// range becomes a timestamp window, and which rows are relevant to it.
//
// It is deliberately thin. If a rule about *what is bookable* ever appears in
// this file, it is in the wrong file.

import type { PrismaClient } from '../../generated/prisma/client'
import { MAX_AVAILABILITY_DAYS } from '../config'
import {
  getAvailableSlots,
  type OperatorySpec,
  type ProviderSchedule,
  type ServiceSpec,
  type Slot,
} from './availability'
import { addDays, type ClinicDate, createClinicCalendar, iso } from './clinic-time'

/**
 * The slice of Prisma this module touches, named rather than taking the whole
 * client. Six delegates, all read-only — the type is the documentation of what
 * an availability query is allowed to reach.
 */
export type AvailabilityDb = Pick<
  PrismaClient,
  'service' | 'provider' | 'operatory' | 'appointment' | 'timeOff' | 'clinicClosure'
>

export type AvailabilityQueryErrorCode = 'SERVICE_NOT_FOUND' | 'RANGE_INVERTED' | 'RANGE_TOO_LONG'

/**
 * A query the caller got wrong, as opposed to a database failure.
 *
 * The `code` is what the HTTP layer maps to a status — 404 or 400 — so the
 * route handler never has to match on message strings.
 */
export class AvailabilityQueryError extends Error {
  constructor(
    readonly code: AvailabilityQueryErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'AvailabilityQueryError'
  }
}

export type AvailabilityQuery = {
  /**
   * The service's slug, not its id. Slugs are already `@unique`, they are
   * stable, and they keep UUIDs out of the public URL — `?service=root-canal`
   * is a thing a person can type and read back in a log.
   */
  serviceSlug: string
  /** First civil date to compute, inclusive. */
  from: ClinicDate
  /** Last civil date to compute, inclusive. */
  to: ClinicDate
  /** The clinic's IANA zone. Passed in, never read from env here — see clinic-time.ts. */
  timeZone: string
  /** Injectable for the same reason the engine takes it: tests pin the lead-time cutoff. */
  now?: Date
}

/**
 * The resolved service travels back with the slots. The endpoint wants it for
 * the response body, and Phase 4 needs the id and buffer to write the row it
 * has just proven bookable.
 */
export type ResolvedService = ServiceSpec & {
  id: string
  slug: string
  name: string
}

export type AvailabilityResult = {
  service: ResolvedService
  timeZone: string
  dates: ClinicDate[]
  slots: Slot[]
}

const MINUTE = 60_000
const DAY = 86_400_000

/** A civil date as a UTC midnight, purely so two of them can be compared and subtracted. */
const ordinal = (date: ClinicDate): number => Date.UTC(date.year, date.month - 1, date.day)

/**
 * Every civil date from `from` to `to` inclusive.
 *
 * Exported because it is the one piece of this module with logic worth testing
 * on its own — the range guards, and the fact that it walks calendar days
 * rather than adding 86,400,000ms, which loses or gains a day across a DST
 * boundary.
 */
export function datesInRange(from: ClinicDate, to: ClinicDate): ClinicDate[] {
  const span = (ordinal(to) - ordinal(from)) / DAY

  if (span < 0) {
    throw new AvailabilityQueryError(
      'RANGE_INVERTED',
      `Range ends before it starts: ${iso(from)} to ${iso(to)}.`,
    )
  }

  if (span + 1 > MAX_AVAILABILITY_DAYS) {
    throw new AvailabilityQueryError(
      'RANGE_TOO_LONG',
      `Range covers ${span + 1} days; the maximum is ${MAX_AVAILABILITY_DAYS}.`,
    )
  }

  const dates: ClinicDate[] = []
  for (let offset = 0; offset <= span; offset += 1) dates.push(addDays(from, offset))
  return dates
}

/**
 * Load what the engine needs for one service over one date range, and hand it
 * the answer.
 *
 * Five reads, issued together. Not a transaction: Postgres' default isolation
 * would give each statement its own snapshot anyway, and a stricter one would
 * buy consistency this query does not need. A Slot is a candidate, not a
 * reservation (availability.ts) — a booking landing mid-query can at worst
 * make one offered slot stale, and the exclusion constraints reject it at
 * write time. Phase 4 re-runs the engine inside the booking transaction, which
 * is where a consistent read actually matters.
 */
export async function findAvailability(
  db: AvailabilityDb,
  query: AvailabilityQuery,
): Promise<AvailabilityResult> {
  const { serviceSlug, timeZone, now = new Date() } = query

  const dates = datesInRange(query.from, query.to)
  const calendar = createClinicCalendar(timeZone)

  const service = await db.service.findUnique({
    where: { slug: serviceSlug },
    select: {
      id: true,
      slug: true,
      name: true,
      durationMins: true,
      bufferMins: true,
      providerType: true,
      isActive: true,
    },
  })

  // A retired service is not found as far as a patient is concerned. The row
  // stays for the appointments that point at it; it is simply not bookable.
  if (!service || !service.isActive) {
    throw new AvailabilityQueryError('SERVICE_NOT_FOUND', `No bookable service "${serviceSlug}".`)
  }

  // The instants the civil range covers: midnight opening the first date to
  // midnight closing the last, in the clinic's zone — 24 real hours per day
  // except across a DST boundary, which `clinicInstant` resolves for us.
  const windowStart = calendar.clinicInstant(dates[0] as ClinicDate, 0)
  const windowEnd = calendar.clinicInstant(dates[dates.length - 1] as ClinicDate, 1440)

  // A candidate's *blocked* range may run past the end of the working day and
  // therefore past that last midnight (ADR-0005), so an appointment starting
  // just after the window can still collide with one. The buffer is exactly
  // how far past, so that is exactly how far the appointment window reaches.
  const collisionEnd = new Date(windowEnd.getTime() + service.bufferMins * MINUTE)

  const [providers, operatories, appointments, timeOff, closures] = await Promise.all([
    // Only providers who can deliver this service. The engine filters by type
    // again — it is pure and total, and must be correct on any input — but
    // there is no reason to ship the other half of the roster over the wire.
    db.provider.findMany({
      where: { isActive: true, type: service.providerType },
      select: {
        id: true,
        type: true,
        workingHours: { select: { weekday: true, startMinute: true, endMinute: true } },
      },
    }),

    db.operatory.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    }),

    // CONFIRMED only. The exclusion constraints are partial on the same
    // predicate, so a cancelled row stops blocking its slot the instant it is
    // cancelled; loading one here would hide a slot the database would accept.
    //
    // Deliberately NOT filtered by provider. A dentist's appointment occupies
    // an operatory, and that room is unavailable to the hygienist this query
    // is about. Narrowing this to matching providers would offer a room that
    // is already full — the one filter in this file that looks like an
    // oversight and is the opposite.
    //
    // Overlap, not containment: `starts before the window ends AND stays
    // blocked after it begins`. An appointment straddling either edge counts.
    db.appointment.findMany({
      where: {
        status: 'CONFIRMED',
        startsAt: { lt: collisionEnd },
        blockedUntil: { gt: windowStart },
      },
      select: { providerId: true, operatoryId: true, startsAt: true, blockedUntil: true },
    }),

    // Time off only ever affects its own provider, so this one may be narrowed
    // by the relation — one round trip, no join in application code.
    db.timeOff.findMany({
      where: {
        provider: { isActive: true, type: service.providerType },
        startsAt: { lt: windowEnd },
        endsAt: { gt: windowStart },
      },
      select: { providerId: true, startsAt: true, endsAt: true },
    }),

    db.clinicClosure.findMany({
      where: { startsAt: { lt: windowEnd }, endsAt: { gt: windowStart } },
      select: { startsAt: true, endsAt: true },
    }),
  ])

  const resolved: ResolvedService = {
    id: service.id,
    slug: service.slug,
    name: service.name,
    durationMins: service.durationMins,
    bufferMins: service.bufferMins,
    providerType: service.providerType,
  }

  return {
    service: resolved,
    timeZone,
    dates,
    slots: getAvailableSlots({
      service: resolved,
      // The row shapes above are the engine's input types already — the
      // `select` clauses were written to match. No mapping layer, and if the
      // schema drifts the compiler says so here.
      providers: providers satisfies ProviderSchedule[],
      operatories: operatories satisfies OperatorySpec[],
      appointments,
      timeOff,
      closures,
      dates,
      now,
      timeZone,
    }),
  }
}
