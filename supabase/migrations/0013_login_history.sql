-- Fan-only login audit trail (2026-08): IP/device per sign-in is only useful
-- (and only wanted) for fans — admin and creators manage the platform from
-- known devices and don't need this retained. Gated in middleware.ts on
-- roles.includes("fan"), not enforced here beyond the insert policy below.
create table public.login_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  ip inet,
  user_agent text,
  device_type text,
  created_at timestamptz not null default now()
);

create index login_history_user_id_created_at_idx
  on public.login_history (user_id, created_at desc);

-- Cheap marker so middleware can tell "already recorded this sign-in" from
-- "just another page load in the same session" without querying
-- login_history on every request.
alter table public.profiles add column if not exists last_login_at timestamptz;

alter table public.login_history enable row level security;

-- Written by middleware using the session-scoped client (not service-role),
-- so a user can only ever insert a row for themselves.
create policy login_history_self_insert on public.login_history
  for insert with check (user_id = auth.uid());

create policy login_history_admin_select on public.login_history
  for select using (public.is_admin());
