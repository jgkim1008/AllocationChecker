-- DCA 주문 모드 추가 (threshold: 지정가+LOC폴백, loc_only: 매일 LOC)
ALTER TABLE dca_settings
  ADD COLUMN IF NOT EXISTS order_mode TEXT NOT NULL DEFAULT 'threshold'
    CHECK (order_mode IN ('threshold', 'loc_only'));
