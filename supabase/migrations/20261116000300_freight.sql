-- Frasa HQ · Phase 1 · Freight estimates
-- Estimates contain supplier costs, so access is granted per user
-- (profiles.freight_access) independently of role. Each save appends an immutable
-- version holding the exact inputs, exchange rate, allocation methods and results.

create table public.freight_estimates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  reference text not null default '',
  current_version_no integer not null default 0,
  is_complete boolean not null default false,
  reporting_currency text check (reporting_currency in ('USD', 'AWG')),
  grand_total numeric(16, 2),
  is_demo boolean not null default false,
  archived_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.freight_estimate_versions (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.freight_estimates (id) on delete cascade,
  version_no integer not null check (version_no > 0),
  inputs jsonb not null,
  results jsonb not null,
  is_complete boolean not null,
  engine_version text not null,
  note text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (estimate_id, version_no)
);

-- Saves a new estimate (p_estimate_id null) or appends a version to an existing one.
-- Runs with the caller's rights, so the RLS policies below decide who may save.
create function public.freight_save_version(
  p_estimate_id uuid,
  p_name text,
  p_reference text,
  p_inputs jsonb,
  p_results jsonb,
  p_is_complete boolean,
  p_reporting_currency text,
  p_grand_total numeric,
  p_engine_version text,
  p_note text,
  p_duplicated_from uuid default null
) returns table (estimate_id uuid, version_no integer)
language plpgsql security invoker
set search_path = ''
as $$
declare
  v_id uuid := p_estimate_id;
  v_no integer;
begin
  if not app.can_edit_freight() then
    raise exception 'You do not have access to save freight estimates.' using errcode = '42501';
  end if;
  if v_id is null then
    insert into public.freight_estimates (name, reference, created_by, updated_by)
    values (p_name, coalesce(p_reference, ''), app.uid(), app.uid())
    returning id into v_id;
    v_no := 1;
    if p_duplicated_from is not null then
      perform app.audit('freight_estimate.duplicated', 'freight_estimate', v_id::text,
        jsonb_build_object('name', p_name, 'duplicated_from', p_duplicated_from));
    end if;
  else
    select e.current_version_no + 1 into v_no
    from public.freight_estimates e where e.id = v_id for update;
    if v_no is null then
      raise exception 'Freight estimate not found.' using errcode = 'P0002';
    end if;
  end if;

  insert into public.freight_estimate_versions
    (estimate_id, version_no, inputs, results, is_complete, engine_version, note, created_by)
  values (v_id, v_no, p_inputs, p_results, p_is_complete, p_engine_version, coalesce(p_note, ''), app.uid());

  update public.freight_estimates e
  set name = p_name, reference = coalesce(p_reference, ''), current_version_no = v_no,
      is_complete = p_is_complete, reporting_currency = p_reporting_currency,
      grand_total = p_grand_total, updated_by = app.uid(), updated_at = now()
  where e.id = v_id;

  return query select v_id, v_no;
end $$;

-- Audit: every saved version, and archive / restore.
create function app.freight_versions_audit() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform app.audit(
    case when new.version_no = 1 then 'freight_estimate.created' else 'freight_estimate.edited' end,
    'freight_estimate', new.estimate_id::text,
    jsonb_build_object('version_no', new.version_no, 'is_complete', new.is_complete,
      'name', new.inputs ->> 'name', 'note', new.note));
  return new;
end $$;
create trigger freight_versions_audit after insert on public.freight_estimate_versions
  for each row execute function app.freight_versions_audit();

create function app.freight_estimates_audit() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.archived_at is distinct from old.archived_at then
    perform app.audit(
      case when new.archived_at is null then 'freight_estimate.restored' else 'freight_estimate.archived' end,
      'freight_estimate', new.id::text, jsonb_build_object('name', new.name));
  end if;
  return new;
end $$;
create trigger freight_estimates_audit after update on public.freight_estimates
  for each row execute function app.freight_estimates_audit();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.freight_estimates enable row level security;
alter table public.freight_estimate_versions enable row level security;

create policy freight_estimates_select on public.freight_estimates for select to authenticated
  using ((select app.can_view_freight()));
create policy freight_estimates_insert on public.freight_estimates for insert to authenticated
  with check ((select app.can_edit_freight()) and created_by = (select app.uid()));
create policy freight_estimates_update on public.freight_estimates for update to authenticated
  using ((select app.can_edit_freight())) with check ((select app.can_edit_freight()));

-- Versions are append-only: there is no update or delete policy or privilege.
create policy freight_versions_select on public.freight_estimate_versions for select to authenticated
  using ((select app.can_view_freight()));
create policy freight_versions_insert on public.freight_estimate_versions for insert to authenticated
  with check ((select app.can_edit_freight()) and created_by = (select app.uid()));

revoke all on public.freight_estimates, public.freight_estimate_versions from anon, authenticated;
grant select, insert on public.freight_estimates to authenticated;
grant update (name, reference, current_version_no, is_complete, reporting_currency, grand_total,
  archived_at, updated_by, updated_at) on public.freight_estimates to authenticated;
grant select, insert on public.freight_estimate_versions to authenticated;
grant all on public.freight_estimates, public.freight_estimate_versions to service_role;

revoke execute on function public.freight_save_version(uuid, text, text, jsonb, jsonb, boolean, text, numeric, text, text, uuid) from public, anon;
grant execute on function public.freight_save_version(uuid, text, text, jsonb, jsonb, boolean, text, numeric, text, text, uuid) to authenticated;

revoke execute on all functions in schema app from public;
grant execute on all functions in schema app to authenticated, service_role;
