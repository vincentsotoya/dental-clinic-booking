---
target: the patient booking flow (client/src/booking)
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 4
target_identity: "file:C:\\Users\\Vincent Sotoya\\OneDrive\\Documents\\ClaudeCode\\dental-clinic-booking\\client\\src\\booking"
timestamp: 2026-09-08T13-17-30Z
slug: client-src-booking
---
Method: dual-agent (A: design review · B: detector + evidence), isolated. No browser automation was exposed to either assessment: the rendered-DOM half (measured contrast, real tap targets, spacing rhythm, focus visibility, responsive behaviour) DID NOT RUN. All figures are source, live API responses, and computed Tailwind values.

## Design Health Score

Mode: Operate. All ten heuristics apply.

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | No step indicator; all four step changes silent — no focus move, no live region, no title change |
| 2 | Match System / Real World | 4 | Strongest axis. "45 min in the chair", "Anyone available", "Nothing is held until you confirm" |
| 3 | User Control and Freedom | 2 | "Back" appears nowhere; the only back affordance is a crumb styled as a status chip, and it silently deletes downstream answers |
| 4 | Consistency and Standards | 3 | ChooseTime.tsx:73 "Nothing is held" vs Confirm.tsx:134 "before we can hold this"; dead ends inconsistent |
| 5 | Error Prevention | 4 | Excellent. Days disabled from engine output, downstream cleared on change, instants deduped, provider re-resolved at confirm |
| 6 | Recognition Rather Than Recall | 2 | Price, duration, bio vanish after their step; unrecoverable without destroying downstream choices |
| 7 | Flexibility and Efficiency | 2 | No "soonest", no time-of-day filter across 26 slots, no deep link from /services into /book?service= |
| 8 | Aesthetic and Minimalist Design | 3 | Emphasis inverted: price text-lg font-bold, treatment name text-base |
| 9 | Error Recovery | 3 | Three booking failures get distinct humane copy plus "Nothing has been charged"; two dead ends offer no button |
| 10 | Help and Documentation | 2 | One "treatments page" link, step 1 only, pointing out of the flow |
| **Total** | | **27/40** | Competent — with one structural gap it has not closed |

## Design Specificity Verdict

The copy is authored for this product. The composition is not.

The voice is unmistakable and good: "What do you need?", "Nothing is held until you confirm", "List price before insurance — we record your plan, we do not estimate what it pays". The structure underneath is the stock booking wizard: bordered cards to bordered cards to an unmodified shadcn Calendar to a grid of identical pills to a dl summary to a primary button. Swap ten services for ten haircuts and not one line of layout code changes.

docs/design-system.md predicted this: "these tokens only. Interaction patterns are an open question." That session never happened. It shows where dentistry differs from haircuts:

- A Routine Cleaning and a Root Canal get pixel-identical cards; the only difference is that the root canal shouts a bigger number.
- "Emergency Toothache Visit" renders 6th of 10 (confirmed against the live API). There is no urgency path.
- Dr Osei's bio ("focus on nervous patients") is the most reassuring sentence in the dataset and sits two steps behind the moment of maximum dread.
- Sign-in-last is a genuinely original decision that the interface never communicates to the patient.

Deterministic scan: ZERO findings across client/src/booking, client/src/routes, client/src/components, client/src/components/ui (5 runs, exit 0). Verified non-vacuous by a planted canary. Calibration: outline-none does NOT fire in JSX mode, so a clean CLI pass is not evidence about focus rings.

Visual overlays: none. No mutation-capable browser tool in session; no injection attempted.

## Priority Issues

### [P0] Step transitions are completely silent

Book.tsx:52 swaps the step inside a plain div. Zero matches in client/src/booking for aria-live, .focus(), tabIndex, document.title. The h1 reads "Book an appointment" on all five steps. Focus falls to body at all four transitions and a screen reader announces nothing. PRODUCT.md makes keyboard-only completion an acceptance criterion; this is the specific thing that fails it.

Fix: hold a ref on the step container; on step change move focus to the step h2 (tabIndex -1), set document.title, and announce "Step 3 of 5" through a visually-hidden aria-live=polite region. The same mechanism gives the visible step indicator heuristic 1 needs.

Command: /impeccable harden

### [P1] The time step presents 26 identical options with no structure

ChooseTime.tsx:54-66 renders every distinct start time as one flat grid-cols-3 of identical pills. Verified against the live API: 26 on a typical weekday, 21 on the lightest. No AM/PM grouping, no lunch gap, no "soonest", no filter. The clinic's real two-hour lunch break renders as nothing at all.

Fix: group Morning/Afternoon from the clinic-zone hour (the data splits cleanly at the 11:00 to 1:00 gap); collapse each to the first six behind "Show all 14 afternoon times"; lead with one primary "Soonest — 9:15 AM".

Command: /impeccable layout

### [P1] Step 1 order is the database's, and the price outshouts the treatment

The API returns dentist services alphabetically then hygienist; ChooseService renders hygienists first. The patient sees Child Cleaning $90 first, Emergency Toothache Visit 6th, New Patient Exam and X-rays 7th. ChooseService.tsx:69-74 sets the name text-base and the price text-lg font-bold.

