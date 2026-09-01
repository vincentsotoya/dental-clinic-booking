# Progress

Reference: `CONTEXT.md` (domain language) · `docs/database-design.md` (schema rules) ·
`docs/roadmap.md` (all phases) · `docs/concepts.md` · `docs/adr/`

Working mode: Claude writes the code and explains the reasoning inline; Vincent reads and
questions. **(S)** marks a task driven by a skill session.

## Current Phase

Phase 5 — Patient frontend, the first shippable portfolio state. Phase 4 is complete: book,
list, cancel and reschedule, each proven against real rows, with every change appended to an
event log inside the transaction that made it.

## Completed

- [x] Phase 0 — repo, skills, domain model settled → `CONTEXT.md`, ADR-0001–0003
- [x] PostgreSQL 17 installed, running as a service on 5432
- [x] `dental_clinic` database created, `btree_gist` available
- [x] Resolve appointment buffer constraint design — see ADR-0004
- [x] Scaffold monorepo — npm workspaces `shared` / `server` / `client`; `GET /api/health`
      verified end to end, all three workspaces typecheck, client builds
- [x] `.env.example` at repo root, `.env` created locally
- [x] Prisma 7.10.0 installed and initialized in `server/` — connects to `dental_clinic`,
      `GET /api/health` reports `database: up`
- [x] `schema.prisma` — 8 models, 3 enums, snake_case mapped
- [x] Migration `20260829145823_init` applied, hand-edited with `btree_gist`, both `EXCLUDE`
      constraints and 6 `CHECK` constraints
- [x] 🎯 Constraints proven against the real schema: provider overlap, operatory overlap,
      buffer-only overlap, dishonest `blocked_until` and reversed times all rejected;
      back-to-back accepted
- [x] `prisma/seed.ts` — 5 providers, 10 services, 3 operatories, 47 working-hours rows,
      1 time off, 1 closure, 10 appointments. Idempotent: wipe-then-insert on fixed UUIDs
- [x] 🎯 Postgres session pinned to UTC in `server/src/db.ts` — see `database-design.md`
- [x] **Phase 1 complete**

- [x] `server/src/services/intervals.ts` — the interval algebra, 41 tests
- [x] ADR-0005 — the two availability rules written down
- [x] `server/src/services/clinic-time.ts` — clinic-calendar helpers extracted out of `seed.ts`;
      `seed.ts` imports them and reseeds identically
- [x] `server/src/config.ts` — `LEAD_TIME_MINS`, `SLOT_GRID_MINS`, `MAX_AVAILABILITY_DAYS` as
      clinic policy, not env
- [x] 🎯 The engine in three layers: `availability.ts` decides (pure, `now` injected),
      `availability-query.ts` loads, `availability-response.ts` serialises
- [x] `shared/src/` — one module per endpoint; request, response and error schemas for
      availability
- [x] `server/src/app.ts` + `server/src/routes/` — `createApp(deps)` separated from `listen`,
      routers take their dependencies as arguments, one error-mapping module
- [x] 🎯 `GET /api/availability` verified with curl against the seeded week: 378 slots over six
      days, first slot 08:00 EDT → `2026-08-31T12:00:00.000Z` in Operatory 2, closure day 200
      with an empty list, all five error codes returning their statuses
- [x] 🎯 `npm run db:availability` — cancelling the seeded 08:00 cleaning frees 08:00 and 08:15
      and restoring re-blocks them, proving the CONFIRMED-only filter against real rows
- [x] **Phase 2 complete** — 125 tests green

- [x] Phase 3 design settled by a `/grill-with-docs` session → ADR-0006, ADR-0007, `CONTEXT.md`
      gains **User** and **Admin**, Phase 3 rescoped to the server in `docs/roadmap.md`

- [x] Better Auth 1.7.2 against Prisma/Postgres — `server/src/auth.ts`, `BETTER_AUTH_SECRET` /
      `BETTER_AUTH_URL` / `CLIENT_ORIGIN` through `env.ts`
- [x] Migration `20260830060324_add_better_auth` — the four generated tables, hand-extended with
      a `user_role_valid` CHECK
- [x] 🎯 The role CHECK proven against the real table: `ADMIN` and `PATIENT` accepted, `WIZARD`
      and the empty string rejected

