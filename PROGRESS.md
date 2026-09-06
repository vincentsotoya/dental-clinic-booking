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
- [x] **(C)** `vercel.json` — SPA rewrite, root-scoped install, `client/dist`. The three pages
      need no API and deploy today; auth and appointments are dead until Phase 11 hosts the rest

## Current Task

- [ ] **(C)** `GET /api/services` and `GET /api/providers` — public, read-only, zod schemas in
      `shared`. Until they exist both pages read `client/src/content/preview-data.ts`, which is a
      hand-transcribed photocopy of the seed and will drift from it

## Next

- [ ] **(V)** Booking flow: ServicePicker → DentistPicker → Calendar → SlotGrid → Confirm

## Active Blockers

- **The accent hue is unsettled.** Two reference sites pointed away from cobalt; all three
  candidates were measured and none is disqualified on contrast. Cobalt ships until it is decided,
  and the decision is one edit to `index.css`

## Recent Decisions

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
- **Deployed before the booking flow exists, and the page says so.** A visitor who discovers it by
  pressing the button and landing back where they started concludes booking is broken, not absent
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
  while passing every type check. Stripped everywhere, with one exception: `calendar.tsx`'s
  dropdown, where the focused element is a `<select>` at `opacity-0`
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
