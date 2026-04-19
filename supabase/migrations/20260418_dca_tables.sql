-- DCA 전략 테이블

CREATE TABLE IF NOT EXISTS dca_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  broker_type TEXT NOT NULL,
  market TEXT NOT NULL CHECK (market IN ('domestic', 'overseas')),
  daily_quantity NUMERIC(14,6) NOT NULL,
  threshold1_pct NUMERIC(5,2) NOT NULL DEFAULT -1.0,
  threshold2_pct NUMERIC(5,2) NOT NULL DEFAULT -2.0,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, symbol)
);

CREATE TABLE IF NOT EXISTS dca_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  symbol TEXT NOT NULL,
  trade_date DATE NOT NULL,
  price NUMERIC(14,4) NOT NULL,
  shares NUMERIC(14,6) NOT NULL,
  amount NUMERIC(14,4) NOT NULL,
  order_type TEXT NOT NULL CHECK (order_type IN ('limit', 'loc')),
  threshold_pct NUMERIC(5,2),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE dca_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE dca_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_dca_settings" ON dca_settings FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all_dca_records" ON dca_records FOR ALL TO service_role USING (true);
CREATE POLICY "users_own_dca_settings" ON dca_settings FOR ALL TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users_own_dca_records" ON dca_records FOR ALL TO authenticated USING (auth.uid() = user_id);
