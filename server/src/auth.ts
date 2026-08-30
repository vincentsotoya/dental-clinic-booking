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

  databaseHooks: {
    user: {
      create: {
        /**
         * Give every new patient login a chart, so "signed up" and "can book"
         * are the same state.
         *
         * The chart is always new. Adopting an unlinked Patient with a matching
         * email would be the friendlier behaviour and is the reason
         * `patients.email` is no longer unique — but until Phase 10 verifies an
         * address, an email in a signup body is a claim, and honouring it hands
         * over an appointment history, a date of birth and insurance details to
         * whoever guessed it. See ADR-0007.
         *
         * Only for PATIENT. An admin administers the schedule and receives no
         * care, so a chart for one would be a row that means nothing.
         *
         * Failure window, accepted knowingly: this runs *after* the user
         * transaction commits, so if the insert below fails the login exists
         * with no chart. `GET /api/me` then answers `patient: null` and booking
         * is refused — visible and recoverable at the front desk. The
         * alternative, creating the chart lazily on first read, makes a GET
         * write, which is a worse property than a rare, loud inconsistency.
         */
        after: async (user) => {
          if (user.role !== 'PATIENT') return

          // Keyed on userId rather than created blindly: the hook is cheap to
          // re-run and this makes a retry idempotent instead of duplicating a
          // chart.
          await prisma.patient.upsert({
            where: { userId: user.id },
            create: {
              userId: user.id,
              firstName: String(user.firstName ?? ''),
              lastName: String(user.lastName ?? ''),
              email: user.email,
            },
            update: {},
          })
        },
      },
    },
  },
})

export type Auth = typeof auth
