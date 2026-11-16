-- Frasa HQ · Phase 1 · SOP library
-- A SOP has metadata (department, category, tags, owner, review date) and a series
-- of versions. Employees read the published version; editors work on at most one
-- draft version at a time. Publishing is done only through public.sop_publish().

create type public.sop_status as enum ('draft', 'published', 'archived');
create type public.sop_version_status as enum ('draft', 'published', 'superseded');

create table public.sop_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);

create table public.sops (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  department_id uuid references public.departments (id) on delete restrict, -- null = company-wide
  category_id uuid references public.sop_categories (id) on delete set null,
  tags text[] not null default '{}',
  owner_id uuid references public.profiles (id) on delete set null,
  status public.sop_status not null default 'draft',
  current_version_id uuid,
  next_review_date date,
  is_sample boolean not null default false,
  search_text text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  archived_at timestamptz
);
create index sops_department_idx on public.sops (department_id);
create index sops_status_idx on public.sops (status);

create table public.sop_versions (
  id uuid primary key default gen_random_uuid(),
  sop_id uuid not null references public.sops (id) on delete cascade,
  version_no integer not null check (version_no > 0),
  status public.sop_version_status not null default 'draft',
  title text not null check (length(trim(title)) > 0),
  purpose text not null default '',
  steps jsonb not null default '[]'::jsonb,   -- [{ "title": text, "detail": text }]
  links jsonb not null default '[]'::jsonb,   -- [{ "label": text, "url": text }]
  change_summary text not null default '',
  requires_ack boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_by uuid references public.profiles (id) on delete set null,
  published_at timestamptz,
  unique (sop_id, version_no),
  check (jsonb_typeof(steps) = 'array'),
  check (jsonb_typeof(links) = 'array')
);
create unique index sop_versions_one_draft on public.sop_versions (sop_id) where status = 'draft';

alter table public.sops
  add constraint sops_current_version_fk
  foreign key (current_version_id) references public.sop_versions (id) on delete set null;

