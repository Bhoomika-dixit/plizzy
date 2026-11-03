-- Attempts are charged before paid AI work and never refunded automatically.
create table public.game_generation_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  attempts smallint not null check (attempts between 1 and 3),
  primary key (user_id, usage_date)
);

alter table public.game_generation_usage enable row level security;
revoke all on table public.game_generation_usage from public, anon, authenticated;
grant select, insert, update on table public.game_generation_usage to service_role;

create function public.consume_game_generation(p_user_id uuid)
returns table (allowed boolean, used integer, resets_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_day date := (statement_timestamp() at time zone 'UTC')::date;
  v_used integer;
begin
  -- The trusted API supplies its verified user ID. Clients cannot call this RPC
  -- or modify counters. The conflict update locks just this user's daily row.
  insert into public.game_generation_usage as usage (user_id, usage_date, attempts)
  values (p_user_id, v_day, 1)
  on conflict (user_id, usage_date) do update
    set attempts = usage.attempts + 1
    where usage.attempts < 3
  returning attempts into v_used;

  return query select v_used is not null, coalesce(v_used, 3),
    ((v_day + 1)::timestamp at time zone 'UTC');
end;
$$;

revoke all on function public.consume_game_generation(uuid) from public, anon, authenticated;
grant execute on function public.consume_game_generation(uuid) to service_role;
