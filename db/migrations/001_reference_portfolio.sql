-- Reference Portfolio foundation
-- PostgreSQL 15+
-- Append-only/versioned reference data. Operational records must store the
-- dataset_version they were created against.


create table if not exists reference_dataset (
  id uuid primary key default gen_random_uuid(),
  dataset_key text not null unique,
  name text not null,
  description text,
  domain text not null check (domain in (
    'geography','occupation','industry','education_level',
    'qualification_type','field_of_study','membership','verification'
  )),
  source_type text not null check (source_type in ('external','mpa_governed','operational')),
  source_name text,
  source_version text,
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists reference_dataset_version (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references reference_dataset(id),
  version_label text not null,
  schema_version integer not null default 1,
  status text not null default 'draft' check (status in ('draft','validated','submitted','approved','scheduled','published','archived')),
  effective_from date,
  effective_to date,
  import_method text check (import_method in ('manual','csv','xlsx','json','api')),
  source_checksum text,
  notes text,
  created_by uuid,
  approved_by uuid,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (dataset_id, version_label),
  check (effective_to is null or effective_from is null or effective_to >= effective_from)
);

create unique index if not exists uq_reference_published_version
  on reference_dataset_version(dataset_id)
  where status = 'published';

create table if not exists reference_item (
  id uuid primary key default gen_random_uuid(),
  dataset_version_id uuid not null references reference_dataset_version(id) on delete restrict,
  code text not null,
  parent_item_id uuid references reference_item(id) on delete restrict,
  label text not null,
  short_label text,
  description text,
  aliases jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  active boolean not null default true,
  effective_from date,
  effective_to date,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dataset_version_id, code),
  check (effective_to is null or effective_from is null or effective_to >= effective_from)
);

create index if not exists ix_reference_item_parent on reference_item(parent_item_id);
create index if not exists ix_reference_item_label on reference_item using gin (to_tsvector('simple', label));

create table if not exists reference_relation (
  id uuid primary key default gen_random_uuid(),
  from_item_id uuid not null references reference_item(id) on delete restrict,
  to_item_id uuid not null references reference_item(id) on delete restrict,
  relation_type text not null check (relation_type in (
    'parent_of','child_of','equivalent','broader_than','narrower_than',
    'related_to','replaces','deprecated_to','crosswalk'
  )),
  metadata jsonb not null default '{}'::jsonb,
  unique(from_item_id,to_item_id,relation_type),
  check (from_item_id <> to_item_id)
);

create table if not exists reference_crosswalk (
  id uuid primary key default gen_random_uuid(),
  from_dataset_version_id uuid not null references reference_dataset_version(id) on delete restrict,
  from_item_id uuid not null references reference_item(id) on delete restrict,
  to_dataset_version_id uuid not null references reference_dataset_version(id) on delete restrict,
  to_item_id uuid not null references reference_item(id) on delete restrict,
  mapping_type text not null check (mapping_type in ('exact','close','broader','narrower','related','not_mappable')),
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  note text,
  unique(from_item_id,to_item_id)
);

create table if not exists reference_import (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references reference_dataset(id) on delete restrict,
  target_version_id uuid references reference_dataset_version(id) on delete restrict,
  filename text not null,
  format text not null check (format in ('csv','xlsx','json')),
  checksum text,
  status text not null default 'uploaded' check (status in (
    'uploaded','mapped','validated','rejected','drafted','published'
  )),
  uploaded_by uuid,
  uploaded_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists reference_import_row (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references reference_import(id) on delete cascade,
  row_number integer not null,
  source_code text,
  source_parent_code text,
  raw_data jsonb not null,
  classification text check (classification in (
    'new','unchanged','renamed','parent_changed','code_changed',
    'duplicate','deleted','deprecated','invalid_parent','conflict','invalid'
  )),
  target_item_id uuid references reference_item(id) on delete restrict,
  errors jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  unique(import_id,row_number)
);

create table if not exists reference_publication (
  id uuid primary key default gen_random_uuid(),
  dataset_version_id uuid not null references reference_dataset_version(id) on delete restrict,
  action text not null check (action in ('validate','approve','publish','schedule','revert','archive')),
  scheduled_for timestamptz,
  performed_by uuid,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists reference_change_request (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references reference_dataset(id) on delete restrict,
  base_version_id uuid references reference_dataset_version(id) on delete restrict,
  proposed_version_id uuid references reference_dataset_version(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft','submitted','approved','rejected','published')),
  requested_by uuid,
  reviewed_by uuid,
  reason text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists membership_product (
  id uuid primary key default gen_random_uuid(),
  product_code text not null unique,
  name text not null,
  description text,
  scope text not null default 'member',
  billing_model text not null check (billing_model in ('recurring','one_time','lifetime')),
  price numeric(14,2) not null check (price >= 0),
  currency char(3) not null default 'ETB',
  duration_days integer,
  renewal_required boolean not null default false,
  grace_period_days integer not null default 0,
  eligibility jsonb not null default '{}'::jsonb,
  benefits jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  effective_from date,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((billing_model = 'lifetime' and renewal_required = false) or billing_model <> 'lifetime')
);

create table if not exists membership_fee_rule (
  id uuid primary key default gen_random_uuid(),
  membership_product_id uuid not null references membership_product(id) on delete restrict,
  version integer not null,
  base_amount numeric(14,2) not null check (base_amount >= 0),
  currency char(3) not null default 'ETB',
  billing_period text,
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  service_fee numeric(14,2) not null default 0 check (service_fee >= 0),
  discount_rules jsonb not null default '[]'::jsonb,
  waiver_rules jsonb not null default '[]'::jsonb,
  eligibility_rules jsonb not null default '{}'::jsonb,
  effective_from date not null,
  effective_to date,
  payment_channels jsonb not null default '["telebirr"]'::jsonb,
  refund_policy jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique(membership_product_id,version),
  check (effective_to is null or effective_to >= effective_from)
);

create table if not exists verification_claim_type (
  id uuid primary key default gen_random_uuid(),
  claim_code text not null unique,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists verification_checklist (
  id uuid primary key default gen_random_uuid(),
  claim_type_id uuid not null references verification_claim_type(id) on delete restrict,
  version integer not null,
  status text not null default 'draft' check (status in ('draft','approved','published','archived')),
  effective_from date,
  effective_to date,
  created_at timestamptz not null default now(),
  approved_by uuid,
  unique(claim_type_id,version)
);

create table if not exists verification_checklist_item (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references verification_checklist(id) on delete cascade,
  item_code text not null,
  label text not null,
  description text,
  response_type text not null check (response_type in (
    'yes_no','pass_fail','verified_not_verified','select','multi_select',
    'numeric','text','date','document_present_missing','document_valid_invalid',
    'reviewer_note'
  )),
  required boolean not null default true,
  evidence_required boolean not null default false,
  evidence_rules jsonb not null default '{}'::jsonb,
  reviewer_guidance text,
  pass_condition jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  active boolean not null default true,
  unique(checklist_id,item_code)
);

create index if not exists ix_verification_checklist_claim on verification_checklist(claim_type_id);

comment on table reference_dataset is 'Admin-governed taxonomy registry; application code must not hard-code business classifications.';
comment on table reference_dataset_version is 'Immutable after publication except administrative archival metadata.';
comment on table membership_fee_rule is 'Historical billing rules remain attached to the obligation that used them.';
