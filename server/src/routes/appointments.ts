import { bookAppointmentRequest, bookAppointmentResponse } from '@dental/shared'
import { Router } from 'express'
import { ApiError } from '../errors'
import type { AuthMiddleware } from '../middleware/auth'
import { getAuth } from '../middleware/auth-context'
import { bookAppointment, type BookingDb } from '../services/booking'

export type AppointmentsDeps = {
  db: BookingDb
  requireAuth: AuthMiddleware['requireAuth']
  timeZone: string
  /** A function, not a Date: the route is long-lived and must read the clock per request. */
  now?: () => Date
}

export function createAppointmentsRouter(deps: AppointmentsDeps): Router {
  const { db, timeZone, now = () => new Date() } = deps
  const router = Router()

  router.post('/appointments', deps.requireAuth, async (req, res) => {
    const body = bookAppointmentRequest.parse(req.body)
    const { patientId } = getAuth(req)

    // An admin has no chart, and so does a login whose signup hook failed
    // (ADR-0007). Neither has anything to book against. FORBIDDEN rather than
    // NOT_FOUND: no id was supplied, so there is no row being probed for and
    // nothing an honest answer could leak. Admins booking for a patient is a
    // Phase 7 route with a patient id in it.
    if (!patientId) {
      throw new ApiError('FORBIDDEN', 'This account has no patient chart to book against.')
    }

    const appointment = await bookAppointment(db, {
      patientId,
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
