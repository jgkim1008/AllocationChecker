-- auto_trade_settings에 broker_credential_id 추가
ALTER TABLE auto_trade_settings
  ADD COLUMN IF NOT EXISTS broker_credential_id UUID REFERENCES broker_credentials(id) ON DELETE SET NULL;
