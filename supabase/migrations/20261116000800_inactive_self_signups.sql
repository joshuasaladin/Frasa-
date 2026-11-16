-- Frasa HQ · Phase 1 · Defence in depth for invite-only accounts
-- Public sign-up must be switched off in the Supabase auth settings. In case it
-- is ever left on, an account that someone creates for themselves gets an
-- INACTIVE profile, which can read nothing until an admin activates it.
-- Accounts created by an invitation or by an admin are recognised by
-- invited_at / an already confirmed email at the moment of creation.

create or replace function app.handle_new_user() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, is_active)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.invited_at is not null or new.email_confirmed_at is not null
  )
  on conflict (id) do nothing;
  return new;
end $$;

revoke execute on function app.handle_new_user() from public;
grant execute on function app.handle_new_user() to authenticated, service_role;
