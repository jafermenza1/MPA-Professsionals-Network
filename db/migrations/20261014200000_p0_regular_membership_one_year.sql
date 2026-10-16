-- P0: the standard/basic membership is valid for one year.
-- This changes plan configuration only; historical applications retain their fee snapshots.
update membership_product
set duration_days = 365,
    updated_at = now()
where upper(product_code) in ('BASIC', 'REGULAR')
  and duration_days is distinct from 365;
