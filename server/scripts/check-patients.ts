// Proves GET /api/admin/patients against real cookies and real rows.
//
// Run with `npm run db:patients --workspace=@dental/server` after a seed. The
// route tests drive a stub that cannot search; this is what it cannot show —
// that the match really is case-insensitive, that several words narrow, that a
// `%` or `_` in the query is a character and not a LIKE wildcard, and that the
// page cap holds against more real rows than it can carry.
//
// The seed's patients are left alone; the extra rows planted to overflow one
// page are deleted before the script exits.

import type { Server } from 'node:http'
import { PATIENT_DIRECTORY_PAGE_SIZE, type AdminPatientsResponse } from '@dental/shared'
import { createApp } from '../src/app'
import { auth } from '../src/auth'
import { databaseIsReachable, prisma } from '../src/db'
import { env } from '../src/env'

const PASSWORD = 'not-a-real-secret'
const MARSH = 'elena.marsh@example.com'
const ADMIN = 'dana.whitfield@example.com'
/** Sorts last and matches nothing in the seed, so planting it moves no seeded row's position. */
const PLANTED_SURNAME = 'Zzplanted'
const PLANTED = 22
const SEEDED_ORDER = ['Lindqvist', 'Marsh', 'Marshall', 'Nakamura', "O'Brien", 'Okafor']

let failures = 0
let server: Server | undefined

function check(label: string, ok: boolean, detail = ''): void {
  if (!ok) failures += 1
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

type Session = { cookie: string }
type Envelope = { error?: { code: string; message: string } }

function makeClient(base: string) {
  async function signIn(email: string): Promise<Session> {
    const res = await fetch(`${base}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { Origin: env.CLIENT_ORIGIN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD }),
    })
    if (res.status !== 200) throw new Error(`sign-in failed for ${email}: ${res.status}`)
    return { cookie: res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') }
  }

  async function search(session: Session | null, q?: string) {
    const query = q === undefined ? '' : `?q=${encodeURIComponent(q)}`
    const res = await fetch(`${base}/api/admin/patients${query}`, {
      headers: { Origin: env.CLIENT_ORIGIN, ...(session ? { Cookie: session.cookie } : {}) },
    })
    const body = (await res.json()) as Partial<AdminPatientsResponse> & Envelope
    return { status: res.status, body, surnames: (body.patients ?? []).map((p) => p.lastName) }
  }

  return { signIn, search }
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i])

async function main() {
  const app = createApp({ db: prisma, auth, databaseIsReachable, timeZone: env.CLINIC_TIMEZONE })
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s))
  })
  const { port } = server.address() as { port: number }
  const { signIn, search } = makeClient(`http://localhost:${port}`)

  console.log(`Patient directory proof on port ${port}.`)
  console.log('Real app, real Better Auth, real Postgres.\n')

  const admin = await signIn(ADMIN)
  const marsh = await signIn(MARSH)

  console.log('Who may ask')
  check('a stranger is refused', (await search(null)).status === 401)
  check('a signed-in patient is refused', (await search(marsh)).status === 403)

  console.log('\nThe seeded directory')
  const all = await search(admin)
  check('200 for an admin', all.status === 200, `${all.status}`)
  check('six charts, alphabetical by surname', same(all.surnames, SEEDED_ORDER), all.surnames.join(', '))
  check('nothing was cut off', all.body.truncated === false)

  const byName = (name: string) => all.body.patients?.find((p) => p.lastName === name)
  check('a registered patient has an account', byName('Marsh')?.hasAccount === true)
  check('a chart with no login does not', byName('Okafor')?.hasAccount === false)
  check(
    'no phone, birth date or insurance on the wire',
    !/phone|dateOfBirth|insurance|userId/.test(JSON.stringify(all.body)),
  )

  console.log('\nSearching')
  check('case does not matter', same((await search(admin, 'MARSH')).surnames, ['Marsh', 'Marshall']))
  check('a fragment matches inside a name', same((await search(admin, 'arsh')).surnames, ['Marsh', 'Marshall']))
  check(
    'a second word narrows rather than widens',
    same((await search(admin, 'elena marshall')).surnames, ['Marshall']),
  )
  check('the words may come in either order', same((await search(admin, 'marshall elena')).surnames, ['Marshall']))
  check('email is searched too', same((await search(admin, 'marcus.okafor@')).surnames, ['Okafor']))
  check('an apostrophe is a character', same((await search(admin, "o'brien")).surnames, ["O'Brien"]))
  check('a miss is an empty list, not an error', (await search(admin, 'nobody')).surnames.length === 0)

  console.log('\nWildcards are text')
  const percent = await search(admin, '%')
  check("'%' matches nothing, since no name or email contains one", percent.surnames.length === 0, percent.surnames.join(', '))
  const underscore = await search(admin, '_')
  check("'_' matches nothing either", underscore.surnames.length === 0, underscore.surnames.join(', '))

  console.log('\nThe page cap')
  await prisma.patient.createMany({
    data: Array.from({ length: PLANTED }, (_, i) => ({
      firstName: `Planted${String(i + 1).padStart(2, '0')}`,
      lastName: PLANTED_SURNAME,
      email: `planted${i + 1}@example.com`,
    })),
  })

  const capped = await search(admin)
  check(
    `an unfiltered list stops at ${PATIENT_DIRECTORY_PAGE_SIZE}`,
    capped.body.patients?.length === PATIENT_DIRECTORY_PAGE_SIZE,
    `${capped.body.patients?.length}`,
  )
  check('and says there are more', capped.body.truncated === true)
  check(
    'the cut falls at the end of the alphabet, not in the middle of it',
    same(capped.surnames.slice(0, SEEDED_ORDER.length), SEEDED_ORDER),
  )

  const narrowed = await search(admin, PLANTED_SURNAME)
  check(`narrowing to the ${PLANTED} planted rows lifts the cap`, narrowed.body.patients?.length === PLANTED)
  check('and stops saying there are more', narrowed.body.truncated === false)
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    server?.close()

    const { count } = await prisma.patient.deleteMany({ where: { lastName: PLANTED_SURNAME } })
    if (count > 0) console.log(`\nCleaned up ${count} planted patient(s).`)

    console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} FAILED.`}`)
    if (failures > 0) process.exitCode = 1

    await prisma.$disconnect()
  })
