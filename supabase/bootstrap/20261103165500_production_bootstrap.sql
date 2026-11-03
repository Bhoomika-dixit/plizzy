-- Bootstrap only a new, empty Plizzy project; apply supabase/migrations afterward.
-- Refuse to overwrite an existing app schema. This contains schema only, no user data.
do $$ begin if to_regclass('public.profiles') is not null then raise exception 'This bootstrap requires an empty Plizzy database'; end if; end $$;

-- Source: 0001_initial_schema.sql
-- Plizzy initial Supabase schema
-- Run with the Supabase CLI or paste into the Supabase SQL Editor.

create extension if not exists pgcrypto;

do $$
begin
  create type public.game_visibility as enum ('private', 'unlisted', 'public');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.room_visibility as enum ('invite_only', 'public');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.room_role as enum ('host', 'member');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.session_status as enum ('lobby', 'playing', 'finished', 'cancelled');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[a-zA-Z0-9_]{3,30}$'),
  display_name text not null check (char_length(display_name) between 1 and 80),
  avatar_url text,
  bio text check (char_length(bio) <= 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username));

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 120),
  summary text check (char_length(summary) <= 500),
  cover_image_url text,
  visibility public.game_visibility not null default 'private',
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists games_creator_created_at_idx
  on public.games (creator_id, created_at desc);
create index if not exists games_public_created_at_idx
  on public.games (created_at desc) where visibility = 'public' and not is_archived;

create table if not exists public.game_versions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  prompt text not null check (char_length(prompt) between 1 and 4000),
  rules_markdown text not null,
  min_players smallint not null check (min_players between 1 and 100),
  max_players smallint not null check (max_players between min_players and 100),
  estimated_duration_minutes smallint check (estimated_duration_minutes between 1 and 480),
  definition jsonb not null default '{}'::jsonb check (jsonb_typeof(definition) = 'object'),
  visual_theme jsonb not null default '{}'::jsonb check (jsonb_typeof(visual_theme) = 'object'),
  generation_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(generation_metadata) = 'object'),
  created_at timestamptz not null default now(),
  unique (game_id, version_number)
);

create index if not exists game_versions_game_id_idx on public.game_versions (game_id, version_number desc);

alter table public.games
  add column if not exists latest_version_id uuid references public.game_versions(id) on delete set null;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 80),
  invite_code text not null unique check (invite_code ~ '^[A-Z0-9]{6,16}$'),
  visibility public.room_visibility not null default 'invite_only',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rooms_host_created_at_idx on public.rooms (host_id, created_at desc);

create table if not exists public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.room_role not null default 'member',
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz,
  primary key (room_id, user_id)
);

create index if not exists room_members_user_id_idx on public.room_members (user_id, joined_at desc);

create table if not exists public.room_games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  game_version_id uuid not null references public.game_versions(id) on delete restrict,
  added_by uuid not null references public.profiles(id) on delete restrict,
  position integer not null default 0 check (position >= 0),
  added_at timestamptz not null default now(),
  unique (room_id, game_version_id)
);

create index if not exists room_games_room_position_idx on public.room_games (room_id, position, added_at);

create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  game_version_id uuid not null references public.game_versions(id) on delete restrict,
  status public.session_status not null default 'lobby',
  current_round integer not null default 0 check (current_round >= 0),
  state jsonb not null default '{}'::jsonb check (jsonb_typeof(state) = 'object'),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status <> 'playing') or started_at is not null),
  check ((status <> 'finished') or finished_at is not null)
);

create index if not exists game_sessions_room_created_at_idx on public.game_sessions (room_id, created_at desc);

alter table public.rooms
  add column if not exists active_session_id uuid references public.game_sessions(id) on delete set null;

