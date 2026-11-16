-- Frasa HQ · Phase 1 · In-app notifications and background jobs
-- Three automations, all idempotent:
--   1. recurring_tasks      create occurrences of recurring series
--   2. due_reminders        remind owners before the due date
--   3. overdue_escalations  tell the department lead when a task is overdue
-- Duplicates are prevented by unique keys (tasks.series_id+occurrence_no and
-- notifications.dedupe_key), so a retried or overlapping run changes nothing.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in
    ('task_assigned', 'task_reminder', 'task_overdue', 'sop_published', 'sop_ack_requested')),
  title text not null,
  body text not null default '',
  link text not null default '',
  task_id uuid references public.tasks (id) on delete cascade,
  sop_id uuid references public.sops (id) on delete cascade,
  dedupe_key text unique,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create table public.job_runs (
  id bigint generated always as identity primary key,
  job_name text not null,
  triggered_by text not null,             -- 'schedule', 'admin', 'http'
  run_date date not null,                 -- the Aruba date the job evaluated
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'failed', 'skipped')),
  created_count integer not null default 0,
  detail jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz
);
create index job_runs_started_idx on public.job_runs (started_at desc);

-- ---------------------------------------------------------------------------
-- Notification helpers
-- ---------------------------------------------------------------------------
create function app.notify_task_assigned(p_task uuid, p_user uuid, p_title text) returns void
language sql security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, kind, title, link, task_id)
  values (p_user, 'task_assigned', 'Assigned to you: ' || p_title, '/tasks/' || p_task::text, p_task)
$$;

create function app.notify_sop_published(p_sop uuid, p_version uuid) returns void
language sql security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, kind, title, body, link, sop_id, dedupe_key)
  select u, case when v.requires_ack then 'sop_ack_requested' else 'sop_published' end,
    case when v.requires_ack then 'Please read and acknowledge: ' else 'SOP updated: ' end || v.title,
    case when v.version_no = 1 then 'New procedure published.'
         else 'Version ' || v.version_no || ' published. ' || v.change_summary end,
    '/sops/' || p_sop::text, p_sop,
    'sop:' || p_version::text || ':' || u::text
  from app.sop_audience(p_sop) u
  join public.sop_versions v on v.id = p_version
  where v.requires_ack or u is distinct from app.uid()
  on conflict (dedupe_key) do nothing
$$;

-- ---------------------------------------------------------------------------
-- Jobs
-- ---------------------------------------------------------------------------
create function app.job_recurring_tasks(p_today date) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  r record;
  v_created integer := 0;
  v_checked integer := 0;
  v_failures jsonb := '[]'::jsonb;
