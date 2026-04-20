-- telegram_subscribers에 user_id 컬럼 추가
-- 사용자별 DCA 알림을 위해 필요

ALTER TABLE telegram_subscribers
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 인덱스: user_id로 조회
CREATE INDEX IF NOT EXISTS idx_telegram_subscribers_user_id
  ON telegram_subscribers(user_id) WHERE user_id IS NOT NULL;
