-- This legacy publishing RPC is not a browser API. Only trusted server code
-- may supply a creator ID; generation routes verify the user before writing.
alter function public.publish_generated_game(uuid, text, text, text, text, smallint, smallint, smallint, public.game_mode, jsonb, jsonb, jsonb)
  security invoker;
alter function public.publish_generated_game(uuid, text, text, text, text, smallint, smallint, smallint, public.game_mode, jsonb, jsonb, jsonb)
  set search_path = '';
revoke all on function public.publish_generated_game(uuid, text, text, text, text, smallint, smallint, smallint, public.game_mode, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.publish_generated_game(uuid, text, text, text, text, smallint, smallint, smallint, public.game_mode, jsonb, jsonb, jsonb)
  to service_role;
