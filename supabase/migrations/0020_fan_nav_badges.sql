-- Stopgap "new content" indicator (a small dot in the drawer nav) ahead of
-- real push notifications — lets a fan tell there's something new in Grupo
-- or Colecciones without opening either. Null means "never visited that
-- section," which correctly shows the dot for a brand-new grant/post too.
alter table public.profiles add column grupo_last_seen_at timestamptz;
alter table public.profiles add column collections_last_seen_at timestamptz;
