// Proves PATCH /api/appointments/:id/cancel against real cookies, real rows and
// a real race.
//
// Run with `npm run db:cancel --workspace=@dental/server` after a seed. The unit
// tests drive the route over a stub, which can refuse and can flip a field but
// cannot hold a row lock — and cannot show that a cancelled row stops blocking
// its slot, which is the whole reason cancellation is a status and not a delete.
//
// The race is the one this route is shaped around: the front desk marking an
// appointment COMPLETED while the patient is cancelling it. It is pinned in an
// open transaction rather than fired concurrently and hoped over. Every row this
// script writes is deleted before it exits.

import type { Server } from 'node:http'
import type {
  AvailabilityResponse,
  AvailabilitySlot,
  BookAppointmentResponse,
  CancelAppointmentResponse,
} from '@dental/shared'
import { createApp } from '../src/app'
import { auth } from '../src/auth'
import { databaseIsReachable, prisma } from '../src/db'
import { env } from '../src/env'

const PASSWORD = 'not-a-real-secret'
const MARSH = 'elena.marsh@example.com'
const NAKAMURA = 'victor.nakamura@example.com'
const ADMIN = 'dana.whitfield@example.com'
const SERVICE = 'routine-exam'
const NEVER_EXISTED = '00000000-0000-4000-8000-000000000000'

let failures = 0

/** Every appointment id this script creates, so the seed is left as it was found. */
const written = new Set<string>()

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
        // Better Auth's CSRF check rejects a state-changing request without it.
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

  async function chartId(session: Session): Promise<string | null> {
    const res = await call<{ patient: { id: string } | null }>('/api/me', session)
    return res.body.patient?.id ?? null
  }

  const book = async (session: Session, slot: AvailabilitySlot) => {
    const res = await call<Partial<BookAppointmentResponse>>('/api/appointments', session, {
      method: 'POST',
      body: JSON.stringify({
        service: SERVICE,
        providerId: slot.providerId,
        startsAt: slot.startsAt,
      }),
    })
    if (res.body.appointment?.id) written.add(res.body.appointment.id)
    return res
  }

  const cancel = (session: Session, id: string) =>
    call<Partial<CancelAppointmentResponse>>(`/api/appointments/${id}/cancel`, session, {
      method: 'PATCH',
    })

  return { call, signIn, chartId, book, cancel }
}

const statusOf = async (id: string) =>
  (await prisma.appointment.findUnique({ where: { id }, select: { status: true } }))?.status ?? null

let server: Server | undefined

