-- 신호 전략 자동매매 설정 테이블
CREATE TABLE IF NOT EXISTS signal_trade_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol VARCHAR(20) NOT NULL,
  broker_type VARCHAR(20) NOT NULL,
  strategy_type VARCHAR(30) NOT NULL,  -- 'ma-alignment' | 'dual-rsi' | 'rsi-divergence' | 'inverse-alignment'

  -- 진입 조건
  min_sync_rate INTEGER DEFAULT 60,     -- 최소 싱크로율 (0-100)

  -- 청산 조건
  take_profit_pct DECIMAL(5,2),         -- 목표 수익률 % (예: 10.00)
  stop_loss_pct DECIMAL(5,2),           -- 손절선 % (예: -5.00, 음수로 저장)
  max_hold_days INTEGER,                -- 최대 보유일 (null = 무제한)
  exit_on_signal_loss BOOLEAN DEFAULT false,  -- 신호 소멸 시 청산

  -- 투자 설정
  investment_amount DECIMAL(15,2) NOT NULL,   -- 1회 투자금
  max_positions INTEGER DEFAULT 1,            -- 동시 최대 포지션 수

  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 신호 전략 포지션 테이블
CREATE TABLE IF NOT EXISTS signal_trade_positions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_id UUID REFERENCES signal_trade_settings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol VARCHAR(20) NOT NULL,
  broker_type VARCHAR(20) NOT NULL,

  -- 포지션 정보
  entry_price DECIMAL(15,4) NOT NULL,
  shares DECIMAL(15,4) NOT NULL,
  entry_date DATE NOT NULL,
  entry_signal_type VARCHAR(30) NOT NULL,
  entry_sync_rate INTEGER,

  -- 상태
  status VARCHAR(20) DEFAULT 'open',  -- 'open' | 'closed'
  exit_price DECIMAL(15,4),
  exit_date DATE,
  exit_reason VARCHAR(50),  -- 'take_profit' | 'stop_loss' | 'max_hold' | 'signal_loss' | 'manual'
  realized_pnl DECIMAL(15,4),  -- 실현 손익 (금액)
  realized_pnl_pct DECIMAL(8,4),  -- 실현 손익률 (%)

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_signal_trade_settings_user ON signal_trade_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_signal_trade_settings_enabled ON signal_trade_settings(is_enabled) WHERE is_enabled = true;
CREATE INDEX IF NOT EXISTS idx_signal_trade_positions_user ON signal_trade_positions(user_id);
CREATE INDEX IF NOT EXISTS idx_signal_trade_positions_status ON signal_trade_positions(status) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_signal_trade_positions_setting ON signal_trade_positions(setting_id);

-- RLS 정책
ALTER TABLE signal_trade_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_trade_positions ENABLE ROW LEVEL SECURITY;

-- signal_trade_settings RLS
CREATE POLICY "Users can view own signal_trade_settings"
  ON signal_trade_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own signal_trade_settings"
  ON signal_trade_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own signal_trade_settings"
  ON signal_trade_settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own signal_trade_settings"
  ON signal_trade_settings FOR DELETE
  USING (auth.uid() = user_id);

-- signal_trade_positions RLS
CREATE POLICY "Users can view own signal_trade_positions"
  ON signal_trade_positions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own signal_trade_positions"
  ON signal_trade_positions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own signal_trade_positions"
  ON signal_trade_positions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own signal_trade_positions"
  ON signal_trade_positions FOR DELETE
  USING (auth.uid() = user_id);

-- Service role 정책 (cron 작업용)
CREATE POLICY "Service role can manage signal_trade_settings"
  ON signal_trade_settings FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can manage signal_trade_positions"
  ON signal_trade_positions FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');
