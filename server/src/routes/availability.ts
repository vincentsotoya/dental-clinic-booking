import { availabilityQuery, availabilityResponse } from '@dental/shared'
import { Router } from 'express'
import { type AvailabilityDb, findAvailability } from '../services/availability-query'
import { toAvailabilityResponse } from '../services/availability-response'

/**
 * Everything the route needs from outside itself.
 *
 * The same shape the rest of this codebase uses — `getAvailableSlots` takes
 * `now`, `createClinicCalendar` takes the zone, `findAvailability` takes the
 * client. Carried through to the route so its tests can hand it a stub and run
 * with no Postgres and no `.env`.
 */
export type AvailabilityDeps = {
  db: AvailabilityDb
  timeZone: string
  /** A function, not a Date: the route is long-lived and must read the clock per request. */
  now?: () => Date
}

export function createAvailabilityRouter(deps: AvailabilityDeps): Router {
  const { db, timeZone, now = () => new Date() } = deps
  const router = Router()

  router.get('/availability', async (req, res) => {
    // Throws ZodError on a bad query; `errors.ts` turns that into a 400 naming
    // the field. Express 5 catches the rejection, so there is no try/catch.
    const query = availabilityQuery.parse(req.query)

    const result = await findAvailability(db, { ...query, timeZone, now: now() })

    // Parsed on the way out, as in the health route. It re-validates a few
    // hundred slots per request, which is not free — but it is small beside
    // the five database round trips it follows, and it is the only thing that
    // catches the serialiser drifting from the contract the client imports.
    const body = availabilityResponse.parse(toAvailabilityResponse(result))

    // The most volatile thing this API serves. A cached slot list is a slot
    // list that offers a time somebody else has already taken.
    res.set('Cache-Control', 'no-store')
    res.json(body)
  })

  return router
}
