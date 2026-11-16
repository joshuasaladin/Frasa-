# Deployment and operations

## Production deployment

Frasa HQ needs two things: a **Supabase project** (database, auth, storage) and a **Node.js host**
for the Next.js app (Vercel is the simplest; any host that runs `npm run build && npm run start`
works).

### 1. Supabase project

1. Create a project at supabase.com. Choose a region close to Aruba (US East). Keep the database
   password somewhere safe.
2. Apply the migrations from this repository:

   ```bash
   npx supabase link --project-ref <your-project-ref>
   ```

   ```bash
   npx supabase db push
   ```

   This creates all tables, security policies, the private `attachments` bucket, the three sample
   SOP drafts and the 15-minute job schedule. It does **not** create demo data.
3. In the Supabase dashboard, under **Authentication**:
   - **Sign In / Providers → Email:** turn **off** "Allow new users to sign up". Accounts are created
     only by invitation. (`supabase/config.toml` already does this for local development; a hosted
     project needs it set in the dashboard, or pushed with `npx supabase config push`.)
   - Set the minimum password length to 10.
   - **URL Configuration:** set *Site URL* to the app's address, e.g. `https://hq.frasa.example`.
   - **Emails → Templates:** paste `supabase/templates/invite.html` into *Invite user* and
     `supabase/templates/recovery.html` into *Reset password*. These links must point at
     `/auth/confirm` as written in the templates.
   - **Emails → SMTP:** configure Frasa's own mail service. Supabase's built-in sender is rate
     limited to a few emails per hour and is not meant for production.

### 2. The app

**On Render:** the repository includes a Blueprint (`render.yaml`). In the Render dashboard switch to
the **Frasa** workspace, choose **New → Blueprint**, connect this repository and branch, and enter
the four values it asks for. Render builds and starts the app and redeploys on every push. The
`NEXT_PUBLIC_…` values are built into the app, so after changing one, trigger a new deploy. Once the
service has its address, put it in `NEXT_PUBLIC_SITE_URL` and in Supabase's *Site URL*.

On any other host, set these environment variables, then deploy the repository:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL (Supabase → Settings → API) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | The service_role / secret key. **Server only; never expose it** |
| `NEXT_PUBLIC_SITE_URL` | The app's public address |
| `CRON_SECRET` | Only if you use the HTTP cron route below; a long random string |

The app sends `X-Robots-Tag: noindex` and security headers on every response. Serve it over HTTPS
only.

### 3. First admin account

Run once, from a machine with the production `NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SITE_URL` in its environment (or in `.env.local`):

```bash
npm run create-admin -- owner@frasa.example "Full Name"
```

It creates the account (or promotes an existing one), and prints a one-time link to choose a
password. No password is stored or printed. After that, everyone else is invited from
**Admin → Users**; the script is not needed again.

Then, signed in as that admin:

1. **Admin → Users:** give yourself freight access if you need it (it is separate from the admin role).
2. **Admin → Departments:** check the department list.
3. **Admin → Users:** invite employees, choosing role, departments and freight access.
4. **Admin → Settings:** set notification defaults and, if wanted, freight defaults.
5. **SOP library → Drafts and archived:** revise the three sample SOPs, then publish.

## Scheduled jobs

The three automations (recurring tasks, due reminders, overdue escalations) are database functions.
One call runs all of them:

```sql
select public.run_scheduled_jobs();
```

**Default: pg_cron inside Supabase.** The migration enables the `pg_cron` extension and schedules
the call every 15 minutes under the name `frasa-hq-jobs`. Nothing else needs to be set up. To check:

```sql
select jobname, schedule, active from cron.job;
```

To change the frequency:

```sql
select cron.schedule('frasa-hq-jobs', '*/15 * * * *', 'select public.run_scheduled_jobs()');
```

**Alternative: HTTP.** If pg_cron is not available, have any scheduler (Vercel Cron, GitHub
Actions, a server crontab) call the app. Set `CRON_SECRET` first:

```bash
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://hq.frasa.example/api/cron/run-jobs
```

Using both is harmless.

**How it behaves**

- Safe to retry and to run more often than needed: tasks and notifications are protected by unique
  keys, so nothing is created twice. Two overlapping runs do not interfere; the second logs
  `skipped`.
- Every run is logged. **Admin → Background jobs** shows the last 90 runs, any failures with their
  error text, a **Run now** button, and a warning if nothing has run for an hour. Log rows older
  than 90 days are removed automatically.
- If one recurring series fails, the others still run; the run is marked `partial` and the failed
  series is retried next time.
- Dates are evaluated in Aruba local time inside the jobs, regardless of the server's time zone.
- Because jobs run every 15 minutes, a reminder appears at most 15 minutes after midnight Aruba
  time on the day it becomes due.

## Routine care

- **Backups.** Supabase takes daily backups on paid plans. Frasa HQ holds procedures, task history
  and cost estimates; confirm the backup plan before rollout.
- **Someone leaves.** Admin → Users → untick *Active*. They can no longer sign in or read anything;
  their tasks and history stay. Reassign their open tasks from the task list (filter by owner).
- **Forgotten password or expired invitation.** Admin → Users → the person → *Send password link*.
  Employees can also use "Forgot your password?" on the sign-in page.
- **Upgrades.** Database changes go in new files under `supabase/migrations` and are applied with
  `npx supabase db push`. Never edit a migration that has been applied to production.
- **Regenerating database types** after a schema change:

  ```bash
  npx supabase gen types typescript --local --schema public > src/lib/supabase/database.types.ts
  ```

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Invitation link says it is invalid or expired | Links are single-use and time-limited. Some mail scanners open links before the person does; send a new password link |
| Invitation emails do not arrive | Custom SMTP not configured, or the built-in sender's hourly limit was reached |
| "No job has run in the last hour" on the jobs page | pg_cron is not enabled or the schedule is missing; run the `cron.schedule` statement above, or use the HTTP alternative |
| A lead cannot assign a task to someone | That person is not a member of the department, or the lead is not marked as leading it (Admin → Users) |
| Someone cannot see the Freight calculator | Freight access is "No access" for them (Admin → Users) |
| A sample SOP will not publish | It needs an owner, a purpose, at least one step and a next review date |
