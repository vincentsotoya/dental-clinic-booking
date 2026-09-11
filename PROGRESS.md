# Progress

Reference: `CONTEXT.md` (domain language) · `docs/database-design.md` (schema rules) ·
`docs/roadmap.md` (all phases) · `docs/concepts.md` · `docs/adr/` ·
`docs/decisions-log.md` (decisions from closed phases)

Working mode: Claude writes the code and explains the reasoning inline; Vincent reads and
questions. **(S)** marks a task driven by a skill session.

## Current Phase

Phase 5 — Patient frontend, the first shippable portfolio state. Phase 4 is complete: book,
list, cancel and reschedule, each proven against real rows, with every change appended to an
event log inside the transaction that made it.

## Completed

Phases 0–4 are closed; `docs/roadmap.md` lists what each one covered and
`docs/decisions-log.md` keeps their reasoning.

- [x] **Phase 0** — repo, skills, domain model settled → `CONTEXT.md`, ADR-0001–0003
- [x] **Phase 1** — Postgres 17, `dental_clinic`, Prisma 7.10.0, `schema.prisma` (8 models,
      3 enums), migration `20260829145823_init` hand-edited with `btree_gist`, both `EXCLUDE`
      constraints and 6 `CHECK`s, all proven against the real schema; idempotent `prisma/seed.ts`
- [x] **Phase 2** — the availability engine in three layers, `GET /api/availability` verified
      by curl against the seeded week and by `npm run db:availability`. 125 tests
- [x] **Phase 3** — Better Auth over Prisma/Postgres, `Patient.userId` linkage, one error
      registry in `shared`, session middleware, `GET /api/me`. `npm run db:authz`. 162 tests
- [x] **Phase 4** — book, list, cancel, reschedule, each behind `requireOwnership` where it
      applies, every change appended to `AppointmentEvent` inside its own transaction. Five
      `db:*` proofs, 139 checks, every claim falsified by deletion. 282 tests

Phase 5, in progress:

- [x] **(S)** `/design-taste-frontend` — **Cobalt & Cream**; tokens in `client/src/index.css`,
      reasoning in `docs/design-system.md`. Outfit + Geist installed and self-hosted
- [x] **(S)** Impeccable installed from its own marketplace; `/impeccable init` → `PRODUCT.md` at
      the repo root. Practice named **Quillon Dental**, fictional, checked against real US
      practices before adoption
- [x] **(C)** `client/src/api/` — every response parsed through the shared schema, per-endpoint
      error unions, query keys, hooks, argued QueryClient defaults
- [x] 🎯 `npm run check:api --workspace=@dental/client` — 27 checks driving the production client
      against the running API. Falsified: cast instead of parse and the off-contract check stops
      throwing
- [x] **(C)** React Router v8; `client/src/auth/` — `useSession` over `/api/me`, `RequireAuth` as
      a nested route, Better Auth's client for sign-in/out actions only
- [x] Client test setup (vitest + jsdom + Testing Library) — 7 tests driving the guard through a
      real memory router over a seeded cache. Falsified: delete the `loading` branch and the guard
      redirects a patient whose session has not resolved yet
- [x] **(C)** UI library settled: **shadcn/ui**. The token adapter publishes Cobalt & Cream under
      shadcn's names, so a generated component is correct without being edited — ADR-0009.
      13 components installed; `danger` enters the palette for destructive actions only
- [x] 🎯 Proven in the built CSS, not asserted: `.text-primary-foreground{color:var(--accent-ink)}`
      with `--accent-ink:#121316` in the dark block. `ui-invariants.test.ts` guards the four
      adaptations — regenerating `button.tsx` from the registry turns five red
- [x] **(C)** Home, Services and Dentists — three routes under `PublicLayout`, floating nav with
      the active route marked by `NavLink`, provider strip with monograms in place of portraits
