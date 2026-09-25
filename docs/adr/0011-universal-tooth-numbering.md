# The Tooth Chart uses universal numbering, not FDI

`ToothChartEntry.tooth` needed one fixed numbering scheme before any row could be written. Two
real systems compete: **Universal** (1–32, starting at the upper-right third molar) and **FDI**
(ISO 3950, two-digit quadrant+tooth, e.g. 18–48).

Universal was chosen. It is the scheme a US dental practice actually uses day to day — Quillon
Dental is fictional but explicitly a US practice (`PRODUCT.md`) — and a plain `Int` between 1 and
32 is the simpler column: no parsing a two-digit code into quadrant and position, no risk of
`08` vs `8` string/int drift.

## Considered options

**FDI** is the internationally standardized scheme and would read as more rigorous to a reviewer
who doesn't already know the domain. Rejected here specifically: the practice this system charts
is American, and Universal is what its front desk would actually be trained on. Modelling the
scheme a real US clinic uses is the more defensible choice, not the more impressive-looking one.

**Storing both** (a computed FDI column alongside Universal) was not seriously considered — a
derived display value belongs in a formatter, not a second source of truth for the same fact.

## Consequences

`tooth INT`, `CHECK (tooth BETWEEN 1 AND 32)` (docs/database-design.md). Never a string, never
zero-padded.

Primary teeth (children) have no Universal number in this scheme — a separate range or letter
system exists for them, unmodelled here. Not a gap for this project: `PRODUCT.md` and the seeded
patients are all adults, and nothing in Phase 8's scope charts a child.

If the practice ever needed to publish charts to a system expecting FDI (an insurer's clearing
house, most plausibly), that is a formatter at the boundary — `toFDI(universal: number): string`
— not a schema change.

## Verified

`CHECK (tooth BETWEEN 1 AND 32)` against real Postgres, inside a transaction rolled back after:
`tooth = 0` and `tooth = 33` both rejected, `23514`. See `docs/database-design.md`'s Clinical
records section for the full proof, shared with the rest of the schema task.
