-- Row-Level Security for every table from 0001_init.sql.
-- Shared three-way pattern on content-adjacent tables: owner-write,
-- subscriber-read-if-active-sub, admin-bypass. Security/ban/rate-limit tables
-- are admin-read-only and service-role-insert-only (never writable by a
-- client session), so a compromised fan session can't forge its own unban.

-- Helper: is the current JWT subject an admin?
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = auth.uid() and r.role = 'admin'
  );
$$;

-- Helper: does the current user hold an active subscription to a creator?
create or replace function public.has_active_subscription(p_creator_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.subscriptions s
    where s.creator_id = p_creator_id
      and s.fan_id = auth.uid()
      and s.status = 'active'
      and s.ends_at > now()
  );
$$;

-- ============================================================================
-- profiles / user_roles
-- ============================================================================

alter table public.profiles enable row level security;
create policy profiles_self_select on public.profiles for select using (id = auth.uid());
create policy profiles_self_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin_all on public.profiles for all using (public.is_admin());

alter table public.user_roles enable row level security;
create policy user_roles_self_select on public.user_roles for select using (user_id = auth.uid());
create policy user_roles_admin_all on public.user_roles for all using (public.is_admin());

-- ============================================================================
-- creators / fans
-- ============================================================================

alter table public.creators enable row level security;
create policy creators_public_select on public.creators for select using (active = true);
create policy creators_self_all on public.creators for all using (id = auth.uid()) with check (id = auth.uid());
create policy creators_admin_all on public.creators for all using (public.is_admin());

alter table public.fans enable row level security;
create policy fans_self_all on public.fans for all using (id = auth.uid()) with check (id = auth.uid());
create policy fans_admin_all on public.fans for all using (public.is_admin());

-- ============================================================================
-- consent_records / consent_history — creator + admin only, fans have no access
-- ============================================================================

alter table public.consent_records enable row level security;
create policy consent_records_creator_all on public.consent_records
  for all using (granted_by = auth.uid()) with check (granted_by = auth.uid());
create policy consent_records_admin_all on public.consent_records for all using (public.is_admin());

alter table public.consent_history enable row level security;
create policy consent_history_admin_all on public.consent_history for all using (public.is_admin());
create policy consent_history_creator_select on public.consent_history for select using (
  exists (
    select 1 from public.consent_records cr
    where cr.id = consent_history.consent_record_id and cr.granted_by = auth.uid()
  )
);

-- ============================================================================
-- content_items — owner-write / subscriber-read-if-active / admin-bypass
-- ============================================================================

alter table public.content_items enable row level security;
create policy content_items_creator_all on public.content_items
  for all using (creator_id = auth.uid()) with check (creator_id = auth.uid());
create policy content_items_fan_select on public.content_items
  for select using (public.has_active_subscription(creator_id));
create policy content_items_admin_all on public.content_items for all using (public.is_admin());

-- ============================================================================
-- subscriptions — fan sees own, creator sees own, admin sees all
-- ============================================================================

alter table public.subscriptions enable row level security;
create policy subscriptions_fan_select on public.subscriptions for select using (fan_id = auth.uid());
create policy subscriptions_creator_select on public.subscriptions for select using (creator_id = auth.uid());
create policy subscriptions_admin_all on public.subscriptions for all using (public.is_admin());
-- inserts/updates happen server-side via service-role client (checkout/fake-charge flow)

-- ============================================================================
-- payments / payouts — same shape
-- ============================================================================

alter table public.payments enable row level security;
create policy payments_fan_select on public.payments for select using (fan_id = auth.uid());
create policy payments_creator_select on public.payments for select using (creator_id = auth.uid());
create policy payments_admin_all on public.payments for all using (public.is_admin());

alter table public.payouts enable row level security;
create policy payouts_creator_select on public.payouts for select using (creator_id = auth.uid());
create policy payouts_admin_all on public.payouts for all using (public.is_admin());

-- ============================================================================
-- Security / ban / rate-limit tables — admin read-only, no direct client writes.
-- All inserts happen server-side through the service-role client, which
-- bypasses RLS entirely, so no insert policy is granted to anon/authenticated.
-- ============================================================================

alter table public.security_events enable row level security;
create policy security_events_admin_select on public.security_events for select using (public.is_admin());

alter table public.ip_bans enable row level security;
create policy ip_bans_admin_select on public.ip_bans for select using (public.is_admin());

alter table public.device_fingerprint_bans enable row level security;
create policy device_fingerprint_bans_admin_select on public.device_fingerprint_bans for select using (public.is_admin());

alter table public.ban_history enable row level security;
create policy ban_history_admin_select on public.ban_history for select using (public.is_admin());

alter table public.action_attempts enable row level security;
create policy action_attempts_admin_select on public.action_attempts for select using (public.is_admin());

-- ============================================================================
-- Storage: content-raw bucket is private; access only via the signed API
-- route using the service-role client, never direct Storage RLS for fans.
-- ============================================================================

create policy content_raw_creator_manage on storage.objects
  for all using (
    bucket_id = 'content-raw'
    and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'content-raw'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy content_raw_admin_all on storage.objects
  for all using (bucket_id = 'content-raw' and public.is_admin());
