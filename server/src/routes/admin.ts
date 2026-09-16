// The clinic's own screens.
//
// Guarded by role, not by ownership: nothing here is addressed by an id
// belonging to one patient, so `requireRole('ADMIN')` is the whole guard —
// there is no "mine" for `requireOwnership` to compare against, the converse
// of profile.ts's reasoning (ADR-0007).

import { adminAppointmentsQuery, adminAppointmentsResponse, toIsoDate } from '@dental/shared'
import { Router } from 'express'
import type { AuthMiddleware } from '../middleware/auth'
import { type AdminAppointmentsDb, findAdminAppointments, toAdminAppointment } from '../services/admin-appointments'

export type AdminDeps = {
  db: AdminAppointmentsDb
  requireRole: AuthMiddleware['requireRole']
  timeZone: string
}

export function createAdminRouter(deps: AdminDeps): Router {
  const { db, requireRole, timeZone } = deps
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

  return router
}
