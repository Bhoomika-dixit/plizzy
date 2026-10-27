-- Repair only the room-creation RPC. Preserve its permissions and search_path.
-- Run in the Supabase SQL editor after the existing app schema.
begin;
do $migration$
declare
  crypto_schema text;
  room_function regprocedure := pg_catalog.to_regprocedure('public.create_room_for_game(uuid)');
  original_definition text;
  repaired_definition text;
begin
  if room_function is null then
    raise exception 'public.create_room_for_game(uuid) was not found.';
  end if;
  select namespace.nspname into crypto_schema
  from pg_catalog.pg_extension extension
  join pg_catalog.pg_namespace namespace on namespace.oid = extension.extnamespace
  where extension.extname = 'pgcrypto';
  if crypto_schema is null then
    raise exception 'Enable the pgcrypto extension in Supabase Database > Extensions, then rerun this migration.';
  end if;

  original_definition := pg_catalog.pg_get_functiondef(room_function);
  repaired_definition := pg_catalog.regexp_replace(
    original_definition,
    '(^|[^[:alnum:]_.])gen_random_bytes[[:space:]]*\(',
    '\1' || pg_catalog.format('%I.gen_random_bytes(', crypto_schema),
    'g'
  );
  if repaired_definition <> original_definition then
    execute repaired_definition;
  end if;
end;
$migration$;
commit;
