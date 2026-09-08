# Booking flow composition

How picking a slot should feel. `docs/design-system.md` gave this flow its tokens and explicitly
withheld its composition — "interaction patterns are an open question" — because the design skill
covers marketing surfaces and excludes wizards. This file is the answer to that question.

Settled in an `/impeccable shape` session after `/impeccable critique` scored the built flow
**27/40**. The critique snapshot is in `.impeccable/critique/`; its finding was that the copy is
authored for this product and the composition is not.

Product truth lives in `PRODUCT.md`, tokens in `client/src/index.css`, domain language in
`CONTEXT.md`. None of it is repeated here.

## The read

Mode is **Operate**: the visitor completes a task, so scanability and decision count outrank
expression. The patient is an adult booking for themselves, usually one-handed on a phone, usually
anxious. The job is narrow and finite.

What this flow can prove that a template cannot: **every time it shows is one the database has
already agreed to honour**, and nothing is held while the patient chooses. The interface says the
second half and has never said the first.

## The thesis

**Ask what the patient knows, not what the clinic files.**

Ten of the flow's problems are one problem. Step 1 asks for a procedure name when six of the ten
services are diagnoses a dentist makes. Step 4 hands over every start time the engine returned.
Both screens present the clinic's data model and ask the patient to translate.

## Step 1 — two doors before the list

"In pain today?" resolves to Emergency Toothache Visit. "First visit?" resolves to New Patient Exam
& X-rays. The full list stays underneath, in a deliberate order, with the treatment name outweighing
the price.

The two doors are why: alphabetical ordering buries the emergency visit sixth and the new-patient
exam seventh, so dentistry's most time-critical journey sits two phone-screens down. Ordering alone
would fix the burial and still ask a person in pain to recognise their need in a list of ten.

They must read as **entry points, not services**, or they become options eleven and twelve. Both set
the service through the same `choose('service', …)` as any card: the URL stays the state and there
is no second path through the machine.

Symptoms map to **visit types, never to treatments**. "Chipped tooth → Composite Filling" is a
treatment plan the system is not allowed to imply (`PRODUCT.md`, principle 2). Routing someone in
pain to an emergency appointment is not a diagnosis.

The price stops being the loudest thing on a card. An anxious patient's first impression of a root
canal should not be `$950` read before the name of the thing.

## Step 4 — split on the clinic's own day

Morning and afternoon groups, divided at the real two-hour lunch gap, led by one primary
**"Earliest — 9:15 AM"**. Each group collapses to about six behind an explicit "Show all 14
afternoon times".

Twenty-six identical pills is 6.5× the working-memory limit at the last decision before commitment,
for someone who by then wants only to be finished. The gap between 11:00 and 1:00 is real
information about the clinic's day and currently renders as nothing — the pills run together.

The split is computed in the clinic's zone through `client/src/lib/clinic-time.ts`, never the
browser's. This is the bug that file exists to prevent and it has already been seen live.

"Earliest" means the earliest time **on the day already chosen** and must be labelled so it cannot
be read as earliest overall. Nothing is hidden silently: a collapsed group says how many it holds.

## Position and revision are two jobs, not one

`StepTrail` currently shows what has been chosen *and* is the only way backwards, and a press
silently discards every answer downstream. The word "Back" appears nowhere in the flow, and a filled
pill does not read as a back button to a sighted first-timer — its only affordance is `sr-only`.

Three controls where there was one:

- A **progress indicator** says where you are. It is the visible half of the announcement
  `Book.tsx` already makes, and must agree with it rather than restate it.
- **Back** returns to the previous question by clearing that one answer. Everything before it is
  untouched.
- The **trail** still jumps, but a jump says what it will clear before it clears it.

Back derives its destination from the current step rather than from history. History would break on
the sign-in round trip, where the previous entry is not the flow's own. Clearing one answer to move
back one question is the only version compatible with a step derived from the choices, and that
derivation is not up for negotiation — it is what makes a half-finished booking a link.

## Binding constraints

- **Untouched:** the URL-as-state model and the derived step, the availability engine as sole
  authority on what is bookable, sign-in deferred to the last step, `slots.ts`, `clinic-time.ts`.
- **Out of scope:** the confirm screen's ending and the appointments hand-off. Real, and a separate
  pass.
- Every new control is authored at **≥ 44px**. The touch-target pass should have less to undo, not
  more.
- Progressive disclosure must not break keyboard-only completion, and "Show all 14" must announce
  that the list grew.

## Ranges a build must survive

Measured against the live API, not assumed: 10 services (7 dentist, 3 hygienist); 21–26 distinct
start times on an offered day; 15 offered days in a typical month; 3–4 provider options.

Also: a day with one time, a month with none, a service no provider currently offers, and a
collapsed group whose "show all" reveals two more rather than fourteen.

## Where the service order lives

**Settled: an ordered slug list in `client/src/booking/ChooseService.tsx`.** Same precedent as
Home's featured four, where a slug list exists precisely so an editorial choice is not made by
whatever the server happened to return first. A slug the list has never heard of sorts to the end
rather than disappearing — a treatment the clinic adds must not vanish because a client-side list
is stale.

A `sortOrder` column is the more honest long-term answer and buys nothing until the front desk has
an interface to set it, which is Phase 7. That is where it should move.

The two doors name two of ten services, which is an editorial claim about what patients most need.
Recorded as **ADR-0010**, not left in a component.
