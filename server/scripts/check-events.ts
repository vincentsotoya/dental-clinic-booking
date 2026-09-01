// Proves the appointment event log against real cookies and real rows.
//
// Run with `npm run db:events --workspace=@dental/server` after a seed.
//
// The unit tests watch what the services hand the log. Only Postgres can show
// the two things that matter about it afterwards: that an event and the change
// it describes commit together or not at all, and that deleting the login that
// acted leaves the event standing with its actor forgotten rather than taking
// the record with it.
//
// Every row this script writes is deleted before it exits.

import type { Server } from 'node:http'
import type {
  AvailabilityResponse,
  AvailabilitySlot,
  BookAppointmentResponse,
} from '@dental/shared'
import { createApp } from '../src/app'
import { auth } from '../src/auth'
import { databaseIsReachable, prisma } from '../src/db'
import { env } from '../src/env'

const PASSWORD = 'not-a-real-secret'
const MARSH = 'elena.marsh@example.com'
const ADMIN = 'dana.whitfield@example.com'
const SERVICE = 'routine-exam'

let failures = 0
const written = new Set<string>()
/** The signup hook charts a patient for the probe login; that chart is ours to clear too. */
const chartsWritten = new Set<string>()

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

  const book = async (session: Session, providerId: string, startsAt: string) => {
    const res = await call<Partial<BookAppointmentResponse>>('/api/appointments', session, {
      method: 'POST',
      body: JSON.stringify({ service: SERVICE, providerId, startsAt }),
    })
    if (res.body.appointment?.id) written.add(res.body.appointment.id)
    return res
  }

  const cancel = (session: Session, id: string) =>
    call<unknown>(`/api/appointments/${id}/cancel`, session, { method: 'PATCH' })

  const move = (session: Session, id: string, body: Record<string, unknown>) =>
    call<unknown>(`/api/appointments/${id}/reschedule`, session, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })

  return { call, signIn, book, cancel, move }
}

const eventsFor = (appointmentId: string) =>
  prisma.appointmentEvent.findMany({
    where: { appointmentId },
    orderBy: { createdAt: 'asc' },
  })

let server: Server | undefined