-- Attachment rows point at objects in the private `attachments` bucket. When a
-- revision is started the rows are copied, so several versions can share one object.
create table public.sop_attachments (
  id uuid primary key default gen_random_uuid(),
  sop_id uuid not null references public.sops (id) on delete cascade,
  sop_version_id uuid not null references public.sop_versions (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (sop_version_id, storage_path)
);
create index sop_attachments_path_idx on public.sop_attachments (storage_path);

create table public.sop_acknowledgments (
  sop_version_id uuid not null references public.sop_versions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  primary key (sop_version_id, user_id)
);

create trigger sops_touch before update on public.sops
  for each row execute function app.touch_updated_at();
create trigger sop_versions_touch before update on public.sop_versions
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Permission helpers
-- ---------------------------------------------------------------------------
-- Publishers: admins, and department leads for SOPs of a department they lead.
-- Company-wide SOPs (no department) are published by admins only.
create function app.can_publish_sop_in(p_department uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select app.is_admin() or (p_department is not null and app.leads_department(p_department))
$$;

-- Editors (may draft): publishers plus the SOP's named owner.
create function app.can_edit_sop(p_sop uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.sops s
    where s.id = p_sop
      and (app.can_publish_sop_in(s.department_id) or (s.owner_id is not null and s.owner_id = app.uid()))
  )
$$;

create function app.can_publish_sop(p_sop uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.sops s where s.id = p_sop and app.can_publish_sop_in(s.department_id)
  )
$$;

create function app.sop_is_published(p_sop uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$ select exists (select 1 from public.sops s where s.id = p_sop and s.status = 'published') $$;

-- Who is expected to acknowledge: active members of the SOP's department, or
-- every active employee for a company-wide SOP.
create function app.sop_audience(p_sop uuid) returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select p.id
  from public.sops s
  join public.profiles p on p.is_active
  where s.id = p_sop
    and (s.department_id is null or exists (
      select 1 from public.department_members m
      where m.user_id = p.id and m.department_id = s.department_id))
$$;

create function app.sop_build_search_text(p_sop uuid, p_version uuid) returns text
language sql stable security definer
set search_path = ''
as $$
  select lower(concat_ws(' ',
    v.title, v.purpose, array_to_string(s.tags, ' '),
    (select string_agg(concat_ws(' ', st ->> 'title', st ->> 'detail'), ' ')
       from jsonb_array_elements(v.steps) st)))
  from public.sops s join public.sop_versions v on v.id = p_version
  where s.id = p_sop
$$;

-- ---------------------------------------------------------------------------
-- Workflow functions (the only way SOP status and versions change state)
-- ---------------------------------------------------------------------------
create function public.sop_create(
  p_title text,
  p_department_id uuid,
  p_category_id uuid,
  p_owner_id uuid
) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_sop uuid;
begin
  if app.uid() is null or not app.can_publish_sop_in(p_department_id) then
    raise exception 'You are not allowed to create SOPs for this department.' using errcode = '42501';
  end if;
  insert into public.sops (title, department_id, category_id, owner_id, created_by)
  values (p_title, p_department_id, p_category_id, coalesce(p_owner_id, app.uid()), app.uid())
  returning id into v_sop;
  insert into public.sop_versions (sop_id, version_no, title, created_by)
  values (v_sop, 1, p_title, app.uid());
  return v_sop;
end $$;

-- Starts (or returns) the draft revision of a SOP, copied from the current version.
create function public.sop_start_revision(p_sop_id uuid) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_sop public.sops;
  v_draft uuid;
  v_next integer;
begin
  if app.uid() is null or not app.can_edit_sop(p_sop_id) then
    raise exception 'You are not allowed to edit this SOP.' using errcode = '42501';
  end if;
  select * into v_sop from public.sops where id = p_sop_id for update;
  select id into v_draft from public.sop_versions where sop_id = p_sop_id and status = 'draft';
  if v_draft is not null then
    return v_draft;
  end if;
  select coalesce(max(version_no), 0) + 1 into v_next from public.sop_versions where sop_id = p_sop_id;
  insert into public.sop_versions (sop_id, version_no, title, purpose, steps, links, created_by)
  select p_sop_id, v_next, c.title, c.purpose, c.steps, c.links, app.uid()
  from public.sop_versions c where c.id = v_sop.current_version_id
  returning id into v_draft;
  if v_draft is null then
    insert into public.sop_versions (sop_id, version_no, title, created_by)
    values (p_sop_id, v_next, v_sop.title, app.uid())
    returning id into v_draft;
  else
    insert into public.sop_attachments (sop_id, sop_version_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
    select a.sop_id, v_draft, a.storage_path, a.file_name, a.mime_type, a.size_bytes, a.uploaded_by
    from public.sop_attachments a where a.sop_version_id = v_sop.current_version_id;
  end if;
  return v_draft;
end $$;

create function public.sop_publish(
  p_version_id uuid,
  p_requires_ack boolean,
  p_change_summary text
) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_version public.sop_versions;
  v_sop public.sops;
begin
  select * into v_version from public.sop_versions where id = p_version_id;
  if v_version.id is null then
    raise exception 'SOP version not found.' using errcode = 'P0002';
  end if;
  select * into v_sop from public.sops where id = v_version.sop_id for update;
  if app.uid() is null or not app.can_publish_sop_in(v_sop.department_id) then
    raise exception 'You are not allowed to publish this SOP.' using errcode = '42501';
  end if;
  -- Re-read under the lock so a retried or double-clicked publish is a no-op.
  select * into v_version from public.sop_versions where id = p_version_id;
  if v_version.status <> 'draft' then
    return;
  end if;
  if v_sop.owner_id is null then
    raise exception 'Assign an owner before publishing.' using errcode = 'P0001';
  end if;
  if length(trim(v_version.purpose)) = 0 or jsonb_array_length(v_version.steps) = 0 then
    raise exception 'Add a purpose and at least one step before publishing.' using errcode = 'P0001';
  end if;
  if v_sop.next_review_date is null then
    raise exception 'Set a next review date before publishing.' using errcode = 'P0001';
  end if;

  update public.sop_versions set status = 'superseded'
  where sop_id = v_sop.id and status = 'published';

  update public.sop_versions
  set status = 'published', published_by = app.uid(), published_at = now(),
      requires_ack = coalesce(p_requires_ack, false),
      change_summary = coalesce(nullif(trim(p_change_summary), ''), change_summary)
  where id = p_version_id;

  update public.sops
  set status = 'published', current_version_id = p_version_id, title = v_version.title,
      published_at = now(), archived_at = null,
      search_text = app.sop_build_search_text(v_sop.id, p_version_id)
  where id = v_sop.id;

  perform app.audit('sop.published', 'sop', v_sop.id::text, jsonb_build_object(
    'title', v_version.title, 'version_no', v_version.version_no,
    'version_id', p_version_id, 'requires_ack', coalesce(p_requires_ack, false)));

  -- In-app notification for the SOP's audience (see the notifications module).
  perform app.notify_sop_published(v_sop.id, p_version_id);
end $$;

create function public.sop_set_archived(p_sop_id uuid, p_archived boolean) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_sop public.sops;
begin
  select * into v_sop from public.sops where id = p_sop_id for update;
  if v_sop.id is null or app.uid() is null or not app.can_publish_sop_in(v_sop.department_id) then
    raise exception 'You are not allowed to archive this SOP.' using errcode = '42501';
  end if;
  if p_archived and v_sop.status <> 'archived' then
    update public.sops set status = 'archived', archived_at = now() where id = p_sop_id;
    perform app.audit('sop.archived', 'sop', p_sop_id::text, jsonb_build_object('title', v_sop.title));
  elsif not p_archived and v_sop.status = 'archived' then
    update public.sops
    set status = case when current_version_id is null then 'draft' else 'published' end::public.sop_status,
        archived_at = null
    where id = p_sop_id;
    perform app.audit('sop.restored', 'sop', p_sop_id::text, jsonb_build_object('title', v_sop.title));
  end if;
end $$;

-- Keeps tag changes searchable and the working title in sync for unpublished SOPs.
create function app.sops_refresh_search() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.current_version_id is not null and new.tags is distinct from old.tags then
    new.search_text := app.sop_build_search_text(new.id, new.current_version_id);
  end if;
  return new;
end $$;
create trigger sops_refresh_search before update of tags on public.sops
  for each row execute function app.sops_refresh_search();

create function app.sop_versions_sync_title() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.status = 'draft' and new.title is distinct from old.title then
    update public.sops set title = new.title
    where id = new.sop_id and current_version_id is null;
  end if;
  return new;
end $$;
create trigger sop_versions_sync_title after update of title on public.sop_versions
  for each row execute function app.sop_versions_sync_title();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.sop_categories enable row level security;
alter table public.sops enable row level security;
alter table public.sop_versions enable row level security;
alter table public.sop_attachments enable row level security;
alter table public.sop_acknowledgments enable row level security;

create policy sop_categories_select on public.sop_categories for select to authenticated
  using ((select app.uid()) is not null);
create policy sop_categories_admin_insert on public.sop_categories for insert to authenticated
  with check ((select app.is_admin()));
create policy sop_categories_admin_update on public.sop_categories for update to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

-- Employees see published SOPs. Drafts and archived SOPs are visible to editors.
create policy sops_select on public.sops for select to authenticated
  using ((select app.uid()) is not null
    and (status = 'published'
      or app.can_publish_sop_in(department_id)
      or owner_id = (select app.uid())));
-- Metadata edits only (column privileges below); a lead cannot move a SOP into a
-- department they do not lead.
create policy sops_update on public.sops for update to authenticated
  using (app.can_publish_sop_in(department_id) or owner_id = (select app.uid()))
  with check (app.can_publish_sop_in(department_id) or owner_id = (select app.uid()));

-- Published and superseded versions of a published SOP are readable by everyone;
-- draft versions only by editors.
create policy sop_versions_select on public.sop_versions for select to authenticated
  using ((select app.uid()) is not null
    and ((status in ('published', 'superseded') and app.sop_is_published(sop_id))
      or app.can_edit_sop(sop_id)));
create policy sop_versions_update_draft on public.sop_versions for update to authenticated
  using (status = 'draft' and app.can_edit_sop(sop_id))
  with check (status = 'draft' and app.can_edit_sop(sop_id));
create policy sop_versions_delete_draft on public.sop_versions for delete to authenticated
  using (status = 'draft' and version_no > 1 and app.can_edit_sop(sop_id));

create function app.sop_version_status(p_version uuid) returns public.sop_version_status
language sql stable security definer
set search_path = ''
as $$ select v.status from public.sop_versions v where v.id = p_version $$;

create policy sop_attachments_select on public.sop_attachments for select to authenticated
  using ((select app.uid()) is not null
    and ((app.sop_version_status(sop_version_id) in ('published', 'superseded') and app.sop_is_published(sop_id))
      or app.can_edit_sop(sop_id)));
create policy sop_attachments_insert on public.sop_attachments for insert to authenticated
  with check (app.sop_version_status(sop_version_id) = 'draft' and app.can_edit_sop(sop_id)
    and uploaded_by = (select app.uid())
    and exists (select 1 from public.sop_versions v where v.id = sop_version_id and v.sop_id = sop_attachments.sop_id));
create policy sop_attachments_delete on public.sop_attachments for delete to authenticated
  using (app.sop_version_status(sop_version_id) = 'draft' and app.can_edit_sop(sop_id));

-- Employees acknowledge for themselves; leads, admins and the SOP owner see who has.
create policy sop_ack_select on public.sop_acknowledgments for select to authenticated
  using (user_id = (select app.uid())
    or exists (select 1 from public.sop_versions v
               where v.id = sop_version_id and app.can_edit_sop(v.sop_id)));
create policy sop_ack_insert on public.sop_acknowledgments for insert to authenticated
  with check (user_id = (select app.uid())
    and app.sop_version_status(sop_version_id) = 'published'
    and exists (select 1 from public.sop_versions v
                where v.id = sop_version_id and v.requires_ack and app.sop_is_published(v.sop_id)));

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on public.sop_categories, public.sops, public.sop_versions,
  public.sop_attachments, public.sop_acknowledgments from anon, authenticated;

grant select, insert on public.sop_categories to authenticated;
grant update (name) on public.sop_categories to authenticated;
grant select on public.sops to authenticated;
grant update (department_id, category_id, tags, owner_id, next_review_date, is_sample) on public.sops to authenticated;
grant select, delete on public.sop_versions to authenticated;
grant update (title, purpose, steps, links, change_summary) on public.sop_versions to authenticated;
grant select, insert, delete on public.sop_attachments to authenticated;
grant select, insert on public.sop_acknowledgments to authenticated;

grant all on public.sop_categories, public.sops, public.sop_versions,
  public.sop_attachments, public.sop_acknowledgments to service_role;

revoke execute on function public.sop_create(text, uuid, uuid, uuid) from public, anon;
revoke execute on function public.sop_start_revision(uuid) from public, anon;
revoke execute on function public.sop_publish(uuid, boolean, text) from public, anon;
revoke execute on function public.sop_set_archived(uuid, boolean) from public, anon;
grant execute on function public.sop_create(text, uuid, uuid, uuid) to authenticated;
grant execute on function public.sop_start_revision(uuid) to authenticated;
grant execute on function public.sop_publish(uuid, boolean, text) to authenticated;
grant execute on function public.sop_set_archived(uuid, boolean) to authenticated;

revoke execute on all functions in schema app from public;
grant execute on all functions in schema app to authenticated, service_role;

insert into public.sop_categories (name) values
  ('Supplier management'), ('Freight and costing'), ('Customer orders'),
  ('Warehouse operations'), ('Administration');
