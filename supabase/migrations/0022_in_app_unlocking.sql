-- In-app unlocking (Grupo cross-creator + colecciones sueltas) via a
-- dedicated Onyx Clip account. Backfills real prices onto the already-built
-- but long-dormant content_collections.price_cents / collection_purchases
-- pair (see 0008_collections.sql / 0010_collections_no_price_gate.sql — the
-- self-serve purchase feature was fully schema'd, then deliberately disabled
-- in favor of manual-only grants, and never actually wired to a checkout
-- route) and adds a daily revenue snapshot table for the internal admin
-- report (no email, no Telegram — see conversation).

-- ============================================================================
-- Real prices for the confirmed pilot catalog (Chivis's 30 priced
-- collections + Lore's 5 priced sets), matched by telegram_channel_code,
-- which was already confirmed 1:1 against each bot's own catalog this
-- session. Overwrites the one stale test value (join_me, 1000 cents) left
-- over from before collection purchases were disabled.
-- ============================================================================

update public.content_collections set price_cents = 39900 where telegram_channel_code = 'hot_tub';
update public.content_collections set price_cents = 49900 where telegram_channel_code = 'dancing_queen';
update public.content_collections set price_cents = 59900 where telegram_channel_code = 'love_seat';
update public.content_collections set price_cents = 39900 where telegram_channel_code = 'wet';
update public.content_collections set price_cents = 29900 where telegram_channel_code = 'lovely';
update public.content_collections set price_cents = 39900 where telegram_channel_code = 'mirror';

update public.content_collections set price_cents = 75000 where telegram_channel_code = 'eva';
update public.content_collections set price_cents = 39900 where telegram_channel_code = 'nico_robin';
update public.content_collections set price_cents = 59900 where telegram_channel_code = 'black_pearl';
update public.content_collections set price_cents = 69900 where telegram_channel_code = 'blue_moon';
update public.content_collections set price_cents = 65000 where telegram_channel_code = 'mexico_en_la_piel';
update public.content_collections set price_cents = 75000 where telegram_channel_code = 'orange_flame';
update public.content_collections set price_cents = 79900 where telegram_channel_code = 'purple_bloom';
update public.content_collections set price_cents = 95000 where telegram_channel_code = 'red_cream';
update public.content_collections set price_cents = 75000 where telegram_channel_code = 'rosario_tijeras';
update public.content_collections set price_cents = 60000 where telegram_channel_code = 'special';
update public.content_collections set price_cents = 60000 where telegram_channel_code = 'winter_kiss';
update public.content_collections set price_cents = 125000 where telegram_channel_code = 'marissa_chivis';

update public.content_collections set price_cents = 85000 where telegram_channel_code = 'paraiso';
update public.content_collections set price_cents = 75000 where telegram_channel_code = 'cherry';
update public.content_collections set price_cents = 35000 where telegram_channel_code = 'hearts';
update public.content_collections set price_cents = 35000 where telegram_channel_code = 'noir_seduction';
update public.content_collections set price_cents = 85000 where telegram_channel_code = 'shower';
update public.content_collections set price_cents = 70000 where telegram_channel_code = 'hot_bath';
update public.content_collections set price_cents = 75000 where telegram_channel_code = 'kitty';
update public.content_collections set price_cents = 70000 where telegram_channel_code = 'sexy_clip';
update public.content_collections set price_cents = 30000 where telegram_channel_code = 'redish';
update public.content_collections set price_cents = 60000 where telegram_channel_code = 'vaquerita';
update public.content_collections set price_cents = 49900 where telegram_channel_code = 'juicy';
update public.content_collections set price_cents = 19900 where telegram_channel_code = 'join_me';

update public.content_collections set price_cents = 109900 where telegram_channel_code = 'musa';
update public.content_collections set price_cents = 89900 where telegram_channel_code = 'play_baby';
update public.content_collections set price_cents = 129900 where telegram_channel_code = 'play_with_me';
update public.content_collections set price_cents = 49900 where telegram_channel_code = 'warm_thoughts';
update public.content_collections set price_cents = 89900 where telegram_channel_code = 'juicy_lips';

-- Lore's Grupo VIP is a per-creator subscription price (creators.monthly_price_cents),
-- not a content_collections row — real $300 MXN, replacing the 999-cent placeholder
-- every creator was seeded with.
update public.creators set monthly_price_cents = 30000
  where handle = 'lore';

-- ============================================================================
-- Daily revenue snapshot (internal admin dashboard only — no email, no
-- Telegram notification of any kind, per the operator's explicit decision).
-- ============================================================================

create table public.daily_revenue_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null,
  creator_id uuid not null references public.creators(id) on delete cascade,
  kind text not null check (kind in ('grupo', 'coleccion')),
  gross_cents int not null default 0,
  commission_cents int not null default 0,
  net_cents int not null default 0,
  transaction_count int not null default 0,
  created_at timestamptz not null default now(),
  unique (snapshot_date, creator_id, kind)
);
create index daily_revenue_snapshots_date_idx on public.daily_revenue_snapshots(snapshot_date);

alter table public.daily_revenue_snapshots enable row level security;
create policy daily_revenue_snapshots_admin_all on public.daily_revenue_snapshots
  for all using (public.is_admin());
-- No creator/fan policy: this is an operator-only aggregate view, not
-- per-creator payout data surfaced to the creators themselves (out of scope
-- for this build — writes/reads both go through the service-role client).
