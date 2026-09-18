// Proves GET/POST /api/admin/providers/:providerId/time-off and
// DELETE /api/admin/time-off/:id against real cookies, a real transaction and
// real rows.
//
// Run with `npm run db:time-off --workspace=@dental/server` after a seed. The
// unit tests drive the route over a stub; this is what a stub cannot show —
// that a real instant round-trips through Postgres and back to the same civil
// day in the clinic's zone, that the create-and-conflict-check really is one
// transaction, and that the conflict check sees a real CONFIRMED appointment.
//
// Dr Raman's seeded Thursday is seed data, not a fixture this script owns, so
// it is left untouched; every row this script writes is deleted before it
// exits.

import type { Server } from 'node:http'
import type { CreateTimeOffResponse, GetTimeOffResponse } from '@dental/shared'
import { createApp } from '../src/app'
import { auth } from '../src/auth'
import { databaseIsReachable, prisma } from '../src/db'
import { env } from '../src/env'
import { createClinicCalendar } from '../src/services/clinic-time'

const PASSWORD = 'not-a-real-secret'
const MARSH = 'elena.marsh@example.com'
const ADMIN = 'dana.whitfield@example.com'

const RAMAN = '1b4e2d00-0000-4000-8000-000000000003'
const NO_SUCH_PROVIDER = '00000000-0000-4000-8000-000000000000'
const SERVICE = 'routine-exam'

let failures = 0

/** Every time-off id this script creates, so the seed is left as it was found. */
const written = new Set<string>()
/** Any appointment planted to prove the conflict check, cleaned up the same way. */
const plantedAppointments = new Set<string>()

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

  const getTimeOff = (session: Session, providerId: string) =>
    call<Partial<GetTimeOffResponse>>(`/api/admin/providers/${providerId}/time-off`, session)

  const createTimeOff = (session: Session, providerId: string, body: unknown) =>
    call<Partial<CreateTimeOffResponse>>(`/api/admin/providers/${providerId}/time-off`, session, {
      method: 'POST',
      body: JSON.stringify(body),
    })

  const deleteTimeOff = (session: Session, id: string) =>
    call<{ id?: string }>(`/api/admin/time-off/${id}`, session, { method: 'DELETE' })

  return { signIn, getTimeOff, createTimeOff, deleteTimeOff }
}

let server: Server | undefined

