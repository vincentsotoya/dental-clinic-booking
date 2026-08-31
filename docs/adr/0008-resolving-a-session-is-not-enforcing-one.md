# Resolving a session is not enforcing one

`GET /api/me` must answer a stranger with `200 { user: null }` rather than 401 — "who am I?" has a
valid answer for someone who is not signed in, and a 401 on every cold page load is an error
Phase 5's query client would retry, log, and surface as a failure. But every other authenticated
route must refuse that same stranger.

So the guard splits in two, over one shared `resolve` function that is the only code in the project
that calls Better Auth's session API:

- `attachSession` — resolves the cookie, attaches the result, refuses nobody. `/api/me` uses it.
- `requireAuth` — the same resolution, then `UNAUTHENTICATED` if there is nobody.
- `requireRole(...)` — `requireAuth`, then `FORBIDDEN` if the role is not in the list.

## `req.auth` has three values, not two

Express can only type an augmented request property as optional, so `undefined` exists whether we
want it or not. Rather than assert it away at every call site, the three states are given three
meanings:

| value | meaning |
|---|---|
| `undefined` | neither middleware ran — the route is mis-wired, our bug |
| `null` | a middleware ran, nobody is signed in |
| `SessionContext` | a middleware ran, this is who it is |

Collapsing `undefined` into `null` is the tempting simplification and the expensive one. A route
that lost its middleware would then be indistinguishable from an anonymous visitor, so it would
answer 401 — sending the user to a login screen that cannot fix anything, because they will log in
successfully and hit the same 401 again. `getSession` and `getAuth` therefore throw `INTERNAL` on
`undefined`: a wiring bug is loud, immediate, and blamed on the right party.

This is not hypothetical. The first version of `createMeRouter` accepted `attachSession` as a
dependency and forgot to mount it; the distinction turned that into a failing test with the reason
in the message, rather than a route that quietly claimed nobody was ever logged in.

## Consequences

A guarded request costs two round trips — Better Auth's session lookup, then ours for the chart id.
The library owns its tables (ADR-0006) and will not join `patients`, and reading its session table
ourselves is exactly the boundary that ADR forbids crossing.

`SessionContext.patientId` is nullable, and callers must handle it. An admin receives no care and
has no chart; a patient can briefly have none in the ADR-0007 window where the signup hook fails
after the user row commits. Null means "cannot book", not "not authenticated".

`requireRole` answers 403 while ADR-0007 insists a stranger's row is a 404. Both are right: that
rule governs data addressed by id, where a 403 distinguishes a row that exists from one that does
not and lets someone count the clinic's bookings. Refusing a patient the admin calendar reveals
nothing they did not already know from typing the URL.
