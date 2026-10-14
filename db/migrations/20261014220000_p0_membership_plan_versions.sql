-- P0: immutable, effective-dated membership plan terms.
alter table membership_fee_rule add column if not exists plan_name text;
alter table membership_fee_rule add column if not exists plan_description text;
alter table membership_fee_rule add column if not exists billing_model text;
alter table membership_fee_rule add column if not exists duration_days integer;
alter table membership_fee_rule add column if not exists renewal_required boolean;
alter table membership_fee_rule add column if not exists grace_period_days integer;
alter table membership_fee_rule add column if not exists benefits jsonb;
alter table membership_fee_rule add column if not exists eligibility jsonb;

update membership_fee_rule r
set plan_name=coalesce(r.plan_name,p.name),
    plan_description=coalesce(r.plan_description,p.description),
    billing_model=coalesce(r.billing_model,p.billing_model),
    duration_days=coalesce(r.duration_days,p.duration_days),
    renewal_required=coalesce(r.renewal_required,p.renewal_required),
    grace_period_days=coalesce(r.grace_period_days,p.grace_period_days),
    benefits=coalesce(r.benefits,p.benefits),
    eligibility=coalesce(r.eligibility,p.eligibility)
from membership_product p
where p.id=r.membership_product_id;

insert into membership_fee_rule(
  membership_product_id,version,base_amount,currency,billing_period,effective_from,effective_to,
  plan_name,plan_description,billing_model,duration_days,renewal_required,grace_period_days,benefits,eligibility
)
select p.id,1,p.price,p.currency,p.billing_model,coalesce(p.effective_from,current_date),p.effective_to,
       p.name,p.description,p.billing_model,p.duration_days,p.renewal_required,p.grace_period_days,p.benefits,p.eligibility
from membership_product p
where not exists(select 1 from membership_fee_rule r where r.membership_product_id=p.id);
