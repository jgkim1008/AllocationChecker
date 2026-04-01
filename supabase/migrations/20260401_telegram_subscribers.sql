-- Telegram 구독자 테이블
-- 마감 알림을 받을 사용자의 chat_id 저장

CREATE TABLE IF NOT EXISTS telegram_subscribers (
  id SERIAL PRIMARY KEY,
  chat_id BIGINT NOT NULL UNIQUE,
  username VARCHAR(255),
  subscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 인덱스: 활성 구독자 조회용
CREATE INDEX IF NOT EXISTS idx_telegram_subscribers_active
  ON telegram_subscribers(is_active) WHERE is_active = TRUE;

-- RLS 정책 (서비스 롤 전용)
ALTER TABLE telegram_subscribers ENABLE ROW LEVEL SECURITY;

-- 서비스 롤은 모든 작업 허용
CREATE POLICY "Service role has full access to telegram_subscribers"
  ON telegram_subscribers
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
