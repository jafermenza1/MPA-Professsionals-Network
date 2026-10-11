-- Configurable vetting, evidence, response and appeal foundation.
create table if not exists verification_program (
 id uuid primary key default gen_random_uuid(),
 program_code text not null unique, name text not null, description text,
 purpose text not null, subject_type text not null default 'person',
 risk_level text not null default 'standard' check (risk_level in ('basic','standard','enhanced','leadership')),
 confidentiality_level text not null default 'restricted' check (confidentiality_level in ('internal','restricted','highly_restricted')),
 requires_consent boolean not null default true, requires_member_response_on_adverse boolean not null default true,
 appeal_enabled boolean not null default true, active boolean not null default true,
 effective_from date, effective_to date, created_by uuid references app_user(id) on delete restrict,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check (effective_to is null or effective_from is null or effective_to >= effective_from)
);
create table if not exists verification_program_checklist (
 id uuid primary key default gen_random_uuid(), program_id uuid not null references verification_program(id) on delete restrict,
 checklist_id uuid not null references verification_checklist(id) on delete restrict,
 required boolean not null default true, created_at timestamptz not null default now(), unique(program_id,checklist_id)
);
create table if not exists verification_case (
 id uuid primary key default gen_random_uuid(), program_id uuid not null references verification_program(id) on delete restrict,
 subject_user_id uuid not null references app_user(id) on delete restrict,
 status text not null default 'draft' check (status in ('draft','consent_pending','submitted','screening','evidence_required','member_response_required','review','decision_pending','approved','partially_verified','rejected','appeal_pending','appealed','closed','withdrawn')),
 checklist_version_snapshot jsonb not null default '{}'::jsonb, program_snapshot jsonb not null default '{}'::jsonb,
 purpose_snapshot text not null, opened_by uuid references app_user(id) on delete restrict,
 assigned_reviewer_id uuid references app_user(id) on delete restrict, assigned_at timestamptz,
 submitted_at timestamptz, decided_at timestamptz, closed_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists ix_verification_case_subject on verification_case(subject_user_id,created_at desc);
create index if not exists ix_verification_case_status on verification_case(status,created_at desc);
create table if not exists verification_claim (
 id uuid primary key default gen_random_uuid(), case_id uuid not null references verification_case(id) on delete restrict,
 claim_type_id uuid not null references verification_claim_type(id) on delete restrict,
 claim_code_snapshot text not null, claimed_value jsonb not null default '{}'::jsonb,
 status text not null default 'unverified' check (status in ('unverified','under_review','verified','partially_verified','not_verified','disputed','expired','withdrawn')),
 confidence numeric(5,4) check (confidence is null or (confidence between 0 and 1)),
 verified_at timestamptz, expires_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists ix_verification_claim_case on verification_claim(case_id);
create table if not exists verification_evidence (
 id uuid primary key default gen_random_uuid(), case_id uuid not null references verification_case(id) on delete restrict,
 claim_id uuid references verification_claim(id) on delete restrict, file_object_id uuid references file_object(id) on delete restrict,
 evidence_type text not null, source_type text not null check (source_type in ('member','referee','issuer','employer','professional_body','public_record','staff','system','other')),
 source_name text, source_reference text, evidence_hash text, collected_at timestamptz, expires_at timestamptz,
 authenticity_status text not null default 'pending' check (authenticity_status in ('pending','authentic','questioned','not_authentic','not_applicable')),
 relevance_status text not null default 'pending' check (relevance_status in ('pending','relevant','insufficient','irrelevant')),
 confidentiality_level text not null default 'restricted' check (confidentiality_level in ('internal','restricted','highly_restricted')),
 notes text, uploaded_by uuid references app_user(id) on delete restrict, created_at timestamptz not null default now()
);
create index if not exists ix_verification_evidence_case on verification_evidence(case_id,created_at desc);
create table if not exists verification_check_result (
 id uuid primary key default gen_random_uuid(), case_id uuid not null references verification_case(id) on delete restrict,
 checklist_item_id uuid not null references verification_checklist_item(id) on delete restrict,
 response jsonb not null default '{}'::jsonb, outcome text not null default 'pending' check (outcome in ('pending','pass','fail','not_applicable','needs_review')),
 evidence_required boolean not null default false, evidence_ids jsonb not null default '[]'::jsonb, reviewer_note text,
 reviewed_by uuid references app_user(id) on delete restrict, reviewed_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(case_id,checklist_item_id)
);
create table if not exists verification_decision (
 id uuid primary key default gen_random_uuid(), case_id uuid not null references verification_case(id) on delete restrict,
 decision text not null check (decision in ('approved','partially_verified','rejected','correction_required','closed_no_finding')),
 decision_basis jsonb not null default '{}'::jsonb, reason text not null, adverse boolean not null default false,
 decided_by uuid not null references app_user(id) on delete restrict, decided_at timestamptz not null default now(),
 member_notified_at timestamptz, member_response_due_at timestamptz, finalised_at timestamptz
);
create table if not exists verification_member_response (
 id uuid primary key default gen_random_uuid(), case_id uuid not null references verification_case(id) on delete restrict,
 decision_id uuid references verification_decision(id) on delete restrict, response_text text,
 evidence_ids jsonb not null default '[]'::jsonb, submitted_by uuid not null references app_user(id) on delete restrict,
 submitted_at timestamptz not null default now()
);
create table if not exists verification_appeal (
 id uuid primary key default gen_random_uuid(), case_id uuid not null references verification_case(id) on delete restrict,
 decision_id uuid not null references verification_decision(id) on delete restrict,
 status text not null default 'submitted' check (status in ('submitted','accepted','under_review','upheld','overturned','partially_overturned','withdrawn','closed')),
 grounds text not null, evidence_ids jsonb not null default '[]'::jsonb,
 assigned_reviewer_id uuid references app_user(id) on delete restrict, decision_reason text,
 decided_by uuid references app_user(id) on delete restrict, submitted_at timestamptz not null default now(), decided_at timestamptz
);
create index if not exists ix_verification_appeal_case on verification_appeal(case_id,submitted_at desc);
create table if not exists verification_reference_request (
 id uuid primary key default gen_random_uuid(), case_id uuid not null references verification_case(id) on delete restrict,
 referee_name text not null, referee_contact text not null, relationship text not null,
 consent_status text not null default 'pending' check (consent_status in ('pending','accepted','declined','withdrawn')),
 questions jsonb not null default '[]'::jsonb, response jsonb,
 verification_status text not null default 'pending' check (verification_status in ('pending','received','verified','insufficient','disputed')),
 requested_by uuid references app_user(id) on delete restrict, requested_at timestamptz not null default now(), responded_at timestamptz
);
create table if not exists verification_concern (
 id uuid primary key default gen_random_uuid(), case_id uuid not null references verification_case(id) on delete restrict,
 source_type text not null check (source_type in ('member','staff','referee','issuer','professional_body','public_record','other')),
 source_reference text, allegation text not null, evidence_ids jsonb not null default '[]'::jsonb,
 status text not null default 'reported' check (status in ('reported','screening','substantiated','unsubstantiated','resolved','dismissed')),
 severity text not null default 'standard' check (severity in ('low','standard','high','critical')),
 response_requested boolean not null default true, response_due_at timestamptz,
 resolved_by uuid references app_user(id) on delete restrict, resolved_at timestamptz, resolution_reason text,
 created_by uuid references app_user(id) on delete restrict, created_at timestamptz not null default now()
);
insert into app_role(role_code,name,description) values
 ('supporting_staff','Supporting Staff','Authorized staff-assisted member data completion within scope'),
 ('verification_reviewer','Verification Reviewer','Authorized reviewer for evidence and verification cases'),
 ('ethics_reviewer','Ethics Reviewer','Authorized reviewer for ethical/professional conduct cases'),
 ('appeal_reviewer','Appeal Reviewer','Independent reviewer for verification appeals')
on conflict (role_code) do nothing;
insert into verification_program(program_code,name,description,purpose,risk_level,confidentiality_level,requires_consent,requires_member_response_on_adverse,appeal_enabled) values
 ('MEMBER_IDENTITY','Member Identity Verification','Confirm account holder identity.','Identity continuity and account integrity','basic','restricted',true,true,true),
 ('PROFESSIONAL_VERIFICATION','Verified Professional','Verify professional qualification, registration or capability.','Professional claim verification','standard','restricted',true,true,true),
 ('ENHANCED_PROFESSIONAL','Enhanced Professional Vetting','Additional evidence/reference review where justified.','Proportionate enhanced due diligence','enhanced','highly_restricted',true,true,true),
 ('LEADERSHIP_VETTING','Leadership and Governance Vetting','Higher assurance for governance, finance and sensitive-data roles.','Leadership suitability, integrity and conflict-of-interest assurance','leadership','highly_restricted',true,true,true)
on conflict (program_code) do nothing;
comment on table verification_program is 'Configurable vetting policy. Islamic terms must be shown with plain-English equivalents; no ad-hoc religious tests.';
comment on table verification_case is 'Evidence-led case with policy/checklist snapshots. Adverse outcomes require documented reason and member response where policy requires.';
comment on table verification_concern is 'A concern is not a finding; evidence and response are required before substantiation.';
