-- Run after Supabase Auth has created the requested OTP account. Does not confirm
-- its email or change credentials. Refuses to replace an existing superuser.
do $$
begin
  if (select count(*) from auth.users where lower(email)='bhoomika@plizzy.in' and deleted_at is null) <> 1 then
    raise exception 'Create the designated OTP account first';
  end if;
  insert into plizzy_private.admin_access(user_id)
    select id from auth.users where lower(email)='bhoomika@plizzy.in' and deleted_at is null
    on conflict (singleton) do nothing;
  if not exists (select 1 from plizzy_private.admin_access a join auth.users u on u.id=a.user_id where lower(u.email)='bhoomika@plizzy.in' and u.deleted_at is null) then
    raise exception 'A different superuser is already provisioned';
  end if;
end;
$$;
