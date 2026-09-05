-- Root-cause fix (2026-09-05) for the Telegram-bot-provisioning bridge's
-- ~72% failure rate: lib/admin/findFanByEmail.ts was doing a full,
-- unpaginated admin.auth.admin.listUsers() scan on every single bot
-- approval to find an existing fan by email, capped at perPage 1000 (so it
-- could even silently miss real users past that page). auth.users.email
-- already has a unique index in GoTrue's own schema — this function does a
-- direct indexed lookup instead, turning an O(users) scan into O(1)
-- regardless of how many fans Onyx ever has.
--
-- security definer + a locked-down search_path so this can only ever read
-- auth.users.id/email (nothing else), callable by service_role only (the
-- only role the admin client ever authenticates as).
create or replace function public.find_auth_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = auth, pg_temp
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;

revoke all on function public.find_auth_user_id_by_email(text) from public;
grant execute on function public.find_auth_user_id_by_email(text) to service_role;
