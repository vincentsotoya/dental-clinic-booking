// Proves PATCH /api/appointments/:id/reschedule against real cookies, real rows
// and a real race.
//
// Run with `npm run db:reschedule --workspace=@dental/server` after a seed.
//
// Two claims here cannot be made against a stub. The first is that an
// appointment does not block its own move: the row sits in the schedule the
// engine reads, so without `excludeAppointmentId` a 09:00 booking can never
// shift to 09:15 for its own provider. The second is that an exclusion
// constraint rejects an UPDATE exactly as it rejects an INSERT — a move loses
// the same race a booking does.
//
// Every row this script writes is deleted before it exits.

import type { Server } from 'node:http'
import type {
  AvailabilityResponse,
  AvailabilitySlot,
  BookAppointmentResponse,
  RescheduleAppointmentResponse,
} from '@dental/shared'
import { createApp } from '../src/app'
import { auth } from '../src/auth'
import { databaseIsReachable, prisma } from '../src/db'
import { env } from '../src/env'

const PASSWORD = 'not-a-real-secret'
const MARSH = 'elena.marsh@example.com'
const NAKAMURA = 'victor.nakamura@example.com'
const SERVICE = 'routine-exam'
const QUARTER_HOUR = 15 * 60_000

let failures = 0
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

  const book = async (session: Session, providerId: string, startsAt: string) => {
    const res = await call<Partial<BookAppointmentResponse>>('/api/appointments', session, {
      method: 'POST',
      body: JSON.stringify({ service: SERVICE, providerId, startsAt }),
    })
    if (res.body.appointment?.id) written.add(res.body.appointment.id)
    return res
  }

  const move = (session: Session, id: string, body: Record<string, unknown>) =>
    call<Partial<RescheduleAppointmentResponse>>(`/api/appointments/${id}/reschedule`, session, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })

  return { call, signIn, chartId, book, move }
}

const rowOf = async (id: string) =>
  prisma.appointment.findUnique({
    where: { id },
    select: {
      status: true,
      startsAt: true,
      endsAt: true,
      blockedUntil: true,
      bufferMins: true,
      serviceId: true,
      providerId: true,
    },
  })

let server: Server | undefined

