-- Frasa HQ · Phase 1 · Core: people, departments, settings, audit history
-- Conventions used by every module:
--   * Every table has row level security enabled. Policies call helpers in the
--     private `app` schema (not exposed through the API).
--   * `app.uid()` returns the caller's id only while their profile is active, so
--     deactivating a user cuts off data access immediately.
--   * Privileges are granted explicitly; nothing is granted to `anon`.
--   * Dates for deadlines and schedules are Aruba local dates (`app.today()`).

create schema if not exists app;
grant usage on schema app to authenticated, service_role;

create type public.user_role as enum ('admin', 'department_lead', 'employee');
create type public.freight_access as enum ('none', 'view', 'edit');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role public.user_role not null default 'employee',
  freight_access public.freight_access not null default 'none',
  is_active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.department_members (
  user_id uuid not null references public.profiles (id) on delete cascade,
  department_id uuid not null references public.departments (id) on delete cascade,
  is_lead boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, department_id)
);
create index department_members_department_idx on public.department_members (department_id);

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at desc);
create index audit_log_entity_idx on public.audit_log (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Helpers (private schema)
-- ---------------------------------------------------------------------------
create function app.today() returns date
language sql stable
set search_path = ''
as $$ select (now() at time zone 'America/Aruba')::date $$;

-- The caller's id, or null when signed out or deactivated.
create function app.uid() returns uuid
language sql stable security definer
set search_path = ''
as $$
  select p.id from public.profiles p
  where p.id = (select auth.uid()) and p.is_active
$$;

create function app.role() returns public.user_role
language sql stable security definer
set search_path = ''
as $$
  select p.role from public.profiles p
  where p.id = (select auth.uid()) and p.is_active
$$;

create function app.is_admin() returns boolean
language sql stable security definer
set search_path = ''
as $$ select coalesce(app.role() = 'admin', false) $$;

create function app.in_department(p_department uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.department_members m
    where m.user_id = app.uid() and m.department_id = p_department
  )
$$;

-- A department lead only has lead powers in the departments they are marked as leading.
create function app.leads_department(p_department uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select app.role() = 'department_lead' and exists (
    select 1 from public.department_members m
    where m.user_id = app.uid() and m.department_id = p_department and m.is_lead
  )
$$;

create function app.user_leads_department(p_user uuid, p_department uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.department_members m
    join public.profiles p on p.id = m.user_id
    where m.user_id = p_user and m.department_id = p_department and m.is_lead
      and p.role = 'department_lead' and p.is_active
  )
$$;

create function app.user_in_department(p_user uuid, p_department uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.department_members m
    join public.profiles p on p.id = m.user_id
    where m.user_id = p_user and m.department_id = p_department and p.is_active
  )
$$;

-- Freight access is separate from role: admins must be granted it like anyone else.
create function app.freight_level() returns public.freight_access
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    (select p.freight_access from public.profiles p where p.id = (select auth.uid()) and p.is_active),
    'none'::public.freight_access)
$$;

create function app.can_view_freight() returns boolean
language sql stable security definer
set search_path = ''
as $$ select app.freight_level() in ('view', 'edit') $$;

create function app.can_edit_freight() returns boolean
language sql stable security definer
set search_path = ''
as $$ select app.freight_level() = 'edit' $$;

create function app.try_uuid(p_text text) returns uuid
language plpgsql immutable
set search_path = ''
as $$
begin
  return p_text::uuid;
exception when others then
  return null;
end $$;

create function app.audit(p_action text, p_entity_type text, p_entity_id text, p_detail jsonb)
returns void
language sql security definer
set search_path = ''
as $$
  insert into public.audit_log (actor_id, action, entity_type, entity_id, detail)
  values (
    (select p.id from public.profiles p where p.id = (select auth.uid())),
    p_action, p_entity_type, p_entity_id, coalesce(p_detail, '{}'::jsonb)
  )
$$;

create function app.touch_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
-- A profile is created for every auth user. Role and access are never read from
-- user-supplied metadata: new accounts always start as employee / no freight access.
create function app.handle_new_user() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

create function app.profiles_guard_and_audit() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform app.audit('user.created', 'profile', new.id::text, jsonb_build_object('email', new.email));
  end if;
  if tg_op = 'UPDATE' then
    if (old.role = 'admin' and old.is_active)
       and (new.role <> 'admin' or not new.is_active)
       and not exists (
         select 1 from public.profiles p
         where p.role = 'admin' and p.is_active and p.id <> old.id
       ) then
      raise exception 'Frasa HQ must keep at least one active admin.' using errcode = 'P0001';
    end if;
    if new.role is distinct from old.role then
      perform app.audit('user.role_changed', 'profile', new.id::text,
        jsonb_build_object('email', new.email, 'from', old.role, 'to', new.role));
    end if;
    if new.freight_access is distinct from old.freight_access then
      perform app.audit('user.freight_access_changed', 'profile', new.id::text,
        jsonb_build_object('email', new.email, 'from', old.freight_access, 'to', new.freight_access));
    end if;
    if new.is_active is distinct from old.is_active then
      perform app.audit(case when new.is_active then 'user.reactivated' else 'user.deactivated' end,
        'profile', new.id::text, jsonb_build_object('email', new.email));
    end if;
  end if;
  return new;
end $$;

create trigger profiles_guard_and_audit
  after insert or update on public.profiles
  for each row execute function app.profiles_guard_and_audit();

create trigger profiles_touch before update on public.profiles
  for each row execute function app.touch_updated_at();

create function app.department_members_audit() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  r public.department_members;
  dept text;
begin
  r := case when tg_op = 'DELETE' then old else new end;
  select d.name into dept from public.departments d where d.id = r.department_id;
  -- Skip when the profile itself is being removed (cascade).
  if tg_op = 'DELETE' and not exists (select 1 from public.profiles p where p.id = r.user_id) then
    return old;
  end if;
  if tg_op = 'INSERT' then
    perform app.audit('user.department_added', 'profile', r.user_id::text,
      jsonb_build_object('department', dept, 'is_lead', r.is_lead));
  elsif tg_op = 'DELETE' then
    perform app.audit('user.department_removed', 'profile', r.user_id::text,
      jsonb_build_object('department', dept, 'was_lead', r.is_lead));
  elsif new.is_lead is distinct from old.is_lead then
    perform app.audit('user.department_lead_changed', 'profile', r.user_id::text,
      jsonb_build_object('department', dept, 'is_lead', new.is_lead));
  end if;
  return r;
end $$;

create trigger department_members_audit
  after insert or update or delete on public.department_members
  for each row execute function app.department_members_audit();

create function app.app_settings_audit() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := app.uid();
  perform app.audit('settings.changed', 'app_setting', new.key,
    jsonb_build_object('from', case when tg_op = 'UPDATE' then old.value end, 'to', new.value));
  return new;
end $$;

create trigger app_settings_audit
  before insert or update on public.app_settings
  for each row execute function app.app_settings_audit();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.department_members enable row level security;
alter table public.app_settings enable row level security;
alter table public.audit_log enable row level security;

-- Directory data (names, departments) is readable by every active employee.
create policy departments_select on public.departments for select to authenticated
  using ((select app.uid()) is not null);
create policy departments_admin_insert on public.departments for insert to authenticated
  with check ((select app.is_admin()));
create policy departments_admin_update on public.departments for update to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

create policy profiles_select on public.profiles for select to authenticated
  using ((select app.uid()) is not null);
create policy profiles_admin_update on public.profiles for update to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

create policy department_members_select on public.department_members for select to authenticated
  using ((select app.uid()) is not null);
create policy department_members_admin_insert on public.department_members for insert to authenticated
  with check ((select app.is_admin()));
create policy department_members_admin_update on public.department_members for update to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));
create policy department_members_admin_delete on public.department_members for delete to authenticated
  using ((select app.is_admin()));

