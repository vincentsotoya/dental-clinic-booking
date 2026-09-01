// Query keys in one place, so an invalidation cannot miss by a typo.
//
// A booking invalidates every availability query rather than the one day it
// touched: the write blocks a room and a provider for a buffer that can run
// past midnight, so a neighbouring day's slot list can be wrong too. Being
// broadly right beats being narrowly wrong on a list whose whole job is to be
// current.

import type { AppointmentWindow } from '@dental/shared'
import type { AvailabilityParams } from './endpoints'

export const queryKeys = {
  health: () => ['health'] as const,
  me: () => ['me'] as const,

  /** The prefix. Passing it to `invalidateQueries` matches every date range. */
  availability: () => ['availability'] as const,
  availabilityFor: (params: AvailabilityParams) => ['availability', params] as const,

  appointments: () => ['appointments'] as const,
  myAppointments: (when?: AppointmentWindow) => ['appointments', 'me', when ?? 'upcoming'] as const,
} as const
