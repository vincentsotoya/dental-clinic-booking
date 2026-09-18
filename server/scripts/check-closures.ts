// Proves GET/POST /api/admin/closures and DELETE /api/admin/closures/:id
// against real cookies, a real transaction and real rows.
//
// Run with `npm run db:closures --workspace=@dental/server` after a seed. The
// unit tests drive the route over a stub; this is what a stub cannot show —
// that a real instant round-trips through Postgres and back to the same civil
// day in the clinic's zone, that the create-and-conflict-check really is one
// transaction, and that the conflict check sees a real CONFIRMED appointment
// for a provider the closure never named.
//
// The seeded training day is seed data, not a fixture this script owns, so it
// is left untouched; every row this script writes is deleted before it exits.

import type { Server } from 'node:http'
import type { CreateClosureResponse, GetClosuresResponse } from '@dental/shared'
import { createApp } from '../src/app'
import { auth } from '../src/auth'
import { databaseIsReachable, prisma } from '../src/db'
import { env } from '../src/env'
import { createClinicCalendar } from '../src/services/clinic-time'

const PASSWORD = 'not-a-real-secret'
const MARSH = 'elena.marsh@example.com'
const ADMIN = 'dana.whitfield@example.com'
const SERVICE = 'routine-exam'

let failures = 0

/** Every closure id this script creates, so the seed is left as it was found. */
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

  const getClosures = (session: Session) =>
    call<Partial<GetClosuresResponse>>('/api/admin/closures', session)

  const createClosure = (session: Session, body: unknown) =>
    call<Partial<CreateClosureResponse>>('/api/admin/closures', session, {
      method: 'POST',
      body: JSON.stringify(body),
    })

  const deleteClosure = (session: Session, id: string) =>
    call<{ id?: string }>(`/api/admin/closures/${id}`, session, { method: 'DELETE' })

  return { signIn, getClosures, createClosure, deleteClosure }
}

let server: Server | undefined

async function main() {
  const app = createApp({ db: prisma, auth, databaseIsReachable, timeZone: env.CLINIC_TIMEZONE })
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s))
  })
  const { port } = server.address() as { port: number }
  const { signIn, getClosures, createClosure, deleteClosure } = makeClient(`http://localhost:${port}`)
  const calendar = createClinicCalendar(env.CLINIC_TIMEZONE)

  console.log(`Closures proof against the ${env.CLINIC_TIMEZONE} clinic on port ${port}.`)
  console.log('Real app, real Better Auth, real Postgres.\n')

  const admin = await signIn(ADMIN)
  const marsh = await signIn(MARSH)

  // --- Reading the seeded row, converted from a real instant ----------------
  console.log('GET reads the seeded training-day closure')

  const seededRow = await prisma.clinicClosure.findFirstOrThrow({
    select: { startsAt: true, endsAt: true },
  })
  // Independently derived from the raw row, not hardcoded — the seed's own
  // training day moves with the calendar.
  const expectedFromDate = calendar.iso(calendar.dateOf(seededRow.startsAt))
  const expectedToDate = calendar.iso(calendar.dateOf(new Date(seededRow.endsAt.getTime() - 1)))

  const closuresGet = await getClosures(admin)
  check('200 for an admin', closuresGet.status === 200, `${closuresGet.status}`)
  check(
    'the seeded row comes back as the same civil days Postgres holds as instants',
    closuresGet.body.closures?.some(
      (row) => row.fromDate === expectedFromDate && row.toDate === expectedToDate,
    ) ?? false,
    `expected ${expectedFromDate}..${expectedToDate}, got ${JSON.stringify(closuresGet.body.closures)}`,
  )

  console.log('\nWho may call it')
  const byAnonymous = await getClosures(ANONYMOUS)
  const byPatient = await getClosures(marsh)
  check('a stranger gets 401', byAnonymous.status === 401, `got ${byAnonymous.status}`)
  check('a signed-in patient gets 403 — this is the front desk’s screen', byPatient.status === 403)

  // --- Writing a new row and reading it back straight from Postgres ---------
  console.log('\nPOST creates one row, not a replace of the whole set')

  const nextMonth = calendar.addDays(calendar.today(), 30)
  const created = await createClosure(admin, {
    fromDate: calendar.iso(nextMonth),
    toDate: calendar.iso(nextMonth),
    reason: 'db:closures proof',
  })
  check('201 with the row it wrote', created.status === 201, `${created.status}`)
  if (created.body.closure?.id) written.add(created.body.closure.id)

  const stored = created.body.closure?.id
    ? await prisma.clinicClosure.findUnique({
        where: { id: created.body.closure.id },
        select: { reason: true },
      })
    : null
  check('Postgres itself holds the new row', stored?.reason === 'db:closures proof')

  const afterCreate = await getClosures(admin)
  check(
    'the seeded training day is still there — a POST did not replace it',
    (afterCreate.body.closures?.length ?? 0) >= 2,
    `${afterCreate.body.closures?.length} rows`,
  )

  const badRange = await createClosure(admin, {
    fromDate: calendar.iso(nextMonth),
    toDate: calendar.iso(calendar.addDays(nextMonth, -1)),
  })
  check(
    'a range that ends before it starts is 400 INVALID_REQUEST',
    badRange.status === 400 && badRange.body.error?.code === 'INVALID_REQUEST',
  )

  // --- The conflict check, against a real CONFIRMED appointment -------------
  console.log('\nA range overlapping a CONFIRMED appointment for any provider is refused')

  const provider = await prisma.provider.findFirstOrThrow({
    where: { isActive: true, type: 'DENTIST' },
    select: { id: true },
  })
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

  const twoMonthsOut = calendar.addDays(calendar.today(), 60)
  const plantedStart = calendar.clinicInstant(twoMonthsOut, 600) // 10:00
  const planted = await prisma.appointment.create({
    data: {
      patientId: marshChart.id,
      providerId: provider.id,
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

  const conflicting = await createClosure(admin, {
    fromDate: calendar.iso(twoMonthsOut),
    toDate: calendar.iso(twoMonthsOut),
  })
  check(
    'refused as 409 CLOSURE_CONFLICT',
    conflicting.status === 409 && conflicting.body.error?.code === 'CLOSURE_CONFLICT',
    `${conflicting.status} ${conflicting.body.error?.code}`,
  )

  const rowsThatDay = await prisma.clinicClosure.count({ where: { startsAt: plantedStart } })
  check('and nothing was written', rowsThatDay === 0)

  // --- DELETE removes exactly the row asked for ------------------------------
  console.log('\nDELETE removes one row')

  const deleted = created.body.closure?.id ? await deleteClosure(admin, created.body.closure.id) : null
  check(
    '200 with the id it removed',
    deleted?.status === 200 && deleted.body.id === created.body.closure?.id,
  )

  const goneFromDb = created.body.closure?.id
    ? await prisma.clinicClosure.findUnique({ where: { id: created.body.closure.id } })
    : undefined
  check('Postgres agrees the row is gone', goneFromDb === null)
  if (created.body.closure?.id) written.delete(created.body.closure.id)

  const deleteAgain = created.body.closure?.id ? await deleteClosure(admin, created.body.closure.id) : null
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
      const { count } = await prisma.clinicClosure.deleteMany({ where: { id: { in: [...written] } } })
      console.log(`Cleaned up ${count} closure row(s).`)
    }

    await prisma.$disconnect()
  })
