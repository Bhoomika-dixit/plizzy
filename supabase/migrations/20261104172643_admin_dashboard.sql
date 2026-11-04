-- One explicitly provisioned application superuser. This is NOT a Postgres superuser.
create schema if not exists plizzy_private;
revoke all on schema plizzy_private from public, anon, authenticated;
create table plizzy_private.admin_access (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id) on delete restrict,
  granted_at timestamptz not null default now()
);
alter table plizzy_private.admin_access enable row level security;
revoke all on plizzy_private.admin_access from public, anon, authenticated, service_role;

-- Resolve identity by email, never embed environment-specific generated UUIDs.
insert into plizzy_private.admin_access(user_id)
select id from auth.users where lower(email) = 'bhoomika.s@plizzy.in' and deleted_at is null;

create index games_created_at_admin_idx on public.games(created_at);
create index game_generation_usage_date_admin_idx on public.game_generation_usage(usage_date);

create function public.admin_dashboard_snapshot(
  p_actor_id uuid, p_session_id uuid, p_days integer default 30,
  p_page integer default 1, p_query text default '', p_sort text default 'newest',
  p_user_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' set statement_timeout = '8s'
as $$
declare
  today date := (now() at time zone 'UTC')::date;
  start_at timestamptz;
  result jsonb;
begin
  -- Recheck the pinned identity, current verified email, ban and live session on
  -- every read. An email claim, user-editable metadata, or deleted session is insufficient.
  if not exists (
    select 1 from plizzy_private.admin_access a
    join auth.users u on u.id = a.user_id
    join auth.sessions s on s.user_id = u.id and s.id = p_session_id
    where a.user_id = p_actor_id and lower(u.email) = 'bhoomika.s@plizzy.in'
      and u.email_confirmed_at is not null and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= now())
      and (s.not_after is null or s.not_after > now())
  ) then raise exception 'Admin access denied' using errcode = '42501'; end if;
  if p_days is null or p_days not in (7,30,90) or p_page is null or p_page < 1 or p_page > 100000
    or p_query is null or length(p_query) > 100 or p_sort is null or p_sort not in ('newest','games','signins')
    then raise exception 'Invalid report filters' using errcode = '22023'; end if;
  start_at := (today - (p_days - 1))::timestamp at time zone 'UTC';

  with game_rows as materialized (
    select g.id, g.title, g.creator_id, g.created_at, g.visibility::text, g.is_archived as archived,
      v.game_mode::text as mode, u.email as creator_email
    from public.games g left join public.game_versions v on v.id = g.latest_version_id
      left join auth.users u on u.id = g.creator_id
  ), game_counts as (
    select creator_id, count(*) as games,
      count(*) filter(where mode='single_player') as solo,
      count(*) filter(where mode='multiplayer') as multiplayer, max(created_at) as last_game_at
    from game_rows group by creator_id
  ), usage_counts as (
    select user_id, sum(attempts) as attempts,
      coalesce(sum(attempts) filter(where usage_date=today),0) as attempts_today
    from public.game_generation_usage group by user_id
  ), room_counts as (select host_id, count(*) as rooms from public.rooms group by host_id),
  saved_counts as (select user_id, count(*) filter(where is_saved) as saved from public.user_games group by user_id),
  all_users as materialized (
    select u.id,u.email,p.display_name as name,p.username,u.created_at,u.last_sign_in_at,
      (u.email_confirmed_at is not null) as verified,(u.id=p_actor_id) as is_admin,
      coalesce(g.games,0) as games,coalesce(g.solo,0) as solo,coalesce(g.multiplayer,0) as multiplayer,
      g.last_game_at,coalesce(a.attempts,0) as attempts,coalesce(a.attempts_today,0) as attempts_today,
      coalesce(r.rooms,0) as rooms,coalesce(s.saved,0) as saved
    from auth.users u left join public.profiles p on p.id=u.id
      left join game_counts g on g.creator_id=u.id left join usage_counts a on a.user_id=u.id
      left join room_counts r on r.host_id=u.id left join saved_counts s on s.user_id=u.id
    where u.deleted_at is null
  ), matching as materialized (
    select * from all_users where p_query='' or position(lower(p_query) in lower(coalesce(email,'')||' '||coalesce(name,'')||' '||coalesce(username,'')||' '||id::text)) > 0
  ), paged as (
    select * from matching order by
      case when p_sort='games' then games end desc nulls last,
      case when p_sort='signins' then last_sign_in_at end desc nulls last,
      created_at desc,id limit 20 offset ((p_page-1)*20)
  ), day_users as (select (created_at at time zone 'UTC')::date as day,count(*) as count from all_users where created_at>=start_at group by 1),
  day_games as (select (created_at at time zone 'UTC')::date as day,count(*) as count from game_rows where created_at>=start_at group by 1),
  day_attempts as (select usage_date as day,sum(attempts) as count from public.game_generation_usage where usage_date>=today-(p_days-1) group by 1)
  select jsonb_build_object(
    'generated_at',now(),'days',p_days,'page',p_page,'page_size',20,
    'totals',jsonb_build_object(
      'users',(select count(*) from all_users),'verified',(select count(*) from all_users where verified),
      'new_users',(select count(*) from all_users where created_at>=start_at),
      'signed_in',(select count(*) from all_users where last_sign_in_at>=start_at),
      'creators',(select count(*) from all_users where games>0),
      'games',(select count(*) from game_rows),'new_games',(select count(*) from game_rows where created_at>=start_at),
      'solo',(select count(*) from game_rows where mode='single_player'),
      'multiplayer',(select count(*) from game_rows where mode='multiplayer'),
      'archived',(select count(*) from game_rows where archived),
      'public_games',(select count(*) from game_rows where visibility='public'),
      'rooms',(select count(*) from public.rooms),
      'attempts',(select coalesce(sum(attempts),0) from public.game_generation_usage where usage_date>=today-(p_days-1)),
      'attempts_today',(select coalesce(sum(attempts),0) from public.game_generation_usage where usage_date=today),
      'quota_reached',(select count(*) from public.game_generation_usage where usage_date=today and attempts>=3)
    ),
    'users',coalesce((select jsonb_agg(to_jsonb(paged)) from paged),'[]'::jsonb),
    'matched_users',(select count(*) from matching),
    'trend',(select jsonb_agg(jsonb_build_object('day',d.day::date,'users',coalesce(u.count,0),'games',coalesce(g.count,0),'attempts',coalesce(a.count,0)) order by d.day)
      from generate_series(today-(p_days-1),today,interval '1 day') d(day)
      left join day_users u on u.day=d.day::date left join day_games g on g.day=d.day::date left join day_attempts a on a.day=d.day::date),
    'recent_games',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from game_rows order by created_at desc,id limit 10) x),'[]'::jsonb),
    'selected',(select jsonb_build_object('user',to_jsonb(u),'games',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from game_rows where creator_id=u.id order by created_at desc,id limit 20) x),'[]'::jsonb)) from all_users u where id=p_user_id)
  ) into result;
  return result;
end;
$$;
revoke all on function public.admin_dashboard_snapshot(uuid,uuid,integer,integer,text,text,uuid) from public,anon,authenticated;
grant execute on function public.admin_dashboard_snapshot(uuid,uuid,integer,integer,text,text,uuid) to service_role;
comment on function public.admin_dashboard_snapshot(uuid,uuid,integer,integer,text,text,uuid) is 'Read-only admin reporting. Server-only; requires pinned superuser identity and active verified OTP session. Never grants admin through editable user metadata.';
