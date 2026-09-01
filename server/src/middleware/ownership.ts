// May this caller act on the appointment named in the URL? The guard for the
// only routes addressed by an appointment id — cancel and reschedule (ADR-0007).
//
// It hands the handler an id and never a row. A row read out here is read
// outside the handler's transaction, so a handler trusting its `status` could
// cancel an appointment that was cancelled between the two statements.

import type { Request, RequestHandler } from 'express'
import { z } from 'zod'
import type { PrismaClient } from '../../generated/prisma/client'
import { ApiError } from '../errors'
import { getAuth, getChartId } from './auth-context'

export type OwnershipDeps = {
  db: Pick<PrismaClient, 'appointment'>
  /** Composed in, so ownership can never be decided on an unresolved request. */
  requireAuth: RequestHandler
}

declare global {
  namespace Express {
    interface Request {
      /** Written only by `requireOwnership`, read only through `getOwnedAppointmentId`. */
      ownedAppointmentId?: string
    }
  }
}

const params = z.object({ id: z.uuid() })

/** One message for both cases: "not yours" and "not there" are one answer — ADR-0007. */
const NO_SUCH_APPOINTMENT = 'No such appointment.'

export function createRequireOwnership(deps: OwnershipDeps): RequestHandler {
  const { db, requireAuth } = deps

  async function clear(req: Request): Promise<string> {
    // A malformed id is a 400 rather than a 404: it is decided from the string
    // alone, so unlike a real id it reveals nothing about any row. It also keeps
    // a non-UUID away from a `uuid` column, which Postgres answers with a 500.
    const { id } = params.parse(req.params)

    // ADR-0007's single admin branch. `OR role = 'ADMIN'` in each query is the
    // same rule written many times, and so waiting to be written wrong once.
    if (getAuth(req).user.role === 'ADMIN') return id

    // Scoped, not compared. A stranger's id and a deleted one both come back
    // empty here, which is why they can share an answer.
    const row = await db.appointment.findFirst({
      where: { id, patientId: getChartId(req) },
      select: { id: true },
    })

    if (!row) throw new ApiError('NOT_FOUND', NO_SUCH_APPOINTMENT)

    return row.id
  }

  return async (req, res, next) => {
    await requireAuth(req, res, (error?: unknown) => {
      if (error) {
        next(error)
        return
      }

      // Express is not watching this promise — it is our own callback, not a
      // handler it invoked — so the rejection is forwarded by hand.
      clear(req).then((id) => {
        req.ownedAppointmentId = id
        next()
      }, next)
    })
  }
}

/**
 * The id the guard cleared, for the handler about to act on it.
 *
 * Reading `req.params.id` instead works right up until a route is mounted
 * without the guard and then writes to a stranger's row. This throws `INTERNAL`
 * there — the trade `getAuth` already makes for the session (ADR-0008).
 */
export function getOwnedAppointmentId(req: Request): string {
  if (req.ownedAppointmentId === undefined) {
    throw new ApiError('INTERNAL', 'Route read an appointment id without requireOwnership.')
  }

  return req.ownedAppointmentId
}
