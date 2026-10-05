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
