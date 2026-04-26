-- 전략 스캔 결과 서버 캐시 테이블
-- cache_key: 전략별 고유 식별자 (예: weekly_sr_scan, decline_box_scan, forking_scan)
-- data: 스캔 결과 JSON 배열
-- created_at: 캐시 저장 시각 (TTL 계산에 사용)

CREATE TABLE IF NOT EXISTS strategy_cache (
  cache_key  TEXT        PRIMARY KEY,
  data       JSONB       NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- service role 만 읽기/쓰기 허용 (anon/authenticated 차단)
ALTER TABLE strategy_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON strategy_cache
  FOR ALL
  USING (true)
  WITH CHECK (true);