begin
  for r in select id, title from public.task_series where is_active order by created_at loop
    v_checked := v_checked + 1;
    begin
      v_created := v_created + app.generate_series_occurrences(r.id, p_today);
    exception when others then
      -- One broken series must not stop the others.
      v_failures := v_failures || jsonb_build_object('series_id', r.id, 'title', r.title, 'error', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('created', v_created, 'series_checked', v_checked, 'failures', v_failures);
end $$;

create function app.job_due_reminders(p_today date) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_default integer;
  v_created integer;
begin
  select coalesce((value ->> 'remind_days_before')::integer, 1) into v_default
  from public.app_settings where key = 'notification_defaults';
  v_default := coalesce(v_default, 1);

  insert into public.notifications (user_id, kind, title, link, task_id, dedupe_key)
  select t.owner_id, 'task_reminder',
    case when t.due_date = p_today then 'Due today: '
         when t.due_date = p_today + 1 then 'Due tomorrow: '
         else 'Due in ' || (t.due_date - p_today) || ' days: ' end || t.title,
    '/tasks/' || t.id::text, t.id,
    -- Keyed on the due date: a rescheduled task is reminded again for its new date.
    'reminder:' || t.id::text || ':' || t.due_date::text
  from public.tasks t
  join public.profiles p on p.id = t.owner_id and p.is_active
  where t.status not in ('done', 'cancelled')
    and t.due_date is not null
    and p_today between t.due_date - coalesce(t.remind_days_before, v_default) and t.due_date
  on conflict (dedupe_key) do nothing;
  get diagnostics v_created = row_count;
  return jsonb_build_object('created', v_created, 'default_days_before', v_default);
end $$;

create function app.job_overdue_escalations(p_today date) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_created integer;
begin
  insert into public.notifications (user_id, kind, title, body, link, task_id, dedupe_key)
  select r.user_id, 'task_overdue',
    'Overdue: ' || t.title,
    'Owner: ' || coalesce(nullif(o.full_name, ''), o.email) || ' · was due ' || to_char(t.due_date, 'DD Mon YYYY'),
    '/tasks/' || t.id::text, t.id,
    'overdue:' || t.id::text || ':' || t.due_date::text || ':' || r.user_id::text
  from public.tasks t
  join public.profiles o on o.id = t.owner_id
  cross join lateral (
    -- The department's leads; when a department has no lead, the admins.
    select p.id as user_id
    from public.department_members m
    join public.profiles p on p.id = m.user_id
    where m.department_id = t.department_id and m.is_lead and p.role = 'department_lead' and p.is_active
    union
    select p.id from public.profiles p
    where p.role = 'admin' and p.is_active
      and not exists (
        select 1 from public.department_members m2
        join public.profiles p2 on p2.id = m2.user_id
        where m2.department_id = t.department_id and m2.is_lead
          and p2.role = 'department_lead' and p2.is_active)
  ) r
  where t.kind = 'shared' and t.escalate_overdue
    and t.status not in ('done', 'cancelled')
    and t.due_date < p_today
  on conflict (dedupe_key) do nothing;
  get diagnostics v_created = row_count;
  return jsonb_build_object('created', v_created);
end $$;

-- Runs one job, records the outcome in job_runs, and never raises: a failure is
-- rolled back to the start of the job and logged, so the next run can retry it.
create function app.run_job(p_job text, p_today date, p_triggered_by text) returns bigint
language plpgsql security definer
set search_path = ''
as $$
declare
  v_run bigint;
  v_result jsonb;
  v_error text;
begin
  insert into public.job_runs (job_name, triggered_by, run_date)
  values (p_job, p_triggered_by, p_today) returning id into v_run;

  -- Only one run of a given job at a time; an overlapping run is logged and skipped.
  if not pg_try_advisory_xact_lock(hashtextextended('frasa_hq_job:' || p_job, 0)) then
    update public.job_runs set status = 'skipped', finished_at = clock_timestamp(),
      detail = jsonb_build_object('reason', 'another run of this job is in progress')
    where id = v_run;
    return v_run;
  end if;

  begin
    v_result := case p_job
      when 'recurring_tasks' then app.job_recurring_tasks(p_today)
      when 'due_reminders' then app.job_due_reminders(p_today)
      when 'overdue_escalations' then app.job_overdue_escalations(p_today)
    end;
    if v_result is null then
      raise exception 'Unknown job: %', p_job;
    end if;
    update public.job_runs
    set status = case when jsonb_array_length(coalesce(v_result -> 'failures', '[]'::jsonb)) > 0
                      then 'partial' else 'success' end,
        created_count = coalesce((v_result ->> 'created')::integer, 0),
        detail = v_result, finished_at = clock_timestamp()
    where id = v_run;
  exception when others then
    v_error := sqlerrm;
    update public.job_runs set status = 'failed', error = v_error, finished_at = clock_timestamp()
    where id = v_run;
  end;
  return v_run;
end $$;

-- Entry point for schedulers (pg_cron, or the /api/cron/run-jobs route using the
-- service role). p_today is overridable only here, for testing.
create function public.run_scheduled_jobs(p_today date default null, p_triggered_by text default 'schedule')
returns setof public.job_runs
language plpgsql security definer
set search_path = ''
as $$
declare
  v_today date := coalesce(p_today, app.today());
  v_ids bigint[] := '{}';
begin
  v_ids := v_ids || app.run_job('recurring_tasks', v_today, p_triggered_by);
  v_ids := v_ids || app.run_job('due_reminders', v_today, p_triggered_by);
  v_ids := v_ids || app.run_job('overdue_escalations', v_today, p_triggered_by);
  delete from public.job_runs where started_at < now() - interval '90 days';   -- keep the log bounded
  return query select * from public.job_runs where id = any (v_ids) order by id;
end $$;

-- "Run now" on the admin screen.
create function public.admin_run_jobs() returns setof public.job_runs
language plpgsql security definer
set search_path = ''
as $$
begin
  if not app.is_admin() then
    raise exception 'Only admins can run jobs.' using errcode = '42501';
  end if;
  return query select * from public.run_scheduled_jobs(null, 'admin');
end $$;

create function public.mark_notifications_read(p_ids uuid[] default null) returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.notifications set read_at = now()
  where user_id = app.uid() and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- Row level security and privileges
-- ---------------------------------------------------------------------------
alter table public.notifications enable row level security;
alter table public.job_runs enable row level security;

create policy notifications_select_own on public.notifications for select to authenticated
  using (user_id = (select app.uid()));
create policy job_runs_admin_select on public.job_runs for select to authenticated
  using ((select app.is_admin()));

revoke all on public.notifications, public.job_runs from anon, authenticated;
grant select on public.notifications, public.job_runs to authenticated;
grant all on public.notifications, public.job_runs to service_role;

revoke execute on function public.run_scheduled_jobs(date, text) from public, anon, authenticated;
revoke execute on function public.admin_run_jobs() from public, anon;
revoke execute on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.run_scheduled_jobs(date, text) to service_role;
grant execute on function public.admin_run_jobs() to authenticated;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

revoke execute on all functions in schema app from public;
grant execute on all functions in schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Schedule (pg_cron): every 15 minutes. Times are evaluated in Aruba local time
-- inside the jobs, so the cron expression itself does not need a time zone.
-- ---------------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'frasa-hq-jobs';
  perform cron.schedule('frasa-hq-jobs', '*/15 * * * *', 'select public.run_scheduled_jobs()');
exception when others then
  raise notice 'pg_cron is not available (%). Schedule public.run_scheduled_jobs() another way; see docs/OPERATIONS.md.', sqlerrm;
end $$;
