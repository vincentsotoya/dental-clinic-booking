# Dental Clinic Booking

PERN appointment-booking app, built as a portfolio piece that has to be *defensible in an
interview*, not just demoable. Solo project, short sessions over many weeks.

## Start of session

1. Read `PROGRESS.md`.
2. Read **only the current phase** of `docs/roadmap.md`.
3. Read an ADR or doc only when those two point at one.

Don't scan the repo to orient — those files are the orientation.

Then report briefly: current phase · current task · next task · active blockers. **Wait for
confirmation before modifying code.**

## Reference, don't restate

`PROGRESS.md` current state · `docs/roadmap.md` all 12 phases, Phase 5 first shippable ·
`CONTEXT.md` domain language · `docs/database-design.md` rules governing `schema.prisma` ·
`docs/adr/` decisions and reasoning · `docs/concepts.md` interview prep.

Link to these. Never copy their content into `CLAUDE.md`, `PROGRESS.md`, or a code comment.

## Writing code

Claude writes it and explains the reasoning; Vincent reads and questions it. Surface decisions
and trade-offs rather than making them silently.

Comment only what isn't obvious from the code: domain rules, constraints, non-obvious reasoning,
trade-offs taken. Nothing that narrates what a line plainly does.

## Verification

`npm run typecheck` and `npm test` from the repo root before calling implementation work
complete. For HTTP or database work, exercise it for real too — curl the endpoint, prove the
constraint rejects the bad row. "It compiles" is not evidence.

## Committing

Directly to `main` — never branch, never offer to. One logical change per commit, message
explains why. **Never commit unless explicitly asked.**

## Updating PROGRESS.md

Update when project state actually changed: a task completed or started, a blocker raised or
cleared, a decision made, next steps shifted. Skip it after a question-only session.

It is current state, not a diary. Keep the fixed sections (Current Phase · Completed · Current
Task · Next · Active Blockers · Recent Decisions), edit in place instead of appending history,
drop resolved blockers. No terminal output, logs, or conversation history.
