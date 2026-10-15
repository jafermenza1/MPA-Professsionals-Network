-- Membership-card profile image, verifiable opaque QR token versioning, and editable card branding.
-- Existing membership numbers and application tracking references are intentionally unchanged.
alter table professional_profile
  add column if not exists profile_picture_file_id uuid references file_object(id) on delete set null;
create index if not exists ix_professional_profile_picture_file
  on professional_profile(profile_picture_file_id)
  where profile_picture_file_id is not null;

alter table membership_record
  add column if not exists card_token_version integer not null default 1
  check (card_token_version > 0);

create table if not exists membership_card_settings (
  id smallint primary key default 1 check (id = 1),
  header_text varchar(120) not null default 'Muslim Professionals Association',
  subtitle_text varchar(80) not null default 'Membership ID',
  footer_text varchar(180) not null default 'Verify membership using the QR code',
  background_style varchar(24) not null default 'geometric'
    check (background_style in ('geometric','gradient','midnight')),
  background_start varchar(7) not null default '#0A3258'
    check (background_start ~ '^#[0-9A-Fa-f]{6}$'),
  background_end varchar(7) not null default '#174A78'
    check (background_end ~ '^#[0-9A-Fa-f]{6}$'),
  accent_color varchar(7) not null default '#97C024'
    check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  text_color varchar(7) not null default '#FFFFFF'
    check (text_color ~ '^#[0-9A-Fa-f]{6}$'),
  show_membership_type boolean not null default true,
  updated_by uuid references app_user(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into membership_card_settings(id) values(1) on conflict(id) do nothing;
