-- Distinguish organization-representative accounts from professional identities.
-- Existing accounts remain professional by default; no historical role is silently removed.
alter table app_user
  add column if not exists account_type text not null default 'professional';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='app_user_account_type_check'
      and conrelid='app_user'::regclass
  ) then
    alter table app_user
      add constraint app_user_account_type_check
      check (account_type in ('professional','organization_representative'));
  end if;
end $$;

insert into app_role(role_code,name,description) values
  ('organization_representative','Organization Representative','Creates and manages organization applications and authorized organization workspaces')
on conflict (role_code) do nothing;
