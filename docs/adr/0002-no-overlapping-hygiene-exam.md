# The dentist's exam during a cleaning is deliberately not modelled

In a real practice, a patient books a cleaning with a Hygienist and the Dentist steps into the same
Operatory partway through for a short exam: one visit, one chair, two Providers, overlapping in
time. Our `Appointment` — one Provider, one Operatory, one range — cannot express this, and we
chose not to extend it.

The decisive reason is that the natural fix collides with
[ADR-0001](./0001-postgres-exclusion-constraint-for-double-booking.md). Modelling the exam as a
second linked Appointment in the same Operatory is rejected by the operatory exclusion constraint,
which is behaving correctly; supporting it would mean weakening the project's central invariant to
carve out an exception.

## Considered options

Adding a second `examProviderId` column to Appointment was rejected outright, and is the option to
resist if it comes up again. It appears to work while leaving the exam provider entirely unguarded
by the exclusion constraint — the same Dentist could be booked for exams in two Operatories
simultaneously and the database would accept both.

## Consequences

A cleaning is a Hygienist appointment and nothing more. A dentist examination is a separate Service
that a patient books separately. If this is ever revisited, the shape to reach for is a
`bookingGroup` of Appointments plus a narrowed operatory constraint that exempts zero-resource
visits — not a second provider column.
