-- Admin-managed demonstration scenarios and contextual user guidance.
create table if not exists experience_demo_case (
  id uuid primary key default gen_random_uuid(),
  case_key text not null unique,
  title text not null,
  business_area text not null,
  persona text not null,
  description text not null,
  start_path text not null,
  scenario jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references app_user(id) on delete set null,
  updated_by uuid references app_user(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ix_demo_case_area on experience_demo_case(active,business_area,sort_order);

create table if not exists ui_guide_tour (
  id uuid primary key default gen_random_uuid(),
  guide_key text not null unique,
  route_pattern text not null,
  title text not null,
  description text not null,
  steps jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references app_user(id) on delete set null,
  updated_by uuid references app_user(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ix_ui_guide_route on ui_guide_tour(active,route_pattern,sort_order);

insert into experience_demo_case(case_key,title,business_area,persona,description,start_path,scenario,sort_order)
values
('member-onboarding','Join MPA and complete membership','Identity & Membership','New professional','Register, complete profile, submit supporting documents and move through membership/payment review.','/profile','{"outcomes":["account_created","profile_completed","membership_submitted","payment_verified"],"roles":["member","membership_staff","finance_staff"]}',10),
('verification-review','Verify a professional claim','Verification & Talent','Reviewer','Inspect a submitted credential claim, evidence and checklist, then make an accountable verification decision.','/network','{"outcomes":["claim_verified","talent_discoverable","private_evidence_protected"],"roles":["professional","reviewer","system_admin"]}',20),
('talent-recruitment','Recruit a verified professional','Employment & ATS','Recruiter','Create a vacancy, screen eligible professionals, interview with scorecards, approve an offer and record the hiring outcome.','/jobs','{"outcomes":["requisition_approved","job_published","candidate_screened","interview_completed","offer_approved","candidate_accepted","job_filled"],"roles":["recruiter","hiring_manager","approver","candidate"]}',30),
('organization-onboarding','Verify a partner organization','Organizations','Organization administrator','Register an organization, supply evidence, submit for review and become eligible to publish opportunities.','/organizations','{"outcomes":["organization_registered","evidence_submitted","organization_verified"],"roles":["organization_owner","reviewer"]}',40),
('service-delivery','Request and deliver a professional service','Services','Requester & provider','Discover a service, request it, accept the engagement, complete delivery and capture feedback/outcome.','/services','{"outcomes":["service_discovered","request_accepted","delivery_completed","feedback_recorded"],"roles":["requester","provider"]}',50),
('mentor-match','Match a mentee with a verified mentor','Mentorship','Mentee','Set a goal, browse recommended mentors, request a match, schedule sessions and close with an outcome.','/mentorship','{"outcomes":["goal_set","mentor_requested","match_accepted","session_completed","goal_outcome_recorded"],"roles":["mentee","mentor"]}',60),
('manual-payment','Process manual membership payment','Payments','Finance staff','Review bank/cash evidence, reconcile the payment idempotently and activate only after verified payment.','/profile','{"outcomes":["payment_evidence_received","payment_verified","membership_activated"],"roles":["member","finance_staff"]}',70),
('field-inspection','Capture evidence in low connectivity','Field operations','Field worker','Use the rugged evidence interface, queue an attachment while offline and confirm synchronization before reporting success.','/field','{"outcomes":["evidence_captured","queued_locally","sync_confirmed","finding_recorded"],"roles":["field_worker","inspector","reviewer"]}',80),
('stakeholder-outcomes','Inspect ecosystem progress and outcomes','Stakeholder Outcomes','Executive stakeholder','Review recruiting, services, mentorship and talent outcomes without exposing private verification evidence.','/admin','{"outcomes":["progress_seen","bottleneck_identified","outcome_reviewed"],"roles":["executive","organization_lead","system_admin"]}',90),
('partner-opportunity','Publish a partner-network opportunity','Employment & ATS','Partner organization','Publish a partner-scoped vacancy and allow eligible network professionals to discover and apply.','/jobs','{"outcomes":["partner_job_published","eligible_candidate_applies","application_progress_visible"],"roles":["partner_recruiter","candidate"]}',100)
on conflict(case_key) do nothing;

insert into ui_guide_tour(guide_key,route_pattern,title,description,steps,sort_order)
values
('global-navigation','*','Welcome to MPA','Learn the navigation once; the same patterns repeat throughout the platform.','[
 {"target":"#mpa-brand","title":"Your home base","text":"Use the MPA mark to return to the ecosystem home."},
 {"target":"#mpa-search","title":"Omni-search","text":"Search across people, opportunities and other permitted content without leaving your workspace."},
 {"target":"#mpa-sync","title":"Connection status","text":"Green means synced. A queued count means local work is waiting for confirmation."},
 {"target":"#mpa-help","title":"Help anytime","text":"Open this guide again whenever you need a reminder."}
]'::jsonb,10),
('network-directory','/network','Find trusted professionals','This directory exposes only the public-safe projection of verified talent.','[
 {"target":"#talent-filters","title":"Start broad, then narrow","text":"Use occupation, industry, education, field, availability and location filters."},
 {"target":"#talent-result","title":"Trust at a glance","text":"Badges indicate verified professional eligibility; private evidence and reviewer notes stay hidden."},
 {"target":"#talent-quick-view","title":"Quick view","text":"Open the side panel to inspect the public profile without losing your search context."}
]'::jsonb,20),
('mentorship-match','/mentorship','Find a mentor','Set your goal first, then compare verified mentors using transparent matching signals.','[
 {"target":"#mentor-goal","title":"Your goal","text":"Define the sector, outcome and preferred time before requesting a match."},
 {"target":"#mentor-card","title":"Compare mentors","text":"Review verified expertise, languages, style and availability."},
 {"target":"#mentor-request","title":"Request match","text":"Send a concise request. The matching service recommends; people remain the decision makers."}
]'::jsonb,30),
('jobs-ats','/jobs','Move a vacancy from need to outcome','The job workspace follows a familiar ATS pipeline from requisition to hire.','[
 {"target":"#job-filters","title":"Find the right opportunity","text":"Filter by scope, location, employment type, seniority and other permitted criteria."},
 {"target":"#job-card","title":"Understand the opportunity","text":"Review eligibility, role details and application status before applying."},
 {"target":"#job-progress","title":"Track progress","text":"Candidate progress shows the current human-reviewed stage and next action."}
]'::jsonb,40),
('field-workspace','/field','Work safely when connectivity is weak','The field workspace makes network state explicit and never pretends queued work is uploaded.','[
 {"target":"#field-network","title":"Network state","text":"Offline means evidence is queued locally. Do not close the workflow until synchronization is confirmed."},
 {"target":"#field-photo","title":"Capture evidence","text":"Use the large touch target for a geotagged photo or upload a document."},
 {"target":"#field-queue","title":"Queue visibility","text":"Every queued item has a clear status and can be retried when connectivity returns."}
]'::jsonb,50)
on conflict(guide_key) do nothing;