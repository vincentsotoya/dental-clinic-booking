// Proves the typed API client against the real server.
//
// Run with `npm run check:api --workspace=@dental/client` while the API is up.
//
// The client code under test is the production code, unmodified: the same
// `request`, the same endpoint functions, the same shared schemas. Only two
// things are substituted, and both are browser facts rather than app logic —
// there is no Vite proxy outside a browser, so `/api` is rewritten to the
// server's own origin, and there is no cookie jar, so one is kept by hand.
//
// What this catches that a stubbed test cannot: a response the server really
// sends that the shared schema really rejects. That is the whole claim of
// parsing rather than casting, and it can only be made against real bodies.
//
// Cleanup is weaker than the server's db:* scripts on purpose. This has no
// database handle, only the API, so it cancels what it booked and cannot
// delete it. Each run therefore leaves one CANCELLED row behind; `npm run
// db:seed --workspace=@dental/server` resets that whenever it matters.

import { ZodError } from 'zod'
import { availabilityResponse } from '@dental/shared'
import { request } from '../src/api/client'
import { ApiRequestError, isRetryable, NetworkError } from '../src/api/errors'
import {
  bookAppointment,
  cancelAppointment,
  getAvailability,
  getHealth,
  getMe,
  getMyAppointments,
  rescheduleAppointment,
} from '../src/api/endpoints'

const API = process.env.API_ORIGIN ?? 'http://localhost:3000'

/** Mutable, so the unreachable case can be driven through the real client. */
let origin = API
const PASSWORD = 'not-a-real-secret'
const MARSH = 'elena.marsh@example.com'
const SERVICE = 'routine-exam'

let failures = 0
const booked = new Set<string>()

function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures += 1
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

// --- The two browser facts this environment does not have -------------------

let cookie = ''
const realFetch = globalThis.fetch

globalThis.fetch = ((input: RequestInfo | URL, init: RequestInit = {}) => {
  const path = String(input)
  const url = path.startsWith('/api') ? `${origin}${path}` : path

  const headers = new Headers(init.headers)
  if (cookie) headers.set('Cookie', cookie)
  // Better Auth's CSRF check refuses a state-changing request without it.
  headers.set('Origin', process.env.CLIENT_ORIGIN ?? 'http://localhost:5173')

  return realFetch(url, { ...init, headers })
}) as typeof fetch

