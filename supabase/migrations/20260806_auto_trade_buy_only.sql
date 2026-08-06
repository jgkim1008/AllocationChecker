-- 매수전용 옵션
-- ON일 때: 자동매매 크론이 매도 주문(LOC+지정가)을 제출하지 않고 매수만 실행
ALTER TABLE auto_trade_settings
  ADD COLUMN IF NOT EXISTS buy_only BOOLEAN DEFAULT false;

COMMENT ON COLUMN auto_trade_settings.buy_only IS
  '매수전용: 크론이 매도 주문을 생략하고 매수(LOC)만 자동 제출';
