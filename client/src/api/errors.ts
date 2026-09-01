// What a failed request becomes on this side of the wire.
//
// The server sends one envelope for every failure, `INTERNAL` included, so the
// client parses one shape rather than a happy path, an error path, and a third
// thing for when the server falls over (see shared/src/errors.ts).
//
// The code is what a component switches on. Prose is for humans and changes
// without warning, so nothing here matches on a message.

import { apiError, type ApiErrorCode } from '@dental/shared'

/**
 * A failure the API named. `code` is narrowed per endpoint by the caller, so a
 * component handling booking sees `SLOT_TAKEN` in its union and never
 * `RANGE_TOO_LONG`.
 */
export class ApiRequestError<Code extends ApiErrorCode = ApiErrorCode> extends Error {
  constructor(
    readonly code: Code,
    message: string,
    /** The HTTP status, for logging. Never for branching: that is the code's job. */
    readonly status: number,
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

/** The one message shown when the failure has no name we can trust. */
const UNREADABLE = 'Something went wrong. Please try again.'

/**
 * Turn a failed response into an `ApiRequestError`.
 *
 * A body that does not parse as the envelope is not a server error we can
 * describe — it is a proxy error page, an HTML 502, or a bug — so it becomes
 * `INTERNAL` with a fixed message rather than leaking whatever arrived into the
 * interface.
 */
export async function toApiError(response: Response): Promise<ApiRequestError> {
  const body: unknown = await response.json().catch(() => null)
  const parsed = apiError.safeParse(body)

  if (!parsed.success) {
    return new ApiRequestError('INTERNAL', UNREADABLE, response.status)
  }

  return new ApiRequestError(parsed.data.error.code, parsed.data.error.message, response.status)
}

/**
 * `fetch` rejects only when the request never completed: offline, DNS, a
 * cancelled navigation. That is not a failure the API has a name for, and it is
 * the one case where retrying is genuinely worth doing.
 */
export class NetworkError extends Error {
  constructor(override readonly cause: unknown) {
    super('Could not reach the clinic. Check your connection.')
    this.name = 'NetworkError'
  }
}

/** True for the failures a retry could plausibly fix. */
export function isRetryable(error: unknown): boolean {
  if (error instanceof NetworkError) return true
  // 5xx only. Retrying a 409 asks the same question that was already answered,
  // and retrying a 401 sends the same dead cookie again.
  return error instanceof ApiRequestError && error.status >= 500
}
