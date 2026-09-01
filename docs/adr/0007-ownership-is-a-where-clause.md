# Ownership is a WHERE clause, a stranger's row is a 404, and email proves nothing

Three decisions that answer one question: what makes a row *yours*?

## Ownership is enforced by scoping, not by comparing

`requireAuth` resolves the session once and attaches `{ userId, role, patientId }` to the request.
Handlers then read the caller's data by filtering on `patientId` — never by loading a row and then
asking whether it belongs to the caller.

The two are equally correct when written correctly. They fail differently when forgotten. A
handler that forgets to compare returns another patient's appointment; a handler that forgets to
filter returns *every* patient's appointments, which is louder, fails the permission matrix
immediately, and is visible in any manual test. Neither is acceptable, but only one of them hides.

`requireOwnership` guards the routes that are addressed by an appointment id — cancel, reschedule.
It was written down here as the exception to all of this, the one place a row has to be loaded
before anyone can know who owns it. Building it showed otherwise: the guard needs no column but
`id`, so it asks whether a row with that id exists *for this caller* and never loads one to
compare against. It is the same WHERE clause, asked as a question rather than for data. The rule
above has no exception.

`ADMIN` skips the scoping in exactly one branch, in that middleware. An `OR role = 'ADMIN'`
smuggled into each query is the same rule written many times, which is the same rule waiting to be
written wrong once.

## The guard clears an id, not a row

The obvious economy is for the middleware to attach the row it just read, sparing the handler a
second lookup. It does not, and both reasons are worth more than the round trip.

The row would be read outside the handler's transaction. Cancel decides from `status` whether the
transition is even legal, and a status read in middleware can be stale by the time the `UPDATE`
runs. So the handler reads it again inside the transaction it writes in, where the read and the
write see one snapshot.

And the handler takes the id from `getOwnedAppointmentId`, never from `req.params`. Only the guard
writes that field, so a route mounted without the guard throws `INTERNAL` rather than writing to a
stranger's row. That converts the failure mode this whole ADR is about — a check that is forgotten
and hides — into the loud one, and it is the trade `getAuth` already makes for the session
(ADR-0008).

## A row that exists and is not yours returns 404

A 403 is the honest answer to "you may not have this." It is also an oracle: it distinguishes an
appointment that exists from one that does not, so walking a range of ids counts the clinic's
bookings, reveals when a given patient has an appointment at all, and does it without ever
returning a byte of appointment data. A 404 answers "there is no such appointment *for you*",
which is true, and which leaks nothing.

The cost is real and worth naming: a legitimate client cannot distinguish "gone" from "not yours",
and a 404 on a row that plainly exists in the database looks like a bug to anyone reading the code
without this file open.

Falling out of the first decision, this is mostly free — a scoped query returns no rows for a
stranger's id and for a deleted id alike, so 404 is what the handler would naturally produce. The
decision is really to *not* add a second lookup that turns some of those into 403s.

A malformed id is the one thing answered differently, with a 400, and it is not a crack in this.
It is decided from the string before any row is looked for, so it separates no two ids the caller
could not already separate themselves. Rejecting it also keeps a non-UUID away from a `uuid`
column, where Postgres raises and the honest 404 would have become a 500.

## Signing up with a patient's email does not give you their chart

The clinic charts people who have never been online: the seed has two such patients, and
`Patient.userId` is nullable precisely so the front desk can create a record before an account
exists. The obvious convenience is for signup to notice an unlinked Patient with the same email
and adopt it, so a walk-in who later registers finds their history waiting.

We do not do this, because `requireEmailVerification` is `false` and must be until Phase 10
provisions Resend. Until something proves an address, an email in a signup body is a claim, not an
identity — and adopting a chart on that claim hands the attacker an appointment history, a date of
birth, and insurance member details, in a system where those fields are the most sensitive thing
stored. Convenience for one honest walk-in against full disclosure for a guessed address is not a
close trade.

So signup always creates a fresh Patient, and the seed links its own patients to their logins
directly rather than going through the same path.

## Consequences

Phase 10 unlocks this feature rather than inventing it: once an address is verified, adoption
becomes safe and the rule can be revisited with the threat gone. That is the sequencing, and it
belongs in the Phase 10 notes.

Until then a walk-in who registers online has two records — the chart the clinic made and the one
their signup made. Merging them is a front-desk action in Phase 7, not something the patient can
trigger by typing an email address.

That forces `patients.email` to drop its unique index, which is the rule's visible cost in the
schema: two charts may share an address. It is also the more honest model. An email was never an
identity here — it is a way to reach someone, and two family members sharing one inbox was always
going to happen. Identity is `user.email`, which Better Auth keeps unique, and which a password
defends.

Every handler that touches patient data must either scope its own query or sit behind
`requireOwnership` and act on the id it cleared. Nothing in between, and no third way. That is a
property the permission matrix tests route by route, because it cannot be enforced by a type.
