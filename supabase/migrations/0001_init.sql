-- Sandbox anti-piracy platform: core schema.
-- Mirrors two proven Taurina patterns: append-only audit log (admin_actions ->
-- security_events/ban_history) and attempts-table + windowed-count rate limiting
-- (subscription_attempts -> action_attempts).

create extension if not exists pgcrypto;

-- ============================================================================
-- Identity / roles
-- ============================================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  banned_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'creator', 'fan')),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);
create index user_roles_user_idx on public.user_roles(user_id);

-- ============================================================================
-- Creators and fans (distinct tables per role, mirrors Taurina's models/subscribers split)
-- ============================================================================

create table public.creators (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text unique not null,
  bio text,
  monthly_price_cents int not null default 999,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.fans (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Consent (Ley Olimpia readiness) — append-only history next to mutable row,
-- same shape as Taurina's price_history next to models.precio_mensual.
-- ============================================================================

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  subject_name text not null,
  subject_contact text,
  granted_by uuid not null references auth.users(id),
  scope text not null,
  consent_given_at timestamptz not null,
  consent_document_url text,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.consent_history (
  id uuid primary key default gen_random_uuid(),
  consent_record_id uuid not null references public.consent_records(id) on delete cascade,
  changed_field text not null,
  old_value text,
  new_value text,
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now()
);
create index consent_history_record_idx on public.consent_history(consent_record_id, changed_at desc);

-- ============================================================================
-- Content — files live only in a private Storage bucket, never public.
-- consent_record_id is NOT NULL: every upload is forced to reference a consent
-- record, even in the sandbox where the operator links everything to his own.
-- ============================================================================

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators(id) on delete cascade,
  storage_path text not null,
  content_type text not null check (content_type in ('image', 'video')),
  is_premium boolean not null default true,
  consent_record_id uuid not null references public.consent_records(id),
  created_at timestamptz not null default now()
);
create index content_items_creator_idx on public.content_items(creator_id);

-- ============================================================================
-- Subscriptions and payments (processor/reference/raw_payload let a real
-- processor swap in later with no migration).
-- ============================================================================

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  fan_id uuid not null references public.fans(id) on delete cascade,
  creator_id uuid not null references public.creators(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'expired', 'cancelled')),
  started_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index subscriptions_active_unique_idx
  on public.subscriptions(fan_id, creator_id)
  where status in ('pending', 'active');

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references public.subscriptions(id) on delete cascade,
  fan_id uuid not null references public.fans(id),
  creator_id uuid not null references public.creators(id),
  amount_cents int not null,
  processor text not null default 'fake',
  processor_reference text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index payments_subscription_idx on public.payments(subscription_id);
create index payments_status_idx on public.payments(status);

-- Mexico "plataformas tecnológicas" ISR/IVA withholding fields — computed as 0
-- during the sandbox phase, wired up here so payout logic doesn't need a
-- migration later when real withholding calculations are added.
create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators(id),
  period_start date not null,
  period_end date not null,
  gross_cents int not null default 0,
  isr_withheld_cents int not null default 0,
  iva_withheld_cents int not null default 0,
  net_cents int not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Security: events, bans, rate limiting
-- ============================================================================

create table public.security_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  user_id uuid references auth.users(id),
  ip inet,
  user_agent text,
  device_fingerprint text,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index security_events_type_idx on public.security_events(event_type, created_at desc);
create index security_events_user_idx on public.security_events(user_id, created_at desc);
create index security_events_fp_idx on public.security_events(device_fingerprint);

create table public.ip_bans (
  ip inet primary key,
  reason text not null,
  banned_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.device_fingerprint_bans (
  fingerprint text primary key,
  reason text not null,
  banned_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.ban_history (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('user', 'ip', 'fingerprint')),
  target_value text not null,
  action text not null check (action in ('banned', 'unbanned')),
  reason text,
  actor_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.action_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  ip inet,
  action_type text not null,
  created_at timestamptz not null default now()
);
create index action_attempts_lookup_idx on public.action_attempts(action_type, user_id, created_at desc);
create index action_attempts_ip_idx on public.action_attempts(action_type, ip, created_at desc);

-- ============================================================================
-- Private storage bucket for content — never public.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('content-raw', 'content-raw', false)
on conflict (id) do nothing;
