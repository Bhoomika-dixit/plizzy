-- Legacy server-only RPC, retained for compatibility with the hardening migration.
create or replace function public.publish_generated_game(
  p_creator_id uuid, p_title text, p_summary text, p_prompt text,
  p_rules_markdown text, p_min_players smallint, p_max_players smallint,
  p_estimated_duration_minutes smallint, p_game_mode public.game_mode,
  p_definition jsonb, p_visual_theme jsonb, p_generation_metadata jsonb
)
returns table (game_id uuid, version_id uuid)
language plpgsql security invoker set search_path = ''
as $$
declare
  new_game_id uuid;
  new_version_id uuid;
begin
  insert into public.games (creator_id, title, summary, visibility)
  values (p_creator_id, p_title, p_summary, 'private') returning id into new_game_id;
  insert into public.game_versions (
    game_id, version_number, prompt, rules_markdown, min_players, max_players,
    estimated_duration_minutes, game_mode, definition, visual_theme, generation_metadata
  ) values (
    new_game_id, 1, p_prompt, p_rules_markdown, p_min_players, p_max_players,
    p_estimated_duration_minutes, p_game_mode, p_definition, p_visual_theme, p_generation_metadata
  ) returning id into new_version_id;
  update public.games set latest_version_id = new_version_id where id = new_game_id;
  insert into public.user_games (user_id, game_id, is_saved, last_played_at)
  values (p_creator_id, new_game_id, true, null);
  return query select new_game_id, new_version_id;
end;
$$;
revoke all on function public.publish_generated_game(uuid,text,text,text,text,smallint,smallint,smallint,public.game_mode,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.publish_generated_game(uuid,text,text,text,text,smallint,smallint,smallint,public.game_mode,jsonb,jsonb,jsonb) to service_role;

-- Browser code uses only the authenticated membership/room functions.
revoke execute on function public.handle_new_user(), public.set_updated_at(),
  public.is_room_member(uuid), public.is_session_member(uuid), public.join_room_by_code(text),
  public.create_room_for_game(uuid), public.remove_room_member(uuid,uuid) from public, anon;
revoke execute on function public.handle_new_user(), public.set_updated_at() from authenticated;
grant execute on function public.is_room_member(uuid), public.is_session_member(uuid),
  public.join_room_by_code(text), public.create_room_for_game(uuid), public.remove_room_member(uuid,uuid)
  to authenticated, service_role;

grant all on public.profiles, public.games, public.game_versions, public.rooms,
  public.room_members, public.room_games, public.game_sessions, public.session_players,
  public.game_events, public.user_games, public.game_assets to service_role;
grant usage, select on all sequences in schema public to service_role;
