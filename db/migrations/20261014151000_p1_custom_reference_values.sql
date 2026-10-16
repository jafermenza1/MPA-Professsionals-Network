-- P1 follow-up: preserve user-entered values when a reference field is set to Other.
ALTER TABLE professional_profile_reference ADD COLUMN IF NOT EXISTS custom_value text;
ALTER TABLE professional_education ADD COLUMN IF NOT EXISTS education_level_custom text;
