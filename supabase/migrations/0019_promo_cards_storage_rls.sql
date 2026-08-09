-- Missed in 0018: marking a bucket "public" only controls whether GET
-- requests need no auth — it does not bypass RLS on storage.objects for
-- writes. Without this, admin uploads to promo-assets were rejected outright
-- (same fix already in place for content-raw, see 0002_rls.sql).
create policy promo_assets_admin_all on storage.objects
  for all using (bucket_id = 'promo-assets' and public.is_admin());
