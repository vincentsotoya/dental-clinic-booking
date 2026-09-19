// Proves PATCH /api/admin/appointments/:id/close against real cookies, real
// rows and a real race.
//
// Run with `npm run db:complete-no-show --workspace=@dental/server` after a
// seed. The unit tests drive the route over a stub, which can refuse and can
// flip a field but cannot hold a row lock — and cannot show that leaving
// CONFIRMED frees the slot in the exclusion index, the same claim
// `check-cancel.ts` makes for CANCELLED.
//
// The race here cannot be "a patient cancels while the front desk closes it
// out", the way check-cancel.ts's own race is a patient racing the front
// desk: `refusalToChange` refuses a cancellation once an appointment has
// started, and `refusalToClose` refuses a close-out until it has — the two
// checks are disjoint by design, so no appointment is ever eligible for
// both at once. The real race is two front-desk actions on the same row —
// modelled here as one admin's close blocking on another's, mid-transaction.
// Every row this script writes is deleted before it exits.

import type { Server } from 'node:http'
import type {
  AvailabilityResponse,
  AvailabilitySlot,
  BookAppointmentResponse,
  CloseAppointmentResponse,
} from '@dental/shared'
import { createApp } from '../src/app'
import { auth } from '../src/auth'
import { databaseIsReachable, prisma } from '../src/db'
import { env } from '../src/env'

const PASSWORD = 'not-a-real-secret'
const MARSH = 'elena.marsh@example.com'
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
    call<Envelope>(`/api/appointments/${id}/cancel`, session, { method: 'PATCH' })

  const close = (session: Session, id: string, outcome: 'COMPLETED' | 'NO_SHOW') =>
    call<Partial<CloseAppointmentResponse>>(`/api/admin/appointments/${id}/close`, session, {
      method: 'PATCH',
      body: JSON.stringify({ outcome }),
    })

  return { call, signIn, chartId, book, cancel, close }
}

const statusOf = async (id: string) =>
  (await prisma.appointment.findUnique({ where: { id }, select: { status: true } }))?.status ?? null

const eventCount = async (id: string, type: string) =>
  prisma.appointmentEvent.count({ where: { appointmentId: id, type: type as never } })

let server: Server | undefined

