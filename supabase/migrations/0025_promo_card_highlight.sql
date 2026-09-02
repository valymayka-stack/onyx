-- Temporary "look at this" marker for a promo card in "Explora más" — a red
-- asterisk next to the title while highlight_until is today or a future
-- date, gone automatically after (no cron/cleanup needed, just a date
-- comparison at render time). Nullable, defaults to none for every existing
-- card.
alter table public.promo_cards add column if not exists highlight_until date;
