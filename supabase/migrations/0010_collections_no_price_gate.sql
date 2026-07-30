-- Collections are no longer sold: access is a private grant admin/creator
-- assigns directly (collection_access_grants), with no separate "unlock"
-- purchase step and no price to configure. price_cents stays on the table
-- (collection_purchases.amount_cents still references it historically) but
-- is no longer required at creation time.
alter table public.content_collections alter column price_cents drop not null;
