// Stubs shared by the route and middleware tests. Everything is injected, so those
// tests drive real routing, real schemas and real error mapping with no Postgres and
// no `.env`; the DB-backed paths are proven by the `npm run db:*` scripts.

import type { Role } from '@dental/shared'
import type { PrismaClient } from '../../generated/prisma/client'
import type { AuthLike } from '../middleware/auth'

export type StubUser = {
  id: string
  email: string
  firstName: string
  lastName: string
  role: Role
}

export const PATIENT_USER: StubUser = {
  id: 'user_patient_1',
  email: 'elena.marsh@example.com',
  firstName: 'Elena',
  lastName: 'Marsh',
  role: 'PATIENT',
}

export const ADMIN_USER: StubUser = {
  id: 'user_admin_1',
  email: 'dana.whitfield@example.com',
  firstName: 'Dana',
  lastName: 'Whitfield',
  role: 'ADMIN',
}

export type StubChart = {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
  dateOfBirth: Date | null
  insuranceProvider: string | null
  insuranceMemberId: string | null
}

export const PATIENT_CHART: StubChart = {
  id: '3d604f00-0000-4000-8000-0000000000a1',
  firstName: 'Elena',
  lastName: 'Marsh',
  email: 'elena.marsh@example.com',
  phone: null,
  dateOfBirth: null,
  insuranceProvider: null,
  insuranceMemberId: null,
}

/** Only `api.getSession` is reachable from the middleware; `handler` is mounted but never called. */
export function stubAuth(user: StubUser | null): AuthLike {
  return {
    api: { getSession: async () => (user ? { user, session: {} } : null) },
    handler: async () => new Response(null, { status: 404 }),
  } as unknown as AuthLike
}

/** A session store that is reachable but broken — proves it is not read as anonymous. */
export function brokenAuth(): AuthLike {
  return {
    api: {
      getSession: async () => {
        throw new Error('session store unreachable at 127.0.0.1:5432')
      },
    },
    handler: async () => new Response(null, { status: 404 }),
  } as unknown as AuthLike
}

/** `chart` is what `findUnique` returns for any lookup — null means this login owns none. */
export function stubPatientDb(chart: StubChart | null): Pick<PrismaClient, 'patient'> {
  return {
    patient: { findUnique: async () => chart },
  } as unknown as Pick<PrismaClient, 'patient'>
}

/**
 * `chart` backs three calls at once: `findUnique` is what `requireAuth`
 * itself uses to resolve `patientId` (null means this login owns no chart,
 * same as `stubPatientDb`), and `findUniqueOrThrow`/`update` are the profile
 * route's own reads and writes.
 *
 * Mutated by `update` the way Postgres would be — closed over, not reset per
 * call, so a test can PATCH and then read back what it wrote through the same
 * stub the way a real save-then-reload does.
 */
export function stubProfileDb(chart: StubChart | null): Pick<PrismaClient, 'patient'> {
  let current = chart

  const found = () => current ?? raise()
  const raise = (): never => {
    throw new Error('stubProfileDb: no chart for this login')
  }

  return {
    patient: {
      findUnique: async () => (current ? { id: current.id } : null),
      findUniqueOrThrow: async () => found(),
      update: async ({ data }: { data: Partial<StubChart> }) => {
        current = { ...found(), ...data }
        return current
      },
    },
  } as unknown as Pick<PrismaClient, 'patient'>
}

/**
 * An interactive transaction that runs the callback against the same stub.
 *
 * No isolation and no rollback — a stub has no snapshot to take. It exists so
 * the code under test takes its real path; what a transaction actually buys is
 * proven against Postgres by the `npm run db:*` scripts.
 */
export function stubTransaction<T extends object>(db: T): Pick<PrismaClient, '$transaction'> {
  return {
    $transaction: async (run: (tx: T) => unknown) => run(db),
  } as unknown as Pick<PrismaClient, '$transaction'>
}
