-- One generalized public topic per private demand request; makes review retries safe.
CREATE UNIQUE INDEX IF NOT EXISTS uq_marketplace_demand_topic_source
 ON marketplace_demand_topic(source_demand_id) WHERE source_demand_id IS NOT NULL;
