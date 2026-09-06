import { providersResponse, servicesResponse } from '@dental/shared'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../app'
import { stubAuth } from '../test-support/stubs'

// A row as Prisma would hand it back if the handler asked for every column —
// the operational fields included, so the assertions below can show they do not
// reach the wire.
const SERVICE_ROW = {
  id: '5d604f00-0000-4000-8000-0000000000b1',
  slug: 'routine-exam',
  name: 'Routine Exam',
  description: null,
  durationMins: 30,
  priceCents: 8_500,
  providerType: 'DENTIST',
  bufferMins: 15,
  isActive: true,
}

const PROVIDER_ROW = {
  id: '5d604f00-0000-4000-8000-0000000000c1',
  type: 'DENTIST',
  firstName: 'Amara',
  lastName: 'Osei',
  title: 'DDS',
  bio: 'General and restorative dentistry.',
  isActive: true,
}

/** Records the arguments each handler sends, which is the half of the query the route owns. */
function appWith(rows: { services?: unknown[]; providers?: unknown[] }) {
  const asked: { services?: unknown; providers?: unknown } = {}

  const app = createApp({
    db: {
      service: {
        findMany: async (args: unknown) => {
          asked.services = args
          return rows.services ?? []
        },
        findUnique: async () => null,
      },
      provider: {
        findMany: async (args: unknown) => {
          asked.providers = args
          return rows.providers ?? []
        },
      },
      patient: { findUnique: async () => null },
    },
    auth: stubAuth(null),
    databaseIsReachable: async () => true,
    timeZone: 'America/New_York',
  } as unknown as Parameters<typeof createApp>[0])

  return { app, asked }
}

describe('GET /api/services', () => {
  it('answers 200 with a body matching its contract', async () => {
    const { app } = appWith({ services: [SERVICE_ROW] })

    const res = await request(app).get('/api/services')

    expect(res.status).toBe(200)
    expect(() => servicesResponse.parse(res.body)).not.toThrow()
    expect(res.body.services).toHaveLength(1)
    expect(res.body.services[0].slug).toBe('routine-exam')
  })

  // The buffer is the clinic's turnover time. Quoting it to a patient would
  // describe a 45-minute visit for a 30-minute exam.
  it('withholds the operational columns even when the row carries them', async () => {
    const { app } = appWith({ services: [SERVICE_ROW] })

    const res = await request(app).get('/api/services')

    expect(res.body.services[0]).not.toHaveProperty('bufferMins')
    expect(res.body.services[0]).not.toHaveProperty('isActive')
  })

  // The clause a retired service depends on. Postgres applies it; what the
  // route controls is asking for it at all, so that is what is asserted here.
  it('asks for active rows only, in a deterministic order', async () => {
    const { app, asked } = appWith({ services: [] })

    await request(app).get('/api/services')

    expect(asked.services).toMatchObject({
      where: { isActive: true },
      orderBy: [{ providerType: 'asc' }, { name: 'asc' }],
    })
  })

  // A clinic that has retired everything is a strange clinic, not a broken
  // endpoint — the page shows "nothing to show", not an error.
  it('answers 200 with an empty list, not 404', async () => {
    const { app } = appWith({ services: [] })

    const res = await request(app).get('/api/services')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ services: [] })
  })

  // The opposite of availability's `no-store`, and safe only because no cookie
  // is read here.
  it('is publicly cacheable', async () => {
    const { app } = appWith({ services: [SERVICE_ROW] })

    const res = await request(app).get('/api/services')

    expect(res.headers['cache-control']).toBe('public, max-age=300')
  })
})

describe('GET /api/providers', () => {
  it('answers 200 with a body matching its contract', async () => {
    const { app } = appWith({ providers: [PROVIDER_ROW] })

    const res = await request(app).get('/api/providers')

    expect(res.status).toBe(200)
    expect(() => providersResponse.parse(res.body)).not.toThrow()
    expect(res.body.providers[0].lastName).toBe('Osei')
    expect(res.body.providers[0]).not.toHaveProperty('isActive')
  })

  it('asks for active rows only, in a deterministic order', async () => {
    const { app, asked } = appWith({ providers: [] })

    await request(app).get('/api/providers')

    expect(asked.providers).toMatchObject({
      where: { isActive: true },
      orderBy: [{ type: 'asc' }, { lastName: 'asc' }],
    })
  })

  // Both are nullable in the schema, so a provider the front desk added in a
  // hurry must survive the contract rather than fail it.
  it('carries a provider with no title and no biography', async () => {
    const { app } = appWith({ providers: [{ ...PROVIDER_ROW, title: null, bio: null }] })

    const res = await request(app).get('/api/providers')

    expect(res.status).toBe(200)
    expect(() => providersResponse.parse(res.body)).not.toThrow()
    expect(res.body.providers[0].title).toBeNull()
  })

  // Nobody signs in to read a price list, so a stranger must not meet a 401.
  it('answers an anonymous caller', async () => {
    const { app } = appWith({ providers: [PROVIDER_ROW] })

    const res = await request(app).get('/api/providers')

    expect(res.status).toBe(200)
  })
})
