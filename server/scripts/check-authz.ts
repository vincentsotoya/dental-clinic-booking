// Proves the authorization rules against real cookies and real rows.
//
// Run with `npm run db:authz --workspace=@dental/server` after a seed. The unit
// tests drive the guards over stubs; this drives them over Better Auth issuing
// real sessions and Postgres holding real charts.
//
// The middleware, the auth instance and the database are production code. The
// `/probe` routes are not: they stand in for the Phase 4 appointment routes
// that do not exist yet, because "patient A cannot touch patient B's anything"
// needs a route addressed by an id to be a claim about anything at all. They
// are the shape those handlers will take — a WHERE clause, not a comparison
// (ADR-0007).

import express from 'express'
import type { Server } from 'node:http'
import { toNodeHandler } from 'better-auth/node'
import { type MeResponse, meResponse } from '@dental/shared'
import { auth } from '../src/auth'
import { prisma } from '../src/db'
import { env } from '../src/env'
import { createAuthMiddleware } from '../src/middleware/auth'
import { getAuth } from '../src/middleware/auth-context'
import { errorHandler } from '../src/routes/errors'
import { createMeRouter } from '../src/routes/me'

const PASSWORD = 'not-a-real-secret'

const LOGINS = {
  marsh: 'elena.marsh@example.com',
  nakamura: 'victor.nakamura@example.com',
  admin: 'dana.whitfield@example.com',
} as const

let failures = 0

function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures += 1
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

// --- The app under test -----------------------------------------------------

function buildApp() {
  const { attachSession, requireAuth, requireRole } = createAuthMiddleware({ auth, db: prisma })
  const app = express()

  app.all('/api/auth/*splat', toNodeHandler(auth))
  app.use(express.json())
  app.use('/api', createMeRouter({ attachSession, db: prisma }))

  app.get('/probe/guarded', requireAuth, (req, res) => {
    res.json({ role: getAuth(req).user.role })
  })

  app.get('/probe/admin', requireRole('ADMIN'), (_req, res) => {
    res.json({ ok: true })
  })

  // Phase 4's shape. The caller's chart id is part of the query, so a stranger's
  // id and a deleted id both return no rows and both answer 404 — the row's
  // existence is never disclosed. An admin is the one branch that skips scoping.
  const scope = (req: express.Request) => {
    const { user, patientId } = getAuth(req)
    return user.role === 'ADMIN' ? {} : { patientId: patientId ?? '' }
  }

  app.get('/probe/appointments', requireAuth, async (req, res) => {
    const rows = await prisma.appointment.findMany({
      where: scope(req),
      select: { id: true },
      orderBy: { startsAt: 'asc' },
    })
    res.json({ ids: rows.map((row) => row.id) })
  })

  app.get('/probe/appointments/:id', requireAuth, async (req, res) => {
    const row = await prisma.appointment.findFirst({
      where: { id: String(req.params.id), ...scope(req) },
      select: { id: true, patientId: true },
    })

    if (!row) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No such appointment.' } })
      return
    }

    res.json(row)
  })

  app.use(errorHandler)
  return app
}

// --- A cookie jar, because fetch has none -----------------------------------

type Session = { cookie: string; label: string }

const ANONYMOUS: Session = { cookie: '', label: 'anonymous' }

/** What the probe routes answer. Narrow on purpose — an assertion on a typo should not compile. */
type ProbeBody = {
  role?: string
  ok?: boolean
  id?: string
  ids?: string[]
  error?: { code: string; message: string }
}

function makeClient(base: string) {
  async function call<T = ProbeBody>(path: string, session: Session, init: RequestInit = {}) {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        // A browser always sends this, and Better Auth's CSRF check rejects a
        // state-changing request without it.
        Origin: env.CLIENT_ORIGIN,
        ...(session.cookie ? { Cookie: session.cookie } : {}),
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    })

    const body = (
      res.headers.get('content-type')?.includes('json') ? await res.json() : null
    ) as T
    return { status: res.status, body, setCookie: res.headers.getSetCookie() }
  }

  async function signIn(email: string): Promise<Session> {
    const res = await call('/api/auth/sign-in/email', ANONYMOUS, {
      method: 'POST',
      body: JSON.stringify({ email, password: PASSWORD }),
    })

    if (res.status !== 200) throw new Error(`sign-in failed for ${email}: ${res.status}`)

    const cookie = res.setCookie.map((c) => c.split(';')[0]).join('; ')
    return { cookie, label: email.split('@')[0]! }
  }

  return { call, signIn }
}

