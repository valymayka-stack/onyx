-- Ties a promo_cards row to the real creator it advertises, so the
-- in-app cross-creator unlock section (Colecciones — "Otras creadoras")
-- can offer the exact same Telegram link Explora más already uses for that
-- creator, as a fallback next to the card-payment "Desbloquear" button.
-- Nullable/backfilled per-row on purpose — most creators piloting this
-- (or any future promo card for a creator with no Onyx unlock pilot yet)
-- simply won't have one set, and the fallback link just doesn't render.
alter table public.promo_cards add column if not exists creator_id uuid references public.creators(id);