- [x] `Patient.userId` nullable + unique with a hand-added FK; `patients.email` unique index
      dropped; signup hook creates a fresh chart — migration `20260830150840_link_patient_to_user`
- [x] 🎯 Proven against real rows: signing up as `elena.marsh@example.com` creates a **new** chart
      and leaves hers unlinked, a body claiming `role: "ADMIN"` produces a `PATIENT`, and deleting
      a login leaves the chart standing with `user_id` back to null

- [x] Seed grows logins — Marsh, Nakamura and an admin through `auth.api.signUpEmail`; the wipe
      now clears `user` and `verification` too, and the seed prints the three credentials
- [x] 🎯 All three sign in for real: roles come back `PATIENT`/`PATIENT`/`ADMIN`, a wrong password
      is rejected, both patients keep their fixed chart id with its 5 appointments and insurance,
      the admin has none, and a reseed still ends at 2 charts / 3 logins

- [x] `shared/src/errors.ts` — one `apiErrorCode` registry, `baseErrorCode` / `guardedErrorCode` /
      `availabilityErrorCode` as `.extract()` subsets of it, `errorBody()` builds the envelope;
      `server/src/errors.ts` holds one throwable `ApiError`, `INVALID_QUERY` renamed
      `INVALID_REQUEST`
- [x] 🎯 All six availability error paths re-curled against the running server: the three
      `AvailabilityQueryError` cases prove the handler's single `instanceof ApiError` catches the
      subclass, and the happy path still answers with slots

- [x] `/api/auth/*splat` mounted above `express.json()`; `attachSession` / `requireAuth` /
      `requireRole` in `server/src/middleware/`; `GET /api/me` + `shared/src/me.ts`; `ROLES`
      moved to `shared` — ADR-0008
- [x] 🎯 Real cookies over real HTTP for the first time: sign-in returns a session token,
      `/api/me` resolves Marsh's seeded chart (the one with 5 appointments) and withholds her
      insurance, the admin comes back `patient: null`, a forged cookie reads anonymous rather
      than 500, and a replayed token after sign-out is dead

- [x] 🎯 `npm run db:authz` — 29 checks over real cookies and real rows: the two patients'
      appointment lists are disjoint and sum to the admin's, Marsh gets 404 on a Nakamura row
      that provably exists, and that 404 is byte-identical to the one for an id that never
      existed. Both tamper cases edit inside the token, not its base64 padding
- [x] **Phase 3 complete** — 162 tests green

- [x] `shared/src/appointments.ts` — the booking contract; `SLOT_UNAVAILABLE` and `SLOT_TAKEN`
      added to `apiErrorCode`, both 409
- [x] `server/src/services/booking.ts` — re-run the engine, insert, catch `23P01`;
      `server/src/routes/appointments.ts` — `POST /api/appointments` behind `requireAuth`
- [x] `calendar.dateOf(instant)` — the inverse of `clinicInstant`, which booking needs and
      `today()` now delegates to
- [x] `GET /api/appointments/me` — `?when=upcoming|past|all`; `getChartId` in
      `auth-context.ts` is the seam both appointment routes share; `bookedAppointment` renamed
      `patientAppointment` now that two endpoints send it
- [x] 🎯 `npm run db:booking` — 34 checks over real cookies and real rows. The race is pinned,
      not hoped for: a rival insert held in an open transaction is invisible to the re-check, so
      the route decides the slot is free, blocks on the GiST index, and takes a real `23P01` on
      commit. The two patients' lists are disjoint *and* each equals its own chart's row count,
      with a planted backdated row proving `past` and `all`
- [x] 🎯 Every claim falsified: stub out `isSlotTaken` and the loser turns 500; remove the
      re-check and Postgres accepts a 3am booking with a 201; drop `patientId` from the WHERE
      clause and each patient reads all 12 rows

- [x] `server/src/middleware/ownership.ts` — `requireOwnership` composed over `requireAuth`,
      plus `getOwnedAppointmentId` as the only way to read what it cleared
- [x] `errorHandler` no longer echoes a hand-thrown `INTERNAL` message — one fixed 500 message,
      written once, with the real one logged
- [x] 🎯 `npm run db:authz` now drives the real guard, not a stand-in — 30 checks, and every
      claim falsified: drop the chart id from the WHERE clause or widen the admin branch and
      Marsh reads Nakamura's row with a 200; drop the UUID parse and a malformed id 500s