- [x] **(C)** `vercel.json` — SPA rewrite, root-scoped install, `client/dist`
- [x] **(C)** `GET /api/services` and `GET /api/providers` — `shared/src/catalogue.ts`, one
      router in `server/src/routes/catalogue.ts`, `useServices` / `useProviders` on the client.
      `content/preview-data.ts` is deleted; the pages, the strip and every count on them now read
      the API. Formatters live in `client/src/lib/format.ts`
- [x] 🎯 `npm run db:catalogue` — 16 checks over real rows: retiring a service removes it from the
      catalogue and restoring it brings it back, a departed provider leaves the directory while
      their row survives, and no operational column reaches the wire
- [x] 🎯 Falsified: drop `where: { isActive: true }` and a retired treatment is offered again.
      Widening the `select` did *not* leak `bufferMins` — the parse strips it, which corrected the
      claim the route's comment was making
- [x] **(C)** Booking flow — `client/src/booking/`, route `/book` under `PublicLayout`. Five
      steps, one availability request per month, and the whole booking in the URL. Public until
      the last step: availability is public, so a visitor reaches a real time before being asked
      who they are. **Was marked (V)** — see Active Blockers
- [x] **(C)** Both 409s handled in the confirm step, which is the only screen that can lose the
      race. `SLOT_UNAVAILABLE` is the common one; `SLOT_TAKEN` is the true constraint race
- [x] `client/src/lib/clinic-time.ts` — every slot rendered in the clinic's zone, every calendar
      date built at local midnight so it never round-trips through UTC
- [x] 🎯 34 tests over the flow: the URL state machine through a real router, the slot algebra,
      and the whole flow driven over a stubbed `fetch` so the real query keys, `request()` and
      schema parsing all run. Falsified: stop clearing downstream answers and changing the
      treatment keeps a slot chosen for a different one
- [x] 🎯 The flow's exact payload against real Postgres: 201 with the note, the same instant again
      answers 409 `SLOT_UNAVAILABLE`, cancel cleans up. The dev machine's zone renders that 8:30am
      slot as 9:30pm, which is the bug `clinic-time.ts` exists to prevent, seen live
- [x] **(C)** Signup and sign-in — `routes/SignIn.tsx`, `routes/SignUp.tsx` and `auth/AuthShell`,
      react-hook-form over the shared schemas. Where the patient was going moved out of router
      state into `?next=`, read back through `safeNext`. **Was marked (V)** — see Active Blockers
- [x] **(C)** `shared/src/credentials.ts` — the password rule the server enforces and the form
      states, as one constant. `server/src/auth.ts` imports it, and sets `maxPasswordLength` too
- [x] 🎯 22 tests over the two screens and `safeNext`. Falsified twice: drop the redirect
      validation and five turn red, including the one that actually navigates; move
      `PASSWORD_MIN_LENGTH` to 14 and the form's own message moves with it
- [x] 🎯 The real endpoints by curl: 11 characters refused `PASSWORD_TOO_SHORT`, 12 accepted, and
      `/api/me` on the new cookie answers with a chart — signed up and can book are one state. A
      wrong password and an unknown email came back byte-identical. Proof rows deleted after
- [x] **(S)** `/impeccable critique` over the booking flow — **27/40**, one P0 and four P1s.
      Snapshot in `.impeccable/critique/`, which `/impeccable polish` reads its priorities from.
      Verdict: the copy is authored for this product, the composition is not
- [x] **(C)** The P0: step changes announce themselves. Focus moves to the step that replaced the
      one just answered, an `aria-live` region says the position, and the title names the
      question. The *visible* step indicator is the composition session's, not this fix's
- [x] 🎯 Falsified three ways, one red test each: drop the `focus()` and focus stays on `<body>`;
      drop `aria-live` and the announcement is text nothing reads; drop the first-render guard and
      the page steals focus from a patient who just arrived
- [x] **(S)** `/impeccable shape` — the composition session the design system deferred, settled in
      `docs/booking-composition.md`. No code: shape returns a brief and stops
