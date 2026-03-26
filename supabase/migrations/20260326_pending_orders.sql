-- pending_orders 테이블 (체결 대기 주문)
-- 자동매매 주문 제출 후 체결 확인까지 추적

CREATE TABLE IF NOT EXISTS pending_orders (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES auth.users(id),
  broker_type    TEXT NOT NULL CHECK (broker_type IN ('kis', 'kiwoom')),
  broker_order_id TEXT NOT NULL,           -- 증권사 주문번호
  symbol         TEXT NOT NULL,
  symbol_name    TEXT,
  market         TEXT NOT NULL CHECK (market IN ('domestic', 'overseas')),
  side           TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  order_type     TEXT NOT NULL CHECK (order_type IN ('market', 'limit', 'loc')),
  order_quantity NUMERIC(14, 6) NOT NULL,
  order_price    NUMERIC(14, 4) NOT NULL,
  status         TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'partial', 'filled', 'cancelled', 'rejected', 'expired')),
  filled_quantity NUMERIC(14, 6) DEFAULT 0,
  filled_price   NUMERIC(14, 4),
  filled_amount  NUMERIC(14, 4),
  -- 무한매수법 관련 정보
  strategy_version TEXT CHECK (strategy_version IN ('V2.2', 'V3.0')),
  capital        NUMERIC(14, 4),
  cycle_number   INTEGER,
  round_number   INTEGER,
  reason         TEXT,                     -- 주문 사유 (예: "40분할 1회차")
  -- 시간 정보
  order_time     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  filled_time    TIMESTAMPTZ,
  checked_at     TIMESTAMPTZ,              -- 마지막 체결 확인 시간
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pending_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pending_orders_public_read" ON pending_orders
  FOR SELECT USING (true);

CREATE POLICY "pending_orders_public_insert" ON pending_orders
  FOR INSERT WITH CHECK (true);

CREATE POLICY "pending_orders_public_update" ON pending_orders
  FOR UPDATE USING (true);

CREATE POLICY "pending_orders_public_delete" ON pending_orders
  FOR DELETE USING (true);

CREATE INDEX IF NOT EXISTS idx_pending_orders_user ON pending_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_pending_orders_status ON pending_orders(status);
CREATE INDEX IF NOT EXISTS idx_pending_orders_market ON pending_orders(market);
CREATE INDEX IF NOT EXISTS idx_pending_orders_symbol ON pending_orders(symbol);
CREATE INDEX IF NOT EXISTS idx_pending_orders_order_time ON pending_orders(order_time DESC);
