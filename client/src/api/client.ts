// The one place this app talks to its API.
//
// WHY THE RESPONSE IS PARSED AND NOT CAST
//
// `shared` exists so the two halves agree by construction. Casting a response
// to its type would throw that away at the only point it matters: `as
// MeResponse` is a promise the compiler cannot keep, and a server that started
// sending `patient: undefined` would surface as a blank name three components
// away from the cause.
//
// So every response is parsed through the same schema the route parsed on the
// way out. A contract violation fails here, once, naming the field.
//
// The cost is real and small: zod is already a dependency of `shared`, and the
// bodies are tens of fields, not thousands of rows.

import type { z } from 'zod'
import type { ApiErrorCode } from '@dental/shared'
import { type ApiRequestError, NetworkError, toApiError } from './errors'

/** Same-origin in dev through Vite's proxy; Phase 11 decides what it is in production. */
const BASE = '/api'

type RequestOptions<Result> = {
  path: string
  /** Parsed with this on the way in. The same schema the route parsed on the way out. */
  schema: z.ZodType<Result>
  method?: 'GET' | 'POST' | 'PATCH'
  /** Serialised as JSON. Omitted entirely for a request that has no body. */
  body?: unknown
  signal?: AbortSignal
}

/**
 * Perform one request, or throw something the interface can act on.
 *
 * Throws `ApiRequestError` for a failure the API named, and `NetworkError` when
 * the request never arrived. Nothing else is expected: a body that does not
 * match its contract throws a `ZodError`, which is a bug rather than a
 * user-facing state, and it fails loudly for that reason.
 *
 * `Code` is supplied by the caller so a handler's `catch` sees the codes that
 * endpoint actually declares. Nothing at runtime depends on it.
 */
export async function request<Result, Code extends ApiErrorCode = ApiErrorCode>(
  options: RequestOptions<Result>,
): Promise<Result> {
  const { path, schema, method = 'GET', body, signal } = options

  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      signal,
      // The session cookie. Same-origin today, so this changes nothing; it is
      // what keeps working when Phase 11 deploys the client separately.
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (cause) {
    // An aborted request is the caller changing their mind, not a failure.
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    throw new NetworkError(cause)
  }

  if (!response.ok) {
    throw (await toApiError(response)) as ApiRequestError<Code>
  }

  return schema.parse(await response.json())
}
