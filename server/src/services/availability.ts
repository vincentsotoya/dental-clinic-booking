// The availability engine: which start times are genuinely bookable.
//
// PURE ON PURPOSE
//
// Nothing here touches Prisma, and nothing calls `new Date()` — `now` is a
// parameter. That is not stylistic tidiness. Two of the six things this
// function has to get right are untestable otherwise: the lead-time cutoff
// needs "now" to sit at a chosen minute, and the DST case needs to run against
// a March date and a July date on a machine in neither zone. A function that
// reads the clock and the database can only be tested by arranging a database
// and waiting.
//
// The DB-loading wrapper that feeds this lives separately. It loads rows; this
// decides. Keeping the two apart is also what lets Phase 4 re-run the same
// decision inside a transaction before it inserts.
//
// THE SHAPE OF THE ANSWER
//
// A Slot names a specific Provider *and* Operatory (CONTEXT.md) — never
// "someone, somewhere". Where several rooms are free at the same instant the
// engine reports one Slot naming the first room by name, because the rooms are
// interchangeable and the patient is choosing a time, not a chair.
//
// Providers are computed independently, so two dentists free at 08:00 are both
// offered Room A. That is deliberate: a Slot is a candidate, not a reservation.
// There is no held or pending state (schema.prisma), so nothing is consumed
// until a row is written — whoever books first takes Room A, and the next query
// sees it blocked and offers Room B. Assigning distinct rooms across providers
// here would be inventing a reservation the system does not have, and would be
// wrong the moment either patient walked away.
//
// THE TWO RULES
//
// Both are ADR-0005, and they are not the same rule:
//
//   · Treatment  [start, start+duration)          must fit INSIDE free time.
//   · Blocked    [start, start+duration+buffer)   must merely avoid other
//                                                 appointments.
//
// So the buffer may overrun the end of the working day, and the last checkup
// before closing stays bookable. This is why the candidate loop cannot collapse
// into `atLeastMinutes(free, duration + buffer)`: the two spans are checked
// against two different sets.

import { LEAD_TIME_MINS, SLOT_GRID_MINS } from '../config'
import { type ClinicCalendar, type ClinicDate, createClinicCalendar, type Weekday } from './clinic-time'
import { atLeastMinutes, contains, intersect, type Interval, overlaps, subtract } from './intervals'

/** Mirrors the schema's `ProviderType` enum without importing generated code. */
export type ProviderType = 'DENTIST' | 'HYGIENIST'

/** One `WorkingHours` row: wall-clock minutes from midnight, not instants. */
export type WorkingWindow = {
  weekday: Weekday
  startMinute: number
  endMinute: number
}

export type ProviderSchedule = {
  id: string
  type: ProviderType
  workingHours: readonly WorkingWindow[]
}

export type OperatorySpec = {
  id: string
  name: string
}

/**
 * An appointment already on the books, as the engine cares about it: the range
 * it blocks, not the treatment it delivers.
 *
 * Callers must pass CONFIRMED rows only. The exclusion constraints are partial
 * (status = CONFIRMED), so a cancelled row stops blocking its slot the instant
 * it is cancelled; including one here would hide a slot the database would
 * happily accept.
 */
export type BookedRange = {
  providerId: string
  operatoryId: string
  startsAt: Date
  blockedUntil: Date
}

export type ProviderTimeOff = { providerId: string; startsAt: Date; endsAt: Date }
export type ClinicClosureRange = { startsAt: Date; endsAt: Date }

export type ServiceSpec = {
  durationMins: number
  bufferMins: number
  providerType: ProviderType
}

/** A candidate start time proven bookable. Computed, never stored. */
export type Slot = {
  /** Treatment begins. Clinical truth, and what the patient is shown. */
  startsAt: Date
  /** Treatment ends. */
  endsAt: Date
  /** `endsAt` + buffer — the range Phase 4 writes and the constraints police. */
  blockedUntil: Date
  providerId: string
  operatoryId: string
}

export type AvailabilityRequest = {
  service: ServiceSpec
  providers: readonly ProviderSchedule[]
  operatories: readonly OperatorySpec[]
  /** CONFIRMED appointments only — see `BookedRange`. */
  appointments: readonly BookedRange[]
  timeOff: readonly ProviderTimeOff[]
  closures: readonly ClinicClosureRange[]
  /** Civil dates to compute, in the clinic's calendar. */
  dates: readonly ClinicDate[]
  now: Date
  timeZone: string
  /** Defaults to the clinic policy in `config.ts`; injectable so tests can pin it. */
  leadTimeMins?: number
  gridMins?: number
}

const MINUTE = 60_000

const spanOf = (range: { startsAt: Date; endsAt: Date }): Interval => ({
  start: range.startsAt,
  end: range.endsAt,
})

const blockedSpanOf = (booking: BookedRange): Interval => ({
  start: booking.startsAt,
  end: booking.blockedUntil,
})

/**
 * Every bookable start time for a service, across the given dates.
 *
 * Returned in chronological order; ties — two providers free at the same
 * instant — break by provider id, so the output is stable for tests and for a
 * UI that renders it directly.
 */
