-- Room creation must be atomic: allocate a per-host name, make the host a
-- member, and attach the immutable game version in one transaction.
create or replace function public.create_room_for_game(target_game_version_id uuid)
returns table (room_id uuid, room_name text, invite_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  next_room_number integer;
  new_room_id uuid;
  new_invite_code text;
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  if not exists (
    select 1 from public.game_versions versions
    join public.games games on games.id = versions.game_id
    where versions.id = target_game_version_id and games.creator_id = auth.uid()
  ) then raise exception 'You can only create a room for your own game version'; end if;

  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
  select count(*) + 1 into next_room_number from public.rooms where host_id = auth.uid();
  loop
    new_invite_code := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 10));
    exit when not exists (select 1 from public.rooms where rooms.invite_code = new_invite_code);
  end loop;
  insert into public.rooms (host_id, name, invite_code, visibility)
  values (auth.uid(), format('Room %s', next_room_number), new_invite_code, 'invite_only')
  returning id into new_room_id;
  insert into public.room_members (room_id, user_id, role) values (new_room_id, auth.uid(), 'host');
  insert into public.room_games (room_id, game_version_id, added_by, position)
  values (new_room_id, target_game_version_id, auth.uid(), 0);
  return query select new_room_id, format('Room %s', next_room_number), new_invite_code;
end;
$$;

create or replace function public.remove_room_member(target_room_id uuid, target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication is required'; end if;
  if not exists (select 1 from public.rooms where id = target_room_id and host_id = auth.uid()) then
    raise exception 'Only the room admin can remove members';
  end if;
  if target_user_id = auth.uid() then raise exception 'The room admin cannot be removed'; end if;
  delete from public.room_members where room_id = target_room_id and user_id = target_user_id and role = 'member';
end;
$$;

grant execute on function public.create_room_for_game(uuid), public.remove_room_member(uuid, uuid) to authenticated;
