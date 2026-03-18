-- 오일전문가 가치투자 전략 스캔 결과 테이블
CREATE TABLE IF NOT EXISTS value_scan_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  market TEXT NOT NULL,
  total_score NUMERIC NOT NULL DEFAULT 0,
  grade TEXT NOT NULL DEFAULT 'D',
  -- 점수 breakdown
  score_per NUMERIC DEFAULT 0,
  score_pbr NUMERIC DEFAULT 0,
  score_profit_sustainability NUMERIC DEFAULT 0,
  score_cross_listed NUMERIC DEFAULT 0,
  score_dividend_yield NUMERIC DEFAULT 0,
  score_quarterly_dividend NUMERIC DEFAULT 0,
  score_dividend_streak NUMERIC DEFAULT 0,
  score_buyback_active NUMERIC DEFAULT 0,
  score_buyback_ratio NUMERIC DEFAULT 0,
  score_treasury_ratio NUMERIC DEFAULT 0,
  score_growth_potential NUMERIC DEFAULT 0,
  score_management NUMERIC DEFAULT 0,
  score_global_brand NUMERIC DEFAULT 0,
  -- 원본 데이터
  per NUMERIC,
  pbr NUMERIC,
  dividend_yield NUMERIC,
  dividend_streak INTEGER DEFAULT 0,
  roe NUMERIC,
  revenue_growth NUMERIC,
  market_cap NUMERIC,
  shares_outstanding NUMERIC,
  float_shares NUMERIC,
  raw_data JSONB,
  scanned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(symbol)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS value_scan_results_grade_idx ON value_scan_results(grade);
CREATE INDEX IF NOT EXISTS value_scan_results_total_score_idx ON value_scan_results(total_score DESC);
CREATE INDEX IF NOT EXISTS value_scan_results_market_idx ON value_scan_results(market);
CREATE INDEX IF NOT EXISTS value_scan_results_scanned_at_idx ON value_scan_results(scanned_at DESC);

-- RLS
ALTER TABLE value_scan_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "value_scan_results_read_all" ON value_scan_results FOR SELECT USING (true);
CREATE POLICY "value_scan_results_service_write" ON value_scan_results FOR ALL USING (true);
