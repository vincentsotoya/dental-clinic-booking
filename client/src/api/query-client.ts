// The QueryClient, and the two defaults worth arguing about.
//
// RETRY
//
// The library retries three times by default, which is wrong for most of this
// API. A 409 SLOT_TAKEN is a true answer about the world, and asking again
// gets the same answer while the patient waits; a 401 sends the same dead
// cookie again. Only a network failure or a 5xx is worth repeating, which is
// what `isRetryable` decides.
//
// STALENESS
//
// Availability has no stale window at all. The server sends it `no-store`
// because a cached slot list offers times that are already taken, and a slot
// was never a reservation in the first place. Cached availability is precisely
// the bug the 409 path exists to recover from, so the cache is not allowed to
// create it.

import { QueryClient } from '@tanstack/react-query'
import { isRetryable } from './errors'

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Two attempts after the first, and only for failures a retry can fix.
        retry: (failureCount, error) => failureCount < 2 && isRetryable(error),
        staleTime: 0,
        // Coming back to the tab is exactly when a slot list is most likely to
        // be out of date.
        refetchOnWindowFocus: true,
      },
      mutations: {
        // A write is never retried automatically. Booking is not idempotent,
        // and a retried POST can take a second slot.
        retry: false,
      },
    },
  })
}
