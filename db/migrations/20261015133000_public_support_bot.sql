-- Public support bot, human follow-up inbox, and editable categorized knowledge base.
create table if not exists support_knowledge_category (
  id uuid primary key default gen_random_uuid(),
  slug varchar(80) not null unique,
  name varchar(120) not null,
  description varchar(500) not null default '',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references app_user(id) on delete set null,
  updated_by uuid references app_user(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists support_knowledge_article (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references support_knowledge_category(id) on delete restrict,
  title varchar(180) not null,
  question_examples text[] not null default '{}',
  keywords text[] not null default '{}',
  answer text not null,
  source_note varchar(500) not null default '',
  sort_order integer not null default 0,
  is_published boolean not null default false,
  created_by uuid references app_user(id) on delete set null,
  updated_by uuid references app_user(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(answer)) > 0)
);
create index if not exists ix_support_knowledge_published
  on support_knowledge_article(category_id,is_published,sort_order);
create table if not exists support_conversation (
  id uuid primary key default gen_random_uuid(),
  public_reference varchar(24) not null unique,
  visitor_key_hash char(64) not null,
  user_id uuid references app_user(id) on delete set null,
  contact_name varchar(160),
  contact_email varchar(254),
  contact_phone varchar(40),
  preferred_contact varchar(16) not null default 'email' check(preferred_contact in ('email','phone','none')),
  consent_to_contact boolean not null default false,
  page_path varchar(500) not null default '/',
  status varchar(20) not null default 'open' check(status in ('open','in_progress','resolved','closed')),
  category_id uuid references support_knowledge_category(id) on delete set null,
  last_question text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  assigned_to uuid references app_user(id) on delete set null,
  resolved_at timestamptz
);
create index if not exists ix_support_conversation_inbox on support_conversation(status,updated_at desc);
create index if not exists ix_support_conversation_email on support_conversation(contact_email) where contact_email is not null;
create table if not exists support_message (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references support_conversation(id) on delete cascade,
  sender_type varchar(12) not null check(sender_type in ('visitor','bot','staff','system')),
  message_text text not null,
  knowledge_article_id uuid references support_knowledge_article(id) on delete set null,
  created_at timestamptz not null default now(),
  check(length(trim(message_text)) > 0)
);
create index if not exists ix_support_message_conversation on support_message(conversation_id,created_at);
insert into support_knowledge_category(slug,name,description,sort_order) values
 ('membership','Membership','Eligibility, application, membership status and membership ID.',10),
 ('account','Account and profile','Registration, login, profile and account security.',20),
 ('jobs','Jobs and recruitment','Vacancies, applications and recruitment support.',30),
 ('organizations','Organizations','Organization registration, verification and access.',40),
 ('mentorship','Mentorship and services','Mentorship, professional services and requests.',50),
 ('events','Events and learning','Events, learning and professional development.',60),
 ('privacy','Privacy and verification','Data privacy, identity verification and support escalation.',70),
 ('general','General help','How to use MPA and how to contact support.',100)
on conflict(slug) do nothing;
insert into support_knowledge_article(category_id,title,question_examples,keywords,answer,source_note,is_published)
select id,'How do I contact MPA support?','{"contact support","talk to a person","human help"}','{"support","contact","person","help","human","agent"}',
'You can send your question through this support assistant. If you share an email address or phone number and consent to follow-up, the MPA support team can review your inquiry and contact you. Please do not send passwords or sensitive identity documents here.',
'Starter answer; administrators should confirm the official support process.',true
from support_knowledge_category where slug='general'
and not exists(select 1 from support_knowledge_article where title='How do I contact MPA support?');
