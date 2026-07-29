-- Private paid collections ("sets"): a second monetization unit alongside
-- creator-wide subscriptions. Two independent gates, unlike the subscription
-- model which only has one:
--   1. Allowlist (collection_access_grants) — can this fan even see the
--      collection exists? Nothing to do with payment.
--   2. Purchase (collection_purchases) — of those who can see it, have they
--      unlocked the non-cover photos? Mirrors payments/subscriptions shape.

create table public.content_collections (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators(id) on delete cascade,
  title text not null,
  description text,
  cover_item_id uuid references public.content_items(id) on delete set null,
  price_cents int not null,
  is_hidden boolean not null default false,
  hidden_at timestamptz,
  hidden_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index content_collections_creator_idx on public.content_collections(creator_id);

alter table public.content_items
  add column collection_id uuid references public.content_collections(id) on delete cascade,
  add column is_cover boolean not null default false;
create index content_items_collection_idx on public.content_items(collection_id);

create table public.collection_access_grants (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.content_collections(id) on delete cascade,
  fan_id uuid not null references public.fans(id) on delete cascade,
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (collection_id, fan_id)
);
create index collection_access_grants_collection_idx on public.collection_access_grants(collection_id);
create index collection_access_grants_fan_idx on public.collection_access_grants(fan_id);

create table public.collection_purchases (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.content_collections(id) on delete cascade,
  fan_id uuid not null references public.fans(id) on delete cascade,
  creator_id uuid not null references public.creators(id) on delete cascade,
  amount_cents int not null,
  processor text not null default 'fake',
  processor_reference text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index collection_purchases_collection_idx on public.collection_purchases(collection_id);
create index collection_purchases_fan_idx on public.collection_purchases(fan_id);

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.content_collections enable row level security;
create policy content_collections_creator_all on public.content_collections
  for all using (creator_id = auth.uid()) with check (creator_id = auth.uid());
create policy content_collections_admin_all on public.content_collections for all using (public.is_admin());
-- No fan select policy: a collection's existence is only ever surfaced to
-- fans via the service-role client after an explicit allowlist check in app
-- code (mirrors how content_items metadata already reaches fans today), so
-- RLS defaulting to deny-all-for-fans here is intentional, not an oversight.

-- content_items' fan-read policy was subscription-only (0002_rls.sql); that's
-- now wrong for collection photos, which must additionally require an
-- allowlist grant regardless of the fan's subscription status to the creator.
drop policy content_items_fan_select on public.content_items;
create policy content_items_fan_select on public.content_items
  for select using (
    (collection_id is null and public.has_active_subscription(creator_id))
    or (
      collection_id is not null
      and exists (
        select 1 from public.collection_access_grants g
        where g.collection_id = content_items.collection_id and g.fan_id = auth.uid()
      )
    )
  );

alter table public.collection_access_grants enable row level security;
create policy collection_access_grants_creator_all on public.collection_access_grants
  for all using (
    exists (
      select 1 from public.content_collections c
      where c.id = collection_access_grants.collection_id and c.creator_id = auth.uid()
    )
  );
create policy collection_access_grants_admin_all on public.collection_access_grants for all using (public.is_admin());
-- No fan select: a fan learning the full guest list of who else can see a
-- collection isn't needed for any feature and isn't information they should
-- have.

alter table public.collection_purchases enable row level security;
create policy collection_purchases_fan_select on public.collection_purchases for select using (fan_id = auth.uid());
create policy collection_purchases_creator_select on public.collection_purchases for select using (creator_id = auth.uid());
create policy collection_purchases_admin_all on public.collection_purchases for all using (public.is_admin());
-- inserts/updates happen server-side via service-role client (purchase route), same as payments
