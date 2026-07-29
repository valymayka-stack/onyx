-- Self-serve signup only ever creates a FAN account. Creator accounts are
-- seeded manually by the sandbox operator (insert into creators + user_roles
-- directly via SQL/Studio) — there is no self-serve creator signup yet, which
-- keeps the sandbox multi-tenant but controlled.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));

  insert into public.fans (id) values (new.id);

  insert into public.user_roles (user_id, role) values (new.id, 'fan');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
