-- A membership application may receive a replacement payment after a
-- previously submitted payment was refunded or reversed.
alter table membership_application_payment drop constraint if exists membership_application_payment_application_id_key;
create index if not exists ix_membership_application_payment_application
  on membership_application_payment(application_id,created_at desc);
