-- The owner corrected the designated address before launch. Revoke the old
-- account's application admin grant without changing or deleting Auth records.
delete from plizzy_private.admin_access a using auth.users u
where a.user_id=u.id and lower(u.email)='bhoomika.s@plizzy.in';

do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.admin_dashboard_snapshot(uuid,uuid,integer,integer,text,text,uuid)'::regprocedure);
  if position('bhoomika.s@plizzy.in' in definition) = 0 then
    raise exception 'Unexpected admin function definition';
  end if;
  execute replace(definition,'bhoomika.s@plizzy.in','bhoomika@plizzy.in');
end;
$$;

insert into plizzy_private.admin_access(user_id)
select id from auth.users where lower(email)='bhoomika@plizzy.in' and deleted_at is null;
