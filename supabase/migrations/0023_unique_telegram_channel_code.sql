-- Enforce uniqueness on content_collections.telegram_channel_code (2026-08-28).
--
-- This column is set by hand by an admin (see 0011_telegram_bridge_prep.sql)
-- and read by several bot-facing routes (sync-collection-price,
-- provision-fan/provisionOrGrantFan, mirror-channel-post, check-fan-access,
-- expire-fan-collection) that look up a collection by this code alone, with
-- no creator_id scoping — they rely entirely on the code staying unique
-- across every creator. Nothing enforced that until now: two creators
-- (Chivis and Lore) independently named a set "Toy" and both ended up with
-- telegram_channel_code = 'toy', which made every one of those lookups
-- ambiguous and silently broke delivery for both. Fixed by hand for that one
-- pair (Lore's renamed to 'lore_toy'); this migration makes the same
-- collision impossible to create again, failing loudly at write time instead
-- of silently at delivery time weeks later.
--
-- No application code path currently writes this column (grep confirmed —
-- it's admin-set only), so this cannot break any existing request. Current
-- data has zero duplicates (verified before writing this migration), so it
-- applies cleanly with no cleanup needed. Multiple NULLs remain allowed
-- (collections with no Telegram bridge at all), matching how the column is
-- used everywhere else.

create unique index if not exists content_collections_telegram_channel_code_key
  on public.content_collections (telegram_channel_code)
  where telegram_channel_code is not null;
