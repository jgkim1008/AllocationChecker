-- 브로커 자격증명 암호화 저장 + TOTP 2FA 테이블
-- 2026-04-10

-- ============================================================
-- broker_credentials (암호화된 자격증명)
-- ============================================================
CREATE TABLE IF NOT EXISTS broker_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  broker_type TEXT NOT NULL CHECK (broker_type IN ('kis', 'kiwoom')),
  encrypted_credentials TEXT NOT NULL,  -- AES-256-GCM 암호화된 JSON
  encryption_iv TEXT NOT NULL,          -- 초기화 벡터 (Base64)
  encryption_tag TEXT NOT NULL,         -- 인증 태그 (Base64)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, broker_type)
);

ALTER TABLE broker_credentials ENABLE ROW LEVEL SECURITY;

-- RLS: 본인 데이터만 접근
CREATE POLICY "broker_credentials_own_select" ON broker_credentials
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "broker_credentials_own_insert" ON broker_credentials
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "broker_credentials_own_update" ON broker_credentials
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "broker_credentials_own_delete" ON broker_credentials
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_broker_credentials_user ON broker_credentials(user_id);

-- ============================================================
-- user_totp_secrets (TOTP 시크릿 - 암호화 저장)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_totp_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  encrypted_secret TEXT NOT NULL,       -- AES-256-GCM 암호화된 시크릿
  encryption_iv TEXT NOT NULL,          -- 초기화 벡터 (Base64)
  encryption_tag TEXT NOT NULL,         -- 인증 태그 (Base64)
  is_verified BOOLEAN DEFAULT FALSE,    -- 최초 인증 완료 여부
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_totp_secrets ENABLE ROW LEVEL SECURITY;

-- RLS: 본인 데이터만 접근
CREATE POLICY "user_totp_secrets_own_select" ON user_totp_secrets
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_totp_secrets_own_insert" ON user_totp_secrets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_totp_secrets_own_update" ON user_totp_secrets
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "user_totp_secrets_own_delete" ON user_totp_secrets
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_totp_secrets_user ON user_totp_secrets(user_id);

-- ============================================================
-- credential_access_sessions (2시간 세션)
-- ============================================================
CREATE TABLE IF NOT EXISTS credential_access_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  session_token_hash TEXT NOT NULL,     -- SHA-256 해시된 세션 토큰
  expires_at TIMESTAMPTZ NOT NULL,      -- 만료 시간 (2시간)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE credential_access_sessions ENABLE ROW LEVEL SECURITY;

-- RLS: 본인 데이터만 접근
CREATE POLICY "credential_access_sessions_own_select" ON credential_access_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "credential_access_sessions_own_insert" ON credential_access_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "credential_access_sessions_own_update" ON credential_access_sessions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "credential_access_sessions_own_delete" ON credential_access_sessions
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_credential_access_sessions_user ON credential_access_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_credential_access_sessions_expires ON credential_access_sessions(expires_at);

-- 만료된 세션 자동 정리 (cron job 또는 수동 실행)
-- DELETE FROM credential_access_sessions WHERE expires_at < NOW();
