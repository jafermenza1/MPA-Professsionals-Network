-- Reconcile the service request agreed-price invariant using a forward-only migration.
-- Migration 012 introduced this constraint without rerun protection; do not rewrite that
-- historical migration. This migration safely normalizes the constraint on new and legacy schemas.
alter table service_request
  drop constraint if exists service_request_agreed_price_check;

alter table service_request
  add constraint service_request_agreed_price_check
  check (agreed_price is null or agreed_price >= 0);
