// Reading an availability response the way the booking flow needs it.
//
// Availability is queried by service and date range only — it has no provider
// parameter — so every one of these narrowings is client-side and free. That is
// what lets the provider step and the calendar share one request: changing "any
// dentist" to "Dr Osei" re-filters a response already in hand rather than
// asking the server again.

import type { AvailabilityResponse, AvailabilitySlot } from '@dental/shared'
import { ANY_PROVIDER } from './use-booking-params'

/** Every slot the chosen provider could take, or all of them for "anyone". */
export function slotsFor(
  response: AvailabilityResponse | undefined,
  provider: string | null,
): AvailabilitySlot[] {
  if (!response) return []
  if (!provider || provider === ANY_PROVIDER) return response.slots
  return response.slots.filter((slot) => slot.providerId === provider)
}

/** The civil dates that have at least one slot — what the calendar may offer. */
export function bookableDates(slots: AvailabilitySlot[]): Set<string> {
  return new Set(slots.map((slot) => slot.date))
}

/**
 * The distinct start times on one date, earliest first.
 *
 * Distinct by instant, not by slot: with two hygienists free at 9:00 the
 * response carries two 9:00 slots, and offering a patient the same time twice
 * asks them to choose between two things they cannot tell apart. Which
 * provider it becomes is settled at `providerForSlot`.
 */
export function startTimesOn(slots: AvailabilitySlot[], date: string): string[] {
  const times = new Set(slots.filter((slot) => slot.date === date).map((slot) => slot.startsAt))
  return [...times].sort()
}

/**
 * Who a chosen instant books with.
 *
 * With a named provider it is that provider. With "anyone" the response's own
 * ordering decides — the engine sorts chronologically, ties broken by provider
 * id — so the choice is deterministic rather than whichever object the filter
 * happened to reach first. `null` means the instant is no longer on offer,
 * which is the honest answer after a refetch has moved underneath a selection.
 */
export function providerForSlot(
  response: AvailabilityResponse | undefined,
  provider: string | null,
  at: string,
): string | null {
  const candidates = slotsFor(response, provider).filter((slot) => slot.startsAt === at)
  if (candidates.length === 0) return null

  return candidates.map((slot) => slot.providerId).sort()[0] ?? null
}

/** Whether an instant is still bookable — the question a stale selection asks. */
export function isStillOffered(
  response: AvailabilityResponse | undefined,
  provider: string | null,
  at: string,
): boolean {
  return providerForSlot(response, provider, at) !== null
}

/**
 * The providers who can perform this service, from the catalogue rather than
 * from availability.
 *
 * Availability only names providers who have a free slot in the window, so
 * building the picker from it would hide a fully-booked dentist entirely — the
 * patient would not learn they exist, only that they are absent. The catalogue
 * lists who works here; availability decides what is offered once one is
 * chosen.
 */
export function providersWhoPerform<T extends { type: 'DENTIST' | 'HYGIENIST' }>(
  providers: T[],
  serviceProviderType: 'DENTIST' | 'HYGIENIST' | undefined,
): T[] {
  if (!serviceProviderType) return []
  return providers.filter((provider) => provider.type === serviceProviderType)
}
