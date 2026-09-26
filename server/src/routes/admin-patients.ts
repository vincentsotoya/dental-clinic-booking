// GET /api/admin/patients — the front desk's patient directory.
//
// Guarded by role alone, the same reasoning `admin.ts` carries: a search over
// every patient is addressed by no id, so there is no "mine" to compare against.

import { adminPatientsQuery, adminPatientsResponse } from '@dental/shared'
import { Router } from 'express'
import type { AuthMiddleware } from '../middleware/auth'
import { type AdminPatientsDb, findPatients } from '../services/admin-patients'

export type AdminPatientsDeps = {
  db: AdminPatientsDb
  requireRole: AuthMiddleware['requireRole']
}

export function createAdminPatientsRouter(deps: AdminPatientsDeps): Router {
  const { db, requireRole } = deps
  const router = Router()

  router.get('/admin/patients', requireRole('ADMIN'), async (req, res) => {
    const query = adminPatientsQuery.parse(req.query)

    const body = adminPatientsResponse.parse(await findPatients(db, query))

    // A list of people, changed the moment a patient registers — and never
    // something a shared cache should hold.
    res.set('Cache-Control', 'no-store')
    res.json(body)
  })

  return router
}
