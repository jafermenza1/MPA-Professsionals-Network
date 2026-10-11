insert into ui_guide_tour(guide_key,route_pattern,title,description,steps,sort_order) values
('profile-controls','/profile','Manage your trust boundary','Control what is public, what stays private and how you connect to platform workflows.','[
 {"target":"#mpa-brand","title":"Return home","text":"Use the global navigation to leave settings without losing your account context."},
 {"target":"#mpa-search","title":"Find opportunities","text":"The same universal search is available from every workspace."},
 {"target":"#mpa-help","title":"Repeat this lesson","text":"Use Guide whenever you need a refresher."}
]'::jsonb,60),
('organization-onboarding','/organizations','Onboard an organization','Move from registration to evidence review and verified partner status.','[
 {"target":"#org-registration","title":"Start with identity","text":"Enter the legal organization identity and permitted public details."},
 {"target":"#org-evidence","title":"Add evidence privately","text":"Supporting documents belong in the verification boundary, not the public profile."}
]'::jsonb,70),
('service-delivery','/services','Deliver a professional service','Follow the engagement from discovery through completion and feedback.','[
 {"target":"#service-discovery","title":"Discover capability","text":"Compare service listings and delivery modes before making a request."},
 {"target":"#service-request","title":"Watch the lifecycle","text":"Every transition is explicit: request, accept, in progress, complete."}
]'::jsonb,80),
('admin-experience','/admin','Operate the Experience Lab','Administrators control which demonstrations and walkthroughs are available to users.','[
 {"target":"#mpa-brand","title":"Stay in the workspace","text":"The global guide remains available while you manage scenarios."}
]'::jsonb,90)
on conflict(guide_key) do nothing;