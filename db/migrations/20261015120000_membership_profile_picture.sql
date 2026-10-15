-- Professional profile pictures use the existing private-file upload and access controls.
alter table professional_profile add column if not exists profile_picture_file_id uuid references file_object(id) on delete set null;
create index if not exists ix_professional_profile_picture_file on professional_profile(profile_picture_file_id) where profile_picture_file_id is not null;
