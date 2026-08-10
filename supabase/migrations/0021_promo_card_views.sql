-- View count for promo_cards, separate from the click-through count (which
-- lives on the linked bot's side via source='onyx_referral' — Onyx has no
-- visibility into whether the fan actually followed the link out to
-- Telegram, only whether the card was shown).
alter table public.promo_cards add column views integer not null default 0;

-- Atomic increment (not a read-then-write from the app) so concurrent
-- page loads never lose a count.
create or replace function public.increment_promo_card_views(p_card_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.promo_cards set views = views + 1 where id = p_card_id;
$$;
