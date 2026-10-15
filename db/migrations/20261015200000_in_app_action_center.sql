-- Action-center foundation: extend the existing notification ledger without replacing history.
-- Existing notification_event rows remain readable; no destructive backfill or delivery claim is made.
ALTER TABLE notification_event
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS body text,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS action_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS action_url text,
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS dedupe_key text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='notification_event_category_valid' AND conrelid='notification_event'::regclass) THEN
    ALTER TABLE notification_event ADD CONSTRAINT notification_event_category_valid
      CHECK (category IN ('membership','verification','opportunities','recruitment','organizations','mentorship','services','events_learning','security','system'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='notification_event_priority_valid' AND conrelid='notification_event'::regclass) THEN
    ALTER TABLE notification_event ADD CONSTRAINT notification_event_priority_valid
      CHECK (priority IN ('low','normal','high','urgent'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='notification_event_action_url_internal' AND conrelid='notification_event'::regclass) THEN
    ALTER TABLE notification_event ADD CONSTRAINT notification_event_action_url_internal
      CHECK (action_url IS NULL OR (left(action_url,1)='/' AND left(action_url,2)<>'//' AND action_url !~ '[[:cntrl:]]' AND position(chr(92) in action_url)=0));
  END IF;
END $$;

-- Backfill presentation metadata for historical events without deleting or rewriting event identity/history.
UPDATE notification_event
SET category = CASE
      WHEN event_code LIKE 'membership.%' THEN 'membership'
      WHEN event_code LIKE 'verification.%' THEN 'verification'
      WHEN event_code LIKE 'opportunity.%' THEN 'opportunities'
      WHEN event_code LIKE 'job.%' OR event_code LIKE 'job_application.%' OR event_code LIKE 'employer.%' THEN 'recruitment'
      WHEN event_code LIKE 'organization.%' THEN 'organizations'
      WHEN event_code LIKE 'mentor.%' OR event_code LIKE 'mentorship.%' THEN 'mentorship'
      WHEN event_code LIKE 'service.%' THEN 'services'
      WHEN event_code LIKE 'event.%' OR event_code LIKE 'learning.%' THEN 'events_learning'
      WHEN event_code LIKE 'security.%' THEN 'security'
      ELSE category
    END,
    title = coalesce(title, initcap(replace(replace(event_code,'.',' '),'_',' '))),
    body = coalesce(body, payload->>'message', payload->>'summary', payload->>'nextAction', payload->>'next_action',
      CASE WHEN payload ? 'status' THEN 'Status updated: ' || replace(replace(payload->>'status','_',' '),'-',' ')
           ELSE 'There is an update to review in your MPA Network account.' END),
    priority = CASE WHEN payload->>'priority' IN ('low','normal','high','urgent') THEN payload->>'priority' ELSE priority END,
    action_required = action_required OR payload->>'actionRequired'='true' OR payload->>'action_required'='true'
      OR coalesce(nullif(payload->>'nextAction',''),'')<>'' OR coalesce(nullif(payload->>'next_action',''),'')<>'';

CREATE INDEX IF NOT EXISTS ix_notification_event_inbox
  ON notification_event(user_id, created_at DESC, id)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_notification_event_unread
  ON notification_event(user_id, created_at DESC)
  WHERE read_at IS NULL AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_notification_event_action_required
  ON notification_event(user_id, priority, created_at DESC)
  WHERE action_required = true AND archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_event_dedupe
  ON notification_event(user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- Per-category in-app preferences are independent of email delivery preferences.
ALTER TABLE notification_preference
  ADD COLUMN IF NOT EXISTS in_app_categories jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS digest_enabled boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='notification_preference_categories_object' AND conrelid='notification_preference'::regclass) THEN
    ALTER TABLE notification_preference ADD CONSTRAINT notification_preference_categories_object
      CHECK (jsonb_typeof(in_app_categories) = 'object');
  END IF;
END $$;
