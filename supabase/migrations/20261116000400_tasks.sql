-- Frasa HQ · Phase 1 · Tasks and recurring series
-- Personal to-dos are private to their owner. Shared tasks belong to a department
-- and have exactly one accountable owner. Due dates are Aruba local dates.

create type public.task_kind as enum ('personal', 'shared');
create type public.task_status as enum ('open', 'in_progress', 'blocked', 'done', 'cancelled');
create type public.task_priority as enum ('low', 'normal', 'high', 'urgent');
create type public.recurrence_frequency as enum ('daily', 'weekly', 'monthly');
-- fixed_schedule:    occurrences fall on calendar dates computed from the start date,
--                    whether or not earlier occurrences were completed.
-- after_completion:  the next occurrence is due one interval after the previous
--                    occurrence was completed.
create type public.recurrence_mode as enum ('fixed_schedule', 'after_completion');

create table public.task_series (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  description text not null default '',
  kind public.task_kind not null,
  owner_id uuid not null references public.profiles (id) on delete restrict,
  department_id uuid references public.departments (id) on delete restrict,
  priority public.task_priority not null default 'normal',
  frequency public.recurrence_frequency not null,
  interval_count integer not null default 1 check (interval_count between 1 and 52),
  schedule_mode public.recurrence_mode not null,
  start_date date not null,
  end_date date,
  weekdays smallint[],            -- daily series only: ISO weekdays (1 = Monday); null = every day
  checklist_template jsonb not null default '[]'::jsonb,   -- ["label", ...]
  sop_id uuid references public.sops (id) on delete set null,
  remind_days_before integer check (remind_days_before between 0 and 30),
  escalate_overdue boolean not null default false,
  is_active boolean not null default true,
  last_occurrence_no integer not null default -1,
  -- Occurrence number that start_date refers to. It moves forward when the schedule
  -- is edited, so start_date then means "the next occurrence" and numbering continues.
  anchor_no integer not null default 0,
  is_demo boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'shared') = (department_id is not null)),
  check (end_date is null or end_date >= start_date),
  check (jsonb_typeof(checklist_template) = 'array'),
  check (weekdays is null or (cardinality(weekdays) > 0 and weekdays <@ array[1,2,3,4,5,6,7]::smallint[]))
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  description text not null default '',
  kind public.task_kind not null,
  owner_id uuid not null references public.profiles (id) on delete restrict,
  department_id uuid references public.departments (id) on delete restrict,
  due_date date,
  priority public.task_priority not null default 'normal',
  status public.task_status not null default 'open',
  completed_at timestamptz,
  completed_by uuid references public.profiles (id) on delete set null,
  -- Recurrence: scheduled_for keeps the date the series produced, so a single
  -- occurrence can be rescheduled (due_date) without touching the series.
  series_id uuid references public.task_series (id) on delete set null,
  occurrence_no integer,
  scheduled_for date,
  sop_id uuid references public.sops (id) on delete set null,
  freight_estimate_id uuid references public.freight_estimates (id) on delete set null,
  external_link_label text not null default '',   -- e.g. "NECS order 10452"
  external_link_url text not null default '',
  remind_days_before integer check (remind_days_before between 0 and 30),  -- null = company default
  escalate_overdue boolean not null default false,
  is_demo boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'shared') = (department_id is not null)),
  check (kind = 'personal' or due_date is not null),
  check (external_link_url = '' or external_link_url ~* '^https?://'),
  -- The duplicate guard for recurring occurrences.
  unique (series_id, occurrence_no)
);
create index tasks_owner_open_idx on public.tasks (owner_id, due_date) where status not in ('done', 'cancelled');
create index tasks_department_idx on public.tasks (department_id, due_date);
create index tasks_due_open_idx on public.tasks (due_date) where status not in ('done', 'cancelled');

create table public.task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  label text not null check (length(trim(label)) > 0),
  is_done boolean not null default false,
  position integer not null default 0,
  done_by uuid references public.profiles (id) on delete set null,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index task_checklist_task_idx on public.task_checklist_items (task_id, position);

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create index task_comments_task_idx on public.task_comments (task_id, created_at);

create table public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index task_attachments_task_idx on public.task_attachments (task_id);

