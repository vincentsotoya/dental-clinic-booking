// Proves POST /api/appointments against real cookies, real rows and a real race.
//
// Run with `npm run db:booking --workspace=@dental/server` after a seed. The
// unit tests drive the route over a stub, which can validate and can refuse but
// cannot enforce an exclusion constraint — the one thing this phase is about.
// Here the app, the auth instance and Postgres are all the production ones.
//
// The race is pinned rather than hoped for. Firing two requests at once and
// watching one fail proves little: whichever finishes first makes the other
// fail the *re-check*, which is a different code path from the constraint. So
// the competing booking is held in an open transaction instead — see "The
// race". Every row this script writes is deleted before it exits.

import type { Server } from 'node:http'
import type { AvailabilityResponse, AvailabilitySlot, BookAppointmentResponse } from '@dental/shared'
import { createApp } from '../src/app'
import { auth } from '../src/auth'
import { databaseIsReachable, prisma } from '../src/db'
import { env } from '../src/env'

const PASSWORD = 'not-a-real-secret'
const MARSH = 'elena.marsh@example.com'
const NAKAMURA = 'victor.nakamura@example.com'
const ADMIN = 'dana.whitfield@example.com'
const SERVICE = 'routine-exam'

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
    return { status: res.status, body, setCookie: res.headers.getSetCookie() }
  }

  async function signIn(email: string): Promise<Session> {
    const res = await call<unknown>('/api/auth/sign-in/email', ANONYMOUS, {
      method: 'POST',
      body: JSON.stringify({ email, password: PASSWORD }),
    })
    if (res.status !== 200) throw new Error(`sign-in failed for ${email}: ${res.status}`)
    return { cookie: res.setCookie.map((c) => c.split(';')[0]).join('; ') }
  }

  /** The chart the session resolves to, read the way a client would. */
  async function chartId(session: Session): Promise<string | null> {
    const res = await call<{ patient: { id: string } | null }>('/api/me', session)
    return res.body.patient?.id ?? null
  }

  const book = (session: Session, body: Record<string, unknown>) =>
    call<Partial<BookAppointmentResponse>>('/api/appointments', session, {
      method: 'POST',
      body: JSON.stringify(body),
    })

  return { call, signIn, chartId, book }
}

/** Remember anything that landed, whatever the script goes on to assert about it. */
function record(result: { body: Partial<BookAppointmentResponse> }): void {
  const id = result.body.appointment?.id
  if (id) written.add(id)
}

let server: Server | undefined

