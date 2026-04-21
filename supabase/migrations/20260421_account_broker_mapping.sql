-- 포트폴리오 계좌 ↔ 브로커 계좌 매핑 테이블
-- 2026-04-21

-- ============================================================
-- account_broker_mapping (1:1 매핑)
-- ============================================================
CREATE TABLE IF NOT EXISTS account_broker_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  broker_credential_id UUID NOT NULL REFERENCES broker_credentials(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id),           -- 1:1 매핑: 포트폴리오 계좌당 하나의 브로커만
  UNIQUE(broker_credential_id)  -- 1:1 매핑: 브로커 계좌당 하나의 포트폴리오만
);

ALTER TABLE account_broker_mapping ENABLE ROW LEVEL SECURITY;

-- RLS: 본인 데이터만 접근 (accounts 테이블의 user_id 참조)
CREATE POLICY "account_broker_mapping_own_select" ON account_broker_mapping
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM accounts a WHERE a.id = account_id AND a.user_id = auth.uid()
    )
  );

CREATE POLICY "account_broker_mapping_own_insert" ON account_broker_mapping
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM accounts a WHERE a.id = account_id AND a.user_id = auth.uid()
    )
  );

CREATE POLICY "account_broker_mapping_own_delete" ON account_broker_mapping
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM accounts a WHERE a.id = account_id AND a.user_id = auth.uid()
    )
  );

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_account_broker_mapping_account ON account_broker_mapping(account_id);
CREATE INDEX IF NOT EXISTS idx_account_broker_mapping_credential ON account_broker_mapping(broker_credential_id);
