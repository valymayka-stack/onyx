-- Invisible (steganographic) forensic watermark — logs a short embedded
-- code per delivery so a suspected leaked image can be traced back to
-- exactly which account/session it was served to, even if the visible
-- tiled watermark (lib/watermark/tile.ts) was cropped out or damaged.

create table public.content_delivery_marks (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  item_id uuid not null references public.content_items(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  session_id text not null,
  ip inet,
  created_at timestamptz not null default now()
);
create index content_delivery_marks_item_idx on public.content_delivery_marks(item_id);
create index content_delivery_marks_user_idx on public.content_delivery_marks(user_id);

alter table public.content_delivery_marks enable row level security;
create policy content_delivery_marks_admin_all on public.content_delivery_marks
  for all using (public.is_admin());
