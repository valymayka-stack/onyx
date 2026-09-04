-- Manual SPEI-transfer payment path (2026-09-04) — an alternative to Clip
-- card checkout for the cross-creator unlock pilot. A fan uploads a receipt
-- photo, an admin reviews it in /admin/transfer-receipts and approves/
-- rejects; approval mirrors app/api/webhooks/clip-onyx/route.ts's
-- subscription-activation logic exactly (same started_at/ends_at math, same
-- collection_access_grants upsert), so a manually-approved transfer grants
-- access identically to a completed Clip payment.
create table if not exists public.manual_transfer_receipts (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id),
  fan_id uuid not null references public.profiles(id),
  creator_id uuid not null references public.creators(id),
  amount_cents integer not null,
  receipt_storage_path text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  rejection_reason text
);

create index if not exists manual_transfer_receipts_status_idx
  on public.manual_transfer_receipts (status);

create index if not exists manual_transfer_receipts_fan_creator_idx
  on public.manual_transfer_receipts (fan_id, creator_id);
