-- Explicit per-user capabilities. Existing organization/job membership checks remain authoritative for scoped resources.
create table if not exists app_permission (
  permission_code text primary key,
  area text not null,
  label text not null,
  description text not null,
  sensitive boolean not null default false,
  system_only boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists app_user_permission (
  user_id uuid not null references app_user(id) on delete restrict,
  permission_code text not null references app_permission(permission_code) on delete restrict,
  assigned_by uuid references app_user(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  primary key(user_id,permission_code)
);
create index if not exists ix_app_user_permission_code on app_user_permission(permission_code,user_id);

insert into app_permission(permission_code,area,label,description,sensitive,system_only) values
('dashboard.view','Dashboard','View dashboard','View platform dashboard summaries.',false,false),
('members.view','Membership','View members','View member directory and membership records permitted by data scope.',false,false),
('members.manage','Membership','Manage members','Review membership applications, request corrections, and manage membership lifecycle.',true,false),
('finance.view','Finance','View finance','View membership payment records, payment status, and finance queues.',true,false),
('finance.manage','Finance','Manage finance','Verify payments and perform authorized finance actions; does not bypass amount or audit controls.',true,false),
('organizations.view','Organizations','View organizations','View organization workspace data only where organization scope permits.',false,false),
('organizations.manage','Organizations','Manage organizations','Manage organization setup and membership where the caller is otherwise authorized.',true,false),
('organizations.review','Organizations','Review organization verification','Review organization verification cases, subject to conflict-of-interest controls.',true,false),
('jobs.view','Recruitment','View jobs and pipeline','View recruitment data allowed by organization and job scope.',true,false),
('jobs.manage','Recruitment','Manage jobs','Manage vacancies, pipelines, and recruitment settings where assigned to the organization/job.',true,false),
('applications.view','Applications','View applications','View application records allowed by applicant and organization scope.',true,false),
('applications.manage','Applications','Manage applications','Update application workflow and interview records where scoped.',true,false),
('services.view','Services','View services','View service listings and requests.',false,false),
('services.manage','Services','Manage services','Manage service listings and provider workflows.',true,false),
('mentorship.view','Mentorship','View mentorship','View mentorship requests and engagements as an authorized participant.',false,false),
('mentorship.manage','Mentorship','Manage mentorship','Manage eligible mentorship workflows; participant and verification requirements remain.',true,false),
('verification.view','Verification','View verification','View verification cases allowed by subject ownership or review assignment.',true,false),
('verification.manage','Verification','Manage verification','Perform authorized verification review actions, subject to assignment and conflict checks.',true,false),
('reviews.view','Review queues','View review queues','View review queues allowed by the specific review policy.',true,false),
('reports.view','Reports','View reports','View reports and operational summaries allowed by data scope.',true,false),
('users.view','User administration','View users','View platform account records.',true,false),
('users.manage','User administration','Manage users','Suspend/disable accounts and revoke sessions with an audit reason.',true,false),
('permissions.manage','User administration','Manage user permissions','Assign direct per-user capabilities. This capability is reserved to system administrators.',true,true),
('settings.manage','Platform settings','Manage settings','Manage platform-wide settings.',true,true),
('files.view_private','Private files','View private files','View private files only where the file authorization policy grants access.',true,false),
('notifications.manage','Notifications','Manage notifications','Manage notification preferences and delivery configuration.',false,false)
on conflict(permission_code) do update set area=excluded.area,label=excluded.label,description=excluded.description,sensitive=excluded.sensitive,system_only=excluded.system_only;
