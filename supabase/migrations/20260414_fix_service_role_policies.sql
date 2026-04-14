-- Service Role 정책 수정: INSERT 권한 추가
-- 기존 정책은 USING만 있어서 SELECT/UPDATE/DELETE만 가능했음

-- 기존 정책 삭제
DROP POLICY IF EXISTS "Service role full access broker_configs" ON broker_configs;
DROP POLICY IF EXISTS "Service role full access auto_trade_settings" ON auto_trade_settings;
DROP POLICY IF EXISTS "Service role full access auto_trade_orders" ON auto_trade_orders;

-- Service Role 전체 접근 정책 (SELECT, UPDATE, DELETE)
CREATE POLICY "Service role can select broker_configs"
  ON broker_configs FOR SELECT
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can update broker_configs"
  ON broker_configs FOR UPDATE
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can delete broker_configs"
  ON broker_configs FOR DELETE
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can insert broker_configs"
  ON broker_configs FOR INSERT
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- auto_trade_settings
CREATE POLICY "Service role can select auto_trade_settings"
  ON auto_trade_settings FOR SELECT
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can update auto_trade_settings"
  ON auto_trade_settings FOR UPDATE
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can delete auto_trade_settings"
  ON auto_trade_settings FOR DELETE
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can insert auto_trade_settings"
  ON auto_trade_settings FOR INSERT
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- auto_trade_orders
CREATE POLICY "Service role can select auto_trade_orders"
  ON auto_trade_orders FOR SELECT
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can update auto_trade_orders"
  ON auto_trade_orders FOR UPDATE
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can delete auto_trade_orders"
  ON auto_trade_orders FOR DELETE
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can insert auto_trade_orders"
  ON auto_trade_orders FOR INSERT
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');
