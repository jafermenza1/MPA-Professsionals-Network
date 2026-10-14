-- P0: immutable, effective-dated membership plan terms.
alter table membership_fee_rule add column if not exists plan_name text;
alter table membership_fee_rule add column if not exists plan_description text;
alter table membership_fee_rule add column if not exists billing_model text;
alter table membership_fee_rule add column if not exists duration_days integer;
alter table membership_fee_rule add column if not exists renewal_required boolean;
alter table membership_fee_rule add column if not exists grace_period_days integer;
alter table membership_fee_rule add column if not exists benefits jsonb;
alter table membership_fee_rule add column if not exists eligibility jsonb;
alter table membership_fee_rule add column if not exists terms_snapshot_complete boolean not null default false;

-- Existing fee history did not store every historical plan term. Backfill only
-- the rule currently in effect from the current plan configuration; do not
-- invent historical benefits/validity for older fee versions.
update membership_fee_rule r
set plan_name=coalesce(r.plan_name,p.name),
    plan_description=coalesce(r.plan_description,p.description),
    billing_model=coalesce(r.billing_model,p.billing_model),
    duration_days=coalesce(r.duration_days,p.duration_days),
    renewal_required=coalesce(r.renewal_required,p.renewal_required),
    grace_period_days=coalesce(r.grace_period_days,p.grace_period_days),
    benefits=coalesce(r.benefits,p.benefits),
    eligibility=coalesce(r.eligibility,p.eligibility),
    terms_snapshot_complete=true
from membership_product p
where p.id=r.membership_product_id
  and r.effective_from<=current_date and (r.effective_to is null or r.effective_to>=current_date)
  and r.id=(select current_rule.id from membership_fee_rule current_rule
    where current_rule.membership_product_id=p.id
      and current_rule.effective_from<=current_date
      and (current_rule.effective_to is null or current_rule.effective_to>=current_date)
    order by current_rule.effective_from desc,current_rule.version desc limit 1);

insert into membership_fee_rule(
  membership_product_id,version,base_amount,currency,billing_period,effective_from,effective_to,
  plan_name,plan_description,billing_model,duration_days,renewal_required,grace_period_days,benefits,eligibility,terms_snapshot_complete
)
select p.id,1,p.price,p.currency,p.billing_model,coalesce(p.effective_from,current_date),p.effective_to,
       p.name,p.description,p.billing_model,p.duration_days,p.renewal_required,p.grace_period_days,p.benefits,p.eligibility,true
from membership_product p
where not exists(select 1 from membership_fee_rule r where r.membership_product_id=p.id);
