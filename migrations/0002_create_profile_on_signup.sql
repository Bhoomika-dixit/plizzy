-- Run after 0001_initial_schema.sql. Configure Supabase Auth > Email > Confirm email as OFF.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
  profile_username text;
  profile_display_name text;
begin
  base_username := lower(regexp_replace(split_part(coalesce(new.email, ''), '@', 1), '[^a-zA-Z0-9_]', '', 'g'));
  if char_length(base_username) < 3 then base_username := 'player'; end if;
  profile_username := left(base_username, 22) || '_' || left(new.id::text, 7);
  profile_display_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
  insert into public.profiles (id, username, display_name)
  values (new.id, profile_username, coalesce(profile_display_name, profile_username));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
