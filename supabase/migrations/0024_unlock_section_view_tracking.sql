-- View tracking for the in-app cross-creator unlock section
-- ("Otras creadoras" / "Desbloquea más" on /feed/colecciones) — added
-- 2026-08-31 after finding real conversions there are still zero (0 real
-- Clip subscription payments, 0 real collection purchases — the only
-- collection_purchases row is a simulated test transaction) and no way to
-- tell whether fans are even seeing the section and not converting, or
-- never seeing it at all.
--
-- Mirrors 0021_promo_card_views.sql's own established pattern exactly
-- (a plain integer counter incremented atomically via a SECURITY DEFINER
-- function) rather than a new event-log table — same lightweight shape
-- already proven safe in this codebase, nothing new to reason about.

alter table public.creators add column if not exists unlock_section_views integer not null default 0;
alter table public.content_collections add column if not exists unlock_section_views integer not null default 0;

create or replace function public.increment_creator_unlock_view(p_creator_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.creators set unlock_section_views = unlock_section_views + 1 where id = p_creator_id;
$$;

create or replace function public.increment_collection_unlock_view(p_collection_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.content_collections set unlock_section_views = unlock_section_views + 1 where id = p_collection_id;
$$;