async function main() {
  const app = createApp({ db: prisma, auth, databaseIsReachable, timeZone: env.CLINIC_TIMEZONE })
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s))
  })
  const { port } = server.address() as { port: number }
  const { call, signIn, chartId, book } = makeClient(`http://localhost:${port}`)

  console.log(`Booking proof against the ${env.CLINIC_TIMEZONE} clinic on port ${port}.`)
  console.log('Real app, real Better Auth, real Postgres.\n')

  const marsh = await signIn(MARSH)
  const nakamura = await signIn(NAKAMURA)
  const admin = await signIn(ADMIN)
  const marshChart = await chartId(marsh)
  const nakamuraChart = await chartId(nakamura)
  if (!marshChart || !nakamuraChart) throw new Error('Seeded patients have no charts; reseed.')

  // --- Slots to work with --------------------------------------------------
  console.log('Pick slots from GET /api/availability')

  const day = (offset: number) =>
    new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)

  const offered = await call<AvailabilityResponse>(
    `/api/availability?service=${SERVICE}&from=${day(1)}&to=${day(6)}`,
    marsh,
  )
  const slots: AvailabilitySlot[] = offered.body.slots ?? []
  check(`availability offers slots for ${SERVICE}`, slots.length > 0, `${slots.length} slots`)

  // One slot per day, three different days. Adjacent slots share a provider and
  // a buffer, so booking one can remove the next — separate days cannot
  // interfere, which keeps every check below about the thing it names.
  const byDay = new Map<string, AvailabilitySlot>()
  for (const slot of slots) if (!byDay.has(slot.date)) byDay.set(slot.date, slot)

  const picked = [...byDay.values()]
  if (picked.length < 3) throw new Error('Need free slots on three separate days; reseed.')
  const [first, second, third] = picked as [AvailabilitySlot, AvailabilitySlot, AvailabilitySlot]
  console.log(`  using ${first.date}, ${second.date}, ${third.date}`)

  // --- The happy path ------------------------------------------------------
  console.log('\nPOST /api/appointments')

  const booked = await book(marsh, {
    service: SERVICE,
    providerId: first.providerId,
    startsAt: first.startsAt,
    notes: 'Nervous about the drill.',
  })
  record(booked)
  check('a patient books an offered slot', booked.status === 201, `got ${booked.status}`)

  const id = booked.body.appointment?.id
  check('the response carries the new appointment id', Boolean(id))

  // The row, not the response: a response can describe something that never landed.
  const row = id
    ? await prisma.appointment.findUnique({
        where: { id },
        select: {
          patientId: true,
          startsAt: true,
          endsAt: true,
          blockedUntil: true,
          bufferMins: true,
          status: true,
          notes: true,
        },
      })
    : null

  check('the row is in Postgres', row !== null)
  check('it is CONFIRMED on arrival — there is no pending state', row?.status === 'CONFIRMED')
  check(
    'it starts at exactly the offered instant',
    row?.startsAt.toISOString() === first.startsAt,
    `${row?.startsAt.toISOString()} vs ${first.startsAt}`,
  )
  check(
    'it ends where the service says, not where a body might have claimed',
    row?.endsAt.toISOString() === first.endsAt,
  )
  check(
    'blocked_until is ends_at plus the snapshotted buffer',
    row !== null && row.blockedUntil.getTime() === row.endsAt.getTime() + row.bufferMins * 60_000,
  )
  check('the notes were kept', row?.notes === 'Nervous about the drill.')
  check('it belongs to the caller’s chart', row?.patientId === marshChart)

  // --- The chart comes from the session, not the body ----------------------
  console.log('\nWhose appointment it is')

  const forged = await book(nakamura, {
    service: SERVICE,
    providerId: second.providerId,
    startsAt: second.startsAt,
    patientId: marshChart,
  })
  record(forged)
  check('a body naming another patient is still accepted', forged.status === 201, `got ${forged.status}`)

  const forgedRow = forged.body.appointment?.id
    ? await prisma.appointment.findUnique({
        where: { id: forged.body.appointment.id },
        select: { patientId: true },
      })
    : null
  check(
    '…but it books the caller’s chart, not the one the body named',
    forgedRow?.patientId === nakamuraChart,
    `${forgedRow?.patientId} vs ${marshChart}`,
  )

  // --- Refusals no constraint could make -----------------------------------
  console.log('\nWhat the re-check catches that Postgres would not')

  // Five hours before the first slot of a working day: the small hours, when
  // the clinic is shut. Both exclusion constraints would accept this row.
  const smallHours = new Date(new Date(first.startsAt).getTime() - 5 * 3_600_000)
  const closed = await book(marsh, {
    service: SERVICE,
    providerId: first.providerId,
    startsAt: smallHours.toISOString(),
  })
  record(closed)
  check(
    'a time outside working hours is 409 SLOT_UNAVAILABLE',
    closed.status === 409 && closed.body.error?.code === 'SLOT_UNAVAILABLE',
    `${closed.status} ${closed.body.error?.code}`,
  )

  const gone = await book(marsh, {
    service: SERVICE,
    providerId: first.providerId,
    startsAt: first.startsAt,
  })
  record(gone)
  check(
    'the slot just taken is no longer offered at all',
    gone.status === 409 && gone.body.error?.code === 'SLOT_UNAVAILABLE',
    `${gone.status} ${gone.body.error?.code}`,
  )

  const unknown = await book(marsh, {
    service: 'gold-plated-fangs',
    providerId: third.providerId,
    startsAt: third.startsAt,
  })
  record(unknown)
  check(
    'an unknown service is 404 SERVICE_NOT_FOUND',
    unknown.status === 404 && unknown.body.error?.code === 'SERVICE_NOT_FOUND',
    `${unknown.status} ${unknown.body.error?.code}`,
  )

  const malformed = await book(marsh, {
    service: SERVICE,
    providerId: 'not-a-uuid',
    startsAt: third.startsAt,
  })
  check(
    'a malformed body is 400 INVALID_REQUEST naming the field',
    malformed.status === 400 && Boolean(malformed.body.error?.message.includes('providerId')),
    `${malformed.status} ${malformed.body.error?.message}`,
  )

  const stranger = await book(ANONYMOUS, {
    service: SERVICE,
    providerId: third.providerId,
    startsAt: third.startsAt,
  })
  check('a stranger is 401', stranger.status === 401, `got ${stranger.status}`)

  const adminBooking = await book(admin, {
    service: SERVICE,
    providerId: third.providerId,
    startsAt: third.startsAt,
  })
  record(adminBooking)
  check(
    'an admin has no chart to book against — 403',
    adminBooking.status === 403 && adminBooking.body.error?.code === 'FORBIDDEN',
    `${adminBooking.status} ${adminBooking.body.error?.code}`,
  )

  // --- The race ------------------------------------------------------------
  //
  // A competing booking is written inside an open transaction. Uncommitted it
  // is invisible at READ COMMITTED, so the route's re-check still sees the slot
  // as free — precisely what the loser of a real race sees. Its INSERT then
  // blocks on the GiST index entry the open transaction holds, and the instant
  // that transaction commits, Postgres raises 23P01.
  //
  // Not a simulation of the race: the race, with the timing pinned.
  console.log('\nThe race')

  const service = await prisma.service.findUniqueOrThrow({
    where: { slug: SERVICE },
    select: { id: true, bufferMins: true },
  })

  let inFlight: ReturnType<typeof book> | undefined

  await prisma.$transaction(
    async (tx) => {
      const held = await tx.appointment.create({
        data: {
          patientId: nakamuraChart,
          providerId: third.providerId,
          serviceId: service.id,
          operatoryId: third.operatoryId,
          startsAt: new Date(third.startsAt),
          endsAt: new Date(third.endsAt),
          blockedUntil: new Date(third.blockedUntil),
          bufferMins: service.bufferMins,
        },
        select: { id: true },
      })
      written.add(held.id)

      // Fired, deliberately not awaited: awaiting it here would deadlock, since
      // it cannot finish until this transaction commits and this transaction
      // cannot commit until the callback returns.
      inFlight = book(marsh, {
        service: SERVICE,
        providerId: third.providerId,
        startsAt: third.startsAt,
      })

      const settled = await Promise.race([
        inFlight.then(
          () => 'answered' as const,
          () => 'answered' as const,
        ),
        new Promise<'blocked'>((resolve) => setTimeout(() => resolve('blocked'), 1_000)),
      ])
      check('the rival request is stuck on the index, not answered', settled === 'blocked', settled)
    },
    { timeout: 20_000, maxWait: 10_000 },
  )

  // The transaction has now committed, which is what releases the blocked INSERT.
  const contended = await (inFlight as ReturnType<typeof book>)
  record(contended)
  check(
    'the loser gets 409 SLOT_TAKEN, not a 500',
    contended.status === 409 && contended.body.error?.code === 'SLOT_TAKEN',
    `${contended.status} ${contended.body.error?.code}`,
  )

  const survivors = await prisma.appointment.count({
    where: {
      status: 'CONFIRMED',
      providerId: third.providerId,
      startsAt: new Date(third.startsAt),
    },
  })
  check('exactly one appointment holds that slot', survivors === 1, `${survivors} rows`)

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