- [x] **(C)** Step 1 — two doors above a deliberately ordered list, treatment name over price.
      Order is a slug list in `ChooseService.tsx`; the doors are ADR-0010
- [x] 🎯 9 tests, falsified three ways: stop sorting and the list leads with Child Cleaning again;
      rank an unknown slug at -1 and a new treatment jumps the queue instead of joining the end;
      build the doors without reading the catalogue and a retired service keeps its door
- [x] **(C)** Step 4 — morning/afternoon split at the clinic's noon, each group collapsing to six
      behind a counted disclosure, led by "Earliest — 10:15 AM". `clinicHour` is new in
      `clinic-time.ts`
- [x] 🎯 9 tests, falsified three ways: split on the browser's hour and two turn red on a machine
      at UTC+9; stop collapsing and six becomes thirteen; drop `aria-expanded` and the disclosure
      redraws the list without saying it grew
- [x] 🎯 Against real rows: 9 September returns 17 distinct times, 4 morning / 13 afternoon, and
      the boundary falls where the clinic's lunch actually is — morning ends 11:00 AM, afternoon
      starts 1:00 PM. Nothing tuned to make that land
- [x] **(C)** Position and revision split into three controls — `StepHeader.tsx` carries the
      progress bar and Back, `StepTrail.tsx` still jumps but says what a jump will clear first,
      and `questions.ts` holds the flow's wording once. Back is derived from the step, never
      from history
- [x] 🎯 14 tests, falsified seven ways, one red run each: a history-based Back turns the sign-in
      round trip red; an off-by-one `previous` turns five red; dropping `aria-hidden` says the
      position twice; jumping without asking turns three red; asking about the last answer turns
      one red; and each of the two focus moves turns one
- [x] 🎯 In the built CSS, not in the class names: `--spacing:.25rem` against `.min-h-11` and
      `.h-11` puts every new control at 44px
- [x] **(S)** `/review-animations` — **Block**, six findings, all applied. `pressable` and
      `--ease-out` are new in `index.css`; the progress bar scales instead of resizing; the
      button names the properties it transitions; reduced motion drops movement and keeps colour
- [x] 🎯 Proven in the built CSS: `.pressable:active{transform:scale(.97)}` at
      `cubic-bezier(.23,1,.32,1)`/160ms, and the reduce block's `transition-property` allowlist
      with no `transform` in it. Falsified: regenerating `button.tsx` from the registry turns
      seven red, two of them the new ones

- [x] **(C)** Deploy, everything up to the publish — `client/public/robots.txt` and a `noindex`
      meta unlist the site while it has no API, and the README's status table no longer says there
      is no user interface
- [x] 🎯 The built `client/dist` served under `vercel.json`'s own rewrite: six routes including
      two deep links return the app shell, `/api/*` returns 404, and `robots.txt` is served as a
      file rather than swallowed by the SPA rewrite. A 404's HTML body fails `apiError.safeParse`,
      so the shell degrades to "we couldn't load" with a retry rather than crashing
- [x] **(V)** Published to Vercel from the repo root, preset "Other", no environment variables to
      set — the client calls `/api` same-origin, so there is no base URL to configure
- [x] 🎯 The same rewrite on Vercel's edge, against the live URL: `/`, `/dentists` and a `/book`
      deep link return one identical shell, `robots.txt` is served as a file, `/api/*` 404s, and
      the shipped CSS carries `.pressable:active{transform:scale(.97)}` and `--spacing:.25rem`

- [x] **(C)** `lg` is 44px, not 40 — the size every primary action uses, at all eight call sites.
      `ChooseTime` had already overridden the variant for one button with the same argument; a
      second call site making the same override is the variant being wrong
- [x] 🎯 Falsified: restore `h-10` and exactly the new invariant turns red. In the shipped bundle
      rather than the source, `h-11 rounded-pill px-6`. The stylesheet is unchanged because
      `.h-11` was already emitted for the trail crumb — this change is in the class the button
      asks for, so the bundle is where it shows

