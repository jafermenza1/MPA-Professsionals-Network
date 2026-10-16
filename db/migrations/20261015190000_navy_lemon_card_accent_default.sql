BEGIN;

-- New installations should start with the shared navy/lemon brand. Existing saved
-- membership-card settings are intentionally preserved; do not overwrite custom choices.
ALTER TABLE membership_card_settings
  ALTER COLUMN accent_color SET DEFAULT '#E5F044';

COMMIT;
