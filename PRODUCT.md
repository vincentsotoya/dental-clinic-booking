# Product

<!-- impeccable:product-schema 1 -->

Durable product truth for Quillon Dental. Domain vocabulary is defined once in `CONTEXT.md` and is
not repeated here; the reasoning behind individual decisions lives in `docs/adr/`.

## Platform

web

## Users

**Patients** are the primary users and the only ones with a frontend in the current phase. An adult
booking dental care for themselves, usually on a phone, usually not enjoying the errand. The job is
narrow and finite: find a time that works, take it, and get on with the day. A returning patient's
second job is changing a booking they already made, which they are doing because something went
wrong with their week.

**The front desk** (`ADMIN`) runs the schedule and acts on patients' behalf when they phone in. They
have a login and no chart of their own. Their interface is a later phase; the API already treats
them as a distinct actor, and the event log already records when they acted for someone.

**Providers do not log in.** A dentist or hygienist occupies a schedule but has no account. Whether
they ever get one is an open product decision, not an oversight.

## Product Purpose

The appointment system for a single-location dental practice. Patients browse treatments, book a
slot the clinic can genuinely honour, and cancel or move it themselves. The clinic keeps one true
schedule behind it.

Success is a patient completing a booking without phoning, and the clinic never seeing a booking it
cannot deliver.

## Positioning

Availability is computed from the clinic's real constraints rather than published as a static
calendar: each provider's working hours, their time off, whole-clinic closures, the finite number
of treatment rooms, and the sterilisation buffer that a given treatment leaves behind. A slot is a
candidate the engine has proven bookable, naming a specific provider and a specific room, and it is
computed fresh rather than stored.

Underneath that, double-booking is not merely prevented in application code, it is refused by the
database: two overlapping confirmed appointments for one provider or one room cannot both exist.
The offer and the guarantee are enforced by different mechanisms, and the second one does not
depend on the first being written correctly.

## Operating Context

One physical practice on the US East Coast, operating in a single timezone (`America/New_York`).
Three treatment rooms. Three dentists and two hygienists, each with their own weekly hours; a
hygienist books independently and does not need a dentist present.

The clinic charts people who have never been online, so a patient record can exist with no login
attached to it. Merging those is a front-desk action, never something a patient can trigger.

## Capabilities and Constraints

Built and proven against real rows: the availability engine, booking, a patient's own appointment
list, cancellation, rescheduling, and an append-only event log that records what happened to an
appointment and which account did it.

Constraints that future work must not design around:

- **Insurance is recorded, never adjudicated** (ADR-0003). The system stores a patient's plan
  details and cannot compute what they will owe. Any interface implying otherwise is wrong.
- **Prices are list prices**, stored as integer cents. They are the fee before insurance, and the
  product has no mechanism to turn one into a patient's share.
- **An appointment is confirmed the moment it is created.** There is no pending, held, or
  provisional state, and nothing is reserved while a patient is choosing.
- **A cancelled appointment is not deleted.** It keeps its row and stays visible to its patient.
- **Email is not yet provisioned**, so no address is verified. Signing up with a patient's email
  therefore does not grant access to their existing chart (ADR-0007), and no flow may assume a
  patient can be reached by email.
- **Roles are `PATIENT` and `ADMIN`**, and a patient may only ever reach their own data.

Explicitly undecided: payments and invoicing, appointment reminders, whether providers get logins,
and whether patients can edit their own insurance details.

## Brand Commitments

The practice is named **Quillon Dental**. The name is fictional and was checked against existing US
dental practices before being adopted; any real-world namesake is coincidental. Nothing in this
project may present it as an operating business.

No tagline, founding date, history, awards, accreditations, or clinician credentials beyond the
seeded titles (`DDS`, `RDH`) have been established. Future work must not invent them.

## Evidence on Hand

All data in this repository is fictional and seeded. There are, specifically, **no** real patients,
appointments, testimonials, reviews, ratings, case studies, press mentions, patient counts, years in
business, address, or phone number. Future work must not fabricate any of them to fill a layout.

What does exist:

- A seeded cast: Dr Amara Osei, Dr Daniel Reyes and Dr Priya Raman (DDS); Naomi Clarke and Tomas
  Vela (RDH). Three operatories. Ten services with real durations, buffers and list prices.
- A seeded week of hours, one provider's time off, and one whole-clinic closure, placed on the
  edges the availability engine has to get right.
- Live availability from the running API, which is real computed data and the most honest thing the
  interface can put in front of a visitor.

**Photography is open-license stock** (Unsplash or Pexels), referenced by URL. It is not the
clinic's own. Alt text and captions must never describe it as this practice, its rooms, or its
staff, and a stock portrait must never be captioned as a named provider.

## Product Principles

1. **Never offer a time the database would refuse.** The engine's answer and the constraint's answer
   must agree, and where they cannot, the constraint wins and the interface explains the conflict.
2. **Say only what the system knows.** No computed insurance share, no estimated cost, no invented
   certainty about what a visit will involve.
3. **The record outlives the interaction.** Cancellations, moves and their actor are kept, because a
   patient who sees no trace of a cancellation concludes the clinic lost it.
4. **A patient reaches their own data and nothing else**, and being refused someone else's row is
   indistinguishable from that row not existing.
5. **Nothing claims to be real.** Fictional practice, fictional people, stock photography, seeded
   data, stated plainly wherever a visitor could reasonably be misled.

## Accessibility & Inclusion

WCAG AA contrast is the floor for every text and control pairing, verified by measurement rather
than by eye. Booking must be completable using a keyboard alone. The target for the deployed build
is Lighthouse ≥ 95.

Patients using this are often anxious and frequently one-handed on a phone. Reducing the number of
decisions between arriving and having a confirmed appointment is an accessibility concern here, not
only a usability one.