export function getAvailableSlots(request: AvailabilityRequest): Slot[] {
  const {
    service,
    dates,
    now,
    timeZone,
    leadTimeMins = LEAD_TIME_MINS,
    gridMins = SLOT_GRID_MINS,
  } = request

  if (service.durationMins <= 0) return []

  const calendar = createClinicCalendar(timeZone)
  const cutoff = now.getTime() + leadTimeMins * MINUTE

  // A service is delivered by exactly one type of provider (ADR-0002), so a
  // cleaning never surfaces a dentist's free afternoon.
  const providers = request.providers.filter((provider) => provider.type === service.providerType)

  // Name order, decided once: it is what makes "the first free room" a stable
  // answer rather than whatever order the database happened to return.
  const operatories = [...request.operatories].sort((a, b) => a.name.localeCompare(b.name))

  const closures = request.closures.map(spanOf)
  const slots: Slot[] = []

  for (const provider of providers) {
    const timeOff = request.timeOff.filter((off) => off.providerId === provider.id).map(spanOf)

    const providerBlocks = request.appointments
      .filter((booking) => booking.providerId === provider.id)
      .map(blockedSpanOf)

    for (const date of dates) {
      const weekday = calendar.weekdayOf(date)
      const rows = provider.workingHours.filter((row) => row.weekday === weekday)
      if (rows.length === 0) continue // not working that day

      // Wall-clock rules become real instants exactly here, and only here.
      const windows = rows.map((row) => ({
        start: calendar.clinicInstant(date, row.startMinute),
        end: calendar.clinicInstant(date, row.endMinute),
      }))

      // Working hours minus closures minus this provider's time off minus what
      // they are already booked for — the subtraction chain from intervals.ts.
      const providerFree = subtract(windows, [...closures, ...timeOff, ...providerBlocks])
      if (providerFree.length === 0) continue

      // A time is bookable where the provider is free AND a room is free, so
      // each room gets its own intersection with the provider's free time.
      const rooms = operatories.map((operatory) => {
        const blocks = request.appointments
          .filter((booking) => booking.operatoryId === operatory.id)
          .map(blockedSpanOf)

        const roomFree = subtract(windows, [...closures, ...blocks])
        const free = atLeastMinutes(intersect(providerFree, roomFree), service.durationMins)

        return { operatory, blocks, free }
      })

      const candidates = candidateStarts(
        rooms.map((room) => room.free),
        rows,
        date,
        calendar,
        gridMins,
      )

      for (const candidateMs of candidates) {
        if (candidateMs < cutoff) continue // inside the lead time

        const startsAt = new Date(candidateMs)
        const endsAt = new Date(candidateMs + service.durationMins * MINUTE)
        const blockedUntil = new Date(endsAt.getTime() + service.bufferMins * MINUTE)

        const treatment: Interval = { start: startsAt, end: endsAt }
        const blocked: Interval = { start: startsAt, end: blockedUntil }

        // ADR-0005 rule 2, provider half: the blocked range only has to clear
        // other appointments. It may run past the end of the working window.
        if (providerBlocks.some((block) => overlaps(blocked, block))) continue

        // ADR-0005 rule 1 plus rule 2's room half, applied per room in name
        // order. The first room that satisfies both wins.
        const room = rooms.find(
          (candidate) =>
            candidate.free.some((interval) => contains(interval, treatment)) &&
            !candidate.blocks.some((block) => overlaps(blocked, block)),
        )
        if (!room) continue

        slots.push({
          startsAt,
          endsAt,
          blockedUntil,
          providerId: provider.id,
          operatoryId: room.operatory.id,
        })
      }
    }
  }

  return slots.sort(
    (a, b) =>
      a.startsAt.getTime() - b.startsAt.getTime() || a.providerId.localeCompare(b.providerId),
  )
}

/**
 * The instants worth testing on one date: a wall-clock grid, plus the start of
 * every free interval.
 *
 * The grid is generated in the clinic's wall clock — minute 480, 495, 510 — and
 * then converted, rather than by adding 15 minutes of elapsed time to the first
 * slot. Patients read the clinic's clock, and in a zone with a half-hour offset
 * the two disagree.
 *
 * The free-interval starts are ADR-0005's second rule. Without them a buffer
 * ending at 10:05 pushes the next offer to 10:15, and ten minutes vanish after
 * every appointment of the day.
 *
 * Sorted and deduplicated on the way out: a grid point landing exactly on a
 * free interval's start is one candidate, not two.
 */
function candidateStarts(
  freePerRoom: readonly Interval[][],
  rows: readonly WorkingWindow[],
  date: ClinicDate,
  calendar: ClinicCalendar,
  gridMins: number,
): number[] {
  const found = new Set<number>()

  for (const row of rows) {
    const first = Math.ceil(row.startMinute / gridMins) * gridMins
    for (let minute = first; minute < row.endMinute; minute += gridMins) {
      found.add(calendar.clinicInstant(date, minute).getTime())
    }
  }

  for (const free of freePerRoom) {
    for (const interval of free) {
      found.add(interval.start.getTime())
    }
  }

  return [...found].sort((a, b) => a - b)
}
