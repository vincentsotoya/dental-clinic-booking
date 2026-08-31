// The one error a handler, service or middleware throws when it knows what
// went wrong.
//
// Lives at `src/` rather than under `routes/` because services and middleware
// both throw it, and neither should import from the HTTP layer. The reverse
// direction is fine: `routes/errors.ts` imports this to map it to a status.
//
// One class, not one per feature. The alternative — `AvailabilityQueryError`,
// then `AuthError`, then a third — grows an `instanceof` branch in the error
// handler for every area of the app, and a forgotten branch is a 500 on a
// failure the code already understood perfectly well.

import type { ApiErrorCode } from '@dental/shared'

/**
 * A failure the API has a name for, as opposed to a bug or an outage.
 *
 * The `code` is what `routes/errors.ts` maps to a status, so nothing upstream
 * touches `res.status` and nothing downstream matches on a message string.
 */
export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}
