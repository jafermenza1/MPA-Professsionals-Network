-- Email operations center: editable templates, durable drafts, inbound mail and delivery metadata.
create table if not exists email_notification_template (
  template_code text primary key,
  display_name text not null,
  audience text not null default 'all',
  subject_template text not null,
  text_template text not null,
  html_template text not null,
  enabled boolean not null default true,
  adjustable_by_admin boolean not null default true,
  updated_by uuid references app_user(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (audience in ('all','professional','organization_representative','reviewer','administrator','employer','mentor'))
);
create table if not exists email_outbox_draft (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references app_user(id) on delete set null,
  recipient text not null,
  subject text not null,
  text_body text not null default '',
  html_body text not null default '',
  status text not null default 'draft' check (status in ('draft','queued','cancelled')),
  queued_outbox_id uuid references notification_outbox(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ix_email_outbox_draft_status on email_outbox_draft(status,updated_at desc);
alter table notification_outbox add column if not exists subject text;
alter table notification_outbox add column if not exists text_body text;
alter table notification_outbox add column if not exists html_body text;
alter table notification_outbox add column if not exists updated_at timestamptz not null default now();
alter table notification_outbox add column if not exists delivery_error_code text;
alter table notification_outbox add column if not exists locked_at timestamptz;
alter table notification_outbox add column if not exists created_by uuid references app_user(id) on delete set null;
create index if not exists ix_notification_outbox_email_status on notification_outbox(channel,status,created_at desc);
create table if not exists email_inbox_message (
  id uuid primary key default gen_random_uuid(),
  provider_message_id text unique,
  sender text not null,
  recipients text[] not null default '{}',
  subject text not null default '',
  text_body text not null default '',
  html_body text not null default '',
  received_at timestamptz not null default now(),
  read_at timestamptz,
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists ix_email_inbox_received on email_inbox_message(received_at desc) where archived_at is null;

insert into email_notification_template(template_code,display_name,audience,subject_template,text_template,html_template) values
('account.email_verification','Verify your email','all','Verify your MPA Network email','Hello {{firstName}},\n\nVerify your email using this secure link: {{verificationUrl}}\nThis link expires in 24 hours.\n\nReference: {{registrationReference}}','<p>Hello {{firstName}},</p><p><a href="{{verificationUrl}}">Verify your email address</a></p><p>This link expires in 24 hours.</p><p>Reference: <strong>{{registrationReference}}</strong></p>'),
('organization.registration_received','Organization registration received','organization_representative','We received {{organizationName}} registration','Hello {{firstName}},\nWe received {{organizationName}}. Reference: {{registrationReference}}. Current status: {{status}}. Next action: {{nextAction}}.','<p>Hello {{firstName}},</p><p>We received <strong>{{organizationName}}</strong>.</p><p>Reference: {{registrationReference}}<br>Status: {{status}}<br>Next action: {{nextAction}}</p>'),
('organization.review_update','Organization review update','organization_representative','Update on {{organizationName}}','Hello {{firstName}},\nStatus: {{status}}. Last updated: {{lastUpdated}}. Next action: {{nextAction}}. Reference: {{registrationReference}}.','<p>Hello {{firstName}},</p><p>Status: {{status}}<br>Last updated: {{lastUpdated}}<br>Next action: {{nextAction}}<br>Reference: {{registrationReference}}</p>'),
('membership.application_update','Membership application update','professional','Membership application update: {{status}}','Hello {{firstName}},\nYour membership application status is {{status}}. Next action: {{nextAction}}. Reference: {{registrationReference}}.','<p>Hello {{firstName}},</p><p>Your membership application status is <strong>{{status}}</strong>.</p><p>Next action: {{nextAction}}<br>Reference: {{registrationReference}}</p>'),
('security.admin_alert','Administrator security alert','administrator','Security alert: {{event}}','Security event: {{event}}\nTime: {{occurredAt}}\nPlease review the administrator security console.','<p>Security event: <strong>{{event}}</strong><br>Time: {{occurredAt}}</p><p>Please review the administrator security console.</p>')
on conflict(template_code) do nothing;
