-- Leak monitoring + DMCA takedown drafting.
--
-- Deliberately decoupled from creators/auth.users: this protects a real
-- person's content regardless of whether she has (or ever has) a platform
-- account, so the subject is identified by name/label (subject_name), with
-- an optional link to a creators row if one exists.
--
-- Detection is automated; SENDING a takedown is not — a wrong or bad-faith
-- DMCA notice carries real liability for the signer (17 U.S.C. § 512(f)),
-- so every notice requires a human to confirm the finding and explicitly
-- mark it sent. See lib/leakwatch/scan.ts and dmca_notices.status below.

create table public.leak_watch_targets (
  id uuid primary key default gen_random_uuid(),
  subject_name text not null,
  creator_id uuid references public.creators(id),
  url text not null,
  site_label text not null,
  -- Regex used to pull "item" sub-links out of this page's HTML (site
  -- structures differ — e.g. packsde.pro lists sets as /silvia-montalvo/<slug>/).
  link_pattern text not null,
  active boolean not null default true,
  -- Set when a fetch comes back blocked (e.g. a Cloudflare JS challenge) so
  -- the scanner stops retrying blindly and the site shows up for manual
  -- checking instead of silently never finding anything.
  blocked_reason text,
  last_checked_at timestamptz,
  created_at timestamptz not null default now()
);
create index leak_watch_targets_active_idx on public.leak_watch_targets(active);

create table public.leak_watch_snapshots (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references public.leak_watch_targets(id) on delete cascade,
  item_urls jsonb not null,
  checked_at timestamptz not null default now()
);
create index leak_watch_snapshots_target_idx on public.leak_watch_snapshots(target_id, checked_at desc);

create table public.leak_findings (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references public.leak_watch_targets(id) on delete cascade,
  subject_name text not null,
  item_url text not null,
  status text not null default 'pending_review'
    check (status in ('pending_review', 'confirmed', 'dismissed', 'notice_sent')),
  first_seen_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  unique (target_id, item_url)
);
create index leak_findings_status_idx on public.leak_findings(status, first_seen_at desc);

create table public.creator_legal_contacts (
  subject_name text primary key,
  agent_name text not null,
  agent_email text not null,
  agent_address text,
  updated_at timestamptz not null default now()
);

create table public.dmca_notices (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null references public.leak_findings(id) on delete cascade,
  subject_name text not null,
  -- Proof of standing to act as agent, once formalized — reuses the
  -- existing Ley Olimpia consent_records table with scope
  -- 'dmca-agency-authorization' rather than a parallel authorization table.
  consent_record_id uuid references public.consent_records(id),
  recipient_hint text,
  notice_text text not null,
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'resolved')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  sent_by uuid references auth.users(id)
);
create index dmca_notices_status_idx on public.dmca_notices(status, created_at desc);

-- ============================================================================
-- RLS — admin-only across the board. This is operational/legal tooling, not
-- something a fan or even the creator herself needs direct access to.
-- ============================================================================

alter table public.leak_watch_targets enable row level security;
create policy leak_watch_targets_admin_all on public.leak_watch_targets for all using (public.is_admin());

alter table public.leak_watch_snapshots enable row level security;
create policy leak_watch_snapshots_admin_all on public.leak_watch_snapshots for all using (public.is_admin());

alter table public.leak_findings enable row level security;
create policy leak_findings_admin_all on public.leak_findings for all using (public.is_admin());

alter table public.creator_legal_contacts enable row level security;
create policy creator_legal_contacts_admin_all on public.creator_legal_contacts for all using (public.is_admin());

alter table public.dmca_notices enable row level security;
create policy dmca_notices_admin_all on public.dmca_notices for all using (public.is_admin());