Fix: an explicit display order surfacing Emergency and New Patient Exam first, ideally as two entry points above the groups ("In pain today?" / "First visit?"). Invert the card type scale: name to text-lg, price to text-base text-muted-foreground.

Command: /impeccable layout

### [P1] Touch targets are systematically under 44px

Calendar day cell ~32px (calendar.tsx:36, --cell-size:--spacing(8)); StepTrail crumb ~28px (StepTrail.tsx:64, px-3 py-1) — the only back control, at the top of the page under a sticky nav; time pill ~42px (ChooseTime.tsx:60, px-3 py-2.5); "Confirm booking" 40px (size=lg, h-10). Only the service and provider cards clear 44px.

CAVEAT: computed from Tailwind classes, not measured in a browser. Confirm in devtools before acting.

Command: /impeccable adapt

### [P1] The flow ends on an explicitly-unfinished screen

Confirm.tsx:92 navigates to /appointments?booked=<id>. Nothing reads "booked" — verified by grep. MyAppointments.tsx calls itself "a working stand-in", renders outside PublicLayout with no nav or footer, shows the new appointment as an unhighlighted row with lowercase muted "confirmed", and its most prominent control is Sign out. Email is not provisioned, so the patient leaves with no artifact at all and no screen says so.

Fix: cheap now — read ?booked=, render a success alert above the list, highlight that row. Correct later — a dedicated confirmation screen with an .ics download (the one artifact possible without email) and an explicit line that no email is coming.

Command: /impeccable onboard

### [P2] The flow contradicts its own best promise

ChooseTime.tsx:73 "Nothing is held until you confirm" against Confirm.tsx:134 "before we can hold this". One screen apart, at the moment trust is being asked for. Fix: "before we can book this."

Command: /impeccable clarify

## Cognitive Load

5 of 8 items fail. Band: HIGH.

FAIL: chunking (7 services in one group; 26 times in one group), visual grouping (26 undifferentiated pills, no morning/afternoon split, no visible lunch gap), visual hierarchy (price outweighs name; no step indicator), minimal choices (10 at step 1, 26 at step 4), working memory (price/duration/bio discarded and unrecoverable without destroying progress).

PASS: single focus, one thing at a time, progressive disclosure.

## Persona Red Flags

Jordan (confused first-timer): the first card is Child Cleaning $90; step 1 asks him to choose between procedure names rather than symptoms, with no "I do not know what I need" option and no triage path; he does not recognise the breadcrumb as back (a filled pill whose affordance is sr-only "— change this"); two dead-end screens say "go back and pick another" with no button, one screen after a different failure did give him one.

Sam (screen reader and keyboard): four silent transitions (P0); the h1 never changes across five steps; no progress information in any modality; every crumb press silently deletes three answers, unannounced, with no undo; the 26 time pills are button-in-li with no aria-pressed or role=radio, so he hears "9:15 AM, button" twenty-six times with no announced grouping or count. CREDIT: react-day-picker gives disabled days aria-disabled rather than the disabled attribute, so he can arrow across the grid and hear which days are unavailable — the best a11y behaviour in the flow, and it came from the library rather than this code.

Casey (one thumb, interrupted): every primary target undersized; the back control at the top under a sticky nav; 26 pills in grid-cols-3 is nine rows of scrolling. Interruption is handled genuinely well — the booking is in the URL, so backgrounding and returning restores the exact step. But there is no active: state on any button despite design-system.md listing :active translate-y-[1px] in Motion 3; on a phone with no hover a tap gets no acknowledgement until re-render, which on a slow connection reads as a dead button.

## Minor Observations

- ChooseService skeleton is 5 x h-20; the real content is two headed groups of ten ~120px cards. Guaranteed layout shift on first paint, relevant to the Lighthouse >= 95 target.
- No startMonth/endMonth on the calendar: a patient can page back to 2019, firing an availability request per month, landing on copy that blames their choice rather than the empty month.
- ChooseDate never passes selected to Calendar, so the calendar has no concept of the current choice.
- The notes placeholder "I'm nervous about the drill." is the most empathetic line in the product, sitting as grey placeholder text in an optional field on the last screen. It belongs on step 1.
- Doc drift found while verifying: PROGRESS.md records outline-none as "stripped everywhere, with one exception: calendar.tsx's dropdown". The code is stricter — outline-none appears nowhere in client/src except the test forbidding it, calendar included. The real exception is to a different invariant (ui-invariants.test.ts:34-40 allows calendar a has-focus: ring and every other component none). The code is right; the note describes it wrongly.

## Questions to Consider

1. The design system doc deferred this flow's composition to its own session, and that session never happened. Review it as finished, or as the placeholder it says it is?
2. Why does step 1 ask a patient to name a procedure? Only four of ten are self-diagnosable. Would "What is going on?" be a truer first question?
3. Sign-in-last is a real product decision the interface never mentions. If arrival said so, how many anxious visitors who bounce at the price list would stay?
4. Twenty-six times is a database dump with rounded corners. Would three — soonest, next morning, next afternoon — make a nervous patient book faster, or feel manipulated?
5. No email means a confirmed appointment produces no artifact. A temporary gap, or a constraint the confirmation screen must be designed around?
