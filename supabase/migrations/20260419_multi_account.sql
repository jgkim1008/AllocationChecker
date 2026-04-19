-- 다중 계좌 지원 마이그레이션
-- 2026-04-19

-- ============================================================
-- 1. broker_credentials에 account_alias 추가
-- ============================================================
ALTER TABLE broker_credentials ADD COLUMN IF NOT EXISTS account_alias TEXT NOT NULL DEFAULT 'default';

-- 기존 unique 제약 제거 후 새 제약으로 교체
ALTER TABLE broker_credentials DROP CONSTRAINT IF EXISTS broker_credentials_user_id_broker_type_key;
ALTER TABLE broker_credentials ADD CONSTRAINT broker_credentials_user_broker_alias_key
  UNIQUE(user_id, broker_type, account_alias);

-- ============================================================
-- 2. dca_settings에 broker_credential_id FK 추가
-- ============================================================
ALTER TABLE dca_settings ADD COLUMN IF NOT EXISTS broker_credential_id UUID REFERENCES broker_credentials(id) ON DELETE SET NULL;

-- 기존 데이터: broker_type 기반으로 broker_credential_id 채우기
UPDATE dca_settings ds
SET broker_credential_id = bc.id
FROM broker_credentials bc
WHERE bc.user_id = ds.user_id
  AND bc.broker_type = ds.broker_type
  AND ds.broker_credential_id IS NULL;

-- ============================================================
-- 3. pending_orders에 broker_credential_id FK 추가 (DCA 주문 추적용)
-- ============================================================
ALTER TABLE pending_orders ADD COLUMN IF NOT EXISTS broker_credential_id UUID REFERENCES broker_credentials(id) ON DELETE SET NULL;