async function signIn(email: string): Promise<void> {
  const res = await realFetch(`${API}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
    },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  if (res.status !== 200) throw new Error(`sign-in failed: ${res.status}`)
  cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
}

const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)

async function main() {
  console.log(`API client proof against ${API}.\n`)

  // --- Unguarded, and the schema that parses it --------------------------
  console.log('Anonymous')

  const health = await getHealth()
  check('getHealth parses', health.status === 'ok' && health.database === 'up', health.database)

  const anonymous = await getMe()
  // The contract says a stranger is answered, not refused. If the schema were
  // wrong about `user: null` being allowed, this line would throw, not fail.
  check('getMe answers a stranger with a parsed null user', anonymous.user === null)

  const offered = await getAvailability({ service: SERVICE, from: day(2), to: day(9) })
  check('getAvailability parses', offered.slots.length > 0, `${offered.slots.length} slots`)
  check(
    'every slot names a provider the response also describes',
    offered.slots.every((slot) => slot.providerId in offered.providers),
  )

  // --- A failure the API names ------------------------------------------
  console.log('\nErrors arrive typed, not as text')

  const guarded = await getMyAppointments().then(
    () => null,
    (error: unknown) => error,
  )
  check(
    'an unauthenticated read throws ApiRequestError',
    guarded instanceof ApiRequestError,
    guarded instanceof Error ? guarded.name : typeof guarded,
  )
  check(
    'carrying the code the client switches on',
    guarded instanceof ApiRequestError && guarded.code === 'UNAUTHENTICATED',
    guarded instanceof ApiRequestError ? guarded.code : '',
  )
  check(
    'and the status, for logging only',
    guarded instanceof ApiRequestError && guarded.status === 401,
  )

  const badRange = await getAvailability({ service: SERVICE, from: day(9), to: day(2) }).then(
    () => null,
    (error: unknown) => error,
  )
  check(
    'an inverted range is RANGE_INVERTED, not a generic failure',
    badRange instanceof ApiRequestError && badRange.code === 'RANGE_INVERTED',
    badRange instanceof ApiRequestError ? badRange.code : '',
  )

  // --- Signed in ---------------------------------------------------------
  console.log('\nSigned in as Marsh')
  await signIn(MARSH)

  const me = await getMe()
  check('getMe resolves the chart', me.patient?.email === MARSH, me.patient?.id)

  const mine = await getMyAppointments()
  check('getMyAppointments parses', mine.when === 'upcoming', `${mine.appointments.length} rows`)
  const past = await getMyAppointments('past')
  check('the window travels', past.when === 'past')

  // --- Writes ------------------------------------------------------------
  console.log('\nWrites')

  const slot = offered.slots[0]
  if (!slot) throw new Error('No slot to book. Reseed.')

  const created = await bookAppointment({
    service: SERVICE,
    providerId: slot.providerId,
    startsAt: slot.startsAt,
  })
  booked.add(created.appointment.id)
  check(
    'bookAppointment parses the 201 body',
    created.appointment.status === 'CONFIRMED' && created.appointment.startsAt === slot.startsAt,
  )

  // The same slot, immediately: the engine no longer offers it.
  const twice = await bookAppointment({
    service: SERVICE,
    providerId: slot.providerId,
    startsAt: slot.startsAt,
  }).then(
    () => null,
    (error: unknown) => error,
  )
  check(
    'booking a taken slot throws a 409 the UI can branch on',
    twice instanceof ApiRequestError &&
      (twice.code === 'SLOT_TAKEN' || twice.code === 'SLOT_UNAVAILABLE') &&
      twice.status === 409,
    twice instanceof ApiRequestError ? `${twice.status} ${twice.code}` : '',
  )

  const later = offered.slots.find(
    (candidate) =>
      candidate.providerId === slot.providerId &&
      new Date(candidate.startsAt).getTime() >= new Date(slot.blockedUntil).getTime(),
  )
  if (!later) throw new Error('No clear second slot for that provider. Reseed.')

  const moved = await rescheduleAppointment(created.appointment.id, {
    providerId: later.providerId,
    startsAt: later.startsAt,
  })
  check(
    'rescheduleAppointment keeps the id and moves the time',
    moved.appointment.id === created.appointment.id && moved.appointment.startsAt === later.startsAt,
  )

  const cancelled = await cancelAppointment(created.appointment.id)
  check('cancelAppointment parses', cancelled.appointment.status === 'CANCELLED')

  const again = await cancelAppointment(created.appointment.id)
  check('cancelling twice is not an error', again.appointment.status === 'CANCELLED')

  const stranger = await cancelAppointment('00000000-0000-4000-8000-000000000000').then(
    () => null,
    (error: unknown) => error,
  )
  check(
    'an id that is not yours is NOT_FOUND',
    stranger instanceof ApiRequestError && stranger.code === 'NOT_FOUND',
    stranger instanceof ApiRequestError ? stranger.code : '',
  )

  // --- The request that never arrives ------------------------------------
  //
  // Driven through the real client rather than constructed by hand: the claim
  // is that `request` turns a dead connection into a NetworkError, and only
  // calling it can show that.
  console.log('\nWhen the API is unreachable')

  origin = 'http://127.0.0.1:9'
  const unreachable = await getHealth().then(
    () => null,
    (error: unknown) => error,
  )
  origin = API

  check(
    'a dead connection is a NetworkError, not an ApiRequestError',
    unreachable instanceof NetworkError,
    unreachable instanceof Error ? unreachable.name : typeof unreachable,
  )
  check(
    'and it says something a patient could act on',
    unreachable instanceof NetworkError && unreachable.message.includes('connection'),
    unreachable instanceof NetworkError ? unreachable.message : '',
  )
  check('the API is reachable again afterwards', (await getHealth()).status === 'ok')

  // --- The claim that parsing is load-bearing -----------------------------
  //
  // Every check above passes whether the body is parsed or cast, because the
  // server is honest. This is the one that does not: a real response measured
  // against the wrong contract has to fail at the boundary, which is the entire
  // argument for not writing `as MeResponse`.
  console.log('\nParsing, not casting')

  const offContract = await request({ path: '/health', schema: availabilityResponse }).then(
    () => null,
    (error: unknown) => error,
  )
  check(
    'a real body that violates its schema throws at the boundary',
    offContract instanceof ZodError,
    offContract instanceof Error ? offContract.name : typeof offContract,
  )
  check(
    'and the failure names the field, not the component that would have rendered it',
    offContract instanceof ZodError && offContract.issues.length > 0,
    offContract instanceof ZodError ? offContract.issues[0]?.path.join('.') : '',
  )

  // --- The retry policy ---------------------------------------------------
  //
  // The library retries three times by default. Asking again about a 409 gets
  // the same true answer while the patient waits.
  console.log('\nWhat is worth retrying')

  check('a 409 is not retried', !isRetryable(new ApiRequestError('SLOT_TAKEN', 'x', 409)))
  check('a 401 is not retried', !isRetryable(new ApiRequestError('UNAUTHENTICATED', 'x', 401)))
  check('a 500 is retried', isRetryable(new ApiRequestError('INTERNAL', 'x', 500)))
  check('an unreachable API is retried', isRetryable(new NetworkError(new Error('offline'))))

  console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} FAILED.`}`)
  if (failures > 0) process.exitCode = 1
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    // Anything booked here is cancelled through the API it was created with.
    for (const id of booked) {
      await cancelAppointment(id).catch(() => undefined)
    }
    if (booked.size > 0) console.log(`Cancelled ${booked.size} appointment(s).`)
  })

