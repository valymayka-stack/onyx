-- Reversible content moderation for the admin panel — "hide" not "delete",
-- per the operator's choice: mistakes stay recoverable, and the file/row
-- both remain intact for any later dispute, audit, or DMCA reference.

alter table public.content_items
  add column is_hidden boolean not null default false,
  add column hidden_at timestamptz,
  add column hidden_by uuid references auth.users(id);
