// Proves GET/PATCH /api/admin/providers/:providerId/working-hours against
// real cookies, a real transaction and real rows.
//
// Run with `npm run db:working-hours --workspace=@dental/server` after a
// seed. The unit tests drive the route over a stub; this is what a stub
// cannot show — that the delete-and-recreate really is one transaction (a
// rejected overlap leaves the old rows untouched, not half-deleted), and
// that a real `Weekday` enum round-trips through Postgres in the order this
// app expects.
//
// Naomi Clarke's row is seed data, not a fixture this script owns, so every
// value it writes is restored before it exits rather than deleted.

import type { Server } from 'node:http'
import type { GetWorkingHoursResponse, UpdateWorkingHoursResponse } from '@dental/shared'
import { createApp } from '../src/app'
import { auth } from '../src/auth'
import { databaseIsReachable, prisma } from '../src/db'
import { env } from '../src/env'

const PASSWORD = 'not-a-real-secret'
const MARSH = 'elena.marsh@example.com'
const ADMIN = 'dana.whitfield@example.com'

const CLARKE = '1b4e2d00-0000-4000-8000-000000000004'
const NO_SUCH_PROVIDER = '00000000-0000-4000-8000-000000000000'

let failures = 0

function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures += 1
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

type Session = { cookie: string }
const ANONYMOUS: Session = { cookie: '' }

type Envelope = { error?: { code: string; message: string } }

