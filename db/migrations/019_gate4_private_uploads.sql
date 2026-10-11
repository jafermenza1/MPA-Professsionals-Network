-- Gate 4: bounded, one-time private upload authorization for verification evidence.
create table if not exists private_upload_session (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_user(id) on delete restrict,
  object_key text not null unique,
  original_name text not null,
  content_type text not null,
  expected_byte_size bigint not null check (expected_byte_size > 0 and expected_byte_size <= 10485760),
  expected_checksum_sha256 text,
  upload_token_sha256 text not null,
  status text not null default 'authorized' check (status in ('authorized','uploaded','confirmed','expired')),
  actual_byte_size bigint,
  actual_checksum_sha256 text,
  file_object_id uuid unique references file_object(id) on delete restrict,
  expires_at timestamptz not null,
  uploaded_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ix_private_upload_session_user_status on private_upload_session(user_id,status,created_at desc);
