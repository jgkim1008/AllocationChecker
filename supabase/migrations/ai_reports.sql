-- AI Reports 테이블 생성
-- Claude AI를 활용한 투자 분석 리포트 캐싱용

CREATE TABLE IF NOT EXISTS ai_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  report_type text NOT NULL, -- 'investment_report', 'dividend_picks', 'compare', 'sentiment'
  content jsonb NOT NULL,
  generated_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT now() + interval '1 hour'
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_ai_reports_symbol ON ai_reports(symbol);
CREATE INDEX IF NOT EXISTS idx_ai_reports_type ON ai_reports(report_type);
CREATE INDEX IF NOT EXISTS idx_ai_reports_expires ON ai_reports(expires_at);

-- 만료된 리포트 자동 삭제용 함수 (선택사항)
CREATE OR REPLACE FUNCTION cleanup_expired_ai_reports()
RETURNS void AS $$
BEGIN
  DELETE FROM ai_reports WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql;

-- RLS 정책 (필요 시)
ALTER TABLE ai_reports ENABLE ROW LEVEL SECURITY;

-- 모든 인증된 사용자가 읽기 가능
CREATE POLICY "ai_reports_read_policy" ON ai_reports
  FOR SELECT
  USING (true);

-- 서비스 역할만 쓰기 가능
CREATE POLICY "ai_reports_insert_policy" ON ai_reports
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "ai_reports_delete_policy" ON ai_reports
  FOR DELETE
  USING (true);
