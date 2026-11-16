# Phase 1 plan and data model

## Implementation plan

1. **Foundation.** Next.js + TypeScript + Supabase. People, departments, roles, settings and an
   audit log. Every table has row level security (RLS); the app reads and writes with the signed-in
   user's own session, so the database decides what each person can see.
2. **Tasks.** Personal and shared tasks, checklists, comments, attachments, history, recurring
   series, in-app notifications and the three background jobs.
3. **SOP library.** Metadata plus versioned content, a publish workflow in the database,
   acknowledgments, search.
4. **Freight calculator.** A pure calculation engine with unit tests, an editor with live results,
   and append-only saved versions.
5. **Administration.** Invitations, roles and freight access, departments, defaults, job log, audit log.
6. **Verification.** Automated checks at the database/API level and through a browser
   (see [VERIFICATION.md](VERIFICATION.md)).

Principles that later phases should keep:

- **The database enforces access.** Pages also check, for a better experience, but RLS and storage
  policies are the source of truth. The service-role key is used only to manage auth accounts and
  for the optional HTTP cron route.
- **State changes that must be atomic or audited are database functions** (publishing a SOP, saving
  an estimate version, running jobs), not sequences of app calls.
- **Dates are Aruba local dates** (`America/Aruba`, UTC-4, no daylight saving). Deadlines are
  dates, not times.
- **One migration file per module**; modules link to each other by id only.

## Data model

```
auth.users ──1:1── profiles ──< department_members >── departments
                      │ role: admin | department_lead | employee
                      │ freight_access: none | view | edit      (separate from role)

task_series ──< tasks ──< task_checklist_items
   (recurrence rule)  ├──< task_comments
                      ├──< task_attachments      → private storage: tasks/{task_id}/…
                      ├──< task_events           (history, written by triggers)
                      ├──> sops                  (optional link)
                      └──> freight_estimates     (optional link)

sop_categories ──< sops ──< sop_versions ──< sop_attachments   → storage: sops/{sop_id}/…
                    │            └──< sop_acknowledgments (one per user per version)
                    └── current_version_id → the published version employees read

freight_estimates ──< freight_estimate_versions   (append-only: inputs + results as saved)

notifications   (per user, unique dedupe_key)        job_runs   (log of background jobs)
app_settings    (notification and freight defaults)  audit_log  (append-only)
```

### Core (`…000100_core.sql`)

| Table | Purpose | Notes |
| --- | --- | --- |
| `departments` | Sales, Purchasing, Logistics, Warehouse, Administration | Can be renamed, added, deactivated |
| `profiles` | One per account: name, email, `role`, `freight_access`, `is_active`, `is_demo` | Created automatically for every auth user, always as employee with no freight access |
| `department_members` | Who belongs to which department; `is_lead` | Lead powers need role `department_lead` **and** `is_lead` in that department |
| `app_settings` | `notification_defaults`, `freight_defaults` | Freight defaults hold no rates until Frasa enters them |
| `audit_log` | Who did what, when | Written by triggers and database functions only |

### Tasks (`…000400_tasks.sql`)

| Table | Key columns |
| --- | --- |
| `tasks` | `kind` (personal/shared), `owner_id` (one accountable owner), `department_id` (required for shared), `due_date` (required for shared), `priority`, `status` (open, in_progress, blocked, done, cancelled), `sop_id`, `freight_estimate_id`, `external_link_label/url` (NECS / QuickBooks record), `remind_days_before`, `escalate_overdue`, `series_id`, `occurrence_no`, `scheduled_for` |
| `task_series` | Recurrence rule: `frequency` (daily/weekly/monthly), `interval_count`, `schedule_mode`, `start_date`, `end_date`, `weekdays` (daily only), `checklist_template`, `is_active` |
| `task_checklist_items`, `task_comments`, `task_attachments`, `task_events` | Checklist, discussion, files, history |

**Recurrence.** Two modes, shown in plain words wherever a series appears:

- **Fixed schedule** — occurrences fall on dates counted from the start date (occurrence *n* =
  start date + *n* periods), whether or not earlier ones were finished. A monthly series started on
  the 31st gives 31 Jan, 28 Feb, 31 Mar.
- **After completion** — the next occurrence is due one period after the previous one was
  completed. Nothing new appears while one is open.

