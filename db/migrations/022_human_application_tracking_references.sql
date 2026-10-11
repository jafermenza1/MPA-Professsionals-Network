create sequence if not exists application_tracking_reference_seq start with 1;

alter table membership_application
  add column if not exists tracking_reference text;
alter table organization
  add column if not exists tracking_reference text;
alter table job_application
  add column if not exists tracking_reference text;

do $$
declare
  application record;
  serial_value bigint;
  reference_value text;
begin
  for application in
    select kind,id,created_at from (
      select 'MEM'::text kind,id,created_at from membership_application where tracking_reference is null
      union all
      select 'ORG'::text kind,id,created_at from organization where tracking_reference is null
      union all
      select 'JOB'::text kind,id,created_at from job_application where tracking_reference is null
    ) pending order by created_at,id,kind
  loop
    serial_value := nextval('application_tracking_reference_seq');
    reference_value := 'MPA-'||application.kind||'-'||to_char(application.created_at,'YY')||'-'||
      repeat('0',greatest(0,6-length(serial_value::text)))||serial_value::text;

    if application.kind='MEM' then
      update membership_application set tracking_reference=reference_value where id=application.id;
    elsif application.kind='ORG' then
      update organization set tracking_reference=reference_value where id=application.id;
    else
      update job_application set tracking_reference=reference_value where id=application.id;
    end if;
  end loop;
end $$;

alter table membership_application alter column tracking_reference set not null;
alter table organization alter column tracking_reference set not null;
alter table job_application alter column tracking_reference set not null;

create unique index if not exists uq_membership_application_tracking_reference
  on membership_application(tracking_reference);
create unique index if not exists uq_organization_tracking_reference
  on organization(tracking_reference);
create unique index if not exists uq_job_application_tracking_reference
  on job_application(tracking_reference);