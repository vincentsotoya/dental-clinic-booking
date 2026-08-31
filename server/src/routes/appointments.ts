import {
  bookAppointmentRequest,
  bookAppointmentResponse,
  myAppointmentsQuery,
  myAppointmentsResponse,
  type AppointmentWindow,
} from '@dental/shared'
import { Router } from 'express'
import type { AuthMiddleware } from '../middleware/auth'
import { getChartId } from '../middleware/auth-context'
import { bookAppointment, type BookingDb } from '../services/booking'

export type AppointmentsDeps = {
  db: BookingDb
  requireAuth: AuthMiddleware['requireAuth']
  timeZone: string
  /** A function, not a Date: the route is long-lived and must read the clock per request. */
  now?: () => Date
}

/** What the patient asked for, as a WHERE clause and an order. ADR-0007. */
function scope(patientId: string, when: AppointmentWindow, now: Date) {
  const where = { patientId, ...(when === 'all' ? {} : { startsAt: bound(when, now) }) }

  // Soonest first for what is coming, most recent first for what is gone —
  // both are "nearest to now", which is what a list wants at the top.
  const orderBy = { startsAt: when === 'past' ? ('desc' as const) : ('asc' as const) }

  return { where, orderBy }
}

const bound = (when: AppointmentWindow, now: Date) =>
  when === 'past' ? { lt: now } : { gte: now }

/** The columns a patient may see. `blockedUntil` and the room are not among them. */
const VISIBLE = {
  id: true,
  status: true,
  startsAt: true,
  endsAt: true,
  notes: true,
  service: { select: { id: true, slug: true, name: true, durationMins: true } },
  provider: { select: { id: true, type: true, firstName: true, lastName: true, title: true } },
} as const

export function createAppointmentsRouter(deps: AppointmentsDeps): Router {
  const { db, timeZone, now = () => new Date() } = deps
  const router = Router()

  // Before any `/appointments/:id` route that Phase 4 still has to add, or
  // Express will read "me" as an id.
  router.get('/appointments/me', deps.requireAuth, async (req, res) => {
    const { when } = myAppointmentsQuery.parse(req.query)

    // The chart id is *in* the query, not compared after it. A stranger's row
    // is not filtered out of the answer — it is never in it (ADR-0007).
    const rows = await db.appointment.findMany({
      ...scope(getChartId(req), when, now()),
      select: VISIBLE,
    })

    const body = myAppointmentsResponse.parse({
      when,
      appointments: rows.map((row) => ({
        ...row,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
      })),
    })

    // Somebody else's browser on a shared machine, and a cancellation that
    // still looks booked, are both this header's job.
    res.set('Cache-Control', 'no-store')
    res.json(body)
  })

  router.post('/appointments', deps.requireAuth, async (req, res) => {
    const body = bookAppointmentRequest.parse(req.body)

    const appointment = await bookAppointment(db, {
      patientId: getChartId(req),
      serviceSlug: body.service,
      providerId: body.providerId,
      startsAt: new Date(body.startsAt),
      notes: body.notes,
      timeZone,
      now: now(),
    })

    // Parsed on the way out, as in every route here.
    const payload = bookAppointmentResponse.parse({
      appointment: {
        ...appointment,
        startsAt: appointment.startsAt.toISOString(),
        endsAt: appointment.endsAt.toISOString(),
      },
    })

    // 201 with the row, not 204: the client needs the id to cancel it and the
    // resolved times to show a confirmation.
    res.status(201).json(payload)
  })

  return router
}