let server: Server | undefined

async function main() {
  const app = buildApp()
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s))
  })
  const { port } = server.address() as { port: number }
  const { call, signIn } = makeClient(`http://localhost:${port}`)

  console.log(`Authz proof against ${env.CLINIC_TIMEZONE} clinic on port ${port}.`)
  console.log('Real Better Auth, real Postgres, real cookies. /probe routes stand in for Phase 4.\n')

  // --- Sign-in ------------------------------------------------------------
  console.log('Sign-in over HTTP')
  const marsh = await signIn(LOGINS.marsh)
  const nakamura = await signIn(LOGINS.nakamura)
  const admin = await signIn(LOGINS.admin)
  check('three logins issue session cookies', [marsh, nakamura, admin].every((s) => s.cookie !== ''))

  const wrong = await call('/api/auth/sign-in/email', ANONYMOUS, {
    method: 'POST',
    body: JSON.stringify({ email: LOGINS.marsh, password: 'not-the-password' }),
  })
  check('a wrong password is refused', wrong.status === 401, `got ${wrong.status}`)

  // --- Identity is scoped to the cookie -----------------------------------
  console.log('\nGET /api/me')
  // Parsed through the shared schema, not poked at: this doubles as proof that
  // a real response satisfies the contract the client imports.
  const readMe = async (session: Session): Promise<MeResponse> => {
    const res = await call<MeResponse>('/api/me', session)
    return meResponse.parse(res.body)
  }

  const anonymous = await call<MeResponse>('/api/me', ANONYMOUS)
  const marshMe = await readMe(marsh)
  const nakamuraMe = await readMe(nakamura)
  const adminMe = await readMe(admin)

  check('anonymous is answered, not refused', anonymous.status === 200)
  check('anonymous carries no identity', meResponse.parse(anonymous.body).user === null)
  check('Marsh sees Marsh', marshMe.patient?.email === LOGINS.marsh, marshMe.patient?.id)
  check('Nakamura sees Nakamura', nakamuraMe.patient?.email === LOGINS.nakamura)
  check('the two patients get different charts', marshMe.patient?.id !== nakamuraMe.patient?.id)
  check('the admin has no chart', adminMe.user?.role === 'ADMIN' && adminMe.patient === null)
  check(
    'no insurance, date of birth or phone on the wire',
    !/insurance|dateOfBirth|phone/i.test(JSON.stringify(marshMe)),
  )

  // --- The guards ----------------------------------------------------------
  console.log('\nrequireAuth / requireRole')
  const guarded = {
    anonymous: await call('/probe/guarded', ANONYMOUS),
    marsh: await call('/probe/guarded', marsh),
  }
  check('401 for a stranger', guarded.anonymous.status === 401, guarded.anonymous.body?.error?.code)
  check('200 for a patient', guarded.marsh.status === 200)

  const adminOnly = {
    anonymous: await call('/probe/admin', ANONYMOUS),
    marsh: await call('/probe/admin', marsh),
    admin: await call('/probe/admin', admin),
  }
  check('403 when a patient asks for an admin route', adminOnly.marsh.status === 403)
  check('200 for the admin', adminOnly.admin.status === 200)
  // Unidentified, not forbidden — and 403 would confirm the route exists.
  check('401 before 403 for a stranger', adminOnly.anonymous.status === 401)

  // --- Patient A cannot touch patient B's anything -------------------------
  console.log("\nPatient A against patient B's rows")
  const listFor = async (session: Session): Promise<string[]> =>
    (await call('/probe/appointments', session)).body.ids ?? []

  const lists = {
    marsh: await listFor(marsh),
    nakamura: await listFor(nakamura),
    admin: await listFor(admin),
  }
  const overlap = lists.marsh.filter((id) => lists.nakamura.includes(id))

  // Counted from the rows rather than hardcoded, and compared exactly. A
  // `length > 0` here would have reported "ok" while she read all ten.
  const owned = async (chartId: string | undefined) =>
    prisma.appointment.count({ where: { patientId: chartId ?? '' } })
  const marshOwns = await owned(marshMe.patient?.id)
  const nakamuraOwns = await owned(nakamuraMe.patient?.id)

  check(
    'Marsh lists exactly her own',
    lists.marsh.length === marshOwns,
    `${lists.marsh.length} of her ${marshOwns}`,
  )
  check(
    'Nakamura lists exactly his own',
    lists.nakamura.length === nakamuraOwns,
    `${lists.nakamura.length} of his ${nakamuraOwns}`,
  )
  check('the two lists are disjoint', overlap.length === 0, `${overlap.length} shared`)
  check(
    'together they are every appointment',
    lists.marsh.length + lists.nakamura.length === lists.admin.length,
    `${lists.marsh.length} + ${lists.nakamura.length} vs ${lists.admin.length} for the admin`,
  )

  const hers = lists.marsh[0]!
  const his = lists.nakamura[0]!
  const missing = '00000000-0000-4000-8000-000000000000'

  const own = await call(`/probe/appointments/${hers}`, marsh)
  const other = await call(`/probe/appointments/${his}`, marsh)
  const gone = await call(`/probe/appointments/${missing}`, marsh)
  const byAdmin = await call(`/probe/appointments/${his}`, admin)

  check('Marsh reads her own appointment', own.status === 200)
  check("Marsh cannot read Nakamura's", other.status === 404, `got ${other.status}`)
  check('the row she was refused really exists', byAdmin.status === 200 && byAdmin.body.id === his)
  // The point of the 404: "not yours" and "not there" must be one answer, or
  // walking ids counts the clinic's bookings. See ADR-0007.
  check(
    "a stranger's row is indistinguishable from a missing one",
    other.status === gone.status && JSON.stringify(other.body) === JSON.stringify(gone.body),
  )

  // --- Cookies that should not work ---------------------------------------
  console.log('\nCookies that must not authenticate')
  const forged = { cookie: 'better-auth.session_token=totally.made.up', label: 'forged' }
  const forgedRes = await call<MeResponse>('/api/me', forged)
  check(
    'a forged cookie reads as anonymous',
    forgedRes.status === 200 && meResponse.parse(forgedRes.body).user === null,
  )
  check('a forged cookie is refused by requireAuth', (await call('/probe/guarded', forged)).status === 401)

  // A genuine cookie is `<session id>.<signature>`. Flipping a character in
  // the middle of either half — never the trailing %3D, which is base64 padding
  // and would fail on decoding rather than on verification.
  const flip = (text: string) => {
    const at = Math.floor(text.length / 2)
    return text.slice(0, at) + (text[at] === 'a' ? 'b' : 'a') + text.slice(at + 1)
  }

  const [id, signature] = marsh.cookie.split('.') as [string, string]
  const swappedId = { cookie: `${flip(id)}.${signature}`, label: 'swapped id' }
  const forgedSignature = { cookie: `${id}.${flip(signature)}`, label: 'forged signature' }

  check(
    'a session id edited under a valid signature is rejected',
    (await call('/probe/guarded', swappedId)).status === 401,
  )
  check(
    'a genuine session id under an edited signature is rejected',
    (await call('/probe/guarded', forgedSignature)).status === 401,
  )

  // --- Sign-out ------------------------------------------------------------
  console.log('\nSign-out')
  const doomed = await signIn(LOGINS.marsh)
  const before = await call('/probe/guarded', doomed)
  const signOut = await call('/api/auth/sign-out', doomed, { method: 'POST', body: '{}' })
  const after = await call('/probe/guarded', doomed)

  check('the session worked before sign-out', before.status === 200)
  check('sign-out succeeds', signOut.status === 200, `got ${signOut.status}`)
  // Replaying the exact token: proves the session died server-side rather than
  // the client merely forgetting it.
  check('replaying the token afterwards fails', after.status === 401, `got ${after.status}`)

  server.close()

  console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} FAILED.`}`)
  if (failures > 0) process.exitCode = 1
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    // Both, always. A thrown check used to leave the listener open and the
    // process hanging, which hides the failure it was meant to report.
    server?.close()
    await prisma.$disconnect()
  })