- [x] **(V)** 🎯 The calendar cell measured: **32px at both 390px and 1440px**, which falsified the
      reasoning that it grew with the viewport. `root: "w-fit"` shrink-wrapped the grid to
      `--cell-size`, so the column never widened
- [x] **(C)** The calendar sizes its days from the column instead — `w-full max-w-sm`, square kept.
      43px at 390px and 51px at 1440px, up from 32px, and it cannot overflow: raising
      `--cell-size` to 44px alone would have needed 308px of row against 302px available at 390px
- [x] 🎯 Falsified: restore `w-fit` and exactly the new invariant turns red

- [x] **(C)** The critique's last P1, the cheap half: `/appointments?booked=` now confirms the
      booking by name, marks its row in words as well as colour, moves focus to the confirmation,
      and says no email is coming. The dedicated confirmation screen with an `.ics` is Phase 6's.
      All four P1s are closed
- [x] 🎯 6 tests, falsified three ways: match on the parameter instead of the id and a typed URL
      confirms a stranger's booking; drop the `CONFIRMED` check and a cancelled one is still
      "booked"; drop the `focus()` and focus stays on `<body>`
- [x] 🎯 Against real rows: the id `POST /api/appointments` returned was a `CONFIRMED` row in the
      list's default window, and after a real cancel it was still there as `CANCELLED`, so the
      status check is needed against real data, not only in the fixture. Proof rows deleted after

## Current Task

- [ ] **(C)** The critique's P2 — step 4 promises "Nothing is held until you confirm" and the
      confirm step says "before we can hold this". One word: *book*

## Next

- [ ] **Phase 6** — the patient account: my appointments, cancel, reschedule, profile and
      insurance details. The Phase 4 endpoints are already built and proven; this is their screens,
      plus the dedicated booking confirmation with an `.ics` download

## Active Blockers

- **The accent hue is unsettled.** Two reference sites pointed away from cobalt; all three
  candidates were measured and none is disqualified on contrast. Cobalt ships until it is decided,
  and the decision is one edit to `index.css`
- **The critique's browser half never ran.** No browser automation was exposed and `detect.mjs`'s
  URL mode needs puppeteer, which is not a dependency. Its four touch-target numbers have since
  been settled and fixed; contrast, spacing rhythm and responsive behaviour are still unmeasured,
  and still need a browser
- **A month of availability is 352KB uncompressed** for a popular service — 1,482 slots, of which
  the calendar needs only the 20 distinct dates. Tolerable gzipped, and the fix is a days-only
  projection on the server rather than anything on the client
- **The deployed site needs an API that is not deployed.** Seen live, not predicted: the public
  pages and `/book` render their copy, their skeletons and then "We couldn't load our
  treatments". Phase 11 hosting the server clears it. Until then the site is deliberately unlisted
  rather than reverted — the transcript was the thing being removed, and a portfolio piece found
  in a broken state reads as broken software. The Vercel project is named
  `dental-clinic-booking-server` but serves the client, so Phase 11 wants its own project rather
  than this one

## Recent Decisions

- **A confirmation needs a row, not a parameter.** `?booked=` is a URL anyone can type or
  bookmark, so the message appears only when that id is one of the patient's own `CONFIRMED`
  rows. The parameter is left in place rather than cleared: a refresh still shows something true,
  and a cancelled booking stops being confirmed without the page doing anything
- **The confirmation says no email is coming.** Email is Phase 10. A patient waiting for one
  concludes the booking failed, so the page says so and makes itself the record
- **The calendar's days are sized by the column, not by a token.** 44px squares need 308px of row;
  390px offers 302px, and `min-w` means the row cannot shrink, so raising `--cell-size` would have
  traded a small tap target for a horizontal overflow on every phone. Filling the card degrades
  instead: 43px at 390px, 51px from 430px up, square at every width. The 0.9px under 44 at 390px is
  accepted — the alternative was spending the page's mobile gutters to buy it