async function main() {
  const app = createApp({ db: prisma, auth, databaseIsReachable, timeZone: env.CLINIC_TIMEZONE })
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s))
  })
  const { port } = server.address() as { port: number }
  const { call, signIn, book, cancel, move } = makeClient(`http://localhost:${port}`)

  console.log(`Event log proof against the ${env.CLINIC_TIMEZONE} clinic on port ${port}.`)
  console.log('Real app, real Better Auth, real Postgres.\n')

  const marsh = await signIn(MARSH)
  const admin = await signIn(ADMIN)

  const marshUser = await prisma.user.findFirstOrThrow({
    where: { email: MARSH },
    select: { id: true },
  })
  const adminUser = await prisma.user.findFirstOrThrow({
    where: { email: ADMIN },
    select: { id: true },
  })

  const day = (offset: number) =>
    new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)

  const offered = await call<AvailabilityResponse>(
    `/api/availability?service=${SERVICE}&from=${day(2)}&to=${day(9)}`,
    ANONYMOUS,
  )
  const slots = offered.body.slots ?? []
  if (slots.length < 6) throw new Error(`Need six free slots, saw ${slots.length}. Reseed.`)

  const [first] = slots as [AvailabilitySlot]
  const later = slots.find(
    (slot) =>
      slot.providerId === first.providerId &&
      new Date(slot.startsAt).getTime() >= new Date(first.blockedUntil).getTime(),
  )
  if (!later) throw new Error('Need a clear second slot for the same provider. Reseed.')

  // --- The seed's own history ---------------------------------------------
  console.log('What the seed left behind')

  const seeded = await prisma.appointment.count()
  const seededEvents = await prisma.appointmentEvent.count({ where: { type: 'BOOKED' } })
  check(
    'every seeded appointment has the event that created it',
    seededEvents >= seeded,
    `${seededEvents} BOOKED for ${seeded} appointments`,
  )
  const system = await prisma.appointmentEvent.findFirst({ where: { actorRole: 'SYSTEM' } })
  check('the seed acted as SYSTEM, with no user behind it', system?.actorUserId === null)

  // --- One appointment's whole life ---------------------------------------
  console.log('\nA booking, a move and a cancellation')

  const booked = await book(marsh, first.providerId, first.startsAt)
  const id = booked.body.appointment?.id
  if (!id) throw new Error(`Could not book: ${booked.status}`)

  const afterBooking = await eventsFor(id)
  check('booking writes one event', afterBooking.length === 1, `${afterBooking.length}`)
  check(
    'and it is a BOOKED by the patient who booked it',
    afterBooking[0]?.type === 'BOOKED' &&
      afterBooking[0]?.actorRole === 'PATIENT' &&
      afterBooking[0]?.actorUserId === marshUser.id,
    `${afterBooking[0]?.type} ${afterBooking[0]?.actorRole}`,
  )
  check(
    'with no status before it existed',
    afterBooking[0]?.fromStatus === null && afterBooking[0]?.toStatus === 'CONFIRMED',
  )

  const moved = await move(marsh, id, { providerId: later.providerId, startsAt: later.startsAt })
  check('the move succeeded', moved.status === 200, `${moved.status}`)

  const afterMove = await eventsFor(id)
  const rescheduled = afterMove[1]
  check('the move appended a second event', afterMove.length === 2, `${afterMove.length}`)
  check('it is a RESCHEDULED', rescheduled?.type === 'RESCHEDULED')
  // The claim the whole table exists for: the appointment row no longer knows
  // this, and nothing else in the database does either.
  check(
    'the time it moved from survives only here',
    rescheduled?.fromStartsAt?.toISOString() === first.startsAt &&
      rescheduled?.toStartsAt?.toISOString() === later.startsAt,
    `${rescheduled?.fromStartsAt?.toISOString()} → ${rescheduled?.toStartsAt?.toISOString()}`,
  )
  // A move changes no status, which is why this is a log of events.
  check(
    'and it claims no status change',
    rescheduled?.fromStatus === null && rescheduled?.toStatus === null,
  )

  // The front desk cancelling for a patient: the chart is hers, the login is
  // the admin's, and telling those apart is the actor column's whole job.
  const cancelled = await cancel(admin, id)
  check('the admin cancelled it', cancelled.status === 200, `${cancelled.status}`)

  const afterCancel = await eventsFor(id)
  const third = afterCancel[2]
  check('the cancellation appended a third event', afterCancel.length === 3, `${afterCancel.length}`)
  check(
    'it names the admin who acted, not the patient who owns the chart',
    third?.type === 'CANCELLED' &&
      third?.actorRole === 'ADMIN' &&
      third?.actorUserId === adminUser.id,
    `${third?.actorRole} ${third?.actorUserId === marshUser.id ? '(wrongly Marsh)' : ''}`,
  )
  check(
    'and it records the transition',
    third?.fromStatus === 'CONFIRMED' && third?.toStatus === 'CANCELLED',
  )

  // Cancelling again is 200 and changes nothing, so it must add nothing.
  await cancel(admin, id)
  check('asking twice does not log twice', (await eventsFor(id)).length === 3)

  // --- A refusal writes nothing -------------------------------------------
  console.log('\nRefusals leave no trace')

  const refused = await move(marsh, id, {
    providerId: first.providerId,
    startsAt: first.startsAt,
  })
  check('moving a cancelled appointment is refused', refused.status === 409, `${refused.status}`)
  check('and wrote no event', (await eventsFor(id)).length === 3)

  // --- The event outlives the account -------------------------------------
  //
  // ON DELETE SET NULL, not CASCADE. An event is a record of something that
  // happened; deleting the login must forget who, not what.
  console.log('\nDeleting the login that acted')

  const doomed = await auth.api.signUpEmail({
    body: {
      email: `events-probe-${Date.now()}@example.com`,
      password: PASSWORD,
      name: 'Probe Patient',
      firstName: 'Probe',
      lastName: 'Patient',
    },
  })
  const probeUserId = doomed.user.id

  const probeChart = await prisma.patient.findFirstOrThrow({
    where: { userId: probeUserId },
    select: { id: true },
  })

  const service = await prisma.service.findUniqueOrThrow({
    where: { slug: SERVICE },
    select: { id: true, bufferMins: true },
  })
  const lastYear = new Date(Date.now() - 400 * 86_400_000)
  const historic = await prisma.appointment.create({
    data: {
      patientId: probeChart.id,
      providerId: first.providerId,
      serviceId: service.id,
      operatoryId: first.operatoryId,
      startsAt: lastYear,
      endsAt: new Date(lastYear.getTime() + 30 * 60_000),
      blockedUntil: new Date(lastYear.getTime() + 40 * 60_000),
      bufferMins: service.bufferMins,
      status: 'COMPLETED',
    },
    select: { id: true },
  })
  written.add(historic.id)
  chartsWritten.add(probeChart.id)

  const trace = await prisma.appointmentEvent.create({
    data: {
      appointmentId: historic.id,
      type: 'CANCELLED',
      fromStatus: 'CONFIRMED',
      toStatus: 'CANCELLED',
      actorUserId: probeUserId,
      actorRole: 'PATIENT',
    },
    select: { id: true },
  })

  await prisma.user.delete({ where: { id: probeUserId } })

  const orphaned = await prisma.appointmentEvent.findUnique({ where: { id: trace.id } })
  check('the event survives the deleted login', orphaned !== null)
  check('its actor is forgotten, not the event', orphaned?.actorUserId === null)
  check('and the role it acted in is still recorded', orphaned?.actorRole === 'PATIENT')

  // --- Deleting the appointment takes its log with it ----------------------
  //
  // CASCADE here, and the opposite reasoning: an event describes one
  // appointment, so it is meaningless once that row is gone.
  const before = await prisma.appointmentEvent.count({ where: { appointmentId: historic.id } })
  await prisma.appointment.delete({ where: { id: historic.id } })
  const after = await prisma.appointmentEvent.count({ where: { appointmentId: historic.id } })
  check('an appointment takes its events with it', before > 0 && after === 0, `${before} → ${after}`)

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
    if (chartsWritten.size > 0) {
      const { count } = await prisma.patient.deleteMany({
        where: { id: { in: [...chartsWritten] } },
      })
      console.log(`Cleaned up ${count} chart(s).`)
    }
    await prisma.$disconnect()
  })
