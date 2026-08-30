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

`requireOwnership` still exists, because Phase 4 has routes — cancel, reschedule — that are
addressed by appointment id and must load the row before they can know who owns it. There it is a
genuine fetch-then-compare. It is the exception, and the smaller the set of routes that use it,
the smaller the set that can get it wrong.

`ADMIN` skips the scoping in exactly one branch, in the middleware. An `OR role = 'ADMIN'` smuggled
into each query is the same rule written many times, which is the same rule waiting to be written
wrong once.

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

Every handler that returns patient data must be scoped. That is a property the permission matrix
tests route by route, because it cannot be enforced by a type.
