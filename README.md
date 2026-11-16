# Frasa HQ

Private internal web app for **Frasa International Trading N.V.** (Aruba). Employees use it to see
what they need to do, find the current procedure, and coordinate work across sales, purchasing,
logistics, warehouse and administration.

Invoicing, accounting, financial reporting, inventory and order processing stay in **NECS** and
**QuickBooks**. Frasa HQ only links to those records; there are no live integrations in Phase 1.

| Phase 1 module | What it does |
| --- | --- |
| **My Work and tasks** | Personal to-dos and shared department tasks, recurring tasks, in-app reminders and overdue escalation |
| **SOP library** | Searchable published procedures with drafts, revisions, review dates and acknowledgments |
| **Freight calculator** | Landed-cost estimates for shipments (e.g. Miami to Aruba) with saved, immutable versions and CSV export |
| **Access and admin** | Invite-only accounts, roles, separate freight access, departments, settings, job log, audit log |

Stack: Next.js 16 (App Router, TypeScript), Supabase (authentication, PostgreSQL with row level
security, private file storage), Tailwind CSS.

Documentation:

- [docs/PLAN_AND_DATA_MODEL.md](docs/PLAN_AND_DATA_MODEL.md) — implementation plan, data model, who can do what
- [docs/OPERATIONS.md](docs/OPERATIONS.md) — deployment, scheduled jobs, first admin, backups, troubleshooting
- [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md) — decisions that need Frasa's input before rollout
- [docs/ROADMAP.md](docs/ROADMAP.md) — later phases
- [docs/VERIFICATION.md](docs/VERIFICATION.md) — what was verified and how to re-run it

## Local setup

Requirements: Node.js 20 or newer, Docker (for the local Supabase stack).

```bash
npm install
```

```bash
npm run db:start
```

`db:start` starts a local Supabase (database, auth, storage, a mail catcher) and applies every
migration in `supabase/migrations`. It prints the API URL and keys. Copy `.env.example` to
`.env.local` and fill in the values it printed:

```bash
cp .env.example .env.local
```

| Variable | Value for local development |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:54321` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the "anon" (or "publishable") key |
| `SUPABASE_SERVICE_ROLE_KEY` | the "service_role" (or "secret") key. Server only |
| `NEXT_PUBLIC_SITE_URL` | `http://127.0.0.1:3000` |
| `CRON_SECRET` | optional, see [OPERATIONS](docs/OPERATIONS.md#scheduled-jobs) |

Create your admin account and open the link it prints:

```bash
npm run create-admin -- you@example.com "Your Name"
```

Start the app at http://127.0.0.1:3000 :

```bash
npm run dev
```

Emails sent locally (invitations, password resets) are caught at http://127.0.0.1:54324.

### Demo data (development only)

```bash
npm run seed:demo
```

Creates four demo users at `@frasa-demo.test`, a few tasks, two recurring tasks and one freight
estimate with invented numbers. Every record is flagged `is_demo` and shows a **Demo** badge.
The script **refuses to run against anything but a local Supabase**, and nothing in the migrations
inserts demo records, so demo data cannot reach production by deploying.

The three sample SOPs (supplier quote, freight estimate review, custom-branded order follow-up) are
different: they ship with the app as **drafts** labelled `[SAMPLE]` for Frasa to revise. They are
invisible to employees and cannot be published until someone sets an owner and a review date.

### Useful commands

| Command | Purpose |
| --- | --- |
| `npm run dev` / `npm run build` / `npm run start` | Run, build, serve |
| `npm run typecheck` | TypeScript check |
| `npm test` | Freight calculator unit tests |
| `npm run test:db` | Database and API verification (local Supabase) |
| `npm run test:e2e` | Browser verification (local Supabase and a running app) |
| `npm run db:reset` | Recreate the local database from the migrations |
| `npm run db:stop` | Stop the local Supabase |

## Project layout

```
supabase/migrations/     Database schema, security policies, jobs (one file per module)
supabase/templates/      Invitation and password-reset emails
src/app/                 Pages and routes (thin; they call the modules)
src/modules/tasks/       Tasks and recurring series
src/modules/sops/        SOP library
src/modules/freight/     Freight calculator (engine.ts is pure and unit-tested)
src/modules/admin/       Users, departments, settings, audit descriptions
src/lib/                 Auth, Supabase clients, dates (Aruba time), form helpers
src/components/          Shared UI
scripts/                 create-admin, demo seed, verification scripts
```

Each module owns its migration, queries, server actions and screens, so one can be changed without
touching the others. Modules reference each other only by links (a task can point at a SOP or a
saved estimate).

## Branding

Colours come from the Frasa logo (orange `#fa5005`) and the reference design supplied (dark green
navigation, warm off-white background). They are defined once in `src/app/globals.css`.

To show the real logo instead of the text wordmark, add the file as `public/brand/frasa-logo.svg`
(or `frasa-logo.png`). No code change is needed.
