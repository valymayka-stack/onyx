-- Prep columns for the Onyx <-> Telegram bot bridge (design finalized in
-- conversation 2026-08-02). Neither column is read or acted on by any code
-- path yet — the bot side of the bridge isn't built.
--   - profiles.device_type is written by middleware.ts on every fan page
--     view. Informational only, for the bot's own dashboard to show later;
--     nothing in this codebase branches on it.
--   - content_collections.telegram_channel_code is set by hand by an admin
--     so a later trigger (not built yet) knows which bot channel_key a
--     collection corresponds to. Must match access_channels.channel_key in
--     the bot's own Supabase project exactly, case-sensitive.

alter table public.profiles add column if not exists device_type text;
alter table public.content_collections add column if not exists telegram_channel_code text;
