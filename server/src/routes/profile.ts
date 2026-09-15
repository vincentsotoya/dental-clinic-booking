// GET and PATCH /api/me/profile — the endpoint `me.ts` deliberately leaves a
// gap for. Phone, date of birth and insurance are the schema's most sensitive
// fields; this route is the one place that reads or writes them, rather than
// the hot path every cold load calls.
//
// Scoped by `getChartId`, never `requireOwnership`: there is no id in the
// path to guard. "Mine" is the only row this route can ever mean, so the
// WHERE clause is the session itself (ADR-0007's principle, without its
// machinery).

import { getProfileResponse, updateProfileRequest, updateProfileResponse } from '@dental/shared'
import { Router } from 'express'
import type { PrismaClient } from '../../generated/prisma/client'
import type { AuthMiddleware } from '../middleware/auth'
import { getChartId } from '../middleware/auth-context'

export type ProfileDeps = {
  db: Pick<PrismaClient, 'patient'>
  requireAuth: AuthMiddleware['requireAuth']
}

const PROFILE_SELECT = {
  phone: true,
  dateOfBirth: true,
  insuranceProvider: true,
  insuranceMemberId: true,
} as const

type ProfileRow = {
  phone: string | null
  dateOfBirth: Date | null
  insuranceProvider: string | null
  insuranceMemberId: string | null
}

/** `@db.Date` comes back as a UTC-midnight `Date`; the wire contract wants the civil date it holds, not a timestamp. */
function toProfile(row: ProfileRow) {
  return {
    phone: row.phone,
    dateOfBirth: row.dateOfBirth ? row.dateOfBirth.toISOString().slice(0, 10) : null,
    insuranceProvider: row.insuranceProvider,
    insuranceMemberId: row.insuranceMemberId,
  }
}

export function createProfileRouter(deps: ProfileDeps): Router {
  const { db, requireAuth } = deps
  const router = Router()

  router.get('/me/profile', requireAuth, async (req, res) => {
    // `OrThrow`, not a null check: `getChartId` already guarantees a chart
    // that existed the moment the session was resolved. A row missing here is
    // not a case this route has anything honest to say about — it is a bug.
    const patient = await db.patient.findUniqueOrThrow({
      where: { id: getChartId(req) },
      select: PROFILE_SELECT,
    })

    const body = getProfileResponse.parse({ profile: toProfile(patient) })

    // Sensitive fields, echoed on request — the same reason `/api/me` refuses
    // to be cached.
    res.set('Cache-Control', 'no-store')
    res.json(body)
  })

  router.patch('/me/profile', requireAuth, async (req, res) => {
    const input = updateProfileRequest.parse(req.body)

    const patient = await db.patient.update({
      where: { id: getChartId(req) },
      data: {
        phone: input.phone,
        dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
        insuranceProvider: input.insuranceProvider,
        insuranceMemberId: input.insuranceMemberId,
      },
      select: PROFILE_SELECT,
    })

    const body = updateProfileResponse.parse({ profile: toProfile(patient) })

    res.set('Cache-Control', 'no-store')
    res.json(body)
  })

  return router
}
