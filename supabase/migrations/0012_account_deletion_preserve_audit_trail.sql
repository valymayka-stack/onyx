-- Account deletion (2026-08): fan and creator accounts can now be hard
-- deleted (admin.auth.admin.deleteUser), not just suspended. Content and
-- grants a fan/creator actually owns still cascade away as before — this
-- migration only touches audit/compliance/forensic data that should
-- survive the account disappearing, per the operator's explicit call:
-- keep the security/consent/payment trail, anonymized, rather than lose
-- it along with the account.
--
-- Every column below previously had no ON DELETE behavior, which defaults
-- to RESTRICT — deleting a fan/creator with any row referencing them here
-- would have simply failed outright with a foreign key violation. Each is
-- switched to SET NULL (and NOT NULL dropped where it was set, since the
-- whole point is the row surviving with a now-anonymous actor).

alter table public.consent_records alter column granted_by drop not null;
alter table public.consent_records drop constraint consent_records_granted_by_fkey;
alter table public.consent_records add constraint consent_records_granted_by_fkey
  foreign key (granted_by) references auth.users(id) on delete set null;

alter table public.consent_history drop constraint consent_history_changed_by_fkey;
alter table public.consent_history add constraint consent_history_changed_by_fkey
  foreign key (changed_by) references auth.users(id) on delete set null;

alter table public.security_events drop constraint security_events_user_id_fkey;
alter table public.security_events add constraint security_events_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table public.ip_bans drop constraint ip_bans_banned_by_fkey;
alter table public.ip_bans add constraint ip_bans_banned_by_fkey
  foreign key (banned_by) references auth.users(id) on delete set null;

alter table public.device_fingerprint_bans drop constraint device_fingerprint_bans_banned_by_fkey;
alter table public.device_fingerprint_bans add constraint device_fingerprint_bans_banned_by_fkey
  foreign key (banned_by) references auth.users(id) on delete set null;

alter table public.ban_history drop constraint ban_history_actor_id_fkey;
alter table public.ban_history add constraint ban_history_actor_id_fkey
  foreign key (actor_id) references auth.users(id) on delete set null;

alter table public.action_attempts drop constraint action_attempts_user_id_fkey;
alter table public.action_attempts add constraint action_attempts_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table public.payments alter column fan_id drop not null;
alter table public.payments drop constraint payments_fan_id_fkey;
alter table public.payments add constraint payments_fan_id_fkey
  foreign key (fan_id) references public.fans(id) on delete set null;

alter table public.payments alter column creator_id drop not null;
alter table public.payments drop constraint payments_creator_id_fkey;
alter table public.payments add constraint payments_creator_id_fkey
  foreign key (creator_id) references public.creators(id) on delete set null;

alter table public.payouts alter column creator_id drop not null;
alter table public.payouts drop constraint payouts_creator_id_fkey;
alter table public.payouts add constraint payouts_creator_id_fkey
  foreign key (creator_id) references public.creators(id) on delete set null;

-- content_delivery_marks.user_id is the one exception worth calling out:
-- it's set to SET NULL here (fan deletion preserves the anonymized
-- delivery/forensic trail against content that still exists), but
-- item_id still cascades from content_items — so deleting a *creator*
-- still wipes delivery marks for that creator's own (now-deleted) photos.
-- That's intentional: there's nothing left to trace once the photo itself
-- is gone.
alter table public.content_delivery_marks alter column user_id drop not null;
alter table public.content_delivery_marks drop constraint content_delivery_marks_user_id_fkey;
alter table public.content_delivery_marks add constraint content_delivery_marks_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;
