-- 증권사 API 설정 테이블
CREATE TABLE IF NOT EXISTS broker_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  broker_type VARCHAR(20) NOT NULL, -- 'kis' | 'kiwoom'
  credentials TEXT NOT NULL, -- JSON 문자열 (암호화 권장)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, broker_type)
);

-- 자동매매 설정 테이블
CREATE TABLE IF NOT EXISTS auto_trade_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol VARCHAR(20) NOT NULL,
  broker_type VARCHAR(20) NOT NULL,
  strategy_version VARCHAR(10) NOT NULL, -- 'V2.2' | 'V3.0'
  total_capital DECIMAL(15, 2) NOT NULL,
  current_cycle INTEGER DEFAULT 1,
  current_round INTEGER DEFAULT 0,
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, symbol)
);

-- 주문 기록 테이블
CREATE TABLE IF NOT EXISTS auto_trade_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol VARCHAR(20) NOT NULL,
  broker_type VARCHAR(20) NOT NULL,
  order_id VARCHAR(50), -- 증권사 주문번호
  side VARCHAR(10) NOT NULL, -- 'buy' | 'sell'
  order_type VARCHAR(10) NOT NULL, -- 'market' | 'limit' | 'loc'
  quantity INTEGER NOT NULL,
  order_price DECIMAL(15, 4),
  filled_price DECIMAL(15, 4),
  filled_quantity INTEGER DEFAULT 0,
  status VARCHAR(20) NOT NULL, -- 'pending' | 'submitted' | 'partial' | 'filled' | 'cancelled' | 'rejected'
  cycle_number INTEGER,
  round_number INTEGER,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  executed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_broker_configs_user ON broker_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_auto_trade_settings_user ON auto_trade_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_auto_trade_settings_symbol ON auto_trade_settings(user_id, symbol);
CREATE INDEX IF NOT EXISTS idx_auto_trade_orders_user ON auto_trade_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_auto_trade_orders_symbol ON auto_trade_orders(user_id, symbol);
CREATE INDEX IF NOT EXISTS idx_auto_trade_orders_date ON auto_trade_orders(created_at DESC);

-- RLS (Row Level Security) 정책
ALTER TABLE broker_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_trade_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_trade_orders ENABLE ROW LEVEL SECURITY;

-- 사용자 본인 데이터만 접근 가능
CREATE POLICY "Users can view own broker configs"
  ON broker_configs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own broker configs"
  ON broker_configs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own broker configs"
  ON broker_configs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own broker configs"
  ON broker_configs FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own auto trade settings"
  ON auto_trade_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own auto trade settings"
  ON auto_trade_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own auto trade settings"
  ON auto_trade_settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own auto trade settings"
  ON auto_trade_settings FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own orders"
  ON auto_trade_orders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own orders"
  ON auto_trade_orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own orders"
  ON auto_trade_orders FOR UPDATE
  USING (auth.uid() = user_id);

-- Service Role은 모든 데이터 접근 가능 (백엔드용)
CREATE POLICY "Service role full access broker_configs"
  ON broker_configs
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access auto_trade_settings"
  ON auto_trade_settings
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access auto_trade_orders"
  ON auto_trade_orders
  USING (auth.jwt() ->> 'role' = 'service_role');
