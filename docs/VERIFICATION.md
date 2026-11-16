# Phase 1 verification

Three sets of automated checks. All were run against a clean local Supabase with the migrations in
this repository and a production build of the app.

| Suite | Command | Result |
| --- | --- | --- |
| Freight calculator unit tests | `npm test` | 45 passed |
| Database and API checks (real signed-in sessions through the public API) | `npm run test:db` | 80 passed |
| Browser checks (Chromium, desktop and phone-sized windows) | `npm run test:e2e` | 44 passed |

Also: `npm run typecheck` and `npm run build` are clean.

## The five required checks

| Requirement | How it was checked | Where |
| --- | --- | --- |
| **An employee can sign in and complete an assigned task** | An admin invites an employee from the Users screen; the invitation email arrives; the employee opens the link on a phone-sized screen, sets a password and is signed in. A department lead assigns them a shared task with a checklist. It appears under "Due today" on their My Work page with an "Assigned to you" reminder. They tick a step, comment, and mark it done; it leaves My Work, and the lead sees the completion in the task history | Browser, sections A and B |
| **A monthly task creates exactly one occurrence even if the job retries** | A monthly series anchored on 31 March. The job is run 9 times for the same period (3 sequential retries, then 6 at the same moment): exactly one task, with its 2-step checklist copied once. Running on for April and May adds exactly one each, due 30 April and 31 May. Rescheduling the March occurrence does not move later ones | Database, section 2 |
| **An SOP editor can publish a revision and collect acknowledgments** | A lead writes and publishes version 1 requesting acknowledgment; the employee finds it by search and acknowledges; the lead sees who acknowledged. The lead drafts a revision: the employee still sees version 1 and cannot read the draft. After publishing version 2 the employee sees it, is asked again, acknowledges; version 1 remains readable as "superseded". Both publications are in the audit log | Browser section C; database section 4 |
| **A freight estimate reconciles to the original shipment charges** | In the browser: three products, ocean freight USD 1,000.01 by case count and insurance USD 100.00 by value, at 1.79. Stored result: freight AWG 1,790.02 = 298.34 + 596.67 + 895.01; insurance AWG 179.00; shipment total AWG 23,449.02 = supplier value 21,480.00 + charges 1,969.02. At the engine level: eight charges across volume, value, pallets, weight, cases, manual percent, direct and a percentage charge, in mixed currencies at 1.7925; every charge's allocations equal the original charge to the cent | Browser section D; database section 5; unit tests |
| **An employee without freight access cannot retrieve a saved estimate by direct URL or API request** | Signed in as the employee: the estimate page, its edit page, its CSV export and the estimate list all return 404 with none of the content; search does not reveal it; there is no Freight item in the navigation. A hand-written API request using the employee's own session token returns their own tasks but zero rows from `freight_estimates` and `freight_estimate_versions`. A task linked to the estimate reveals nothing about it | Browser section E; database section 6 |

## Also verified

**Recurring tasks and jobs**
- "After completion" series: one open occurrence at a time; finishing it creates exactly one next
  occurrence, one period later.
- One failing series does not stop the others; the run is logged as `partial` with the error, and
  the failed series succeeds on the next run.
- A job that throws is logged as `failed` with its error message.
- One reminder per task per due date and one escalation per lead, across repeated and simultaneous
  runs; no escalation when it is switched off on the task; admins are not notified when the
  department has a lead.

**Access**
- An employee cannot assign a shared task to someone else or reassign their own; another
  department's employee cannot see the task; personal to-dos are invisible to leads and admins.
- Task attachments: a department colleague can open the file; someone outside cannot get a link or
  download it; the file is not publicly reachable.
- SOPs: employees cannot see drafts, cannot publish, cannot change status by writing to the table,
  cannot acknowledge for someone else, and cannot see who else acknowledged.
- An employee cannot change their own role or freight access, read the audit or job logs, or run
  the jobs. A lead cannot manage users. Admin pages return 404 to non-admins.
- Without signing in the API returns nothing; self sign-up is refused; signed-out visitors are sent
  to the sign-in page; a wrong password is refused.
- Admins do not get freight access automatically. Granting it is audited with the admin's name.
  "View" access can read but not save.
- The last active admin cannot be removed. A deactivated user's open session reads nothing.

**Freight**
- A blank exchange rate makes the estimate incomplete with no total, never an assumed rate. A manual
  split that does not total 100% is rejected. A new estimate with blank inputs is labelled INCOMPLETE.
- Saving again creates version 2 and leaves version 1's inputs, rate and results unchanged; saved
  versions cannot be edited or deleted; saves appear in the audit log. CSV export contains the rate
  and totals.

**Administration**
- The first-admin script produces a working one-time password link. The audit log shows the SOP
  publications and the estimate save. "Run now" runs all three jobs and logs them.

## Not verified automatically

- **Email delivery in production.** Locally, invitations were captured by the bundled mail catcher.
  A real SMTP service must be configured and tried.
- **The hosted Supabase project.** Everything ran against the local stack, which uses the same
  database, auth and storage software. The steps in [OPERATIONS.md](OPERATIONS.md) have not been
  executed against a hosted project, including that pg_cron schedules itself there.
- **The 15-minute schedule firing on its own over time.** The schedule is registered and the
  function it calls was exercised directly and through "Run now".
- **Real devices and browsers.** Phone layouts were checked in a phone-sized Chromium window, not on
  actual phones, Safari or Firefox.
- **File uploads through the browser.** Attachment access rules were verified through the API; the
  upload forms on the task and SOP pages were not driven by the browser checks.
- **Screens checked by loading only.** Recurring-task forms, department and settings screens, the
  user edit screen and SOP archive were loaded without errors (and their rules checked at the
  database level) but not exercised step by step in the browser.
- **Load.** Not tested; the expected size is one company's staff.

## Re-running

```bash
npm run db:start
```

```bash
npm run db:reset
```

```bash
npm test
```

```bash
npm run test:db
```

For the browser checks, start the app first (`npm run build`, then `npm run start`) and install a
browser once with `npm i -D playwright` and `npx playwright install chromium`:

```bash
npm run test:e2e
```

`test:db` and `test:e2e` create users at `@frasa-test.test` and records titled "VERIFY…", remove
them afterwards, and refuse to run against anything but a local Supabase. Because the job checks use
future dates, run them on a freshly reset database rather than one holding data you want to keep.
