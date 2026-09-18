// GET/POST /api/admin/closures and DELETE /api/admin/closures/:id — the
// clinic's own record of when the whole practice is shut.
//
// Guarded by role alone, the same reasoning `admin-time-off.ts` already
// carries. No `:providerId` anywhere in this router — a closure has no
// provider to scope a read by or check exists before a write.

import { createClosureRequest, createClosureResponse, deleteClosureResponse, getClosuresResponse } from '@dental/shared'
import { Router } from 'express'
import { z } from 'zod'
import type { AuthMiddleware } from '../middleware/auth'
import {
  type AdminClosuresDb,
  createClosure,
  deleteClosure,
  findClosures,
} from '../services/admin-closures'

export type AdminClosuresDeps = {
  db: AdminClosuresDb
  requireRole: AuthMiddleware['requireRole']
  timeZone: string
}

const closureParams = z.object({ id: z.uuid() })

export function createAdminClosuresRouter(deps: AdminClosuresDeps): Router {
  const { db, requireRole, timeZone } = deps
  const router = Router()

  router.get('/admin/closures', requireRole('ADMIN'), async (_req, res) => {
    const closures = await findClosures(db, timeZone)

    const body = getClosuresResponse.parse({ closures })

    // Read by an admin about to add or remove a row — the same reasoning
    // every other admin route here refuses a shared cache.
    res.set('Cache-Control', 'no-store')
    res.json(body)
  })

  router.post('/admin/closures', requireRole('ADMIN'), async (req, res) => {
    const input = createClosureRequest.parse(req.body)

    const closure = await createClosure(db, timeZone, input)

    const body = createClosureResponse.parse({ closure })

    res.status(201).json(body)
  })

  router.delete('/admin/closures/:id', requireRole('ADMIN'), async (req, res) => {
    const { id } = closureParams.parse(req.params)

    const deletedId = await deleteClosure(db, id)

    const body = deleteClosureResponse.parse({ id: deletedId })

    res.json(body)
  })

  return router
}
