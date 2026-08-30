# Better Auth owns its own tables and its own error shape

Every table in this schema is plural and snake_case with a `@db.Uuid` primary key, and every
error under `/api/` comes back in one envelope. Better Auth's generated models are singular and
camelCase with plain `String` ids — `user`, `session`, `account`, `verification` — and its
handler returns the library's own error shape. Both differences stay.

## Why the tables are not remapped

The four models are produced by `@better-auth/cli generate` and regenerated whenever the library
changes them. A hand-applied `@@map("users")` and a `@db.Uuid` on every id survive until the next
`generate`, at which point they are silently gone and the next migration renames four tables. The
cost is not writing the mapping once; it is re-writing it, correctly, on every upgrade, with a
failure mode that looks like a data migration rather than a merge conflict.

Prisma's ids are also not incidental. Better Auth generates its own id strings and hands them to
the adapter; a `@db.Uuid` column commits us to those strings always parsing as UUIDs, which is the
library's implementation detail and not a promise it makes.

So the boundary is drawn where the ownership actually changes. Inside `patients`, `appointments`,
`providers` and the rest, the conventions in `database-design.md` hold absolutely. Inside the four
auth tables, the library's conventions hold, and we do not edit them.

## Why the error dialect is not wrapped either

`/api/availability` returns `{ error: { code, message } }` and the client parses one shape. The
obvious next step is to make `/api/auth/*` do the same. That means intercepting the response of a
handler we do not own, re-deriving which of its failures maps to which of our codes, and keeping
that mapping current across versions — inventing exactly the maintenance burden the table decision
just avoided, for the sake of cosmetic uniformity on the one route group the client talks to
through a dedicated auth client anyway.

`/api/auth/*` speaks Better Auth. Everything else under `/api/` speaks our envelope. The seam is
the URL prefix, which is the most visible place a seam can be.

## Consequences

`Patient.userId` is a `String`, not a `@db.Uuid` — one column that does not match its eight
neighbours, and the visible price of the whole decision. A join from `patients` to `user` is a
`text = text` comparison rather than `uuid = uuid`.

The schema file contains two naming conventions. The comment at the top of `schema.prisma` says
which is which and points here, so the inconsistency reads as a decision rather than as drift.

Upgrading Better Auth is `generate` plus `migrate dev`, with no hand-editing step to forget — the
opposite of the migration in ADR-0001, which must be hand-edited every time and says so loudly.