- [x] `shared/src/appointments.ts` — the cancel contract; `NOT_CANCELLABLE` added to
      `apiErrorCode` as a 409. `server/src/services/appointment-view.ts` now holds the one
      patient projection all three appointment routes share
- [x] `server/src/services/cancellation.ts` and `PATCH /api/appointments/:id/cancel`, mounted
      behind `requireOwnership` — its first real caller
- [x] 🎯 `npm run db:cancel` — 22 checks over real cookies and real rows. Cancelling frees the
      slot for real: the freed time books again with a 201, while the row survives as CANCELLED.
      The race is pinned, not hoped for — the front desk's COMPLETED is held in an open
      transaction, the cancellation blocks on the row lock, and on commit its WHERE clause
      matches nothing
- [x] 🎯 Every claim falsified: drop `status` from the UPDATE's WHERE clause and a patient's
      cancellation overwrites the clinic's COMPLETED with a 200; drop the legality check and a
      visit that already started cancels; mount the route on `requireAuth` and Marsh cancels
      Nakamura's

- [x] `shared/src/appointments.ts` — the reschedule contract; `NOT_RESCHEDULABLE` added to
      `apiErrorCode` as a 409
- [x] `findAvailability` takes `excludeAppointmentId`; `refusalToChange` extracted to
      `server/src/services/appointment-state.ts`, where cancel and reschedule both read it
- [x] `server/src/services/rescheduling.ts` and `PATCH /api/appointments/:id/reschedule`
- [x] 🎯 `npm run db:reschedule` — 28 checks over real cookies and real rows, including both
      races: a rival booking held in an open transaction turns the move into a real `23P01`
      from an UPDATE, and the front desk marking the row COMPLETED mid-move wins the row lock
- [x] 🎯 Falsified, and it corrected the proof twice: removing `excludeAppointmentId` makes an
      appointment block its own move with a 409; removing the status from the UPDATE's WHERE
      clause lets a move overwrite the clinic's COMPLETED. The cancelled-row check passed with
      its branch deleted until the planted row was moved into the future — backdated, it was
      being refused for having started

- [x] `AppointmentEvent` + `ActorRole` in `schema.prisma`; migration
      `20260901120755_add_appointment_events`, hand-edited for the actor FK and a CHECK that an
      event describes a change
- [x] `server/src/services/appointment-events.ts` — one writer, called from inside booking's,
      cancellation's and rescheduling's transactions; the three services take an `actor`, the
      routes read it off the session, the seed acts as `SYSTEM`
- [x] 🎯 `npm run db:events` — 21 checks over real rows: an appointment's booking, move and
      cancellation land as three events, the move records the time it came from, the front desk's
      cancellation names the admin rather than the chart's owner, a refused change writes nothing,
      and asking to cancel twice logs once
- [x] 🎯 The two FK directions proven opposite: deleting the login that acted leaves the event
      standing with `actor_user_id` null, deleting the appointment takes its events with it
- [x] 🎯 Falsified: record the new time as `fromStartsAt` and the move's own claim collapses;
      hardcode the actor role and the front-desk case names the wrong person
- [x] **Phase 4 complete** — 282 tests green, 139 checks across five `db:*` proofs

- [x] `/design-taste-frontend` — **Cobalt & Cream**; tokens in `client/src/index.css`, reasoning
      in `docs/design-system.md`, specimen page published as an artifact. Outfit + Geist installed
      and self-hosted, client still builds
- [x] Impeccable installed from its own marketplace; `/impeccable init` → `PRODUCT.md` at the
      repo root, inherited by `client`. Practice named **Quillon Dental**, fictional and checked
      against real US practices before adoption

## Current Task

- [ ] Typed API client + TanStack Query over the four appointment endpoints

## Next

- [ ] Session hook over `GET /api/me` + protected routes, then the marketing pages

## Active Blockers

- None

## Recent Decisions

- The practice is **Quillon Dental**, fictional. Three candidates were searched against real US
  practices first and two were rejected for colliding (`Fernwood Dental` exists in Austin;
  `Alder` collides three ways). Recorded in `PRODUCT.md` as fictional so no later session treats
  it as an operating business
- Photography will be **open-license stock**, never described as this clinic's own rooms or staff.
  A stock portrait is never captioned as a named provider
