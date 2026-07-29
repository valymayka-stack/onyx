-- Security fix (H1 from a full audit): several self-write RLS policies had
-- no column restriction, so a user could update rows they legitimately own
-- to flip a field only an admin should control:
--   - profiles_self_update let a user clear their own banned_at — a banned
--     account could sign back in and un-ban itself directly against the
--     anon endpoint, defeating the entire honeypot/ban-cascade mechanism.
--   - content_items_creator_all / content_collections_creator_all let a
--     creator reverse an admin's is_hidden moderation on their own content.
--   - creators_self_all granted full self-write access (active,
--     monthly_price_cents) that no current feature actually needs — a
--     creator could reactivate a deactivated account.
--
-- Fix pattern: keep ownership-scoped access, but for UPDATE add a WITH CHECK
-- that requires the protected column be unchanged from its currently-stored
-- value (a self-referencing subquery reads the pre-update row, since the
-- update hasn't committed yet). Only the service-role client (used by every
-- admin route/ban cascade already in this codebase) can still change these
-- columns, because it bypasses RLS entirely.

-- ============================================================================
-- profiles — banned_at is now admin-only to change
-- ============================================================================

drop policy profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update using (id = auth.uid())
  with check (
    id = auth.uid()
    and banned_at is not distinct from (select p.banned_at from public.profiles p where p.id = profiles.id)
  );

-- ============================================================================
-- creators — no current feature updates this table from a creator's own
-- session (confirmed: only service-role/seed scripts insert or update it),
-- so self-access is narrowed to read-only rather than trying to carve out
-- exceptions for columns nothing uses yet.
-- ============================================================================

drop policy creators_self_all on public.creators;
create policy creators_self_select on public.creators for select using (id = auth.uid());

-- ============================================================================
-- content_items — is_hidden/hidden_at/hidden_by are admin-moderation-only
-- ============================================================================

drop policy content_items_creator_all on public.content_items;
create policy content_items_creator_select on public.content_items
  for select using (creator_id = auth.uid());
create policy content_items_creator_insert on public.content_items
  for insert with check (creator_id = auth.uid());
create policy content_items_creator_update on public.content_items
  for update using (creator_id = auth.uid())
  with check (
    creator_id = auth.uid()
    and is_hidden is not distinct from (select ci.is_hidden from public.content_items ci where ci.id = content_items.id)
  );
create policy content_items_creator_delete on public.content_items
  for delete using (creator_id = auth.uid());

-- ============================================================================
-- content_collections — same is_hidden protection
-- ============================================================================

drop policy content_collections_creator_all on public.content_collections;
create policy content_collections_creator_select on public.content_collections
  for select using (creator_id = auth.uid());
create policy content_collections_creator_insert on public.content_collections
  for insert with check (creator_id = auth.uid());
create policy content_collections_creator_update on public.content_collections
  for update using (creator_id = auth.uid())
  with check (
    creator_id = auth.uid()
    and is_hidden is not distinct from (select cc.is_hidden from public.content_collections cc where cc.id = content_collections.id)
  );
create policy content_collections_creator_delete on public.content_collections
  for delete using (creator_id = auth.uid());
