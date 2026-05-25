-- 스마트 LOC 스킵 옵션
-- ON일 때: 오늘 filled 주문 수가 해당 날 예상 주문 수 이상이면 LOC 추가 제출 건너뜀
ALTER TABLE auto_trade_settings
  ADD COLUMN IF NOT EXISTS smart_skip_loc BOOLEAN DEFAULT false;

COMMENT ON COLUMN auto_trade_settings.smart_skip_loc IS
  '스마트 스킵: 오늘 체결 수 >= 일일 예상 주문 수면 추가 LOC 주문 제출 안 함';
