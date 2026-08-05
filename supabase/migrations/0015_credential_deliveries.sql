create table public.credential_deliveries (
  id uuid primary key default gen_random_uuid(),
  fan_id uuid references auth.users(id) on delete cascade,
  channel_code text,
  status text not null check (status in ('sent', 'blocked')),
  created_at timestamptz not null default now()
);

create index credential_deliveries_fan_id_created_at_idx
  on public.credential_deliveries (fan_id, created_at desc);

alter table public.credential_deliveries enable row level security;

create policy credential_deliveries_admin_select on public.credential_deliveries
  for select using (public.is_admin());
