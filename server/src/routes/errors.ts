// Thrown error → HTTP status, in one place.
//
// Handlers throw and never touch `res.status`. The mapping lives here so a new
// failure mode is added by extending one table rather than by remembering to
// handle it in every handler that could hit it.

import type { AvailabilityError, AvailabilityErrorCode } from '@dental/shared'
import type { ErrorRequestHandler, Response } from 'express'
import { ZodError } from 'zod'
import { AvailabilityQueryError } from '../services/availability-query'

/**
 * Keyed by the shared enum rather than written as a switch, so adding a code
 * to the contract fails the build here until it has a status. The two 400s are
 * not interchangeable: an inverted range and an over-long one are both the
 * caller's fault, but only one of them is fixed by asking for less.
 */
const STATUS: Record<AvailabilityErrorCode, number> = {
  INVALID_QUERY: 400,
  RANGE_INVERTED: 400,
  RANGE_TOO_LONG: 400,
  SERVICE_NOT_FOUND: 404,
  INTERNAL: 500,
}

function send(res: Response, code: AvailabilityErrorCode, message: string): void {
  const body: AvailabilityError = { error: { code, message } }
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
    send(res, 'INVALID_QUERY', describe(error))
    return
  }

  if (error instanceof AvailabilityQueryError) {
    send(res, error.code, error.message)
    return
  }

  // Unrecognised: a bug, or Postgres being down. Its message can carry a
  // connection string or the contents of a row, so it is logged and not
  // serialised — the client gets the fixed message the contract promises.
  console.error(error)
  send(res, 'INTERNAL', 'Something went wrong.')
}
