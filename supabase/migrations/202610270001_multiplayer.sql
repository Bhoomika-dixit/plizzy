-- Apply after the existing rooms, room_members, room_games and game_versions schema.
create table public.multiplayer_rounds (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  game_version_id uuid not null references public.game_versions(id),
  state jsonb not null,
  revision integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.multiplayer_rounds enable row level security;
-- Moves are server-only; room members can receive committed state via Realtime.
revoke all on public.multiplayer_rounds from anon, authenticated;
grant all on public.multiplayer_rounds to service_role;
grant select on public.multiplayer_rounds to authenticated;
create policy "Room members receive round updates"
on public.multiplayer_rounds for select to authenticated
using (public.is_room_member(room_id));
alter publication supabase_realtime add table public.multiplayer_rounds;