- Service prices are published as **list prices before insurance**, with the reason said plainly to
  the patient. That is ADR-0003 in the patient's own words rather than a gap to hide: the system
  records a plan and cannot compute a share, so it must not imply one
- `PRODUCT.md` lives at the repo root, not `client/`. The product truth spans the API as well, the
  repo already keeps its durable docs there, and Impeccable resolves it from the client as
  `../PRODUCT.md`
- `/impeccable init` moved ahead of the components. It captures product truth, and the roadmap had
  it running after every page was built, which would have meant retrofitting them. `critique` and
  `/review-animations` stay at the end, where a review pass belongs
- **Cobalt on cream, not teal.** Every dental practice in the search results is teal or mint;
  adopting it would make the site invisible in the market it depicts. Full reasoning and the
  measured contrast table in `docs/design-system.md`
- The primary button's label is **dark** in dark mode. White on lifted cobalt measures 3.64:1 and
  fails AA, so the token is `accent-ink` and never `white` — a component hardcoding `text-white`
  is correct in one mode and unreadable in the other, and nothing in the type system objects
- Dials are 5 / 3 / 4, not the skill's 8 / 6 / 4 baseline. Healthcare is a trust-first constraint
  that outranks aesthetic preference, and Phase 11 already commits to Lighthouse ≥ 95 and
  keyboard-only booking. The focus ring and `prefers-reduced-motion` are base styles for that
  reason, so no component can forget them
- Cabinet Grotesk was dropped for **Outfit**: Fontshare-only, so it ships as a hand-committed
  binary or a font CDN `<link>`, and neither belongs in the production critical path
- The design skill covers marketing surfaces and explicitly excludes wizards and product UI, which
  is half of Phase 5. The booking flow and the appointments list inherit the tokens and none of
  the composition advice; how picking a slot *feels* is a separate session before those components
  are written
- The log records **events, not status changes**. A reschedule changes no status and is the one
  change with something irreplaceable to record: the appointment row keeps only where it is now,
  so the time it moved from survives nowhere else
- Every event is written inside the transaction that made the change. A log that can be written
  after the commit is a log that can be missing, and the two must land together or not at all
- Events carry the actor, and the actor is the **login**, not the chart. They differ exactly when
  the front desk acts for a patient, which is the case the column exists to tell apart
- `ON DELETE SET NULL` on the actor, `CASCADE` on the appointment. Deleting a login forgets who
  acted, never what happened; deleting an appointment takes a log that describes only it
- **Prisma proposes dropping both hand-written FKs in every migration it generates.** It cannot
  see them, so it reads them as drift. Deleting those `DROP CONSTRAINT` lines is now part of
  writing a migration — see `docs/database-design.md`
- `prisma migrate dev` blocks on an interactive prompt in this setup. The migration applied and
  `prisma generate` finished the job; `migrate status` is the way to check what really landed
- The idempotent second cancellation writes no event. It changes nothing, and a log that says a
  thing happened twice when it happened once is worse than no log
- A reschedule moves the row rather than cancelling it and booking a new one. The appointment
  is the same commitment at a different hour: the id in a confirmation link stays valid and the
  patient's list shows one booking, not a cancellation they never asked for
- The cost of that, and the reason the next task is what it is: the original time is kept
  nowhere. `AppointmentStatusHistory` has to record a move, not only a status change
- The row is excluded from its own re-check. Left in, its own buffer covers the slot it is
  moving into, so 09:00 could never shift to 09:15 for its own provider — proven by deleting the
  exclusion. The exclusion constraints still see it, and `EXCLUDE` compares distinct rows, so
  the row cannot collide with itself at write time either
- The body carries a provider and a start, never a service. Changing the treatment is booking a
  different appointment, and a thirty-minute exam that could become a ninety-minute crown in the
  same slot is the substitution the booking contract already refuses
- `bufferMins` is re-snapshotted on a move, not carried over. The row is being placed afresh, so
  it takes the buffer in force now — and `blockedUntil` was computed with that one, which the
  CHECK constraint insists on (ADR-0004)
- Moving a cancelled appointment is refused rather than treated as a revival — a released slot
  would come back on the books without passing through booking
- `NOT_RESCHEDULABLE` is its own code beside `NOT_CANCELLABLE`, for what is currently one
  predicate. A clinic that allows a late cancellation but not a late move is an ordinary policy,
  and it arrives as a change to one code rather than a split of a shared one
