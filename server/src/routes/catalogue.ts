import { providersResponse, servicesResponse } from '@dental/shared'
import { Router } from 'express'
import type { PrismaClient } from '../../generated/prisma/client'

/**
 * Two routes in one router because they are one thing: the clinic's public
 * catalogue, read by anyone, guarded by nothing, and changed only by a Phase 7
 * admin. They will be invalidated together and cached together.
 */
export type CatalogueDeps = {
  db: Pick<PrismaClient, 'service' | 'provider'>
}

/**
 * The only cacheable responses this API serves, and the deliberate opposite of
 * availability's `no-store`.
 *
 * `public` is safe precisely because neither route reads a cookie: no session
 * middleware is mounted here, so every caller gets the same bytes and a shared
 * cache cannot leak one person's answer to another. Five minutes bounds how
 * long a price edit takes to appear.
 */
const CATALOGUE_CACHE = 'public, max-age=300'

export function createCatalogueRouter(deps: CatalogueDeps): Router {
  const router = Router()

  // `isActive` is the load-bearing clause in both handlers. A retired service
  // or a provider who has left keeps its rows — appointments reference them —
  // and offering either one books a visit the clinic cannot deliver.
  router.get('/services', async (_req, res) => {
    const services = await deps.db.service.findMany({
      where: { isActive: true },
      // Deterministic, because the page renders in wire order and an unordered
      // findMany is only accidentally stable.
      orderBy: [{ providerType: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        durationMins: true,
        priceCents: true,
        providerType: true,
      },
    })

    // Parsed on the way out, as in every route here — and it is the parse, not
    // the `select`, that keeps `bufferMins` off the wire: zod strips what the
    // contract does not name. Widening the select above wastes a column, it
    // does not leak one. Proven by widening it.
    const body = servicesResponse.parse({ services })

    res.set('Cache-Control', CATALOGUE_CACHE)
    res.json(body)
  })

  router.get('/providers', async (_req, res) => {
    const providers = await deps.db.provider.findMany({
      where: { isActive: true },
      // DENTIST sorts before HYGIENIST, which is also the order the directory
      // reads in. Alphabetical by surname within each.
      orderBy: [{ type: 'asc' }, { lastName: 'asc' }],
      select: { id: true, type: true, firstName: true, lastName: true, title: true, bio: true },
    })

    const body = providersResponse.parse({ providers })

    res.set('Cache-Control', CATALOGUE_CACHE)
    res.json(body)
  })

  return router
}
