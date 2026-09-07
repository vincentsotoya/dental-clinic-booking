// Better Auth's client, used for actions and nothing else.
//
// WHY THIS IS NOT THE SOURCE OF SESSION TRUTH
//
// The library ships its own `useSession`, and using it would give this app two
// answers to "who is signed in": the library's, from its own tables, and ours,
// from `GET /api/me`. Two sources drift, and the drift is silent.
//
// Ours wins, because it knows something the library's cannot. Better Auth owns
// its tables and will not join `patients` (ADR-0006), so its session has a user
// and no chart id — and the chart id is what every appointment route needs.
// `/api/me` resolves both in one answer.
//
// So this module exposes sign-in, sign-up and sign-out, and `use-session.ts`
// answers who the caller is. After any action here the `me` query is
// invalidated, which is the one line that keeps the two in step.

import { createAuthClient } from 'better-auth/react'
import { inferAdditionalFields } from 'better-auth/client/plugins'

export const authClient = createAuthClient({
  // Same-origin: Vite proxies /api to Express in dev. Phase 11 decides what
  // this is once the client is deployed separately.
  basePath: '/api/auth',

  plugins: [
    /**
     * The two name fields the signup form sends, declared rather than inferred.
     *
     * The library's shorthand is `inferAdditionalFields<typeof auth>()`, which
     * reads the server instance's own configuration and cannot drift. It is not
     * taken here because that import reaches into `server/src/auth.ts`, and
     * through it into Prisma's generated types and the server's env validation
     * — the client's typecheck would then depend on the server being built.
     * ADR-0006 puts the seam at the URL prefix; this keeps it there.
     *
     * `role` is deliberately absent. It is `input: false` on the server, and
     * naming it here would make `signUp.email({ role: 'ADMIN' })` compile
     * against a server that silently ignores it.
     */
    inferAdditionalFields({
      user: {
        firstName: { type: 'string', required: true, input: true },
        lastName: { type: 'string', required: true, input: true },
      },
    }),
  ],
})

export const { signIn, signUp, signOut } = authClient