create policy app_settings_select on public.app_settings for select to authenticated
  using ((select app.uid()) is not null);
create policy app_settings_admin_insert on public.app_settings for insert to authenticated
  with check ((select app.is_admin()));
create policy app_settings_admin_update on public.app_settings for update to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

-- The audit history is written only by triggers and definer functions.
create policy audit_log_admin_select on public.audit_log for select to authenticated
  using ((select app.is_admin()));

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on public.departments, public.profiles, public.department_members,
  public.app_settings, public.audit_log from anon, authenticated;

grant select, insert on public.departments to authenticated;
grant update (name, is_active) on public.departments to authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, role, freight_access, is_active) on public.profiles to authenticated;
grant select, insert, delete on public.department_members to authenticated;
grant update (is_lead) on public.department_members to authenticated;
grant select, insert on public.app_settings to authenticated;
grant update (value) on public.app_settings to authenticated;
grant select on public.audit_log to authenticated;

grant all on public.departments, public.profiles, public.department_members,
  public.app_settings, public.audit_log to service_role;

revoke execute on all functions in schema app from public;
grant execute on all functions in schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Reference data and defaults
-- ---------------------------------------------------------------------------
insert into public.departments (name) values
  ('Sales'), ('Purchasing'), ('Logistics'), ('Warehouse'), ('Administration');

-- Notification defaults (editable on the admin screen).
-- Freight defaults deliberately contain no rates: Frasa supplies them.
insert into public.app_settings (key, value) values
  ('notification_defaults', '{"remind_days_before": 1, "escalate_overdue": true}'::jsonb),
  ('freight_defaults', '{"usd_to_awg_rate": null, "charge_templates": []}'::jsonb);
