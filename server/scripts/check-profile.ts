// Proves GET/PATCH /api/me/profile against real cookies and real rows.
//
// Run with `npm run db:profile --workspace=@dental/server` after a seed. The
// unit tests drive the route over a stub; this is what a stub cannot show —
// that the seeded values really are on Marsh's row, that a PATCH really lands
// in Postgres, and that a real `@db.Date` column comes back as the civil date
// it holds rather than a timestamp that could roll to the wrong day.
//
// Marsh's row is seed data, not a fixture this script owns, so every value it
// writes is restored before it exits rather than deleted.

import type { Server } from 'node:http'
import type { GetProfileResponse, UpdateProfileResponse } from '@dental/shared'
import { createApp } from '../src/app'
import { auth } from '../src/auth'
import { databaseIsReachable, prisma } from '../src/db'
import { env } from '../src/env'

const PASSWORD = 'not-a-real-secret'
const MARSH = 'elena.marsh@example.com'
const NAKAMURA = 'victor.nakamura@example.com'
const ADMIN = 'dana.whitfield@example.com'

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

  const getProfile = (session: Session) =>
    call<Partial<GetProfileResponse>>('/api/me/profile', session)

  const patchProfile = (session: Session, body: unknown) =>
    call<Partial<UpdateProfileResponse>>('/api/me/profile', session, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })

  return { call, signIn, getProfile, patchProfile }
}

const rowFor = (chartId: string) =>
  prisma.patient.findUniqueOrThrow({
    where: { id: chartId },
    select: { phone: true, dateOfBirth: true, insuranceProvider: true, insuranceMemberId: true },
  })

let server: Server | undefined

async function main() {
  const app = createApp({ db: prisma, auth, databaseIsReachable, timeZone: env.CLINIC_TIMEZONE })
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s))
  })
  const { port } = server.address() as { port: number }
  const { signIn, getProfile, patchProfile } = makeClient(`http://localhost:${port}`)

  console.log(`Profile proof against the ${env.CLINIC_TIMEZONE} clinic on port ${port}.`)
  console.log('Real app, real Better Auth, real Postgres.\n')

  const marsh = await signIn(MARSH)
  const nakamura = await signIn(NAKAMURA)
  const admin = await signIn(ADMIN)

  // `email` is not unique (ADR-0007), so this is a `findFirst`, not a `findUnique`.
  const marshChart = await prisma.patient.findFirstOrThrow({
    where: { email: MARSH },
    select: { id: true },
  })
  const originalRow = await rowFor(marshChart.id)

  // --- Reading the seeded row -----------------------------------------------
  console.log('GET reads what the seed actually wrote')

  const marshGet = await getProfile(marsh)
  check('200 for a signed-in patient', marshGet.status === 200, `${marshGet.status}`)
  check(
    "the seed's own values, not a fixture",
    marshGet.body.profile?.phone === originalRow.phone &&
      marshGet.body.profile?.insuranceProvider === originalRow.insuranceProvider,
    JSON.stringify(marshGet.body.profile),
  )
  // The point of `@db.Date`, proven end to end: the calendar date on the wire
  // matches the one Postgres holds, not a timestamp off by a UTC day.
  check(
    'date of birth is a plain calendar date',
    marshGet.body.profile?.dateOfBirth === originalRow.dateOfBirth?.toISOString().slice(0, 10),
    `${marshGet.body.profile?.dateOfBirth}`,
  )

  const nakamuraGet = await getProfile(nakamura)
  check(
    "an unset field is null, not an empty string or missing key",
    nakamuraGet.body.profile?.insuranceProvider === null,
    JSON.stringify(nakamuraGet.body.profile),
  )

  console.log('\nWho may call it')
  const byAnonymous = await getProfile(ANONYMOUS)
  const byAdmin = await getProfile(admin)
  check('a stranger gets 401', byAnonymous.status === 401, `got ${byAnonymous.status}`)
  check("an admin's login has no chart to read", byAdmin.status === 403, `got ${byAdmin.status}`)

  // --- Writing, and reading it back straight from Postgres ------------------
  console.log('\nPATCH lands in Postgres, not only in the response')

  const written = await patchProfile(marsh, {
    phone: '  (555) 019-2231  ',
    dateOfBirth: '1990-04-12',
    insuranceProvider: 'Coastal Dental Plus',
    insuranceMemberId: 'CDP-1200',
  })

  check('200 with the row it wrote', written.status === 200, `${written.status}`)
  check('the phone number is trimmed', written.body.profile?.phone === '(555) 019-2231')

  const afterWrite = await rowFor(marshChart.id)
  check(
    'Postgres itself has the new insurance id',
    afterWrite.insuranceMemberId === 'CDP-1200',
    afterWrite.insuranceMemberId ?? 'null',
  )
  check(
    'the stored date of birth is the civil date sent, not shifted by a UTC day',
    afterWrite.dateOfBirth?.toISOString().slice(0, 10) === '1990-04-12',
    afterWrite.dateOfBirth?.toISOString(),
  )

  const reread = await getProfile(marsh)
  check('a fresh GET after the PATCH agrees with it', reread.body.profile?.phone === '(555) 019-2231')

  // --- Clearing a field is a real edit ---------------------------------------
  console.log('\nClearing every field')

  const cleared = await patchProfile(marsh, {
    phone: null,
    dateOfBirth: null,
    insuranceProvider: null,
    insuranceMemberId: null,
  })
  check('200 with nulls', cleared.status === 200 && cleared.body.profile?.phone === null)

  const afterClear = await rowFor(marshChart.id)
  check('Postgres agrees the row is cleared', afterClear.insuranceMemberId === null)

  // --- What is refused, and refused without writing --------------------------
  console.log('\nRejected input never reaches the row')

  const future = await patchProfile(marsh, {
    phone: null,
    dateOfBirth: '2099-01-01',
    insuranceProvider: null,
    insuranceMemberId: null,
  })
  check(
    'a date of birth in the future is 400 INVALID_REQUEST',
    future.status === 400 && future.body.error?.code === 'INVALID_REQUEST',
    `${future.status} ${future.body.error?.code}`,
  )
  check('and it wrote nothing', (await rowFor(marshChart.id)).dateOfBirth === null)

  const tooLong = await patchProfile(marsh, {
    phone: 'x'.repeat(40),
    dateOfBirth: null,
    insuranceProvider: null,
    insuranceMemberId: null,
  })
  check(
    'a phone number past the stored length is 400',
    tooLong.status === 400 && tooLong.body.error?.code === 'INVALID_REQUEST',
    `${tooLong.status}`,
  )

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

    // Marsh's row is seed data the rest of this suite (and a human clicking
    // around in dev) relies on, not a fixture this script is free to leave
    // mutated.
    const marshChart = await prisma.patient
      .findFirst({ where: { email: MARSH }, select: { id: true } })
      .catch(() => null)

    if (marshChart) {
      await prisma.patient.update({
        where: { id: marshChart.id },
        data: {
          phone: '+1-555-0142',
          dateOfBirth: new Date('1988-04-17'),
          insuranceProvider: 'Northlake Dental Plan',
          insuranceMemberId: 'NDP-4471902',
        },
      })
      console.log('Restored Marsh’s seeded profile.')
    }

    await prisma.$disconnect()
  })
