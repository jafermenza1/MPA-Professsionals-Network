-- Backfill legacy underscore-style event codes into the action-center taxonomy.
-- Additive only: preserve event identity, timestamps, read/archive state, and existing payloads.
UPDATE notification_event
SET category = CASE
  WHEN event_code LIKE 'security.%' OR event_code LIKE 'security!_%' ESCAPE '!'
       OR resource_type IN ('security_event','auth_session','one_time_session_link') THEN 'security'
  WHEN event_code LIKE 'membership.%' OR event_code LIKE 'membership!_%' ESCAPE '!'
       OR resource_type LIKE 'membership!_%' ESCAPE '!' OR resource_type IN ('membership_record','payment_transaction') THEN 'membership'
  WHEN event_code LIKE 'verification.%' OR event_code LIKE 'verification!_%' ESCAPE '!'
       OR resource_type LIKE 'verification!_%' ESCAPE '!' OR resource_type IN ('verification_case','verification_claim','verification_decision','verification_appeal') THEN 'verification'
  WHEN event_code LIKE 'opportunity.%' OR event_code LIKE 'opportunity!_%' ESCAPE '!'
       OR resource_type LIKE 'opportunity!_%' ESCAPE '!' THEN 'opportunities'
  WHEN event_code LIKE 'organization.%' OR event_code LIKE 'organization!_%' ESCAPE '!'
       OR resource_type LIKE 'organization!_%' ESCAPE '!' OR resource_type LIKE 'organization%' THEN 'organizations'
  WHEN event_code LIKE 'job.%' OR event_code LIKE 'job!_%' ESCAPE '!'
       OR event_code LIKE 'employer.%' OR event_code LIKE 'employer!_%' ESCAPE '!'
       OR resource_type LIKE 'job!_%' ESCAPE '!' THEN 'recruitment'
  WHEN event_code LIKE 'mentor.%' OR event_code LIKE 'mentor!_%' ESCAPE '!'
       OR event_code LIKE 'mentorship.%' OR event_code LIKE 'mentorship!_%' ESCAPE '!'
       OR resource_type LIKE 'mentor!_%' ESCAPE '!' OR resource_type LIKE 'mentorship!_%' ESCAPE '!'
       OR resource_type='mentorship' THEN 'mentorship'
  WHEN event_code LIKE 'service.%' OR event_code LIKE 'service!_%' ESCAPE '!'
       OR resource_type LIKE 'service!_%' ESCAPE '!' THEN 'services'
  WHEN event_code LIKE 'event.%' OR event_code LIKE 'event!_%' ESCAPE '!'
       OR event_code LIKE 'learning.%' OR event_code LIKE 'learning!_%' ESCAPE '!' THEN 'events_learning'
  ELSE category
END,
title=coalesce(title,initcap(replace(replace(event_code,'.',' '),'_',' '))),
body=coalesce(body,payload->>'message',payload->>'summary',payload->>'nextAction',payload->>'next_action',
  CASE WHEN payload ? 'status' THEN 'Status updated: '||replace(replace(payload->>'status','_',' '),'-',' ')
       ELSE 'There is an update to review in your MPA Network account.' END),
action_required=action_required OR payload->>'actionRequired'='true' OR payload->>'action_required'='true'
  OR coalesce(nullif(payload->>'nextAction',''),'')<>'' OR coalesce(nullif(payload->>'next_action',''),'')<>'';

UPDATE notification_event
SET action_url=coalesce(action_url,CASE category
  WHEN 'membership' THEN '/membership'
  WHEN 'verification' THEN '/verification'
  WHEN 'opportunities' THEN '/jobs'
  WHEN 'recruitment' THEN CASE WHEN resource_type='job_application' AND payload->>'audience'='employer' THEN '/recruitment' ELSE '/jobs' END
  WHEN 'organizations' THEN '/organizations'
  WHEN 'mentorship' THEN '/mentorship'
  WHEN 'services' THEN '/services'
  WHEN 'security' THEN '/profile'
  ELSE NULL
END)
WHERE action_url IS NULL;
