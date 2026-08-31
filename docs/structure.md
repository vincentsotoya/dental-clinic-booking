# Project Structure

Snapshot of the repo tree as of 2026-08-31. Generated from `git ls-files` plus untracked
files — build output, `node_modules`, and `.env` are excluded by `.gitignore`.

```
dental-clinic-booking/
├── .env.example
├── .gitignore
├── CLAUDE.md
├── CONTEXT.md
├── PROGRESS.md
├── README.md
├── package.json
├── package-lock.json
├── tsconfig.base.json
├── skills-lock.json
│
├── client/
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx
│       ├── index.css
│       └── main.tsx
│
├── docs/
│   ├── concepts.md
│   ├── database-design.md
│   ├── roadmap.md
│   ├── structure.md
│   └── adr/
│       ├── 0001-postgres-exclusion-constraint-for-double-booking.md
│       ├── 0002-no-overlapping-hygiene-exam.md
│       ├── 0003-insurance-is-recorded-not-adjudicated.md
│       ├── 0004-blocked-until-is-a-stored-column.md
│       ├── 0005-availability-rules.md
│       ├── 0006-better-auth-owns-its-tables.md
│       ├── 0007-ownership-is-a-where-clause.md
│       └── 0008-resolving-a-session-is-not-enforcing-one.md
│
├── server/
│   ├── package.json
│   ├── prisma.config.ts
│   ├── tsconfig.json
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── seed.ts
│   │   └── migrations/
│   │       ├── migration_lock.toml
│   │       ├── 20260829145823_init/
│   │       │   └── migration.sql
│   │       ├── 20260830060324_add_better_auth/
│   │       │   └── migration.sql
│   │       └── 20260830150840_link_patient_to_user/
│   │           └── migration.sql
│   ├── scripts/
│   │   ├── check-availability.ts
│   │   └── check-authz.ts
│   └── src/
│       ├── app.ts
│       ├── auth.ts
│       ├── config.ts
│       ├── db.ts
│       ├── env.ts
│       ├── errors.ts
│       ├── index.ts
│       ├── middleware/
│       │   ├── auth-context.ts
│       │   ├── auth.ts
│       │   └── auth.test.ts
│       ├── routes/
│       │   ├── availability.ts
│       │   ├── availability.test.ts
│       │   ├── errors.ts
│       │   ├── health.ts
│       │   ├── me.ts
│       │   └── me.test.ts
│       ├── services/
│       │   ├── availability.ts
│       │   ├── availability.test.ts
│       │   ├── availability-query.ts
│       │   ├── availability-query.test.ts
│       │   ├── availability-response.ts
│       │   ├── clinic-time.ts
│       │   ├── clinic-time.test.ts
│       │   ├── intervals.ts
│       │   └── intervals.test.ts
│       └── test-support/
│           └── stubs.ts
│
└── shared/
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── index.ts
        ├── availability.ts
        ├── availability.test.ts
        ├── errors.ts
        ├── errors.test.ts
        ├── health.ts
        ├── me.ts
        ├── me.test.ts
        └── roles.ts
```

## Workspaces

| Workspace | Purpose |
| --- | --- |
| `client/` | React + Vite front end |
| `server/` | Express API, Prisma schema and migrations |
| `shared/` | Contracts imported by both sides (types, schemas, roles) |