create table if not exists public.session_players (
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  is_ready boolean not null default false,
  score integer not null default 0,
  player_state jsonb not null default '{}'::jsonb check (jsonb_typeof(player_state) = 'object'),
  joined_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create table if not exists public.game_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.game_sessions(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type ~ '^[a-z][a-z0-9_]{0,63}$'),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists game_events_session_created_at_idx on public.game_events (session_id, created_at, id);

create table if not exists public.user_games (
  user_id uuid not null references public.profiles(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  is_saved boolean not null default false,
  is_liked boolean not null default false,
  last_played_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, game_id)
);

create table if not exists public.game_assets (
  id uuid primary key default gen_random_uuid(),
  game_version_id uuid not null references public.game_versions(id) on delete cascade,
  storage_bucket text not null default 'game-assets',
  storage_path text not null,
  asset_type text not null check (asset_type in ('cover', 'illustration', 'background', 'audio', 'other')),
  alt_text text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  unique (storage_bucket, storage_path)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists games_set_updated_at on public.games;
create trigger games_set_updated_at before update on public.games
for each row execute procedure public.set_updated_at();

drop trigger if exists rooms_set_updated_at on public.rooms;
create trigger rooms_set_updated_at before update on public.rooms
for each row execute procedure public.set_updated_at();

drop trigger if exists game_sessions_set_updated_at on public.game_sessions;
create trigger game_sessions_set_updated_at before update on public.game_sessions
for each row execute procedure public.set_updated_at();

drop trigger if exists user_games_set_updated_at on public.user_games;
create trigger user_games_set_updated_at before update on public.user_games
for each row execute procedure public.set_updated_at();

-- These helpers prevent RLS policies from recursively querying room membership.
create or replace function public.is_room_member(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.room_members
    where room_id = target_room_id and user_id = (select auth.uid())
  );
$$;

create or replace function public.is_session_member(target_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.game_sessions sessions
    where sessions.id = target_session_id
      and public.is_room_member(sessions.room_id)
  );
$$;

-- Clients use this function to join with an invite code. It never exposes room rows
-- to a user who does not possess the code.
create or replace function public.join_room_by_code(invite_code_input text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_room_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to join a room';
  end if;

  select id into target_room_id
  from public.rooms
  where invite_code = upper(trim(invite_code_input));

  if target_room_id is null then
    raise exception 'Invalid invite code';
  end if;

  insert into public.room_members (room_id, user_id, role)
  values (target_room_id, auth.uid(), 'member')
  on conflict (room_id, user_id) do nothing;

  return target_room_id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.game_versions enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.room_games enable row level security;
alter table public.game_sessions enable row level security;
alter table public.session_players enable row level security;
alter table public.game_events enable row level security;
alter table public.user_games enable row level security;
alter table public.game_assets enable row level security;

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on public.profiles, public.games, public.game_versions,
  public.rooms, public.room_members, public.room_games, public.user_games to authenticated;
-- Live match state, scores, and events are written only by trusted server-side game actions.
grant select on public.game_sessions, public.session_players, public.game_events, public.game_assets to authenticated;
grant execute on function public.join_room_by_code(text), public.is_room_member(uuid), public.is_session_member(uuid) to authenticated;

create policy "Profiles are visible to signed-in users" on public.profiles
  for select to authenticated using (true);
create policy "Users can create their profile" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy "Users can update their profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "Public games and owned games are visible" on public.games
  for select to authenticated using (visibility = 'public' or creator_id = (select auth.uid()));
create policy "Users can create games" on public.games
  for insert to authenticated with check (creator_id = (select auth.uid()));
create policy "Creators can update games" on public.games
  for update to authenticated using (creator_id = (select auth.uid())) with check (creator_id = (select auth.uid()));
create policy "Creators can delete games" on public.games
  for delete to authenticated using (creator_id = (select auth.uid()));

create policy "Visible game versions are readable" on public.game_versions
  for select to authenticated using (exists (
    select 1 from public.games where games.id = game_versions.game_id
      and (games.visibility = 'public' or games.creator_id = (select auth.uid()))
  ) or exists (
    select 1 from public.room_games
    where room_games.game_version_id = game_versions.id
      and public.is_room_member(room_games.room_id)
  ));
create policy "Creators can create versions" on public.game_versions
  for insert to authenticated with check (exists (
    select 1 from public.games where games.id = game_versions.game_id and games.creator_id = (select auth.uid())
  ));
create policy "Creators can update versions" on public.game_versions
  for update to authenticated using (exists (
    select 1 from public.games where games.id = game_versions.game_id and games.creator_id = (select auth.uid())
  ));

create policy "Room members can see rooms" on public.rooms
  for select to authenticated using (host_id = (select auth.uid()) or public.is_room_member(id));
create policy "Users can create rooms" on public.rooms
  for insert to authenticated with check (host_id = (select auth.uid()));
create policy "Hosts can update rooms" on public.rooms
  for update to authenticated using (host_id = (select auth.uid())) with check (host_id = (select auth.uid()));
create policy "Hosts can delete rooms" on public.rooms
  for delete to authenticated using (host_id = (select auth.uid()));

create policy "Room members can see other members" on public.room_members
  for select to authenticated using (public.is_room_member(room_id));
create policy "Hosts can add themselves to a new room" on public.room_members
  for insert to authenticated with check (
    user_id = (select auth.uid()) and exists (
      select 1 from public.rooms where rooms.id = room_members.room_id and rooms.host_id = (select auth.uid())
    )
  );
create policy "Members can leave rooms" on public.room_members
  for delete to authenticated using (user_id = (select auth.uid()) and role = 'member');

create policy "Room members can read queued games" on public.room_games
  for select to authenticated using (public.is_room_member(room_id));
create policy "Hosts manage queued games" on public.room_games
  for all to authenticated using (exists (
    select 1 from public.rooms where rooms.id = room_games.room_id and rooms.host_id = (select auth.uid())
  )) with check (exists (
    select 1 from public.rooms where rooms.id = room_games.room_id and rooms.host_id = (select auth.uid())
  ));

create policy "Room members can read sessions" on public.game_sessions
  for select to authenticated using (public.is_room_member(room_id));
create policy "Hosts manage sessions" on public.game_sessions
  for all to authenticated using (exists (
    select 1 from public.rooms where rooms.id = game_sessions.room_id and rooms.host_id = (select auth.uid())
  )) with check (exists (
    select 1 from public.rooms where rooms.id = game_sessions.room_id and rooms.host_id = (select auth.uid())
  ));

create policy "Session members can read players" on public.session_players
  for select to authenticated using (public.is_session_member(session_id));
create policy "Members can mark themselves ready" on public.session_players
  for update to authenticated using (user_id = (select auth.uid()) and public.is_session_member(session_id))
  with check (user_id = (select auth.uid()) and public.is_session_member(session_id));

create policy "Session members can read events" on public.game_events
  for select to authenticated using (public.is_session_member(session_id));

create policy "Users manage their own library" on public.user_games
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "Assets for visible games are readable" on public.game_assets
  for select to authenticated using (exists (
    select 1
    from public.game_versions versions
    join public.games on games.id = versions.game_id
    where versions.id = game_assets.game_version_id
      and (games.visibility = 'public' or games.creator_id = (select auth.uid()))
  ) or exists (
    select 1
    from public.room_games
    where room_games.game_version_id = game_assets.game_version_id
      and public.is_room_member(room_games.room_id)
  ));

comment on column public.game_versions.definition is 'AI-generated game contract: mechanics, phases, actions, scoring, and state schema.';
comment on column public.game_sessions.state is 'Validated current live state for one match; write only through server-side game actions.';
comment on table public.game_events is 'Append-only gameplay audit trail for replays, scoring, and debugging.';


-- Source: 0002_create_profile_on_signup.sql
-- Email OTP authentication keeps confirmation enabled and uses the code-only templates.
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


-- Source: 0003_add_game_mode.sql
-- A game version carries the intended launch mode. GameDefinition remains the
-- portable runtime contract; this column makes mode queryable and enforceable.
do $$
begin
  create type public.game_mode as enum ('single_player', 'multiplayer');
exception when duplicate_object then null;
end $$;

alter table public.game_versions
  add column if not exists game_mode public.game_mode not null default 'single_player';

create index if not exists game_versions_game_mode_idx
  on public.game_versions (game_mode);

comment on column public.game_versions.game_mode is
  'Selected launch mode. Multiplayer versions are added to a room before a session starts.';


-- Source: 0004_room_workflows.sql
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


-- Source: 0005_profile_avatars.sql
-- User avatars are deliberately separate from generated game assets.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

create policy "Users upload their own avatar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "Users update their own avatar" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text))
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "Users delete their own avatar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "Avatar images are publicly readable" on storage.objects
  for select to public using (bucket_id = 'avatars');


-- Source: 0006_game_assets_storage.sql
-- Generated visual assets remain private. The trusted generation route writes them
-- with the service role; eligible creators and room members can read their own rows.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('game-assets', 'game-assets', false, 2097152, array['image/svg+xml'])
on conflict (id) do update set public = false, file_size_limit = 2097152, allowed_mime_types = array['image/svg+xml'];

drop policy if exists "Creators and room members can read game assets" on storage.objects;
create policy "Creators and room members can read game assets"
on storage.objects for select to authenticated
using (
  bucket_id = 'game-assets' and exists (
    select 1 from public.game_assets assets
    join public.game_versions versions on versions.id = assets.game_version_id
    join public.games games on games.id = versions.game_id
    where assets.storage_bucket = storage.objects.bucket_id
      and assets.storage_path = storage.objects.name
      and (
        games.creator_id = (select auth.uid())
        or exists (
          select 1 from public.room_games room_games
          where room_games.game_version_id = versions.id
            and public.is_room_member(room_games.room_id)
        )
      )
  )
);


-- Source: 0007_generated_game_assets.sql
-- Model-generated gameplay artwork follows the same visibility rules as its game.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'generated-game-assets',
  'generated-game-assets',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

drop policy if exists "Creators and room members can read generated game assets" on storage.objects;
create policy "Creators and room members can read generated game assets"
on storage.objects for select to authenticated
using (
  bucket_id = 'generated-game-assets' and exists (
    select 1 from public.game_assets assets
    join public.game_versions versions on versions.id = assets.game_version_id
    join public.games games on games.id = versions.game_id
    where assets.storage_bucket = storage.objects.bucket_id
      and assets.storage_path = storage.objects.name
      and (
        games.creator_id = (select auth.uid())
        or exists (
          select 1 from public.room_games room_games
          where room_games.game_version_id = versions.id
            and public.is_room_member(room_games.room_id)
        )
      )
  )
);