async function main() {
  const app = createApp({ db: prisma, auth, databaseIsReachable, timeZone: env.CLINIC_TIMEZONE })
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s))
  })
  const { port } = server.address() as { port: number }
  const { call, signIn, chartId, book, cancel } = makeClient(`http://localhost:${port}`)

  console.log(`Cancellation proof against the ${env.CLINIC_TIMEZONE} clinic on port ${port}.`)
  console.log('Real app, real Better Auth, real Postgres.\n')

  const marsh = await signIn(MARSH)
  const nakamura = await signIn(NAKAMURA)
  const admin = await signIn(ADMIN)
  const marshChart = await chartId(marsh)
  const nakamuraChart = await chartId(nakamura)
  if (!marshChart || !nakamuraChart) throw new Error('Seeded patients have no charts; reseed.')

  // --- Slots to work with --------------------------------------------------

  const day = (offset: number) =>
    new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)

  const offered = await call<AvailabilityResponse>(
    `/api/availability?service=${SERVICE}&from=${day(2)}&to=${day(9)}`,
    ANONYMOUS,
  )
  const slots = offered.body.slots ?? []
  if (slots.length < 4) throw new Error(`Need four free slots, saw ${slots.length}. Reseed.`)

  const [first, second, third, fourth] = slots as [
    AvailabilitySlot,
    AvailabilitySlot,
    AvailabilitySlot,
    AvailabilitySlot,
  ]

  // --- Cancelling your own -------------------------------------------------
  console.log('A patient cancels their own appointment')

  const booked = await book(marsh, first)
  const id = booked.body.appointment?.id
  if (!id) throw new Error(`Could not book a slot to cancel: ${booked.status}`)

  const cancelled = await cancel(marsh, id)
  check(
    'the cancellation answers 200 with the row',
    cancelled.status === 200 && cancelled.body.appointment?.id === id,
    `${cancelled.status}`,
  )
  check('the response says CANCELLED', cancelled.body.appointment?.status === 'CANCELLED')
  check('the row in Postgres says CANCELLED', (await statusOf(id)) === 'CANCELLED')

  // The point of a status rather than a DELETE: the row survives, so a patient
  // who cancelled yesterday sees that they cancelled rather than nothing.
  check('the appointment still exists', (await prisma.appointment.count({ where: { id } })) === 1)

  // And the point of the *partial* exclusion index: a cancelled row is not in
  // it, so the slot it was holding is free the instant it is cancelled.
  const rebooked = await book(marsh, first)
  check(
    'the freed slot can be booked again',
    rebooked.status === 201,
    `${rebooked.status} ${rebooked.body.error?.code ?? ''}`,
  )

  // --- Asking twice --------------------------------------------------------
  console.log('\nAsking twice')

  const again = await cancel(marsh, id)
  check('cancelling an already-cancelled appointment is 200, not a conflict', again.status === 200)
  check('and it is still CANCELLED', (await statusOf(id)) === 'CANCELLED')

  // --- Somebody else's -----------------------------------------------------
  console.log("\nSomebody else's appointment")

  const hisBooking = await book(nakamura, second)
  const his = hisBooking.body.appointment?.id
  if (!his) throw new Error(`Could not book for Nakamura: ${hisBooking.status}`)

  const trespass = await cancel(marsh, his)
  const missing = await cancel(marsh, NEVER_EXISTED)
  const malformed = await cancel(marsh, 'not-a-uuid')

  check("Marsh cannot cancel Nakamura's", trespass.status === 404, `got ${trespass.status}`)
  // The refusal has to be inert as well as correct: a 404 that still wrote
  // would be the worst of both.
  check('and his appointment is untouched', (await statusOf(his)) === 'CONFIRMED')
  check(
    'a row she may not have is indistinguishable from one that never existed',
    trespass.status === missing.status &&
      JSON.stringify(trespass.body) === JSON.stringify(missing.body),
  )
  check(
    'a malformed id is a 400',
    malformed.status === 400 && malformed.body.error?.code === 'INVALID_REQUEST',
    `got ${malformed.status}`,
  )

  const byAnonymous = await cancel(ANONYMOUS, his)
  check('a stranger gets 401', byAnonymous.status === 401, `got ${byAnonymous.status}`)

  // The front desk cancelling for a patient on the phone — ADR-0007's one
  // branch, and the only reason an admin gets past a chart-scoped lookup.
  const byAdmin = await cancel(admin, his)
  check('the admin can cancel it', byAdmin.status === 200, `got ${byAdmin.status}`)
  check('and it really moved', (await statusOf(his)) === 'CANCELLED')

  // --- What cannot be cancelled --------------------------------------------
  console.log('\nAppointments that cannot be cancelled')

  const service = await prisma.service.findUniqueOrThrow({
    where: { slug: SERVICE },
    select: { id: true, bufferMins: true },
  })

  /** Planted directly: the engine would never offer a time in the past. */
  const plant = async (startsAt: Date, status: 'CONFIRMED' | 'COMPLETED' | 'NO_SHOW') => {
    const row = await prisma.appointment.create({
      data: {
        patientId: marshChart,
        providerId: first.providerId,
        serviceId: service.id,
        operatoryId: first.operatoryId,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * 60_000),
        blockedUntil: new Date(startsAt.getTime() + 30 * 60_000 + service.bufferMins * 60_000),
        bufferMins: service.bufferMins,
        status,
      },
      select: { id: true },
    })
    written.add(row.id)
    return row.id
  }

  const lastYear = new Date(Date.now() - 365 * 86_400_000)
  const started = await plant(lastYear, 'CONFIRMED')
  const completed = await plant(new Date(lastYear.getTime() + 86_400_000), 'COMPLETED')
  const noShow = await plant(new Date(lastYear.getTime() + 2 * 86_400_000), 'NO_SHOW')

  const onStarted = await cancel(marsh, started)
  const onCompleted = await cancel(marsh, completed)
  const onNoShow = await cancel(marsh, noShow)

  check(
    'an appointment that has already started is 409 NOT_CANCELLABLE',
    onStarted.status === 409 && onStarted.body.error?.code === 'NOT_CANCELLABLE',
    `${onStarted.status} ${onStarted.body.error?.code}`,
  )
  check('and it stays CONFIRMED', (await statusOf(started)) === 'CONFIRMED')
  check(
    'a COMPLETED appointment is 409',
    onCompleted.status === 409 && (await statusOf(completed)) === 'COMPLETED',
    `${onCompleted.status}`,
  )
  // Cancelling this one would erase the record of not turning up, which is the
  // only thing that status exists to remember.
  check(
    'a NO_SHOW appointment is 409 and stays a NO_SHOW',
    onNoShow.status === 409 && (await statusOf(noShow)) === 'NO_SHOW',
    `${onNoShow.status}`,
  )

  // --- The race ------------------------------------------------------------
  //
  // The front desk marks the appointment COMPLETED inside an open transaction.
  // Uncommitted, that is invisible at READ COMMITTED, so the route's read still
  // sees CONFIRMED and decides the cancellation is legal — exactly what the
  // loser of a real race sees. Its UPDATE then blocks on the row lock, and when
  // the transaction commits it re-evaluates `status = 'CONFIRMED'` against the
  // committed value, matches nothing, and refuses.
  //
  // Not a simulation of the race: the race, with the timing pinned.
  console.log('\nThe race with the front desk')

  const contested = await book(marsh, third)
  const contestedId = contested.body.appointment?.id
  if (!contestedId) throw new Error(`Could not book the contested slot: ${contested.status}`)

  let inFlight: ReturnType<typeof cancel> | undefined

  await prisma.$transaction(
    async (tx) => {
      await tx.appointment.update({
        where: { id: contestedId },
        data: { status: 'COMPLETED' },
      })

      // Fired, deliberately not awaited: it cannot finish until this
      // transaction commits, and this transaction cannot commit until the
      // callback returns.
      inFlight = cancel(marsh, contestedId)

      const settled = await Promise.race([
        inFlight.then(
          () => 'answered' as const,
          () => 'answered' as const,
        ),
        new Promise<'blocked'>((resolve) => setTimeout(() => resolve('blocked'), 1_000)),
      ])
      check('the cancellation is stuck on the row lock, not answered', settled === 'blocked', settled)
    },
    { timeout: 20_000, maxWait: 10_000 },
  )

  const raced = await (inFlight as ReturnType<typeof cancel>)
  check(
    'the loser gets 409 NOT_CANCELLABLE, not a 500',
    raced.status === 409 && raced.body.error?.code === 'NOT_CANCELLABLE',
    `${raced.status} ${raced.body.error?.code}`,
  )
  check(
    'and the message names the status it lost to',
    (raced.body.error?.message ?? '').includes('already taken place'),
    raced.body.error?.message,
  )
  // The claim that matters: the patient's cancellation did not overwrite the
  // clinic's judgement about what happened.
  check("the clinic's COMPLETED survived", (await statusOf(contestedId)) === 'COMPLETED')

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
    // Both, always. A thrown check used to leave the listener open and the
    // process hanging, which hides the failure it was meant to report.
    if (written.size > 0) {
      const { count } = await prisma.appointment.deleteMany({
        where: { id: { in: [...written] } },
      })
      console.log(`Cleaned up ${count} appointment(s).`)
    }
    await prisma.$disconnect()
  })
