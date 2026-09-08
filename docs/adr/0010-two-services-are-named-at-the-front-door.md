# Two services are named at the front door

The booking flow's first step offers "In pain today?" and "First visit?" above the treatment list,
resolving to Emergency Toothache Visit and New Patient Exam & X-rays. Ten services exist; these two
get named where the other eight are found by reading.

That is an editorial claim about what patients most need, and it is recorded here rather than left
in `ChooseService.tsx`, where it would read as layout.

The claim: six of the ten services are diagnoses a dentist makes, not conditions a patient can name.
A patient can reasonably know that they are in pain, and that they have never been here before.
Those two facts are also the two most time-critical journeys the clinic has — one is urgent care,
the other is a person with no chart who cannot be reached any other way, because no email is
verified (ADR-0007).

The alternative was ordering alone. Ordering fixes the burial and still asks someone in acute pain
to recognise their need in a list of ten procedure names.

## What this is not

The doors route to a **visit type**. They do not map a symptom to a treatment. "Chipped tooth →
Composite Filling" would be a treatment plan, and the system is not allowed to imply one
(`PRODUCT.md`, principle 2; ADR-0003 for the same boundary about cost). Sending someone in pain to
an emergency appointment is triage a receptionist performs, not a diagnosis.

## Consequences

Adding a third door needs the same argument made again, in this file. The pressure will come from
whichever service is commercially attractive, and the test is whether a patient can name their own
need — not whether the clinic would like it booked.

The doors are built from the catalogue, so a retired service silently loses its door rather than
offering a visit the clinic cannot deliver. The service is named from the API rather than
transcribed, for the same reason counts on the public pages are read rather than written.

The ordering behind the doors is an array in `client/src/booking/ChooseService.tsx`, following the
precedent of Home's featured four. It moves to a `sortOrder` column when the front desk gets an
interface to set it, which is Phase 7 — recorded in `docs/booking-composition.md`.