async function main() {
  const app = createApp({ db: prisma, auth, databaseIsReachable, timeZone: env.CLINIC_TIMEZONE })
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s))
  })
  const { port } = server.address() as { port: number }
  const { call, signIn, chartId, book, cancel, close } = makeClient(`http://localhost:${port}`)

  console.log(`Close-out proof against the ${env.CLINIC_TIMEZONE} clinic on port ${port}.`)
  console.log('Real app, real Better Auth, real Postgres.\n')

  const marsh = await signIn(MARSH)
  const admin = await signIn(ADMIN)
  const marshChart = await chartId(marsh)
  if (!marshChart) throw new Error('Seeded patient has no chart; reseed.')

  const service = await prisma.service.findUniqueOrThrow({
    where: { slug: SERVICE },
    select: { id: true, bufferMins: true },
  })

  const offered = await call<AvailabilityResponse>(
    `/api/availability?service=${SERVICE}&from=${new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10)}&to=${new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10)}`,
    ANONYMOUS,
  )
  const slots = offered.body.slots ?? []
  if (slots.length < 1) throw new Error(`Need a free slot, saw ${slots.length}. Reseed.`)
  const [first] = slots as [AvailabilitySlot]

  /** Planted directly: a CONFIRMED row in the past, which the booking API can never produce. */
  const plant = async (startsAt: Date, status: 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW') => {
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

  const yesterday = new Date(Date.now() - 86_400_000)

  // --- Closing a completed visit -------------------------------------------
  console.log('The front desk closes a visit that happened')

  const seenToCompletion = await plant(yesterday, 'CONFIRMED')
  const completed = await close(admin, seenToCompletion, 'COMPLETED')

  check(
    'the close answers 200 with the row',
    completed.status === 200 && completed.body.appointment?.id === seenToCompletion,
    `${completed.status}`,
  )
  check('the response says COMPLETED', completed.body.appointment?.status === 'COMPLETED')
  check('the row in Postgres says COMPLETED', (await statusOf(seenToCompletion)) === 'COMPLETED')
  check('one COMPLETED event was logged', (await eventCount(seenToCompletion, 'COMPLETED')) === 1)

  // Leaving CONFIRMED frees the slot in the exclusion index exactly as
  // CANCELLED does — the same claim check-cancel.ts makes for cancellation.
  const rebooked = await book(marsh, first)
  check(
    'the freed slot can be booked again',
    rebooked.status === 201,
    `${rebooked.status} ${rebooked.body.error?.code ?? ''}`,
  )
  const rebookedId = rebooked.body.appointment?.id
  if (rebookedId) await cancel(marsh, rebookedId)

  // --- Closing a no-show ----------------------------------------------------
  console.log('\nThe front desk closes a visit nobody attended')

  const missedVisit = await plant(yesterday, 'CONFIRMED')
  const noShow = await close(admin, missedVisit, 'NO_SHOW')

  check('the response says NO_SHOW', noShow.body.appointment?.status === 'NO_SHOW', `${noShow.status}`)
  check('the row in Postgres says NO_SHOW', (await statusOf(missedVisit)) === 'NO_SHOW')
  check('one NO_SHOW event was logged', (await eventCount(missedVisit, 'NO_SHOW')) === 1)

  // --- Asking twice ----------------------------------------------------------
  console.log('\nAsking twice')

  const again = await close(admin, seenToCompletion, 'COMPLETED')
  check('closing an already-COMPLETED row with the same outcome is 200', again.status === 200)
  check('and no second event was logged', (await eventCount(seenToCompletion, 'COMPLETED')) === 1)

  // --- What cannot be closed --------------------------------------------------
  console.log('\nWhat cannot be closed')

  const cancelled = await plant(yesterday, 'CANCELLED')
  const onCancelled = await close(admin, cancelled, 'COMPLETED')
  check(
    'a cancelled appointment is 409 NOT_CLOSEABLE',
    onCancelled.status === 409 && onCancelled.body.error?.code === 'NOT_CLOSEABLE',
    `${onCancelled.status} ${onCancelled.body.error?.code}`,
  )
  check('and the message says so', (onCancelled.body.error?.message ?? '').includes('cancelled'))

  const onFlip = await close(admin, seenToCompletion, 'NO_SHOW')
  check(
    'flipping a settled outcome to the other one is 409',
    onFlip.status === 409 && onFlip.body.error?.code === 'NOT_CLOSEABLE',
    `${onFlip.status}`,
  )
  check('and it stays COMPLETED', (await statusOf(seenToCompletion)) === 'COMPLETED')

  const futureBooking = await book(marsh, first)
  const futureId = futureBooking.body.appointment?.id
  if (!futureId) throw new Error(`Could not book the future slot: ${futureBooking.status}`)
  const tooEarly = await close(admin, futureId, 'COMPLETED')
  check(
    'an appointment that has not happened yet is 409',
    tooEarly.status === 409 && (tooEarly.body.error?.message ?? '').includes("hasn't happened yet"),
    `${tooEarly.status} ${tooEarly.body.error?.message}`,
  )
  check('and it stays CONFIRMED', (await statusOf(futureId)) === 'CONFIRMED')

  // Freed for the race below, which rebooks the same slot.
  await cancel(marsh, futureId)

  // --- Who may -----------------------------------------------------------------
  console.log('\nWho may close an appointment out')

  const byPatient = await close(marsh, seenToCompletion, 'COMPLETED')
  check("a patient cannot use the clinic's own route", byPatient.status === 403, `${byPatient.status}`)

  const byAnonymous = await close(ANONYMOUS, seenToCompletion, 'COMPLETED')
  check('a stranger gets 401', byAnonymous.status === 401, `${byAnonymous.status}`)

  const missing = await close(admin, NEVER_EXISTED, 'COMPLETED')
  check('a missing appointment is 404', missing.status === 404, `${missing.status}`)

  const malformed = await close(admin, 'not-a-uuid', 'COMPLETED')
  check('a malformed id is 400', malformed.status === 400, `${malformed.status}`)

  // --- The race --------------------------------------------------------------
  //
  // One front-desk request sets the row NO_SHOW inside an open transaction
  // while a second, uncoordinated one is closing it COMPLETED. The second
  // request's UPDATE blocks on the row lock, and when the first commits, its
  // re-check of `status = 'CONFIRMED'` matches nothing and it loses.
  console.log('\nThe race between two front-desk requests')

  const contestedId = await plant(yesterday, 'CONFIRMED')

  let inFlight: ReturnType<typeof close> | undefined

  await prisma.$transaction(
    async (tx) => {
      await tx.appointment.update({ where: { id: contestedId }, data: { status: 'NO_SHOW' } })

      inFlight = close(admin, contestedId, 'COMPLETED')

      const settled = await Promise.race([
        inFlight.then(
          () => 'answered' as const,
          () => 'answered' as const,
        ),
        new Promise<'blocked'>((resolve) => setTimeout(() => resolve('blocked'), 1_000)),
      ])
      check('the close is stuck on the row lock, not answered', settled === 'blocked', settled)
    },
    { timeout: 20_000, maxWait: 10_000 },
  )

  const raced = await (inFlight as ReturnType<typeof close>)
  check(
    'the loser gets 409 NOT_CLOSEABLE, not a 500',
    raced.status === 409 && raced.body.error?.code === 'NOT_CLOSEABLE',
    `${raced.status} ${raced.body.error?.code}`,
  )
  check(
    'and the message names the outcome it lost to',
    (raced.body.error?.message ?? '').includes('no-show'),
    raced.body.error?.message,
  )
  check('the first request’s NO_SHOW survived', (await statusOf(contestedId)) === 'NO_SHOW')

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
    if (written.size > 0) {
      const { count } = await prisma.appointment.deleteMany({ where: { id: { in: [...written] } } })
      console.log(`Cleaned up ${count} appointment(s).`)
    }
    await prisma.$disconnect()
  })