- **The live URL waits for its API before the README names it.** The pipeline is worth proving now,
  but a link that fails on every page is worse than no link on a piece meant to be read by an
  interviewer. It goes in with the edit that removes `robots.txt` and the `noindex` meta, so the
  three move together
- **The first deploy ships unlisted, not public.** The roadmap put Deploy in Phase 5 and hosting in
  Phase 11, which means a live URL that fails on every page for several phases. `robots.txt` and
  `noindex` are what let both be true: the pipeline is proven now, on the push where a Vercel
  config problem is cheap to find, and nobody lands on the failure in the meantime
- **Reduced motion drops movement, not motion.** The blanket `transition-duration: 0.01ms` also
  switched off colour and opacity, which are feedback a patient reads rather than movement they
  can be hurt by. Narrowing `transition-property` on `*` is what drops transform and width
  while keeping the rest, and it stays a base rule so no component has to remember it — the same
  argument the focus ring is a base style
- **A press is the only feedback a phone gives.** The flow is one-handed on a device where hover
  never fires, so every card, pill and crumb pressed the same as a dead element until it acted.
  One `pressable` utility rather than the class on each control, because the value is a decision
  and decisions are stated once
- **Back is one question, not one history entry.** The sign-in round trip leaves entries in
  history that are not the flow's own, so `history.back()` from the confirm step returns to the
  sign-in screen. Deriving the destination from the step and clearing exactly one answer is the
  only version compatible with a step derived from the choices — and it clears exactly one because
  the step is the *first unanswered* question, so nothing after it is set
- **The drawn progress bar is decoration; the live region is the progress indicator.** `Book.tsx`
  already announces "Step 4 of 5", so the visible one is `aria-hidden` — two of them say the
  position twice. Both count from the same `stepIndex`, so they cannot drift
- **A jump says what it will clear, except when it clears nothing.** Which is always the most
  recent answer, so the common revision costs no extra press. The confirmation is a disclosure
  under the trail rather than a modal — the same `aria-expanded` vocabulary step 4 already uses
- **The accessible name goes on `aria-label`, not in an `sr-only` span.** The name computation
  joins across the element boundary without a space: "Back" plus " to the day" came out
  `"Backto the day"`, measured, not guessed
- **The question order is stated once.** `DOWNSTREAM` was a table restating the order in
  `QUESTIONS`; `downstreamOf` derives it, and `previous` and `discards` read the same list.
  A table and a list that disagree is a class of bug, not a typo
- **Step 1 and step 4's decisions live in `docs/booking-composition.md`** — the doors, the noon
  split computed through `clinicHour`, the counted disclosure and the service-order slug list,
  each with the reasoning that settled it
- **The shortcut stays away when there is no list to skip.** "Earliest" appears only past six
  times; on a short day it is one more thing to read rather than a saving. Same shape as step 1's
  doors — a shortcut duplicates a row on purpose, and earns its place only where scanning costs
- **Two of ten services are named at the front door, and that needed an ADR** (ADR-0010). The doors
  route to a visit type, never a symptom to a treatment: the first is triage a receptionist does,
  the second is a treatment plan the system may not imply
- **A step change is a navigation with no page load, so it has to say so.** Focus moves to the
  step that replaced the answered one, because otherwise the pressed button unmounts and focus
  falls to `<body>` — nothing announced, and the next Tab starting from the top of the page. The
  live region carries the position because moving focus does not convey it
- **The P0 split in half: behaviour now, the visible indicator later.** Focus, announcement and
  title are defects whatever the flow ends up looking like. "Step 3 of 5" as a *drawn* thing is a
  composition decision, and building it before that session means designing it twice
- **The critique named the gap the design system predicted.** `docs/design-system.md` gave this
  flow "these tokens only — interaction patterns are an open question", and the 27/40 is mostly
  that: error prevention scores 4, the copy scores 4, and the composition scores 2s. Step 1 sorts
  a pain-driven choice alphabetically and step 4 shows 26 identical pills