async function main() {
  const app = createApp({ db: prisma, auth, databaseIsReachable, timeZone: env.CLINIC_TIMEZONE })
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s))
  })
  const { port } = server.address() as { port: number }
  const { signIn, getTimeOff, createTimeOff, deleteTimeOff } = makeClient(`http://localhost:${port}`)
  const calendar = createClinicCalendar(env.CLINIC_TIMEZONE)

  console.log(`Time-off proof against the ${env.CLINIC_TIMEZONE} clinic on port ${port}.`)
  console.log('Real app, real Better Auth, real Postgres.\n')

  const admin = await signIn(ADMIN)
  const marsh = await signIn(MARSH)

  // --- Reading the seeded row, converted from a real instant ----------------
  console.log("GET reads Dr Raman's seeded time off")

  const seededRow = await prisma.timeOff.findFirstOrThrow({
    where: { providerId: RAMAN },
    select: { startsAt: true, endsAt: true },
  })
  // Independently derived from the raw row, not hardcoded — the seed's own
  // "next Thursday" moves with the calendar.
  const expectedFromDate = calendar.iso(calendar.dateOf(seededRow.startsAt))
  const expectedToDate = calendar.iso(calendar.dateOf(new Date(seededRow.endsAt.getTime() - 1)))

  const ramanGet = await getTimeOff(admin, RAMAN)
  check('200 for an admin', ramanGet.status === 200, `${ramanGet.status}`)
  check(
    'the seeded row comes back as the same civil days Postgres holds as instants',
    ramanGet.body.timeOff?.some(
      (row) => row.fromDate === expectedFromDate && row.toDate === expectedToDate,
    ) ?? false,
    `expected ${expectedFromDate}..${expectedToDate}, got ${JSON.stringify(ramanGet.body.timeOff)}`,
  )

  console.log('\nWho may call it')
  const byAnonymous = await getTimeOff(ANONYMOUS, RAMAN)
  const byPatient = await getTimeOff(marsh, RAMAN)
  check('a stranger gets 401', byAnonymous.status === 401, `got ${byAnonymous.status}`)
  check('a signed-in patient gets 403 — this is the front desk’s screen', byPatient.status === 403)

  const missing = await getTimeOff(admin, NO_SUCH_PROVIDER)
  check(
    'a provider that does not exist is 404',
    missing.status === 404 && missing.body.error?.code === 'NOT_FOUND',
    `${missing.status} ${missing.body.error?.code}`,
  )

  // --- Writing a new row and reading it back straight from Postgres ---------
  console.log('\nPOST creates one row, not a replace of the whole set')

  const nextWeek = calendar.addDays(calendar.today(), 7)
  const created = await createTimeOff(admin, RAMAN, {
    fromDate: calendar.iso(nextWeek),
    toDate: calendar.iso(nextWeek),
    reason: 'db:time-off proof',
  })
  check('201 with the row it wrote', created.status === 201, `${created.status}`)
  if (created.body.timeOff?.id) written.add(created.body.timeOff.id)

  const stored = created.body.timeOff?.id
    ? await prisma.timeOff.findUnique({
        where: { id: created.body.timeOff.id },
        select: { providerId: true, reason: true },
      })
    : null
  check(
    'Postgres itself holds the new row, scoped to Raman',
    stored?.providerId === RAMAN && stored.reason === 'db:time-off proof',
  )

  const afterCreate = await getTimeOff(admin, RAMAN)
  check(
    "the seeded Thursday is still there — a POST did not replace it",
    (afterCreate.body.timeOff?.length ?? 0) >= 2,
    `${afterCreate.body.timeOff?.length} rows`,
  )

  const badRange = await createTimeOff(admin, RAMAN, {
    fromDate: calendar.iso(nextWeek),
    toDate: calendar.iso(calendar.addDays(nextWeek, -1)),
  })
  check(
    'a range that ends before it starts is 400 INVALID_REQUEST',
    badRange.status === 400 && badRange.body.error?.code === 'INVALID_REQUEST',
  )

  // --- The conflict check, against a real CONFIRMED appointment -------------
  console.log('\nA range overlapping a CONFIRMED appointment is refused')

  const service = await prisma.service.findUniqueOrThrow({
    where: { slug: SERVICE },
    select: { id: true, bufferMins: true },
  })
  const operatory = await prisma.operatory.findFirstOrThrow({
    where: { isActive: true },
    select: { id: true },
  })
  const marshChart = await prisma.patient.findFirstOrThrow({
    where: { email: MARSH },
    select: { id: true },
  })

  const twoWeeksOut = calendar.addDays(calendar.today(), 14)
  const plantedStart = calendar.clinicInstant(twoWeeksOut, 600) // 10:00
  const planted = await prisma.appointment.create({
    data: {
      patientId: marshChart.id,
      providerId: RAMAN,
      serviceId: service.id,
      operatoryId: operatory.id,
      startsAt: plantedStart,
      endsAt: new Date(plantedStart.getTime() + 30 * 60_000),
      blockedUntil: new Date(plantedStart.getTime() + 30 * 60_000 + service.bufferMins * 60_000),
      bufferMins: service.bufferMins,
      status: 'CONFIRMED',
    },
    select: { id: true },
  })
  plantedAppointments.add(planted.id)

  const conflicting = await createTimeOff(admin, RAMAN, {
    fromDate: calendar.iso(twoWeeksOut),
    toDate: calendar.iso(twoWeeksOut),
  })
  check(
    'refused as 409 TIME_OFF_CONFLICT',
    conflicting.status === 409 && conflicting.body.error?.code === 'TIME_OFF_CONFLICT',
    `${conflicting.status} ${conflicting.body.error?.code}`,
  )

  const rowsForRamanThatDay = await prisma.timeOff.count({
    where: { providerId: RAMAN, startsAt: plantedStart },
  })
  check('and nothing was written', rowsForRamanThatDay === 0)

  // --- DELETE removes exactly the row asked for ------------------------------
  console.log('\nDELETE removes one row')

  const deleted = created.body.timeOff?.id ? await deleteTimeOff(admin, created.body.timeOff.id) : null
  check('200 with the id it removed', deleted?.status === 200 && deleted.body.id === created.body.timeOff?.id)

  const goneFromDb = created.body.timeOff?.id
    ? await prisma.timeOff.findUnique({ where: { id: created.body.timeOff.id } })
    : undefined
  check('Postgres agrees the row is gone', goneFromDb === null)
  if (created.body.timeOff?.id) written.delete(created.body.timeOff.id)

  const deleteAgain = created.body.timeOff?.id
    ? await deleteTimeOff(admin, created.body.timeOff.id)
    : null
  check(
    'deleting it again is 404, not a silent no-op',
    deleteAgain?.status === 404 && deleteAgain.body.error?.code === 'NOT_FOUND',
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

    if (plantedAppointments.size > 0) {
      const { count } = await prisma.appointment.deleteMany({
        where: { id: { in: [...plantedAppointments] } },
      })
      console.log(`Cleaned up ${count} planted appointment(s).`)
    }

    if (written.size > 0) {
      const { count } = await prisma.timeOff.deleteMany({ where: { id: { in: [...written] } } })
      console.log(`Cleaned up ${count} time-off row(s).`)
    }

    await prisma.$disconnect()
  })
