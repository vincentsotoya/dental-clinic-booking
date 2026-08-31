// Thrown error → HTTP status, in one place.
//
// Handlers throw and never touch `res.status`. The mapping lives here so a new
// failure mode is added by extending one table rather than by remembering to
// handle it in every handler that could hit it.

import type { ApiErrorBody, ApiErrorCode } from '@dental/shared'
import type { ErrorRequestHandler, Response } from 'express'
import { ZodError } from 'zod'
import { ApiError } from '../errors'

/**
 * Keyed by the shared registry rather than written as a switch, so adding a
 * code to the contract fails the build here until it has a status.
 *
 * The three 400s are not interchangeable: an inverted range, an over-long one
 * and a malformed one are all the caller's fault, but only one of them is
 * fixed by asking for less.
 *
 * `FORBIDDEN` is a 403 and that does not contradict ADR-0007. That ADR is
 * about *data addressed by id* — there, a 403 distinguishes an appointment
 * that exists from one that does not, so walking ids counts the clinic's
 * bookings, and the honest-looking answer is the leaky one. A role check has
 * no such oracle: refusing a patient the admin calendar tells them nothing
 * they did not already know from typing the URL.
 */
const STATUS: Record<ApiErrorCode, number> = {
  INVALID_REQUEST: 400,
  RANGE_INVERTED: 400,
  RANGE_TOO_LONG: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  SERVICE_NOT_FOUND: 404,
  INTERNAL: 500,
}

function send(res: Response, code: ApiErrorCode, message: string): void {
  const body: ApiErrorBody = { error: { code, message } }
  res.status(STATUS[code]).json(body)
}

/** `service: Not a service slug.; from: Invalid ISO date` — which field, and why. */
function describe(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '(query)'}: ${issue.message}`)
    .join('; ')
}

/**
 * Express 5 forwards a rejected promise from an async handler here on its own,
 * so handlers need no try/catch and cannot forget one.
 */
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    send(res, 'INVALID_REQUEST', describe(error))
    return
  }

  // One branch for every failure the app has a name for, subclasses included.
  // A per-feature `instanceof` would mean a forgotten branch turns a failure
  // the code already understood into a 500.
  if (error instanceof ApiError) {
    send(res, error.code, error.message)
    return
  }

  // Unrecognised: a bug, or Postgres being down. Its message can carry a
  // connection string or the contents of a row, so it is logged and not
  // serialised — the client gets the fixed message the contract promises.
  console.error(error)
  send(res, 'INTERNAL', 'Something went wrong.')
}