- **Where the patient was going is a query parameter, not router state.** `?next=` survives a
  refresh of the sign-in screen and the hop to sign-up; `location.state` survives neither, and
  loses the chosen slot silently. The same argument that put the booking in the URL
- **An unvalidated `?next=` is an open redirect**, so `safeNext` is what reads it back: three
  spellings rejected, not one, because "starts with a slash" is not "is a local path" —
  `//evil.example` is protocol-relative. Proven by deleting the validation
- **One sentence whether the email or the password was wrong.** The server already answers both
  with `INVALID_EMAIL_OR_PASSWORD` — checked, and the two bodies are identical — so a message
  naming which half failed would leak what the server refused to. Signup cannot keep that secret
  and does not pretend to: a taken address has to be refused
- **The password rule lives in `shared`, not in the form.** A form that does not know the rule can
  only discover it by being rejected, and asks for a password twice to say it was too short the
  first time. `maxPasswordLength` is set explicitly for the same reason — a default is not a
  shared constant
- **Sign-in validates the password's presence, never its strength.** Checking an existing password
  against a rule that may since have been raised rejects a correct password, phrased as a typo
- **The confirmation field is not habit.** Verification is off until Phase 10, so there is no
  password reset either: a typo is an account nobody can ever sign in to
- **Better Auth's extra fields are declared on the client, not inferred.** `inferAdditionalFields
  <typeof auth>()` cannot drift, but the import reaches into the server's Prisma types and env
  validation. ADR-0006 puts the seam at the URL prefix. `role` is left out on purpose: naming it
  would make `signUp.email({ role: 'ADMIN' })` compile against a server that ignores it
- **The auth screens sit outside `PublicLayout`.** A nav offering four ways to leave is wrong on a
  screen whose whole job is one short form. The wordmark stays — it is the only thing saying whose
  sign-in this is
- **The booking is the URL, and the step is derived from it.** A patient cannot be on "pick a
  time" with no service chosen because that state is not representable. Back and refresh work
  without being written, a half-finished booking is a link, and — the reason it was chosen — the
  sign-in round trip returns to the chosen slot rather than to an empty form
- **`provider=any` is spelled out rather than left absent.** "I have not chosen" and "I do not
  mind who" are different answers, and only one of them should stop the flow to ask
- **Changing an answer discards everything downstream of it.** A 9:00 that was free for a
  thirty-minute exam is not free for a two-hour root canal; carrying the instant forward would
  send a stale one to confirm. Proven by deleting the clearing — two tests turn red
- **Sign-in is asked for at the last step, not the first.** Availability is public, so asking
  first would make a visitor take on an account to find out whether the clinic has a Thursday
- **One availability request serves three steps.** The endpoint has no provider parameter, so
  narrowing to a provider is client-side and free; only paging the calendar to another month
  asks the server anything
- **Two providers free at 9:00 is one 9:00 to a patient.** Offering it twice asks them to choose
  between two things they cannot tell apart. Who it becomes is settled at the confirm step, from
  the response’s own ordering so it is deterministic, and it is named there rather than in a
  later email
- **The provider list comes from the catalogue, not from availability.** Availability names only
  providers with a free slot, so building the picker from it would erase a fully-booked dentist
  rather than show them as busy
- **A day is offered only if the engine returned a slot on it.** Closures, lunch, the lead time
  and a full book all disable a date through one mechanism; the client knows no clinic rules
- **Times render in the clinic’s zone and dates never round-trip through UTC.** The response
  echoes `timeZone` for exactly this. Seen live on the dev machine: an 8:30am slot renders as
  9:30pm in the browser’s zone
- The nav’s primary action is back, now that booking has somewhere of its own to go — which is
  the condition the decision to delete it named
- **The catalogue is a third projection of the same rows, not a reuse of availability's.**
  Availability answers "when can this be booked" and carries `bufferMins`; the catalogue answers
  "what is offered" and carries price and biography. One schema serving both audiences would be
  their union, and the buffer would end up quoted to a patient as part of their visit
- **It is the parse, not the `select`, that keeps a column off the wire.** Widening the select to
  fetch `bufferMins` leaked nothing — zod strips what the contract does not name. Discovered by
  trying to falsify the opposite claim, which the route's comment had been making
- **`public, max-age=300`, the only cacheable responses in this API.** Safe precisely because
  neither route reads a cookie, so a shared cache cannot hand one visitor another's answer. The
  deliberate opposite of availability's `no-store`, and the client's `staleTime` agrees with it
- **`isActive` is the load-bearing clause in both handlers**, and the one a stub cannot prove. A
  retired service and a departed provider keep their rows because appointments reference them;
  offering either books a visit the clinic cannot deliver
- **Counts are read, not written into the markup.** "Ten treatments", "Three dentists and two
  hygienists" and both "All ten →" links were transcribed numbers in prose — the same drift as the
  data file, one layer up. They are derived now, and an em dash stands where a count is not known
  yet rather than a zero that becomes five
- Home's featured four is a slug list, not `slice(0, 4)`. Taking the first four made an editorial
  choice out of whatever the server's ordering happened to put first — which, once ordered by type
  and name, led with crown preparation at $1,300
- A group with no treatments is hidden rather than shown empty, and a provider with no `title` or
  `bio` renders without a dangling separator. Both columns are nullable in the schema
- **A nav link went missing on a phone, and nothing said so.** The link row scrolled with the
  scrollbar suppressed, so `Dentists` slid off a narrow screen with no affordance at all. The
  scrollbar is visible now: overflow is the fallback, and a fallback that cannot be seen is a bug
- **Two controls, one destination.** The `Treatments` button and the `Services` link both pointed
  at `/services` after the rename, and the button took roughly the width the third link needed.
  Deleting it is most of the fix — a real primary action returns when booking has somewhere
  distinct to go
- The wordmark drops `Dental` below `sm` for the same reason: the second word costs about what the
  third link needs, and a brand that shortens beats a page that cannot be reached
- **Light on a laptop and dark on a phone is correct, not a bug.** The page follows
  `prefers-color-scheme` with no toggle (ADR-0009) and both palettes are measured. A later session
  should not "fix" this
- **The nav's shape came out of measurement, not taste.** Its fill is 1.04:1 against the page, so
  the border and shadow are what make it read at all; links stay at full ink because `muted` over
  a photographic backdrop is 2.95:1, which leaves the active pill carrying the state alone
- **`backdrop-blur` is set and currently invisible.** There is nothing behind the bar to blur, so
  it renders solid on flat cream. The alpha is capped where the worst-case composite — over pure
  black or pure white — still clears AA, so a photographic hero later needs no change here
- Active state is `accent-soft`, the token whose documented job is "a selected slot or an active
  step", and `NavLink` sets `aria-current` itself — the fill and the announcement cannot disagree
- **Monograms, not portraits.** `PRODUCT.md` forbids captioning a stock face with a fictional
  provider's name. Initials are a placeholder for commissioned illustration, never a stock face
- `/dentists` is a grid though Home uses the strip. On the page whose job is showing all five,
  putting three behind a horizontal scroll hides the answer; the strip's real second home is the
  booking flow's provider step
- **shadcn's names won, not the design system's.** Its components are generated against
  `bg-primary` / `text-muted-foreground`, and two names collided outright — its `accent` is a
  hover fill, its `muted` is a background. Adapting in `@theme inline` means every future
  `shadcn add` drops in already correct; adapting per component would be a manual translation
  forever, with a silent failure when one class is missed — ADR-0009
- **The adapter made the AA rule self-enforcing, and immediately caught a real bug.** The generated
  `button.tsx` and `badge.tsx` both shipped `bg-destructive text-white`, which is 2.79:1 on the
  dark-mode red — the exact failure `design-system.md` warns about, arriving pre-written
- **`outline-none` was the dangerous one.** It sits in Tailwind's utilities layer, ordered after
  base, so a generated `<Button>` would have silently disabled the project's only focus indicator
  while passing every type check. Stripped everywhere, `calendar.tsx` included, with no exception.
  The exception belongs to a *different* invariant: `calendar.tsx` alone may carry a `has-focus:`
  ring, because the focused element there is a `<select>` at `opacity-0` and the global outline
  would draw on nothing
- **No `.dark` class and no `@custom-variant dark`.** The page follows `prefers-color-scheme`,
  so leaving `dark:` at Tailwind's default is what makes the variants inside a generated component
  resolve at all. Adding the variant without a `.dark` class would make them dead code
- **`danger` is the one exception to "one accent"**, and only for destructive actions. Cancelling
  an appointment is a real one and Phase 6 builds it. `danger-ink` is dark in dark mode for the
  same measured reason `accent-ink` is
- `sonner.tsx` arrived importing `next-themes`. With no theme provider the answer is always
  `system`, and a dependency that computes a constant is not one — removed
- The invariants are asserted **against the component files, not a rendered tree**. The regression
  is `shadcn add --overwrite` putting the generator's version back, and that is damage to what the
  class strings say, which no render test would see
- TypeScript 7 **removed `baseUrl`**; `paths` now resolve relative to the tsconfig that declares
  them. The alias is duplicated in `vitest.config.ts` rather than shared — the file tests load, and
  the one that gets forgotten
- **A session has three states, not two.** `loading` is distinct from `anonymous` for the same
  reason `req.auth` is three-valued on the server (ADR-0008): collapsing them makes the guard
  bounce a signed-in patient to sign-in and back on every cold load. Proven by deleting the branch
- **`/api/me` is the only source of session truth**, not Better Auth's `useSession`. Better Auth
  owns its tables and will not join `patients` (ADR-0006), so its session has no chart id — and
  the chart id is what every appointment route needs. Its client is used for sign-in, sign-up and
  sign-out actions only, each followed by invalidating `me`
- Signing out **removes** the appointment queries rather than invalidating them. Invalidating
  leaves the previous patient's rows in the cache while they refetch, and the next person at a
  shared machine would see them
- `RequireAuth` guards the *interface*, never the data. Every route under it is already refused by
  the server for anyone who should not have it; removing the guard would leak nothing, it would
  only be rude
- React Router v8 over TanStack Router. TanStack would have let the booking flow's URL state reuse
  `availabilityQuery` from `shared`, which fits this project's thesis well — but the pages and the
  booking flow are **(V)**, and a router Vincent writes fluently outweighs a type win in the
  address bar
- Deep links work in dev because Vite falls back to `index.html`. A static host needs the same
  rewrite rule in Phase 11, or `/appointments` 404s on a refresh
- Responses are **parsed, not cast**. `as MeResponse` is a promise the compiler cannot keep, and a
  server that drifted would surface as a blank field three components from the cause. Proven
  load-bearing: with the parse removed, a real body measured against the wrong contract sails
  through
- Errors reach a component as `ApiRequestError` with the code narrowed to that endpoint's
  `.extract()` subset, so a booking handler sees `SLOT_TAKEN` and never `RANGE_TOO_LONG`. A body
  that is not even the error envelope becomes `INTERNAL` rather than leaking a proxy's HTML
- **Retries only for what a retry can fix**: 5xx and a dead connection. TanStack retries three
  times by default, which would ask about a 409 twice more while the patient waits, and resend a
  dead cookie on a 401
- **Availability has no stale window.** The server marks it `no-store` because a cached slot list
  offers times that are gone, and a slot was never a reservation. Mutations invalidate availability
  on failure too: a 409 is itself evidence the caller's list is stale
- The client has **no unit tests yet** — `check:api` covers the real paths, but the pure branching
  in `isRetryable` and `toApiError` deserves a vitest setup once components need one anyway
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
