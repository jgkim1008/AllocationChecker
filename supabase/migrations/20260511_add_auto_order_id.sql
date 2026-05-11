-- 예약주문 ID 컬럼 추가 (익절/손절 예약주문 관리용)
ALTER TABLE signal_trade_positions
ADD COLUMN IF NOT EXISTS auto_order_id VARCHAR(50);

-- 인덱스 추가 (예약주문 ID로 조회)
CREATE INDEX IF NOT EXISTS idx_signal_trade_positions_auto_order
ON signal_trade_positions(auto_order_id)
WHERE auto_order_id IS NOT NULL;

COMMENT ON COLUMN signal_trade_positions.auto_order_id IS '한국투자증권 자동주문(익절/손절) 예약 ID';
