-- Frasa HQ · Phase 1 · Private file storage
-- One private bucket. Object paths:
--   tasks/{task_id}/{random}/{file name}
--   sops/{sop_id}/{random}/{file name}
-- Files are only ever served through short-lived signed URLs created with the
-- signed-in user's session, so these policies decide who can download.

insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 26214400)   -- 25 MB
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create policy attachments_select on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and (
    ((storage.foldername(name))[1] = 'tasks'
      and app.can_view_task(app.try_uuid((storage.foldername(name))[2])))
    or ((storage.foldername(name))[1] = 'sops' and (
      -- uploaded but not yet linked: visible to SOP editors only
      app.can_edit_sop(app.try_uuid((storage.foldername(name))[2]))
      -- linked to a published or superseded version of a published SOP
      or exists (
        select 1 from public.sop_attachments a
        join public.sop_versions v on v.id = a.sop_version_id
        where a.storage_path = name
          and v.status in ('published', 'superseded')
          and app.sop_is_published(a.sop_id)
          and (select app.uid()) is not null)))
  ));

create policy attachments_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and (
    ((storage.foldername(name))[1] = 'tasks'
      and app.can_view_task(app.try_uuid((storage.foldername(name))[2])))
    or ((storage.foldername(name))[1] = 'sops'
      and app.can_edit_sop(app.try_uuid((storage.foldername(name))[2])))
  ));

create policy attachments_delete on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and (
    ((storage.foldername(name))[1] = 'tasks' and (
      owner_id = (select auth.uid())::text
      or app.can_edit_task(app.try_uuid((storage.foldername(name))[2]))))
    or ((storage.foldername(name))[1] = 'sops'
      and app.can_edit_sop(app.try_uuid((storage.foldername(name))[2])))
  ));
