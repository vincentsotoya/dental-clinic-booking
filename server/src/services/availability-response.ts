// Domain result → wire shape.
//
// A third small module rather than a method on either neighbour, because the
// three layers want different things and mixing them is how one leaks into
// another:
//
//   availability.ts        decides         (pure, Date objects)
//   availability-query.ts  loads           (Prisma, Date objects)
//   this file              serialises      (ISO strings, the shared contract)
//
// Phase 4 books against the domain result and wants real Dates. The HTTP layer
// wants strings and a civil date per slot. Keeping the conversion here means
// neither has to carry the other's baggage.

import { type AvailabilityResponse, toIsoDate } from '@dental/shared'
import type { AvailabilityResult } from './availability-query'

/**
 * The civil date a slot falls on, in the clinic's zone.
 *
 * This is the whole reason `date` is on the wire at all. `startsAt` is an
 * instant; the day a patient sees it under is a wall-clock fact that needs the
 * zone to recover. A 08:00 slot in New York is 12:00Z, and a client naively
 * reading the UTC date is right — until a late-afternoon slot in a zone west
 * of UTC crosses midnight and silently files itself under tomorrow. The server
 * knows the zone, so it answers once and the client only ever groups strings.
 */
function civilDateOf(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  // en-CA formats as YYYY-MM-DD, which is the format we want — but it is a
  // locale detail, so it is rebuilt from parts rather than trusted.
  const lookup = new Map(parts.formatToParts(instant).map((part) => [part.type, part.value]))
  return `${lookup.get('year')}-${lookup.get('month')}-${lookup.get('day')}`
}

export function toAvailabilityResponse(result: AvailabilityResult): AvailabilityResponse {
  const { timeZone } = result

  // Only the providers a patient could actually pick. Sending the full roster
  // would tell the client which providers exist but are fully booked, which is
  // staffing information the booking page has no business publishing.
  const offered = new Set(result.slots.map((slot) => slot.providerId))

  const providers = Object.fromEntries(
    result.providers
      .filter((provider) => offered.has(provider.id))
      .map((provider) => [provider.id, provider]),
  )

  return {
    service: result.service,
    timeZone,
    range: {
      from: toIsoDate(result.dates[0] as (typeof result.dates)[number]),
      to: toIsoDate(result.dates[result.dates.length - 1] as (typeof result.dates)[number]),
    },
    providers,
    slots: result.slots.map((slot) => ({
      date: civilDateOf(slot.startsAt, timeZone),
      startsAt: slot.startsAt.toISOString(),
      endsAt: slot.endsAt.toISOString(),
      blockedUntil: slot.blockedUntil.toISOString(),
      providerId: slot.providerId,
      operatoryId: slot.operatoryId,
    })),
  }
}
