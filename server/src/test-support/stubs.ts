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

export const PATIENT_CHART = {
  id: '3d604f00-0000-4000-8000-0000000000a1',
  firstName: 'Elena',
  lastName: 'Marsh',
  email: 'elena.marsh@example.com',
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
export function stubPatientDb(chart: typeof PATIENT_CHART | null): Pick<PrismaClient, 'patient'> {
  return {
    patient: { findUnique: async () => chart },
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