Each occurrence is a normal task with its own status, comments and history. `scheduled_for` keeps
the date the series produced, so changing `due_date` reschedules that one occurrence only.
Occurrences appear ahead of time (daily 1 day, weekly 7, monthly 14) and missed dates older than 7
days are not back-filled. Editing a series affects future occurrences only.

**Duplicate protection.** `unique (series_id, occurrence_no)` on tasks, and a row lock on the series
while generating.

### Notifications and jobs (`…000500_notifications_jobs.sql`)

| Job | What it does | Why a retry is harmless |
| --- | --- | --- |
| `recurring_tasks` | Creates due occurrences for every active series | Unique `(series_id, occurrence_no)` |
| `due_reminders` | Notifies the owner from N days before the due date (task value, else company default) | `dedupe_key = reminder:{task}:{due date}` |
| `overdue_escalations` | Notifies the department's lead(s) when a shared task with escalation enabled is overdue; admins if the department has no lead | `dedupe_key = overdue:{task}:{due date}:{user}` |

`run_scheduled_jobs()` runs all three. Each run is logged in `job_runs` with status `success`,
`partial` (some series failed; the others still ran), `failed` (with the error), or `skipped`
(another run of the same job was in progress). A failure rolls back that job only and is retried on
the next run.

### SOP library (`…000200_sops.sql`)

- `sops` holds what applies to the procedure as a whole: department (empty = company-wide),
  category, tags, owner, next review date, status (draft, published, archived).
- `sop_versions` holds the content: title, purpose, steps, links, change summary, whether
  acknowledgment is requested. At most one draft per SOP.
- Publishing (`sop_publish`) marks the previous version *superseded*, makes the draft current,
  refreshes the search text, writes the audit entry and notifies the audience. It refuses to publish
  without an owner, purpose, at least one step and a review date.
- Employees always read `current_version_id`; a draft revision is invisible to them until published.
- **Acknowledgment** is per version. The audience is the active members of the SOP's department, or
  everyone for a company-wide SOP.

### Freight (`…000300_freight.sql`)

- `freight_estimates` is the header (name, reference, latest totals for the list, archived flag).
- `freight_estimate_versions` stores, for every save, the complete `inputs` (as typed, including
  the exchange rate and each charge's allocation method), the complete `results`, whether it was
  complete, and the engine version. There is **no update or delete** privilege on this table, so
  later changes to defaults or to the calculator cannot alter a saved estimate.
- The calculation itself lives in `src/modules/freight/engine.ts`
  (see [ASSUMPTIONS.md](ASSUMPTIONS.md#freight-calculator) for its rules).

### Files (`…000600_storage.sql`)

One **private** bucket, `attachments`. Files are opened only through 60-second signed links created
with the viewer's own session; storage policies mirror the task and SOP rules. Limit 25 MB per file.

## Who can do what

| | Employee | Department lead (in departments they lead) | Admin |
| --- | --- | --- | --- |
| **Personal to-dos** | Own only: create, edit, delete | Own only | Own only (admins cannot see other people's) |
| **Shared tasks: read** | Tasks of their departments, tasks they own or created | Same | All |
| **Shared tasks: create** | In their department, owned by themselves | Assign to any member of the department; hand a task to another department's lead | Anywhere, anyone |
| **Shared tasks: change** | Tasks they own (not the owner or department) | Any task of the department, including reassigning and deleting | All |
| **Comment, attach files** | On any task they can see | Same | Same |
| **Recurring tasks** | Personal only | Shared ones for the department | All |
| **SOPs: read** | Published | Published, plus drafts and archived of the department | All |
| **SOPs: draft** | Only SOPs they are the named owner of | Department's SOPs | All |
| **SOPs: publish, archive** | No | Department's SOPs | All, including company-wide |
| **SOPs: see acknowledgments** | Own | Department's SOPs | All |
| **Freight estimates** | By `freight_access` only: *none* = nothing, *view* = read and export, *edit* = also save, duplicate, archive. Not tied to role; admins need it granted too | | |
| **Users, departments, settings, job log, audit log** | No | No | Yes |
| **Directory (names, departments, roles)** | Read | Read | Read and change |

A deactivated account cannot sign in and, if still signed in, immediately reads nothing.
