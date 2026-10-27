create or replace function public.play_tic_tac_toe(target_room_id uuid, expected_revision integer, target_entity_id text)
returns setof public.multiplayer_rounds
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid := auth.uid();
  current_round public.multiplayer_rounds%rowtype;
  definition jsonb;
  next_state jsonb;
  chosen_cell jsonb;
  mark text;
  winner text := null;
  moves integer;
  board text[];
  winning_line integer[];
begin
  if actor is null or not exists (
    select 1 from public.room_members where room_id = target_room_id and user_id = actor
  ) then raise exception 'Room membership is required' using errcode = '42501'; end if;
  select * into current_round from public.multiplayer_rounds where room_id = target_room_id for update;
  if not found then raise exception 'Ask the host to start a round'; end if;
  if current_round.revision is distinct from expected_revision then
    raise exception 'The board changed. Try again on the updated board' using errcode = '40001';
  end if;
  next_state := current_round.state;
  if next_state #>> '{values,engine}' is distinct from 'tic_tac_toe.v1' then raise exception 'This round is not tic-tac-toe'; end if;
  if next_state ->> 'status' is distinct from 'playing' then raise exception 'This round has finished'; end if;
  mark := next_state #>> '{values,turn}';
  if mark not in ('X','O') or mark is null or next_state #>> array['values', 'player' || mark] is distinct from actor::text then
    raise exception 'Wait for your turn' using errcode = '42501';
  end if;
  select v.definition into definition from public.game_versions v where v.id = current_round.game_version_id;
  select cell into chosen_cell from jsonb_array_elements(definition -> 'entities') cell
    where cell ->> 'id' = target_entity_id and cell -> 'grid' is not null;
  if chosen_cell is null then raise exception 'Choose a board cell'; end if;
  if nullif(next_state #>> array['entities', target_entity_id, 'state', 'mark'], '') is not null then
    raise exception 'That cell is already occupied';
  end if;
  next_state := jsonb_set(next_state, array['entities',target_entity_id,'state','mark'], to_jsonb(mark), true);
  select array_agg(next_state #>> array['entities', cell ->> 'id','state','mark']
    order by (cell #>> '{grid,row}')::integer, (cell #>> '{grid,column}')::integer)
    into board from jsonb_array_elements(definition -> 'entities') cell where cell -> 'grid' is not null;
  if coalesce(array_length(board, 1), 0) <> 9 then raise exception 'This board must have nine cells'; end if;
  foreach winning_line slice 1 in array array[[1,2,3],[4,5,6],[7,8,9],[1,4,7],[2,5,8],[3,6,9],[1,5,9],[3,5,7]]
  loop
    if board[winning_line[1]] = mark and board[winning_line[2]] = mark and board[winning_line[3]] = mark then
      winner := mark;
      exit;
    end if;
  end loop;
  moves := coalesce((next_state #>> '{values,moves}')::integer, 0) + 1;
  if winner is null and moves = 9 then winner := 'draw'; end if;
  next_state := jsonb_set(next_state, '{values}', (next_state -> 'values') || jsonb_build_object(
    'turn', case when mark = 'X' then 'O' else 'X' end, 'moves', moves, 'winner', winner));
  if winner is not null then next_state := jsonb_set(next_state, '{status}', '"finished"'::jsonb); end if;
  return query update public.multiplayer_rounds
    set state = next_state, revision = current_round.revision + 1, updated_at = clock_timestamp()
    where room_id = target_room_id returning *;
end;
$function$;
revoke all on function public.play_tic_tac_toe(uuid, integer, text) from public, anon;
grant execute on function public.play_tic_tac_toe(uuid, integer, text) to authenticated;
