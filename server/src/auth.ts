// The Better Auth instance: session issuing, password hashing, and the four
// tables it owns.
//
// The library's own conventions apply inside its tables and its routes, and
// stop at that boundary — see docs/adr/0006. What ownership *means* for the
// rows on our side of it is docs/adr/0007.

import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { prisma } from './db'
import { env } from './env'

/**
 * Two roles, deliberately. A provider login is a Phase 7 decision that needs
 * Phase 7's requirements in front of it, and adding a value to this union later
 * is one migration — far cheaper than designing permissions for a login that
 * does not exist.
 */
export const ROLES = ['PATIENT', 'ADMIN'] as const
export type Role = (typeof ROLES)[number]

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),

  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: [env.CLIENT_ORIGIN],

  emailAndPassword: {
    enabled: true,

    // False because there is nothing to send an email *with*: Resend arrives in
    // Phase 10. This is the single fact that makes chart-adoption-by-email
    // unsafe, which is why signup always creates a fresh Patient (ADR-0007).
    // Turning this on is what unlocks revisiting that rule.
    requireEmailVerification: false,

    // Above the library's default of 8. This is a portfolio app holding
    // fictional medical records; the cost of the stricter rule is one line.
    minPasswordLength: 12,
  },

  user: {
    additionalFields: {
      /**
       * `input: false` is the security-critical word here. Without it, Better
       * Auth accepts the field from the signup body, and `{"role":"ADMIN"}`
       * posted to /api/auth/sign-up/email mints an administrator. Roles are
       * granted server-side or not at all — the seed promotes its admin by
       * updating the row directly, for exactly this reason.
       */
      role: {
        type: ROLES as unknown as string[],
        required: false,
        defaultValue: 'PATIENT' satisfies Role,
        input: false,
      },

      /**
       * Collected separately rather than split out of `name`. A clinic's record
       * of who you are is not recoverable from one string: splitting on a space
       * mangles "van der Berg" and "Ana María", and does it silently, in the
       * field a receptionist reads back to a patient. Better Auth still gets a
       * `name` — it is built from these two, not the other way round.
       */
      firstName: { type: 'string', required: true, input: true },
      lastName: { type: 'string', required: true, input: true },
    },
  },
})

export type Auth = typeof auth
