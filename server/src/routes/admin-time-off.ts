// GET/POST /api/admin/providers/:providerId/time-off and
// DELETE /api/admin/time-off/:id — the clinic's own record of when a provider
// is unavailable.
//
// Guarded by role alone, the same reasoning `admin-working-hours.ts` already
// carries: nothing here is addressed by "mine". DELETE is addressed by the
// row's own id rather than nested under a provider — `TimeOff` has a real id
// of its own, unlike `WorkingHours`, so there is nothing a provider-scoped
// path would add.

import {
  createTimeOffRequest,
  createTimeOffResponse,
  deleteTimeOffResponse,
  getTimeOffResponse,
} from '@dental/shared'
import { Router } from 'express'
import { z } from 'zod'
import type { AuthMiddleware } from '../middleware/auth'
import {
  type AdminTimeOffDb,
  createTimeOff,
  deleteTimeOff,
  findTimeOff,
} from '../services/admin-time-off'

export type AdminTimeOffDeps = {
  db: AdminTimeOffDb
  requireRole: AuthMiddleware['requireRole']
  timeZone: string
}

const providerParams = z.object({ providerId: z.uuid() })
const timeOffParams = z.object({ id: z.uuid() })

export function createAdminTimeOffRouter(deps: AdminTimeOffDeps): Router {
  const { db, requireRole, timeZone } = deps
  const router = Router()

  router.get('/admin/providers/:providerId/time-off', requireRole('ADMIN'), async (req, res) => {
    const { providerId } = providerParams.parse(req.params)

    const timeOff = await findTimeOff(db, providerId, timeZone)

    const body = getTimeOffResponse.parse({ providerId, timeOff })

    // Read by an admin about to add or remove a row — the same reasoning
    // every other admin route here refuses a shared cache.
    res.set('Cache-Control', 'no-store')
    res.json(body)
  })

  router.post('/admin/providers/:providerId/time-off', requireRole('ADMIN'), async (req, res) => {
    const { providerId } = providerParams.parse(req.params)
    const input = createTimeOffRequest.parse(req.body)

    const timeOff = await createTimeOff(db, providerId, timeZone, input)

    const body = createTimeOffResponse.parse({ timeOff })

    res.status(201).json(body)
  })

  router.delete('/admin/time-off/:id', requireRole('ADMIN'), async (req, res) => {
    const { id } = timeOffParams.parse(req.params)

    const deletedId = await deleteTimeOff(db, id)

    const body = deleteTimeOffResponse.parse({ id: deletedId })

    res.json(body)
  })

  return router
}