async function main() {
  const app = createApp({ db: prisma, auth, databaseIsReachable, timeZone: env.CLINIC_TIMEZONE })
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s))
  })
  const { port } = server.address() as { port: number }
  const { call, signIn, chartId, book, move } = makeClient(`http://localhost:${port}`)

  console.log(`Reschedule proof against the ${env.CLINIC_TIMEZONE} clinic on port ${port}.`)
  console.log('Real app, real Better Auth, real Postgres.\n')

  const marsh = await signIn(MARSH)
  const nakamura = await signIn(NAKAMURA)
  const marshChart = await chartId(marsh)
  if (!marshChart) throw new Error('Seeded patient has no chart; reseed.')

  const day = (offset: number) =>
    new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)

  const offered = await call<AvailabilityResponse>(
    `/api/availability?service=${SERVICE}&from=${day(2)}&to=${day(9)}`,
    ANONYMOUS,
  )
  const slots = offered.body.slots ?? []
  if (slots.length < 6) throw new Error(`Need six free slots, saw ${slots.length}. Reseed.`)

  const [first, second, third] = slots as [AvailabilitySlot, AvailabilitySlot, AvailabilitySlot]
  // Same provider, and far enough that the move vacates the old time rather
  // than merely sliding along it: a fifteen-minute shift leaves the new blocked
  // range still covering the slot it left, and "bookable again" would be false
  // for an honest reason.
  const later = slots.find(
    (slot) =>
      slot.providerId === first.providerId &&
      new Date(slot.startsAt).getTime() >= new Date(first.blockedUntil).getTime(),
  )
  if (!later) throw new Error('Need a clear second slot for the same provider. Reseed.')

  // --- A move that has to work --------------------------------------------
  console.log('Moving an appointment')

  const booked = await book(marsh, first.providerId, first.startsAt)
  const id = booked.body.appointment?.id
  if (!id) throw new Error(`Could not book a slot to move: ${booked.status}`)

  const before = await rowOf(id)
  const moved = await move(marsh, id, { providerId: later.providerId, startsAt: later.startsAt })

  check(
    'the move answers 200 with the same appointment',
    moved.status === 200 && moved.body.appointment?.id === id,
    `${moved.status} ${moved.body.error?.code ?? ''}`,
  )
  check(
    'the response carries the new time',
    moved.body.appointment?.startsAt === later.startsAt,
    moved.body.appointment?.startsAt,
  )

  const after = await rowOf(id)
  check('the row in Postgres moved', after?.startsAt.toISOString() === later.startsAt)
  check('it is still CONFIRMED', after?.status === 'CONFIRMED')
  // The whole reason the row moves rather than being replaced.
  check('the appointment kept its id', (await prisma.appointment.count({ where: { id } })) === 1)
  check('and its service', after?.serviceId === before?.serviceId)
  // A 200 already proves this, since the CHECK constraint would have rejected
  // the row — naming it says which rule was under test.
  check(
    'blocked_until is still ends_at plus the buffer it stored',
    after !== null &&
      after.blockedUntil.getTime() === after.endsAt.getTime() + after.bufferMins * 60_000,
  )

  const freed = await book(marsh, first.providerId, first.startsAt)
  check(
    'the time it left is bookable again',
    freed.status === 201,
    `${freed.status} ${freed.body.error?.code ?? ''}`,
  )

  // --- The move that only works because the row is excluded ---------------
  //
  // Fifteen minutes later, same provider: the appointment's own blocked range
  // covers that instant, so it is the one booking that must not be counted.
  console.log('\nA move inside its own buffer')

  const nudged = new Date(new Date(later.startsAt).getTime() + QUARTER_HOUR).toISOString()
  const nudge = await move(marsh, id, { providerId: later.providerId, startsAt: nudged })

  check(
    'an appointment does not block its own move',
    nudge.status === 200,
    `${nudge.status} ${nudge.body.error?.code ?? ''} — needs excludeAppointmentId`,
  )
  check('and it landed on the new time', (await rowOf(id))?.startsAt.toISOString() === nudged)

  // --- Moves that must be refused -----------------------------------------
  console.log('\nMoves that must be refused')

  const hisBooking = await book(nakamura, second.providerId, second.startsAt)
  const his = hisBooking.body.appointment?.id
  if (!his) throw new Error(`Could not book for Nakamura: ${hisBooking.status}`)

  const ontoTaken = await move(marsh, id, {
    providerId: second.providerId,
    startsAt: second.startsAt,
  })
  check(
    'moving onto a booking that is not yours is 409 SLOT_UNAVAILABLE',
    ontoTaken.status === 409 && ontoTaken.body.error?.code === 'SLOT_UNAVAILABLE',
    `${ontoTaken.status} ${ontoTaken.body.error?.code}`,
  )

  const trespass = await move(marsh, his, {
    providerId: third.providerId,
    startsAt: third.startsAt,
  })
  check('Marsh cannot move a row that is not hers', trespass.status === 404, `got ${trespass.status}`)
  check(
    'and that appointment did not move',
    (await rowOf(his))?.startsAt.toISOString() === second.startsAt,
  )

  const malformed = await move(marsh, id, { providerId: 'not-a-uuid', startsAt: third.startsAt })
  check(
    'a malformed body is a 400',
    malformed.status === 400 && malformed.body.error?.code === 'INVALID_REQUEST',
    `got ${malformed.status}`,
  )

  const service = await prisma.service.findUniqueOrThrow({
    where: { slug: SERVICE },
    select: { id: true, bufferMins: true },
  })

  type PlantedStatus = 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW'

  /** Planted directly: the engine would never offer a time in the past. */
  const plant = async (startsAt: Date, status: PlantedStatus) => {
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
  // Deliberately in the future. Backdated, this row would be refused for
  // having already started, and the check would pass with the branch it is
  // meant to prove deleted. A cancelled row is out of the partial index, so
  // planting one ahead of today collides with nothing.
  const cancelled = await plant(new Date(Date.now() + 60 * 86_400_000), 'CANCELLED')
  const started = await plant(lastYear, 'CONFIRMED')
  const completed = await plant(new Date(lastYear.getTime() + 86_400_000), 'COMPLETED')
  const noShow = await plant(new Date(lastYear.getTime() + 2 * 86_400_000), 'NO_SHOW')

  const target = { providerId: third.providerId, startsAt: third.startsAt }
  const onCancelled = await move(marsh, cancelled, target)
  const onStarted = await move(marsh, started, target)
  const onCompleted = await move(marsh, completed, target)
  const onNoShow = await move(marsh, noShow, target)

  // Moving it would put a released slot back on the books without ever passing
  // through booking.
  check(
    'a cancelled appointment cannot be revived by moving it',
    onCancelled.status === 409 && onCancelled.body.error?.code === 'NOT_RESCHEDULABLE',
    `${onCancelled.status} ${onCancelled.body.error?.code}`,
  )
  check('and it is still CANCELLED', (await rowOf(cancelled))?.status === 'CANCELLED')
  check(
    'one that has already started is 409',
    onStarted.status === 409 && onStarted.body.error?.code === 'NOT_RESCHEDULABLE',
    `${onStarted.status}`,
  )
  check('and it did not move', (await rowOf(started))?.startsAt.getTime() === lastYear.getTime())
  check('a COMPLETED appointment is 409', onCompleted.status === 409, `${onCompleted.status}`)
  check('a NO_SHOW appointment is 409', onNoShow.status === 409, `${onNoShow.status}`)

  // --- The race ------------------------------------------------------------
  //
  // A rival booking is written into the target slot inside an open transaction.
  // Uncommitted it is invisible at READ COMMITTED, so the re-check inside the
  // reschedule still sees the slot free and decides the move is legal. Its
  // UPDATE then blocks on the GiST index entry the open transaction holds, and
  // the instant that transaction commits Postgres raises 23P01 — from an
  // UPDATE, which is the claim this section exists to make.
  console.log('\nThe race')

  // Asked for fresh rather than reused from the list above: by now this script
    // has booked, freed and moved rows through those slots, and a target chosen
    // before all that may be held by the very appointment under test.
    const remaining = await call<AvailabilityResponse>(
      `/api/availability?service=${SERVICE}&from=${day(2)}&to=${day(9)}`,
      ANONYMOUS,
    )
    const contested = (remaining.body.slots ?? [])[0]
    if (!contested) throw new Error('No free slot left to contest. Reseed.')
  
    let inFlight: ReturnType<typeof move> | undefined

  await prisma.$transaction(
    async (tx) => {
      const rival = await tx.appointment.create({
        data: {
          patientId: marshChart,
          providerId: contested.providerId,
          serviceId: service.id,
          operatoryId: contested.operatoryId,
          startsAt: new Date(contested.startsAt),
          endsAt: new Date(contested.endsAt),
          blockedUntil: new Date(contested.blockedUntil),
          bufferMins: service.bufferMins,
        },
        select: { id: true },
      })
      written.add(rival.id)

      // Fired, deliberately not awaited: it cannot finish until this
      // transaction commits, and this transaction cannot commit until the
      // callback returns.
      inFlight = move(marsh, id, {
        providerId: contested.providerId,
        startsAt: contested.startsAt,
      })

      const settled = await Promise.race([
        inFlight.then(
          () => 'answered' as const,
          () => 'answered' as const,
        ),
        new Promise<'blocked'>((resolve) => setTimeout(() => resolve('blocked'), 1_000)),
      ])
      check('the move is stuck on the index, not answered', settled === 'blocked', settled)
    },
    { timeout: 20_000, maxWait: 10_000 },
  )

  const raced = await (inFlight as ReturnType<typeof move>)
  check(
    'the loser gets 409 SLOT_TAKEN, not a 500',
    raced.status === 409 && raced.body.error?.code === 'SLOT_TAKEN',
    `${raced.status} ${raced.body.error?.code}`,
  )
  check(
    'and the appointment stayed where it was',
    (await rowOf(id))?.startsAt.toISOString() === nudged,
  )

  const holders = await prisma.appointment.count({
    where: {
      status: 'CONFIRMED',
      providerId: contested.providerId,
      startsAt: new Date(contested.startsAt),
    },
  })
  check('exactly one appointment holds the contested slot', holders === 1, `${holders} rows`)

  // --- The other race: the front desk, mid-move ---------------------------
  //
  // The same shape as db:cancel's. The clinic marks the appointment COMPLETED
  // inside an open transaction, so the move's read still sees CONFIRMED and
  // decides it is legal; the UPDATE then blocks on the row lock and, on
  // commit, re-evaluates status = 'CONFIRMED' against the committed value.
  console.log('\nThe race with the front desk')

  const stillFree = await call<AvailabilityResponse>(
    `/api/availability?service=${SERVICE}&from=${day(2)}&to=${day(9)}`,
    ANONYMOUS,
  )
  const elsewhere = (stillFree.body.slots ?? [])[0]
  if (!elsewhere) throw new Error('No free slot left to move into. Reseed.')

  const wasAt = (await rowOf(id))?.startsAt
  let midMove: ReturnType<typeof move> | undefined

  await prisma.$transaction(
    async (tx) => {
      await tx.appointment.update({ where: { id }, data: { status: 'COMPLETED' } })

      midMove = move(marsh, id, {
        providerId: elsewhere.providerId,
        startsAt: elsewhere.startsAt,
      })

      const settled = await Promise.race([
        midMove.then(
          () => 'answered' as const,
          () => 'answered' as const,
        ),
        new Promise<'blocked'>((resolve) => setTimeout(() => resolve('blocked'), 1_000)),
      ])
      check('the move is stuck on the row lock, not answered', settled === 'blocked', settled)
    },
    { timeout: 20_000, maxWait: 10_000 },
  )

  const closed = await (midMove as ReturnType<typeof move>)
  check(
    'a move that lost to the front desk is 409 NOT_RESCHEDULABLE',
    closed.status === 409 && closed.body.error?.code === 'NOT_RESCHEDULABLE',
    `${closed.status} ${closed.body.error?.code}`,
  )
  const settledRow = await rowOf(id)
  check("the clinic's COMPLETED survived", settledRow?.status === 'COMPLETED')
  check(
    'and the appointment did not move under it',
    settledRow?.startsAt.getTime() === wasAt?.getTime(),
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
    if (written.size > 0) {
      const { count } = await prisma.appointment.deleteMany({
        where: { id: { in: [...written] } },
      })
      console.log(`Cleaned up ${count} appointment(s).`)
    }
    await prisma.$disconnect()
  })
