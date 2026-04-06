-- 월봉 10이평 전략 캐시 테이블
CREATE TABLE IF NOT EXISTS monthly_ma_cache (
  id TEXT PRIMARY KEY DEFAULT 'latest',
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS 정책
ALTER TABLE monthly_ma_cache ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 읽기 가능
CREATE POLICY "Allow public read" ON monthly_ma_cache
  FOR SELECT USING (true);

-- 인증된 사용자만 쓰기 가능 (또는 service role)
CREATE POLICY "Allow authenticated write" ON monthly_ma_cache
  FOR ALL USING (true);
