-- Add skills to the existing governed reference-data domain and seed a starter vocabulary.
alter table reference_dataset drop constraint if exists reference_dataset_domain_check;
alter table reference_dataset add constraint reference_dataset_domain_check
  check (domain in ('geography','occupation','industry','education_level','qualification_type','field_of_study','membership','verification','nationality','experience_range','language','institution','skill'));

insert into reference_dataset(dataset_key,name,description,domain,source_type,source_name,status)
values('professional_skills','Professional skills','Admin-managed skills used by professional profiles, talent search and portfolio relationships.','skill','mpa_governed','MPA professional reference portfolio','active')
on conflict(dataset_key) do nothing;

insert into reference_dataset_version(dataset_id,version_label,status,import_method,notes,effective_from,published_at)
select d.id,'v1','published','manual','Initial governed skills vocabulary; administrators can extend it through the reference portfolio.','2026-10-15',now()
from reference_dataset d
where d.dataset_key='professional_skills'
and not exists(select 1 from reference_dataset_version v where v.dataset_id=d.id and v.status='published');

insert into reference_item(dataset_version_id,code,label,aliases,sort_order,active)
select v.id,x.code,x.label,to_jsonb(x.aliases),x.sort_order,true
from reference_dataset d join reference_dataset_version v on v.dataset_id=d.id and v.status='published'
cross join (values
 ('COMMUNICATION','Communication','["communication skills","written communication","verbal communication"]'::jsonb,10),
 ('CUSTOMER_SERVICE','Customer service','["client service","customer support"]'::jsonb,20),
 ('PROJECT_MANAGEMENT','Project management','["project coordination"]'::jsonb,30),
 ('DATA_ANALYSIS','Data analysis','["analytics","data analytics"]'::jsonb,40),
 ('DIGITAL_MARKETING','Digital marketing','["online marketing","social media marketing"]'::jsonb,50),
 ('GRAPHIC_DESIGN','Graphic design','["visual design"]'::jsonb,60),
 ('WEB_DEVELOPMENT','Web development','["website development","frontend development","backend development"]'::jsonb,70),
 ('ACCOUNTING','Accounting','["bookkeeping"]'::jsonb,80),
 ('SALES','Sales','["business development"]'::jsonb,90),
 ('LEADERSHIP','Leadership','["team leadership"]'::jsonb,100),
 ('RESEARCH','Research','["research methods"]'::jsonb,110),
 ('TEACHING','Teaching','["instruction","training"]'::jsonb,120),
 ('TRANSLATION','Translation','["interpretation","language translation"]'::jsonb,130),
 ('MS_OFFICE','Office productivity tools','["microsoft office","spreadsheets","word processing"]'::jsonb,140),
 ('OTHER','Other skill','["other"]'::jsonb,999)
) as x(code,label,aliases,sort_order)
where d.dataset_key='professional_skills'
on conflict(dataset_version_id,code) do nothing;