-- History of each task / occurrence, written by triggers only.
create table public.task_events (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.tasks (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  event text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index task_events_task_idx on public.task_events (task_id, created_at);

-- ---------------------------------------------------------------------------
-- Permission helpers
-- ---------------------------------------------------------------------------
create function app.can_view_task_row(p_kind public.task_kind, p_owner uuid, p_created_by uuid, p_department uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select app.uid() is not null and case
    when p_kind = 'personal' then p_owner = app.uid()
    else app.is_admin() or p_owner = app.uid() or p_created_by = app.uid() or app.in_department(p_department)
  end
$$;

create function app.can_edit_task_row(p_kind public.task_kind, p_owner uuid, p_department uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select app.uid() is not null and case
    when p_kind = 'personal' then p_owner = app.uid()
    else app.is_admin() or p_owner = app.uid() or app.leads_department(p_department)
  end
$$;

-- Who may create a task:
--   personal: anyone, for themselves.
--   shared:   admins anywhere; a lead in a department they lead (assigning to a member);
--             a member of the department, owned by themselves; and a lead may hand a
--             task to another department by assigning it to one of that department's leads.
create function app.can_create_task(p_kind public.task_kind, p_owner uuid, p_department uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select app.uid() is not null and case
    when p_kind = 'personal' then p_owner = app.uid() and p_department is null
    when app.is_admin() then true
    when app.leads_department(p_department) then p_owner = app.uid() or app.user_in_department(p_owner, p_department)
    when app.in_department(p_department) and p_owner = app.uid() then true
    when app.role() = 'department_lead' then app.user_leads_department(p_owner, p_department)
    else false
  end
$$;

create function app.can_view_task(p_task uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tasks t
    where t.id = p_task and app.can_view_task_row(t.kind, t.owner_id, t.created_by, t.department_id))
$$;

create function app.can_edit_task(p_task uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tasks t
    where t.id = p_task and app.can_edit_task_row(t.kind, t.owner_id, t.department_id))
$$;

-- ---------------------------------------------------------------------------
-- Recurrence
-- ---------------------------------------------------------------------------
create function app.series_step(p_frequency public.recurrence_frequency, p_interval integer, p_n integer)
returns interval
language sql immutable
set search_path = ''
as $$
  select case p_frequency
    when 'daily' then make_interval(days => p_interval * p_n)
    when 'weekly' then make_interval(weeks => p_interval * p_n)
    else make_interval(months => p_interval * p_n)
  end
$$;

-- Date of occurrence n on a fixed schedule. Always computed from the start date so
-- a monthly series anchored on the 31st gives Jan 31, Feb 28/29, Mar 31, ...
create function app.series_fixed_date(p_series public.task_series, p_n integer) returns date
language sql immutable
set search_path = ''
as $$
  select (p_series.start_date
    + app.series_step(p_series.frequency, p_series.interval_count, p_n - p_series.anchor_no))::date
$$;

create function app.series_weekday_ok(p_series public.task_series, p_date date) returns boolean
language sql immutable
set search_path = ''
as $$
  select p_series.frequency <> 'daily' or p_series.weekdays is null
      or extract(isodow from p_date)::smallint = any (p_series.weekdays)
$$;

-- How far ahead of its due date an occurrence appears.
create function app.series_lead_days(p_frequency public.recurrence_frequency) returns integer
language sql immutable
set search_path = ''
as $$ select case p_frequency when 'daily' then 1 when 'weekly' then 7 else 14 end $$;

create function app.series_insert_occurrence(p_series public.task_series, p_n integer, p_date date)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_task uuid;
begin
  insert into public.tasks (title, description, kind, owner_id, department_id, due_date, priority,
    series_id, occurrence_no, scheduled_for, sop_id, remind_days_before, escalate_overdue,
    is_demo, created_by)
  values (p_series.title, p_series.description, p_series.kind, p_series.owner_id, p_series.department_id,
    p_date, p_series.priority, p_series.id, p_n, p_date, p_series.sop_id,
    p_series.remind_days_before, p_series.escalate_overdue, p_series.is_demo, p_series.created_by)
  on conflict (series_id, occurrence_no) do nothing
  returning id into v_task;

  update public.task_series set last_occurrence_no = greatest(last_occurrence_no, p_n)
  where id = p_series.id;

  if v_task is null then
    return 0;   -- already created by an earlier (or concurrent) run
  end if;

  insert into public.task_checklist_items (task_id, label, position)
  select v_task, item.label, item.ord::integer
  from jsonb_array_elements_text(p_series.checklist_template) with ordinality as item (label, ord)
  where length(trim(item.label)) > 0;
  return 1;
end $$;

-- Creates any occurrences that are due to exist for one series. Safe to call any
-- number of times: the series row is locked and (series_id, occurrence_no) is unique.
create function app.generate_series_occurrences(p_series_id uuid, p_today date) returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  s public.task_series;
  v_created integer := 0;
  v_n integer;
  v_date date;
  v_horizon date;
  v_backfill_from date := p_today - 7;   -- occurrences older than a week are not back-filled
  v_last public.tasks;
  v_base date;
  v_guard integer := 0;
begin
  select * into s from public.task_series where id = p_series_id for update;
  if s.id is null or not s.is_active then
    return 0;
  end if;
  v_horizon := p_today + app.series_lead_days(s.frequency);
  if s.end_date is not null then
    v_horizon := least(v_horizon, s.end_date);
  end if;

  if s.schedule_mode = 'fixed_schedule' then
    v_n := s.last_occurrence_no + 1;
    -- Jump close to the back-fill window instead of walking from the start date.
    if app.series_fixed_date(s, v_n) < v_backfill_from then
      v_n := greatest(v_n, s.anchor_no + case s.frequency
        when 'daily' then (v_backfill_from - s.start_date) / s.interval_count
        when 'weekly' then (v_backfill_from - s.start_date) / (7 * s.interval_count)
        else ((extract(year from age(v_backfill_from, s.start_date)) * 12
              + extract(month from age(v_backfill_from, s.start_date)))::integer / s.interval_count) - 1
      end);
    end if;
    loop
      v_guard := v_guard + 1;
      exit when v_guard > 500;
      v_date := app.series_fixed_date(s, v_n);
      exit when v_date > v_horizon;
      if v_date >= v_backfill_from and app.series_weekday_ok(s, v_date) then
        v_created := v_created + app.series_insert_occurrence(s, v_n, v_date);
      end if;
      v_n := v_n + 1;
    end loop;

  else  -- after_completion
    if s.last_occurrence_no < s.anchor_no then
      -- first occurrence of the series, or first one after the schedule was edited
      select * into v_last from public.tasks
      where series_id = s.id and occurrence_no = s.last_occurrence_no;
      if v_last.id is not null and v_last.status not in ('done', 'cancelled') then
        return 0;
      end if;
      v_n := s.anchor_no;
      v_date := s.start_date;
    else
      select * into v_last from public.tasks
      where series_id = s.id and occurrence_no = s.last_occurrence_no;
      if v_last.id is not null and v_last.status not in ('done', 'cancelled') then
        return 0;   -- the current occurrence is still open
      end if;
      v_base := coalesce(
        (coalesce(v_last.completed_at, v_last.updated_at) at time zone 'America/Aruba')::date,
        p_today);
      v_n := s.last_occurrence_no + 1;
      v_date := (v_base + app.series_step(s.frequency, s.interval_count, 1))::date;
    end if;
    while not app.series_weekday_ok(s, v_date) loop
      v_date := v_date + 1;
    end loop;
    -- The first occurrence waits for its lead window; follow-ups are created as
    -- soon as the previous one is finished so the next due date is visible.
    if (s.end_date is null or v_date <= s.end_date)
       and (s.last_occurrence_no >= s.anchor_no or v_date <= v_horizon) then
      v_created := app.series_insert_occurrence(s, v_n, v_date);
    end if;
  end if;
  return v_created;
end $$;

-- ---------------------------------------------------------------------------
-- Task triggers
-- ---------------------------------------------------------------------------
create function app.tasks_before_write() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_structural boolean;
begin
  if tg_op = 'INSERT' then
    if (select auth.uid()) is not null then
      new.created_by := app.uid();
      new.series_id := null;        -- occurrences are only created by the generator
      new.occurrence_no := null;
      new.scheduled_for := null;
    end if;
    if new.status = 'done' then
      new.completed_at := coalesce(new.completed_at, now());
      new.completed_by := coalesce(new.completed_by, app.uid());
    end if;
    return new;
  end if;

  new.updated_at := now();
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  if (select auth.uid()) is not null then
    new.series_id := old.series_id;
    new.occurrence_no := old.occurrence_no;
    new.scheduled_for := old.scheduled_for;
    new.is_demo := old.is_demo;

    v_structural := new.kind <> old.kind
      or new.owner_id <> old.owner_id
      or new.department_id is distinct from old.department_id;
    if v_structural then
      if old.kind = 'personal' or new.kind = 'personal' then
        raise exception 'A personal to-do cannot be reassigned or converted. Create a shared task instead.'
          using errcode = '42501';
      end if;
      if not app.is_admin() then
        if not app.leads_department(old.department_id) then
          raise exception 'Only a department lead or admin can reassign a shared task.' using errcode = '42501';
        end if;
        if not app.can_create_task(new.kind, new.owner_id, new.department_id) then
          raise exception 'You cannot assign this task to that person or department.' using errcode = '42501';
        end if;
      end if;
    end if;
  end if;

  if new.status = 'done' and old.status <> 'done' then
    new.completed_at := now();
    new.completed_by := app.uid();
  elsif new.status <> 'done' and old.status = 'done' then
    new.completed_at := null;
    new.completed_by := null;
  end if;
  return new;
end $$;

create trigger tasks_before_write before insert or update on public.tasks
  for each row execute function app.tasks_before_write();

create function app.tasks_after_write() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := app.uid();
  v_mode public.recurrence_mode;
begin
  if tg_op = 'INSERT' then
    insert into public.task_events (task_id, actor_id, event, detail)
    values (new.id, v_actor,
      case when new.series_id is null then 'created' else 'created_from_series' end,
      jsonb_build_object('owner_id', new.owner_id, 'due_date', new.due_date));
    if new.series_id is null and new.owner_id is distinct from v_actor then
      perform app.notify_task_assigned(new.id, new.owner_id, new.title);
    end if;
    return new;
  end if;

  if new.status <> old.status then
    insert into public.task_events (task_id, actor_id, event, detail)
    values (new.id, v_actor, 'status_changed', jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  if new.owner_id <> old.owner_id then
    insert into public.task_events (task_id, actor_id, event, detail)
    values (new.id, v_actor, 'reassigned', jsonb_build_object('from', old.owner_id, 'to', new.owner_id));
    if new.owner_id is distinct from v_actor then
      perform app.notify_task_assigned(new.id, new.owner_id, new.title);
    end if;
  end if;
  if new.due_date is distinct from old.due_date then
    insert into public.task_events (task_id, actor_id, event, detail)
    values (new.id, v_actor, 'rescheduled', jsonb_build_object('from', old.due_date, 'to', new.due_date));
  end if;
  if new.department_id is distinct from old.department_id then
    insert into public.task_events (task_id, actor_id, event, detail)
    values (new.id, v_actor, 'department_changed',
      jsonb_build_object('from', old.department_id, 'to', new.department_id));
  end if;

  -- "After completion" series: finishing an occurrence schedules the next one.
  if new.series_id is not null and new.status in ('done', 'cancelled')
     and old.status not in ('done', 'cancelled') then
    select schedule_mode into v_mode from public.task_series where id = new.series_id;
    if v_mode = 'after_completion' then
      perform app.generate_series_occurrences(new.series_id, app.today());
    end if;
  end if;
  return new;
end $$;

create trigger tasks_after_write after insert or update on public.tasks
  for each row execute function app.tasks_after_write();

create function app.task_comments_event() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.task_events (task_id, actor_id, event) values (new.task_id, app.uid(), 'commented');
  return new;
end $$;
create trigger task_comments_event after insert on public.task_comments
  for each row execute function app.task_comments_event();

create function app.task_checklist_before_write() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.is_done and (tg_op = 'INSERT' or not old.is_done) then
    new.done_at := now();
    new.done_by := app.uid();
  elsif not new.is_done then
    new.done_at := null;
    new.done_by := null;
  end if;
  return new;
end $$;
create trigger task_checklist_before_write before insert or update on public.task_checklist_items
  for each row execute function app.task_checklist_before_write();

create function app.task_series_before_update() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  if (new.frequency, new.interval_count, new.schedule_mode, new.start_date)
     is distinct from (old.frequency, old.interval_count, old.schedule_mode, old.start_date) then
    new.anchor_no := old.last_occurrence_no + 1;
  end if;
  return new;
end $$;
create trigger task_series_before_update before update on public.task_series
  for each row execute function app.task_series_before_update();

-- A new or edited series produces its first occurrence right away when one is due.
create function app.task_series_after_write() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.is_active then
    perform app.generate_series_occurrences(new.id, app.today());
  end if;
  return new;
end $$;
create trigger task_series_after_insert after insert on public.task_series
  for each row execute function app.task_series_after_write();
-- Listed columns only, so the generator's own bookkeeping update does not re-fire it.
create trigger task_series_after_update
  after update of is_active, frequency, interval_count, schedule_mode, start_date, end_date, weekdays
  on public.task_series
  for each row execute function app.task_series_after_write();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.task_series enable row level security;
alter table public.tasks enable row level security;
alter table public.task_checklist_items enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_attachments enable row level security;
alter table public.task_events enable row level security;

create policy tasks_select on public.tasks for select to authenticated
  using (app.can_view_task_row(kind, owner_id, created_by, department_id));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (app.can_create_task(kind, owner_id, department_id));
create policy tasks_update on public.tasks for update to authenticated
  using (app.can_edit_task_row(kind, owner_id, department_id))
  with check (app.can_view_task_row(kind, owner_id, created_by, department_id));
create policy tasks_delete on public.tasks for delete to authenticated
  using (case when kind = 'personal' then owner_id = (select app.uid())
              else (select app.is_admin()) or app.leads_department(department_id) end);

-- Recurring series: personal ones belong to their owner; shared ones are managed
-- by the department's leads and admins and visible to the department.
create policy task_series_select on public.task_series for select to authenticated
  using (app.can_view_task_row(kind, owner_id, created_by, department_id));
create policy task_series_insert on public.task_series for insert to authenticated
  with check (created_by = (select app.uid()) and case
    when kind = 'personal' then owner_id = (select app.uid())
    else (select app.is_admin())
      or (app.leads_department(department_id)
          and (owner_id = (select app.uid()) or app.user_in_department(owner_id, department_id))) end);
create policy task_series_update on public.task_series for update to authenticated
  using (case when kind = 'personal' then owner_id = (select app.uid())
              else (select app.is_admin()) or app.leads_department(department_id) end)
  with check (case when kind = 'personal' then owner_id = (select app.uid())
              else (select app.is_admin())
                or (app.leads_department(department_id)
                    and (owner_id = (select app.uid()) or app.user_in_department(owner_id, department_id))) end);

create policy task_checklist_select on public.task_checklist_items for select to authenticated
  using (app.can_view_task(task_id));
create policy task_checklist_insert on public.task_checklist_items for insert to authenticated
  with check (app.can_edit_task(task_id));
create policy task_checklist_update on public.task_checklist_items for update to authenticated
  using (app.can_edit_task(task_id)) with check (app.can_edit_task(task_id));
create policy task_checklist_delete on public.task_checklist_items for delete to authenticated
  using (app.can_edit_task(task_id));

create policy task_comments_select on public.task_comments for select to authenticated
  using (app.can_view_task(task_id));
create policy task_comments_insert on public.task_comments for insert to authenticated
  with check (app.can_view_task(task_id) and author_id = (select app.uid()));
create policy task_comments_delete on public.task_comments for delete to authenticated
  using (author_id = (select app.uid()) or (select app.is_admin()));

create policy task_attachments_select on public.task_attachments for select to authenticated
  using (app.can_view_task(task_id));
create policy task_attachments_insert on public.task_attachments for insert to authenticated
  with check (app.can_view_task(task_id) and uploaded_by = (select app.uid())
    and storage_path like 'tasks/' || task_id::text || '/%');
create policy task_attachments_delete on public.task_attachments for delete to authenticated
  using (uploaded_by = (select app.uid()) or app.can_edit_task(task_id));

create policy task_events_select on public.task_events for select to authenticated
  using (app.can_view_task(task_id));

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on public.task_series, public.tasks, public.task_checklist_items, public.task_comments,
  public.task_attachments, public.task_events from anon, authenticated;

grant select, insert, delete on public.tasks to authenticated;
grant update (title, description, kind, owner_id, department_id, due_date, priority, status, sop_id,
  freight_estimate_id, external_link_label, external_link_url, remind_days_before, escalate_overdue)
  on public.tasks to authenticated;
grant select, insert on public.task_series to authenticated;
grant update (title, description, owner_id, priority, frequency, interval_count, schedule_mode,
  start_date, end_date, weekdays, checklist_template, sop_id, remind_days_before, escalate_overdue, is_active)
  on public.task_series to authenticated;
grant select, insert, delete on public.task_checklist_items to authenticated;
grant update (label, is_done, position) on public.task_checklist_items to authenticated;
grant select, insert, delete on public.task_comments to authenticated;
grant select, insert, delete on public.task_attachments to authenticated;
grant select on public.task_events to authenticated;

grant all on public.task_series, public.tasks, public.task_checklist_items, public.task_comments,
  public.task_attachments, public.task_events to service_role;

revoke execute on all functions in schema app from public;
grant execute on all functions in schema app to authenticated, service_role;
