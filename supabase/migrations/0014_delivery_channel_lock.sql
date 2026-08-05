-- Prevents a fan from holding simultaneous access via both delivery
-- channels (Telegram + the Android app) for the same telegram-bridged
-- collections by switching devices. "delivery_channel" is the channel
-- currently authorized for this fan's bridged collections; the first
-- device seen sets it for free, but any channel CHANGE after that consumes
-- a one-time allowance (device_switch_used_at) — a second change is
-- blocked until an admin clears it (see middleware.ts, /admin/users).
alter table public.profiles
  add column if not exists delivery_channel text
    check (delivery_channel in ('telegram', 'app'));

alter table public.profiles
  add column if not exists device_switch_used_at timestamptz;
