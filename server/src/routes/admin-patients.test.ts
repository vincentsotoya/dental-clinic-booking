import { PATIENT_DIRECTORY_PAGE_SIZE } from '@dental/shared'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../app'
import { ADMIN_USER, PATIENT_USER, stubAuth, type StubUser } from '../test-support/stubs'

// No Postgres. A stub cannot run the search, so these prove what the route
// asks Prisma for and how it shapes the answer; that the match itself is
// right — case, several words, a literal `%` — is `db:patients`'s job.

type Row = { id: string; firstName: string; lastName: string; email: string; userId: string | null }

const row = (n: number, overrides: Partial<Row> = {}): Row => ({
  id: `2c5f3e00-0000-4000-8000-${String(n).padStart(12, '0')}`,
  firstName: 'Elena',
  lastName: `Marsh${n}`,
  email: `elena.marsh${n}@example.com`,
  userId: 'user_1',
  ...overrides,
})

function appFor(user: StubUser | null, rows: Row[] = [row(1)]) {
  const calls: unknown[] = []

  const db = {
    patient: {
      findMany: async (args: unknown) => {
        calls.push(args)
        return rows
      },
      // requireAuth's own session resolution asks for it; unused by this route.
      findUnique: async () => null,
    },
  }

  const app = createApp({
    db,
    auth: stubAuth(user),
    databaseIsReachable: async () => true,
    timeZone: 'America/New_York',
  } as unknown as Parameters<typeof createApp>[0])

  return { app, calls: calls as Array<Record<string, any>> }
}

describe('GET /api/admin/patients', () => {
  it('refuses a stranger', async () => {
    const { app, calls } = appFor(null)
    const res = await request(app).get('/api/admin/patients')
    expect(res.status).toBe(401)
    expect(calls).toHaveLength(0)
  })

  it('refuses a signed-in patient before it reads a single row', async () => {
    const { app, calls } = appFor(PATIENT_USER)
    const res = await request(app).get('/api/admin/patients')
    expect(res.status).toBe(403)
    expect(calls).toHaveLength(0)
  })

  it('answers an admin with the directory row and nothing else of the chart', async () => {
    const { app } = appFor(ADMIN_USER, [row(1), row(2, { userId: null })])
    const res = await request(app).get('/api/admin/patients')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      truncated: false,
      patients: [
        { id: row(1).id, firstName: 'Elena', lastName: 'Marsh1', email: 'elena.marsh1@example.com', hasAccount: true },
        { id: row(2).id, firstName: 'Elena', lastName: 'Marsh2', email: 'elena.marsh2@example.com', hasAccount: false },
      ],
    })
    // The login's id is a way to reach the auth tables; a list has no use for it.
    expect(JSON.stringify(res.body)).not.toContain('userId')
  })

  it('applies no filter to a blank search', async () => {
    const { app, calls } = appFor(ADMIN_USER)
    await request(app).get('/api/admin/patients?q=%20%20')
    expect(calls[0]?.where).toEqual({ AND: [] })
  })

  it('requires every word of the search, each matching name or email', async () => {
    const { app, calls } = appFor(ADMIN_USER)
    await request(app).get('/api/admin/patients?q=elena%20marsh')

    const where = calls[0]?.where as { AND: Array<{ OR: unknown[] }> }
    expect(where.AND).toHaveLength(2)
    expect(where.AND[0]?.OR).toEqual([
      { firstName: { contains: 'elena', mode: 'insensitive' } },
      { lastName: { contains: 'elena', mode: 'insensitive' } },
      { email: { contains: 'elena', mode: 'insensitive' } },
    ])
  })

  it('escapes LIKE wildcards, so a typed % or _ is a character and not "everyone"', async () => {
    const { app, calls } = appFor(ADMIN_USER)
    await request(app).get(`/api/admin/patients?q=${encodeURIComponent('50%_\\')}`)

    const where = calls[0]?.where as { AND: Array<{ OR: Array<{ firstName: { contains: string } }> }> }
    expect(where.AND[0]?.OR[0]?.firstName.contains).toBe('50\\%\\_\\\\')
  })

  it('is stable: surname, first name, then id', async () => {
    const { app, calls } = appFor(ADMIN_USER)
    await request(app).get('/api/admin/patients')
    expect(calls[0]?.orderBy).toEqual([{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }])
  })

  it('reads one past the page, and says so when the extra row exists', async () => {
    const many = Array.from({ length: PATIENT_DIRECTORY_PAGE_SIZE + 1 }, (_, i) => row(i + 1))
    const { app, calls } = appFor(ADMIN_USER, many)
    const res = await request(app).get('/api/admin/patients')

    expect(calls[0]?.take).toBe(PATIENT_DIRECTORY_PAGE_SIZE + 1)
    expect(res.body.patients).toHaveLength(PATIENT_DIRECTORY_PAGE_SIZE)
    expect(res.body.truncated).toBe(true)
  })

  it('is not truncated when the page is exactly full', async () => {
    const full = Array.from({ length: PATIENT_DIRECTORY_PAGE_SIZE }, (_, i) => row(i + 1))
    const { app } = appFor(ADMIN_USER, full)
    const res = await request(app).get('/api/admin/patients')

    expect(res.body.patients).toHaveLength(PATIENT_DIRECTORY_PAGE_SIZE)
    expect(res.body.truncated).toBe(false)
  })

  it('refuses a search over the length cap', async () => {
    const { app, calls } = appFor(ADMIN_USER)
    const res = await request(app).get(`/api/admin/patients?q=${'a'.repeat(101)}`)
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_REQUEST')
    expect(calls).toHaveLength(0)
  })

  it('is not cached', async () => {
    const { app } = appFor(ADMIN_USER)
    const res = await request(app).get('/api/admin/patients')
    expect(res.headers['cache-control']).toBe('no-store')
  })
})
