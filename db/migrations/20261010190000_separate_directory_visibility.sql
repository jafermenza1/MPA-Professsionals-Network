-- Keep account-profile audience and talent-directory audience independent.
-- Existing directory audience inherits the previous professional_profile visibility.
ALTER TABLE professional_profile
  ADD COLUMN IF NOT EXISTS directory_visibility text;

UPDATE professional_profile
SET directory_visibility = COALESCE(directory_visibility, visibility, 'members')
WHERE directory_visibility IS NULL;

ALTER TABLE professional_profile
  ALTER COLUMN directory_visibility SET DEFAULT 'members',
  ALTER COLUMN directory_visibility SET NOT NULL;

ALTER TABLE professional_profile
  DROP CONSTRAINT IF EXISTS professional_profile_directory_visibility_check;

ALTER TABLE professional_profile
  ADD CONSTRAINT professional_profile_directory_visibility_check
  CHECK (directory_visibility IN ('private', 'members', 'public'));
