-- pending_orders strategy_version에 'dca' 추가
ALTER TABLE pending_orders DROP CONSTRAINT IF EXISTS pending_orders_strategy_version_check;
ALTER TABLE pending_orders ADD CONSTRAINT pending_orders_strategy_version_check
  CHECK (strategy_version IN ('V2.2', 'V3.0', 'V4.0', 'dca') OR strategy_version IS NULL);
