// Proves GET /api/admin/appointments against real cookies and real rows.
//
// Run with `npm run db:admin-calendar --workspace=@dental/server` after a seed.
//
// The route tests drive this over a stub; what only Postgres can show is the
// endpoint's whole reason to exist — that one call really does return rows
// belonging to two different patients, which no patient-scoped endpoint could
// ever do, and that a cancelled row stays visible rather than disappearing.
//
// The seed's own Monday (`nextMonday()`, not a fixed date) is read off the
// seeded rows themselves rather than recomputed, so this script does not
// drift from whatever `prisma/seed.ts` actually decided "Monday" was.

import type { Server } from 'node:http'
import type { AdminAppointmentsResponse } from '@dental/shared'
import { adminAppointmentsResponse } from '@dental/shared'
import { createApp } from '../src/app'
import { auth } from '../src/auth'
import { databaseIsReachable, prisma } from '../src/db'
import { env } from '../src/env'
import { createClinicCalendar, iso } from '../src/services/clinic-time'

const PASSWORD = 'not-a-real-secret'
const ADMIN = 'dana.whitfield@example.com'
const MARSH = 'elena.marsh@example.com'

// Fixed regardless of which real week the seed ran in — see prisma/seed.ts.
const CLEANING_MON = '4e716000-0000-4000-8000-000000000001'
const CHILD_CLEANING_MON = '4e716000-0000-4000-8000-000000000002'

let failures = 0

function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures += 1
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

type Session = { cookie: string }
const ANONYMOUS: Session = { cookie: '' }

type Envelope = { error?: { code: string; message: string } }

function makeClient(base: string) {
  async function call<T>(path: string, session: Session) {
    const res = await fetch(`${base}${path}`, {
      headers: {
        Origin: env.CLIENT_ORIGIN,
        ...(session.cookie ? { Cookie: session.cookie } : {}),
      },
    })
    const body = (
      res.headers.get('content-type')?.includes('json') ? await res.json() : null
    ) as T & Envelope
    return { status: res.status, headers: res.headers, body }
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

  const getCalendar = (session: Session, query: string) =>
    call<Partial<AdminAppointmentsResponse>>(`/api/admin/appointments?${query}`, session)

  return { signIn, getCalendar }
}

let server: Server | undefined

async function main() {
  const app = createApp({ db: prisma, auth, databaseIsReachable, timeZone: env.CLINIC_TIMEZONE })
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s))
  })
  const { port } = server.address() as { port: number }
  const { signIn, getCalendar } = makeClient(`http://localhost:${port}`)

  console.log(`Admin calendar proof against the ${env.CLINIC_TIMEZONE} clinic on port ${port}.`)
  console.log('Real app, real Better Auth, real Postgres.\n')

  const admin = await signIn(ADMIN)
  const marsh = await signIn(MARSH)

  // The seed's own Monday, read off a row it actually wrote rather than
  // recomputed — `nextMonday()` moves with the calendar this script runs on.
  const cleaningMon = await prisma.appointment.findUniqueOrThrow({
    where: { id: CLEANING_MON },
    select: { startsAt: true },
  })
  const calendar = createClinicCalendar(env.CLINIC_TIMEZONE)
  const monday = iso(calendar.dateOf(cleaningMon.startsAt))
  console.log(`Seeded Monday resolved to ${monday}.\n`)

  // --- Who may call it -------------------------------------------------------
  console.log('Who may call it')

  const byAnonymous = await getCalendar(ANONYMOUS, `from=${monday}`)
  check('a stranger gets 401', byAnonymous.status === 401, `got ${byAnonymous.status}`)

  const byPatient = await getCalendar(marsh, `from=${monday}`)
  check(
    "a signed-in patient gets 403 — this is not their row to read",
    byPatient.status === 403,
    `got ${byPatient.status}`,
  )

  // --- The one thing only Postgres can prove ---------------------------------
  console.log('\nOne call, two patients — what no patient-scoped route can answer')

  const mondayView = await getCalendar(admin, `from=${monday}`)
  check('200, and the body parses as its contract',
    mondayView.status === 200 && adminAppointmentsResponse.safeParse(mondayView.body).success)
  check(
    'not cached — the schedule is as volatile as a patient’s own list',
    mondayView.headers.get('cache-control') === 'no-store',
    String(mondayView.headers.get('cache-control')),
  )

  const mondayRows = mondayView.body.appointments ?? []
  check('both of Monday’s seeded appointments are there', mondayRows.length === 2,
    `${mondayRows.length} rows`)

  const patientNames = new Set(mondayRows.map((row) => row.patient.lastName))
  check(
    'rows belonging to two different patients, in one call',
    patientNames.has('Marsh') && patientNames.has('Nakamura'),
    [...patientNames].join(', '),
  )

  const clarkeOnly = mondayRows.every((row) => row.provider.lastName === 'Clarke')
  check('both are with the seeded provider, Naomi Clarke', clarkeOnly)

  const named = mondayRows.every((row) => row.operatory.name.length > 0)
  check('the room is named — an admin’s business, unlike a patient’s', named)

  // --- A full week aggregates every day of it ---------------------------------
  console.log('\nA week is more than a day')

  const weekView = await getCalendar(admin, `from=${monday}&to=${iso(calendar.addDays(calendar.dateOf(cleaningMon.startsAt), 6))}`)
  check('the whole seeded week comes back as ten appointments',
    (weekView.body.appointments ?? []).length === 10,
    `${(weekView.body.appointments ?? []).length} rows`)

  // --- Range validation, for real ---------------------------------------------
  console.log('\nRange validation')

  const inverted = await getCalendar(admin, `from=${monday}&to=2020-01-01`)
  check('a range ending before it starts is 400 RANGE_INVERTED',
    inverted.status === 400 && inverted.body.error?.code === 'RANGE_INVERTED',
    `${inverted.status} ${inverted.body.error?.code}`)

  const tooLong = await getCalendar(admin, `from=2020-01-01&to=2026-12-31`)
  check('a range past the ceiling is 400 RANGE_TOO_LONG',
    tooLong.status === 400 && tooLong.body.error?.code === 'RANGE_TOO_LONG',
    `${tooLong.status} ${tooLong.body.error?.code}`)

  // --- A cancellation stays visible --------------------------------------------
  console.log('\nA cancelled appointment does not disappear from the day it was on')

  await prisma.appointment.update({
    where: { id: CHILD_CLEANING_MON },
    data: { status: 'CANCELLED' },
  })

  try {
    const afterCancel = await getCalendar(admin, `from=${monday}`)
    const rows = afterCancel.body.appointments ?? []
    check('Monday still shows both rows, not one', rows.length === 2, `${rows.length} rows`)

    const cancelled = rows.find((row) => row.id === CHILD_CLEANING_MON)
    check('the cancelled row is there, marked CANCELLED — not hidden, not deleted',
      cancelled?.status === 'CANCELLED', cancelled?.status)
  } finally {
    await prisma.appointment.update({
      where: { id: CHILD_CLEANING_MON },
      data: { status: 'CONFIRMED' },
    })
  }

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
    await prisma.$disconnect()
  })
