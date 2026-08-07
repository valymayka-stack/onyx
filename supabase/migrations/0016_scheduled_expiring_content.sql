-- Scheduled publishing + caption for daily-post-style collections, and
-- expiring access for collections whose grant should lapse (unlike the
-- default permanent grant). All nullable — existing rows/collections are
-- unaffected: null publish_at means "visible now" (today's behavior), null
-- expires_at means "permanent" (today's behavior).
alter table public.content_items add column caption text;
alter table public.content_items add column publish_at timestamptz;
alter table public.collection_access_grants add column expires_at timestamptz;
