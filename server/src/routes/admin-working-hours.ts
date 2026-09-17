// GET and PATCH /api/admin/providers/:providerId/working-hours — the clinic's
// own edit of a provider's recurring weekly window.
//
// Guarded by role alone, the same reasoning admin.ts already carries: nothing
// here is addressed by "mine", so `requireRole('ADMIN')` is the whole guard.
// `:providerId` is validated as a UUID before it reaches Postgres, the same
// reason `requireOwnership` validates `:id` — a malformed one is a 400, not a
// 500 from a non-UUID hitting a `uuid` column.

import { getWorkingHoursResponse, updateWorkingHoursRequest, updateWorkingHoursResponse } from '@dental/shared'
import { Router } from 'express'
import { z } from 'zod'
import type { AuthMiddleware } from '../middleware/auth'
import {
  type AdminWorkingHoursDb,
  findWorkingHours,
  replaceWorkingHours,
} from '../services/admin-working-hours'

export type AdminWorkingHoursDeps = {
  db: AdminWorkingHoursDb
  requireRole: AuthMiddleware['requireRole']
}

const params = z.object({ providerId: z.uuid() })

export function createAdminWorkingHoursRouter(deps: AdminWorkingHoursDeps): Router {
  const { db, requireRole } = deps
  const router = Router()

  router.get('/admin/providers/:providerId/working-hours', requireRole('ADMIN'), async (req, res) => {
    const { providerId } = params.parse(req.params)

    const workingHours = await findWorkingHours(db, providerId)

    const body = getWorkingHoursResponse.parse({ providerId, workingHours })

    // Read by an admin about to edit it — the same reasoning every other
    // admin route in this app refuses to let a shared cache answer.
    res.set('Cache-Control', 'no-store')
    res.json(body)
  })

  router.patch('/admin/providers/:providerId/working-hours', requireRole('ADMIN'), async (req, res) => {
    const { providerId } = params.parse(req.params)
    const input = updateWorkingHoursRequest.parse(req.body)

    const workingHours = await replaceWorkingHours(db, providerId, input.workingHours)

    const body = updateWorkingHoursResponse.parse({ providerId, workingHours })

    res.set('Cache-Control', 'no-store')
    res.json(body)
  })

  return router
}