- Only the clock check is load-bearing before the write. Cancelled and closed-out are both
  caught again by `status = 'CONFIRMED'` in the UPDATE; they stay because they refuse before the
  engine runs and name the reason
- Cancel is a named sub-resource, not `PATCH { status }`. Status is not the patient's field to
  set — `COMPLETED` and `NO_SHOW` are the clinic's judgements — and a route that took one would
  spend its first lines refusing two of the four values
- Two guards that do not overlap, both proven by deletion: the legality check refuses a visit that
  already started, which is a fact about the clock no WHERE clause on `status` can express, and
  the status repeated in the UPDATE's WHERE clause refuses one the front desk closed out a
  millisecond ago
- Cancelling an already-cancelled appointment is 200, not 409. A double tap and a retried request
  both asked for the state the row is already in; calling that a conflict is a lie about what
  happened
- No notice window. A clinic would rather hear at 7am that nobody is coming at 9 than have the
  chair sit empty, and refusing a late cancellation converts a patient into a no-show. Charging
  for one is Phase 9's problem
- One `NOT_CANCELLABLE` for every refusal about the row's own state, following `SLOT_UNAVAILABLE`.
  Which one it was belongs in the message, not in a code the client would switch on to say the
  same sentence three ways
- An admin may cancel any appointment — the front desk taking a phone call, and the same ADR-0007
  branch that lets them read one
- `requireOwnership` clears an id and never hands over the row, which turned out to leave ADR-0007
  with no exception in it — the ADR is amended to match what was built
- A hand-thrown `INTERNAL` was reaching the client with its own message, which the error registry
  promises never happens. The handler now logs it and sends the one fixed message
- `getChartId(req)` is where "the caller's own chart, or 403" lives, because both appointment
  routes need it and a route that forgot it would silently act on `undefined`. An admin gets 403
  rather than an empty list: "you have no appointments" and "this account cannot have any" are
  different claims and only one is true
- The list sends cancelled and completed rows and lets the client filter. A patient who cancelled
  yesterday and sees no trace of it concludes the clinic lost it, not that the cancellation worked
- `?when` defaults to `upcoming` — the slice a "my appointments" screen opens on, and the only
  one bounded by reality. `past` grows without limit, so it must be asked for by name; paginating
  it is Phase 6's problem, on the screen that will actually scroll
- `db:authz`'s `/probe` list route is now redundant and stays anyway; `/probe/appointments/:id`
  is no longer a stand-in at all — it runs the real `requireOwnership`, and only its handler is
  scaffolding for the cancel and reschedule routes that will sit behind it
- The re-check and the exclusion constraints enforce different things. The constraints know one
  rule — no two CONFIRMED rows overlap for a provider or a room — and nothing about hours, lunch,
  closures, lead time or provider type. Proven, not asserted: delete the re-check and `db:booking`
  books 3am
- Optimistic insert rather than a lock, because there is no row to lock — the conflict is with an
  appointment that does not exist yet. SERIALIZABLE would add a retry loop to every booking and an
  advisory lock would be load-bearing in every future write. The constraint's index entry already
  is the predicate lock
- Prisma has no code for an exclusion violation: it surfaces as `P2039`, a generic driver-adapter
  passthrough, with the real `23P01` at `meta.driverAdapterError.cause.code`. Matched on the
  SQLSTATE — matching `P2039` would turn every driver failure into a cheerful 409.
  `booking.test.ts` pins the recorded shape so a Prisma upgrade that moves it fails loudly
- The body carries a slug, a provider and a start, and nothing else. `endsAt` is derived from the
  service: a body that could name its own would book a ten-minute crown, and no constraint would
  object — they police overlap, not honesty about duration
- No `operatoryId` in the body either, though availability sends one. The room is not the
  patient's choice, and re-picking it means a patient whose offered room was taken still gets
  their time rather than a pointless 409
- One `SLOT_UNAVAILABLE` for every way a slot can be absent. The engine reports what is bookable,
  not why something is not; deriving a reason here would re-do its work and get it subtly wrong
- Both booking refusals are 409, not 400: the request was well formed and was true when the client
  was told it, and the fix is to re-read the clinic's state
- `bookAppointmentErrorCode` omits `NOT_FOUND` — nothing here is addressed by a caller-supplied
  id, so there is no stranger's row to hide. Cancel and reschedule will list it
