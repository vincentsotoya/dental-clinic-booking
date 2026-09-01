import {
  bookAppointmentRequest,
  bookAppointmentResponse,
  cancelAppointmentResponse,
  myAppointmentsQuery,
  myAppointmentsResponse,
  type AppointmentWindow,
} from '@dental/shared'
import { Router, type RequestHandler } from 'express'
import type { AuthMiddleware } from '../middleware/auth'
import { getChartId } from '../middleware/auth-context'
import { getOwnedAppointmentId } from '../middleware/ownership'
import {
  PATIENT_APPOINTMENT_SELECT,
  toPatientAppointment,
} from '../services/appointment-view'
import { bookAppointment, type BookingDb } from '../services/booking'
import { cancelAppointment, type CancellationDb } from '../services/cancellation'

export type AppointmentsDeps = {
  db: BookingDb & CancellationDb
  requireAuth: AuthMiddleware['requireAuth']
  /** Only the id-addressed routes take it; the other two are scoped by their own WHERE clause. */
  requireOwnership: RequestHandler
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
      select: PATIENT_APPOINTMENT_SELECT,
    })

    const body = myAppointmentsResponse.parse({
      when,
      appointments: rows.map(toPatientAppointment),
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
      appointment: toPatientAppointment(appointment),
    })

    // 201 with the row, not 204: the client needs the id to cancel it and the
    // resolved times to show a confirmation.
    res.status(201).json(payload)
  })

  // The guard decides whose row this is; the handler never sees a chart id and
  // never compares one. `getOwnedAppointmentId` is the only way in — reading
  // `req.params.id` here would work until the day the guard is left off.
  router.patch('/appointments/:id/cancel', deps.requireOwnership, async (req, res) => {
    const appointment = await cancelAppointment(db, {
      appointmentId: getOwnedAppointmentId(req),
      now: now(),
    })

    const body = cancelAppointmentResponse.parse({
      appointment: toPatientAppointment(appointment),
    })

    // 200 with the row, not 204: the client re-renders the appointment as
    // cancelled rather than guessing what it now looks like.
    res.set('Cache-Control', 'no-store')
    res.json(body)
  })

  return router
}
