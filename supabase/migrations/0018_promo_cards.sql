-- Cross-promotion cards ("Explora más") shown to fans in the app, each
-- linking out to another creator's Telegram bot. Deliberately separate from
-- content_collections — this is outbound marketing material, not gated fan
-- content, so it gets its own public bucket instead of the private
-- content-raw one: no watermarking, no signed tokens, no rate limiting,
-- none of that machinery applies to a promo photo meant to be shown freely.
insert into storage.buckets (id, name, public)
values ('promo-assets', 'promo-assets', true)
on conflict (id) do nothing;

create table public.promo_cards (
  id uuid primary key default gen_random_uuid(),
  photo_path text not null,
  title text not null,
  description text,
  link_url text not null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Fans never query this table directly — the fan-facing page reads through
-- the service-role client, same pattern as /feed's collection queries — so
-- admin-only RLS is enough (defense in depth, not the actual gate).
alter table public.promo_cards enable row level security;
create policy promo_cards_admin_all on public.promo_cards for all using (public.is_admin());
