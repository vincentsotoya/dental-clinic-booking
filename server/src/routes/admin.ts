// The clinic's own screens.
//
// Guarded by role, not by ownership: nothing here is addressed by an id
// belonging to one patient, so `requireRole('ADMIN')` is the whole guard —
// there is no "mine" for `requireOwnership` to compare against, the converse
// of profile.ts's reasoning (ADR-0007).

import {
  adminAppointmentsQuery,
  adminAppointmentsResponse,
  closeAppointmentRequest,
  closeAppointmentResponse,
  toIsoDate,
} from '@dental/shared'
import { Router, type Request } from 'express'
import { z } from 'zod'
import type { AuthMiddleware } from '../middleware/auth'
import { getAuth } from '../middleware/auth-context'
import { closeAppointment, type CloseAppointmentDb } from '../services/admin-appointment-close'
import {
  type AdminAppointmentsDb,
  findAdminAppointments,
  toAdminAppointment,
} from '../services/admin-appointments'
import type { Actor } from '../services/appointment-events'

export type AdminDeps = {
  db: AdminAppointmentsDb & CloseAppointmentDb
  requireRole: AuthMiddleware['requireRole']
  timeZone: string
  /** A function, not a Date: the route is long-lived and must read the clock per request. */
  now?: () => Date
}

const appointmentParams = z.object({ id: z.uuid() })

/** Who is acting, for the event log — the login, not the chart. Always an admin here. */
const actorOf = (req: Request): Actor => {
  const { user } = getAuth(req)
  return { userId: user.id, role: user.role }
}

export function createAdminRouter(deps: AdminDeps): Router {
  const { db, requireRole, timeZone, now = () => new Date() } = deps
  const router = Router()

  router.get('/admin/appointments', requireRole('ADMIN'), async (req, res) => {
    const query = adminAppointmentsQuery.parse(req.query)

    const rows = await findAdminAppointments(db, { ...query, timeZone })

    const body = adminAppointmentsResponse.parse({
      range: { from: toIsoDate(query.from), to: toIsoDate(query.to) },
      timeZone,
      appointments: rows.map(toAdminAppointment),
    })

    // The clinic's own schedule, as volatile as a patient's — a cached day
    // view is one that can no longer see a cancellation that just happened.
    res.set('Cache-Control', 'no-store')
    res.json(body)
  })

  router.patch('/admin/appointments/:id/close', requireRole('ADMIN'), async (req, res) => {
    const { id } = appointmentParams.parse(req.params)
    const { outcome } = closeAppointmentRequest.parse(req.body)

    const appointment = await closeAppointment(db, {
      appointmentId: id,
      outcome,
      actor: actorOf(req),
      now: now(),
    })

    const body = closeAppointmentResponse.parse({
      appointment: toAdminAppointment(appointment),
    })

    // 200 with the row, not 204: the calendar re-renders the row as closed
    // rather than guessing what it now looks like.
    res.set('Cache-Control', 'no-store')
    res.json(body)
  })

  return router
}
