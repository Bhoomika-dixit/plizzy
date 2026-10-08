-- Keep the immutable version, latest-version pointer and creator library entry
-- consistent. Storage uploads remain outside this transaction and are optional.
create or replace function public.publish_generated_game(
  p_creator_id uuid,
  p_title text,
  p_summary text,
  p_prompt text,
  p_rules_markdown text,
  p_min_players smallint,
  p_max_players smallint,
  p_estimated_duration_minutes smallint,
  p_game_mode public.game_mode,
  p_definition jsonb,
  p_visual_theme jsonb,
  p_generation_metadata jsonb
)
returns table (game_id uuid, version_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_game_id uuid;
  new_version_id uuid;
begin
  insert into public.games (creator_id, title, summary, visibility)
  values (p_creator_id, p_title, p_summary, 'private')
  returning id into new_game_id;

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

revoke all on function public.publish_generated_game(uuid, text, text, text, text, smallint, smallint, smallint, public.game_mode, jsonb, jsonb, jsonb) from public;
grant execute on function public.publish_generated_game(uuid, text, text, text, text, smallint, smallint, smallint, public.game_mode, jsonb, jsonb, jsonb) to service_role;