- An account with no chart — an admin, or ADR-0007's gap — gets 403, not 404. No id was supplied,
  so there is nothing being probed for. An admin booking for a patient is a Phase 7 route
- The booking transaction is for one consistent snapshot of the engine's five reads, not for the
  race. It does not prevent the race and is not meant to; it is also the seam
  `AppointmentStatusHistory` slots into
- The concurrency proof is deterministic, not a `Promise.all` and a hope: a rival booking held in
  an open transaction is invisible at READ COMMITTED, so the loser fails the *constraint* rather
  than the re-check, which is the path that needed proving
- The seed signs up through `auth.api.signUpEmail`, never an INSERT: a hand-written `user` row has
  no `account` row, so it has no password hash and cannot log in
- Signup charts a second, empty patient (ADR-0007 — it never adopts), so the seed deletes that one
  and links the seeded chart instead. That is the Phase 7 front-desk merge, performed by the only
  actor that currently may. Delete before update, in one transaction: `user_id` is unique
- The admin is promoted by a server-side `user.update` after signup. `input: false` means even the
  seed cannot ask for a role in a signup body — which is the point of the flag
- Better Auth mints user ids, so logins are the one seeded thing without a fixed id; email is their
  stable handle. One fixture password for all three, printed by the seed
- Ownership is a WHERE clause and a stranger's row is a 404; signup never adopts a chart by
  unverified email — see ADR-0007
- Better Auth's four tables keep the library's conventions, and `/api/auth/*` keeps its error
  dialect — see ADR-0006
- Roles are `PATIENT | ADMIN`. A provider login is a Phase 7 decision with Phase 7 requirements
  in front of it
- `role` is a Better Auth `additionalFields` with `input: false` — without that, a signup body
  carrying `role: "ADMIN"` mints an admin. Not the `admin` plugin, which brings impersonation,
  banning and a permissions DSL nothing here needs
- `role` is `TEXT` + a `CHECK`, not a Prisma enum: the generator emits a string and rewrites
  those models on every upgrade, so the constraint lives in migration SQL instead
- `patients.user_id` is a plain column, not a Prisma relation — the opposite half would be a
  field on the regenerated `User`. The FK is hand-written, `ON DELETE SET NULL`: deleting a login
  must never delete a medical record
- `patients.email` is no longer unique. Two charts may share an address; identity is `user.email`
- The signup hook runs *after* the user transaction commits, so a failed chart insert leaves a
  login with no chart — visible as `patient: null`, recoverable at the front desk. Creating the
  chart lazily on first read was rejected: a GET that writes is the worse property
- Regenerate with `npx auth generate`, never `npx @better-auth/cli` — the latter is deprecated,
  lags the library, and silently omits `Account.issuer`
- Signup collects `firstName` and `lastName` as separate fields; `User.name` is their join.
  Splitting one name on a space is wrong for *van der Berg*, and wrong silently
- `auth` is an `AppDeps` dependency like `db`; its handler mounts **above** `express.json()`
  (a body parser consumes the stream) at `/api/auth/*splat` (Express 5 rejects a bare `*`)
- Resolving a session and enforcing one are separate middlewares over one `resolve`, so
  `/api/me` can answer a stranger while every other route refuses them. `req.auth` is
  three-valued — `undefined` means no middleware ran and is a 500, not a 401 — see ADR-0008.
  That caught a real bug: `createMeRouter` took `attachSession` and forgot to mount it
- `db:authz` builds its own app: real middleware, real auth, real Postgres, but `/probe`
  routes standing in for Phase 4's. The proof needs a route addressed by an id, and its checks
  are written to fail — deleting the WHERE clause turns 6 of them red
- `/api/me` reads the chart rather than echoing the login. The two records diverge the first
  time the front desk merges (Phase 7) or a patient edits their details (Phase 6)
- `/api/me` sends identity only. DOB, phone and insurance are the schema's most sensitive
  fields and this route is called on every cold load
- `ROLES` lives in `shared`, not `server/src/auth.ts` — the client types `/api/me` with it and
  Phase 7 renders admin navigation from it
- A guarded request costs two round trips: Better Auth's session lookup, then ours for the chart
  id. It owns its tables (ADR-0006) and will not join `patients`