function makeClient(base: string) {
  async function call<T>(path: string, session: Session, init: RequestInit = {}) {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        Origin: env.CLIENT_ORIGIN,
        ...(session.cookie ? { Cookie: session.cookie } : {}),
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    })
    const body = (
      res.headers.get('content-type')?.includes('json') ? await res.json() : null
    ) as T & Envelope
    return { status: res.status, body }
  }

  async function signIn(email: string): Promise<Session> {
    const res = await fetch(`${base}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { Origin: env.CLIENT_ORIGIN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD }),
    })
    if (res.status !== 200) throw new Error(`sign-in failed for ${email}: ${res.status}`)
    return { cookie: res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') }
  }

  const getWeek = (session: Session, providerId: string) =>
    call<Partial<GetWorkingHoursResponse>>(`/api/admin/providers/${providerId}/working-hours`, session)

  const patchWeek = (session: Session, providerId: string, body: unknown) =>
    call<Partial<UpdateWorkingHoursResponse>>(`/api/admin/providers/${providerId}/working-hours`, session, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })

  return { signIn, getWeek, patchWeek }
}

const rowsFor = (providerId: string) =>
  prisma.workingHours.findMany({
    where: { providerId },
    select: { weekday: true, startMinute: true, endMinute: true },
    orderBy: [{ startMinute: 'asc' }],
  })

type SeededRow = Awaited<ReturnType<typeof rowsFor>>[number]

let server: Server | undefined
// Captured as early as possible and restored from in `finally`, independent
// of how far `main` got — the same reasoning `check-profile.ts` restores
// Marsh's row from a fresh query rather than trusting a mutation completed.
let seededRows: SeededRow[] | undefined

async function main() {
  const app = createApp({ db: prisma, auth, databaseIsReachable, timeZone: env.CLINIC_TIMEZONE })
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s))
  })
  const { port } = server.address() as { port: number }
  const { signIn, getWeek, patchWeek } = makeClient(`http://localhost:${port}`)

  console.log(`Working-hours proof against the ${env.CLINIC_TIMEZONE} clinic on port ${port}.`)
  console.log('Real app, real Better Auth, real Postgres.\n')

  const admin = await signIn(ADMIN)
  const marsh = await signIn(MARSH)

  seededRows = await rowsFor(CLARKE)

  // --- Reading the seeded week -----------------------------------------------
  console.log("GET reads Naomi Clarke's own seeded week")

  const clarkeGet = await getWeek(admin, CLARKE)
  check('200 for an admin', clarkeGet.status === 200, `${clarkeGet.status}`)
  check(
    'ten windows — Monday through Friday, morning and afternoon',
    clarkeGet.body.workingHours?.length === 10,
    `${clarkeGet.body.workingHours?.length}`,
  )
  check(
    'Monday first — the response is sorted, not whatever order Postgres returned',
    clarkeGet.body.workingHours?.[0]?.weekday === 'MONDAY' &&
      clarkeGet.body.workingHours[0].startMinute === 480,
    JSON.stringify(clarkeGet.body.workingHours?.[0]),
  )

  console.log('\nWho may call it')
  const byAnonymous = await getWeek(ANONYMOUS, CLARKE)
  const byPatient = await getWeek(marsh, CLARKE)
  check('a stranger gets 401', byAnonymous.status === 401, `got ${byAnonymous.status}`)
  check('a signed-in patient gets 403 — this is the front desk’s screen', byPatient.status === 403)

  const missing = await getWeek(admin, NO_SUCH_PROVIDER)
  check(
    'a provider that does not exist is 404, not an empty week',
    missing.status === 404 && missing.body.error?.code === 'NOT_FOUND',
    `${missing.status} ${missing.body.error?.code}`,
  )

  // --- Writing, and reading it back straight from Postgres ------------------
  console.log('\nPATCH replaces the whole week in one transaction')

  const newWeek = [{ weekday: 'MONDAY', startMinute: 540, endMinute: 600 }]
  const written = await patchWeek(admin, CLARKE, { workingHours: newWeek })
  check('200 with the week it wrote', written.status === 200, `${written.status}`)
  check('exactly the one window sent back', written.body.workingHours?.length === 1)

  const afterWrite = await rowsFor(CLARKE)
  check(
    'Postgres itself now holds one row, not eleven — the old ten were really deleted',
    afterWrite.length === 1 && afterWrite[0]?.startMinute === 540,
    `${afterWrite.length} rows`,
  )

  // --- What is refused, and refused without touching the row ----------------
  console.log('\nRejected input never reaches the transaction')

  const overlap = await patchWeek(admin, CLARKE, {
    workingHours: [
      { weekday: 'TUESDAY', startMinute: 480, endMinute: 720 },
      { weekday: 'TUESDAY', startMinute: 700, endMinute: 900 },
    ],
  })
  check(
    'an overlapping pair is 400 INVALID_REQUEST',
    overlap.status === 400 && overlap.body.error?.code === 'INVALID_REQUEST',
    `${overlap.status} ${overlap.body.error?.code}`,
  )

  const afterOverlapAttempt = await rowsFor(CLARKE)
  check(
    'and Postgres still has the one Monday window from before — nothing was deleted',
    afterOverlapAttempt.length === 1 && afterOverlapAttempt[0]?.weekday === 'MONDAY',
    `${afterOverlapAttempt.length} rows`,
  )

  const missingWrite = await patchWeek(admin, NO_SUCH_PROVIDER, { workingHours: newWeek })
  check(
    'writing a provider that does not exist is 404',
    missingWrite.status === 404 && missingWrite.body.error?.code === 'NOT_FOUND',
  )
  const orphanRows = await rowsFor(NO_SUCH_PROVIDER)
  check('and creates no orphan rows', orphanRows.length === 0, `${orphanRows.length} rows`)

  // --- Clearing every window is a real edit, the same as any other value ----
  console.log('\nAn empty week is a real write, not a no-op')

  const cleared = await patchWeek(admin, CLARKE, { workingHours: [] })
  check('200 with an empty week', cleared.status === 200 && cleared.body.workingHours?.length === 0)
  const afterClear = await rowsFor(CLARKE)
  check('Postgres agrees Clarke has no working hours at all', afterClear.length === 0)

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
    server?.close()

    if (seededRows) {
      await prisma.workingHours.deleteMany({ where: { providerId: CLARKE } })
      await prisma.workingHours.createMany({
        data: seededRows.map((row) => ({ providerId: CLARKE, ...row })),
      })
      console.log("Restored Naomi Clarke's seeded working hours.")
    }

    await prisma.$disconnect()
  })
