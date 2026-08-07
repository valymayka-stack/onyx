-- Grupo-as-feed (Exclusive Chivis): lets a collection render as a stacked,
-- infinite-scroll feed instead of the classic carousel, with multi-file
-- posts and text-only posts. All additive/nullable-or-defaulted — existing
-- collections keep rendering exactly as before.

-- Marks which collections use the feed renderer instead of the carousel.
alter table public.content_collections add column is_feed boolean not null default false;

-- Groups files uploaded together into one feed "post" (today each file is
-- its own row; without this, a 3-photo post with one caption would show as
-- 3 separate cards). Defaults to a fresh id per row, so classic collections
-- (which never read this column) are unaffected.
alter table public.content_items add column post_group_id uuid not null default gen_random_uuid();

-- Text-only posts: storage_path/content_type were both mandatory before.
alter table public.content_items alter column storage_path drop not null;
alter table public.content_items drop constraint content_items_content_type_check;
alter table public.content_items add constraint content_items_content_type_check
  check (content_type in ('image', 'video', 'text'));
alter table public.content_items add constraint content_items_text_has_no_file
  check (
    (content_type = 'text' and storage_path is null)
    or (content_type in ('image', 'video') and storage_path is not null)
  );