- No CORS middleware. Vite proxies `/api` in dev so requests are same-origin; it becomes a real
  decision when the client is deployed separately in Phase 11
- One error vocabulary, many contracts: `apiErrorCode` is the whole registry and each endpoint
  declares a `.extract()` subset of it. Extending the availability enum instead would make that
  contract claim it can return `FORBIDDEN`; `.extract()` is a compile-time proof a subset is drawn
  from the registry, so an invented code fails the build in `shared` rather than in a route
- `INVALID_QUERY` is now `INVALID_REQUEST` — one code for any Zod failure, since Phase 4 posts
  bodies. Renamed while only tests consumed it
- One `ApiError` class in `server/src/errors.ts`, not one per feature: the handler does a single
  `instanceof`, and a forgotten per-feature branch would turn a named failure into a 500.
  `AvailabilityQueryError` stays as a subclass purely to narrow the codes that layer may throw
- `FORBIDDEN` is a 403 and does not contradict ADR-0007. That ADR is about data addressed by id,
  where a 403 is an oracle that counts the clinic's bookings. A role check has no such oracle
- Routers are factories taking `{ db, timeZone, now }` — the same injection the engine and the
  calendar already use. Route tests drive real routing and real schemas over a stub, needing
  neither Postgres nor a `.env`
- `createApp()` is separate from `app.listen()`; a module that opens a socket at import time
  cannot be imported by a test
- One error envelope for the endpoint, `INTERNAL` included, so the client parses one shape.
  A 500 never echoes the underlying message — it can name a table or a connection string
- Availability responses are `Cache-Control: no-store`. A cached slot list offers times that
  are already taken
- Dates cross the wire as `YYYY-MM-DD` and parse straight to `{year, month, day}` — never
  through a `Date`, which would be UTC midnight and so the previous evening in the clinic
- Each slot carries the clinic-zone civil `date` it falls under, so the client groups by a
  string instead of redoing timezone arithmetic the server already knows the answer to
- The response sends providers as a map keyed by id, and only those with a free slot — the
  name would otherwise repeat on hundreds of slots, and the full roster would leak which
  providers exist but are fully booked
- No operatory name on the wire. The room is not the patient's choice, so only the id travels
- `MAX_AVAILABILITY_DAYS` is enforced on the server only — one home for the number; the query
  layer rejects and the route maps it to a 400
- Services are addressed by `slug`, not id — stable, already unique, keeps UUIDs out of the
  public URL and makes a query readable in a log
- The loader fetches **every** CONFIRMED appointment in the window, not just the queried
  provider's: another provider's appointment occupies a room, and that room is unavailable to
  this one
- Availability reads are issued in parallel, not in a transaction — a Slot is a candidate and
  the exclusion constraints are the real guard. Phase 4's booking transaction is where a
  consistent read matters
- A Slot is a candidate, not a reservation: two providers free at the same instant are both
  offered the first free room, because nothing is held until a row is written
- Room choice is deterministic — operatories sorted by name, first free one wins
- Timezone conversion lives in one module and takes the zone as an argument, so tests run at
  `America/New_York` on any machine
- Vitest is the test runner — shares the toolchain the Vite client already uses
- Prisma's Postgres session is pinned to UTC — it sends `DateTime` as a naive timestamp and
  Postgres resolved it in the machine's zone. Details in `docs/database-design.md`
- Seeded appointments anchor to the Monday after today, so the data never goes stale; the UUIDs
  stay fixed so fixtures written against them keep working
- `server/tsconfig.json` includes `prisma/` and `scripts/` — files there were escaping
  `npm run typecheck`
- `blockedUntil` is a stored column, not a computed expression — see ADR-0004
- Insurance is recorded, not adjudicated — see ADR-0003
- Cleaning and dentist exam are separate bookable services — see ADR-0002
- Postgres enforces no-double-booking via `EXCLUDE USING gist` — see ADR-0001
- Development runs on local Postgres 17; hosted Neon deferred to Phase 11
- Prisma pinned to the 7.x line — `prisma`'s `latest` tag is an 8.0 release candidate
- `npm audit` reports 3 high (deepmerge-ts) via the Prisma **CLI**, a devDependency. Not fixed:
  the only fix downgrades to Prisma 6. Dev-time only, no untrusted input. Revisit when Prisma
  ships a patched `@prisma/config`.
