-- AllocationChecker Database Schema
-- Run this in the Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- stocks
-- ============================================================
CREATE TABLE IF NOT EXISTS stocks (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  symbol        TEXT NOT NULL UNIQUE,
  exchange      TEXT,
  market        TEXT NOT NULL CHECK (market IN ('US', 'KR')),
  name          TEXT NOT NULL,
  currency      TEXT NOT NULL CHECK (currency IN ('USD', 'KRW')),
  last_fetched_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE stocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stocks_public_read" ON stocks
  FOR SELECT USING (true);

CREATE POLICY "stocks_public_insert" ON stocks
  FOR INSERT WITH CHECK (true);

CREATE POLICY "stocks_public_update" ON stocks
  FOR UPDATE USING (true);

-- ============================================================
-- dividends
-- ============================================================
CREATE TABLE IF NOT EXISTS dividends (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stock_id         UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  ex_dividend_date DATE NOT NULL,
  payment_date     DATE,
  dividend_amount  NUMERIC(12, 6) NOT NULL,
  frequency        TEXT CHECK (frequency IN ('annual', 'semi-annual', 'quarterly', 'monthly')),
  source           TEXT NOT NULL CHECK (source IN ('fmp', 'yahoo')),
  is_estimated     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (stock_id, ex_dividend_date)
);

ALTER TABLE dividends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dividends_public_read" ON dividends
  FOR SELECT USING (true);

CREATE POLICY "dividends_public_insert" ON dividends
  FOR INSERT WITH CHECK (true);

CREATE POLICY "dividends_public_update" ON dividends
  FOR UPDATE USING (true);

-- ============================================================
-- api_cache
-- ============================================================
CREATE TABLE IF NOT EXISTS api_cache (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cache_key  TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE api_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_cache_public" ON api_cache
  FOR ALL USING (true);

-- ============================================================
-- portfolio_holdings
-- ============================================================
CREATE TABLE IF NOT EXISTS portfolio_holdings (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stock_id     UUID NOT NULL REFERENCES stocks(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES auth.users(id),   -- NULL until auth is added
  shares       NUMERIC(14, 4) NOT NULL CHECK (shares > 0),
  average_cost NUMERIC(14, 4),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE portfolio_holdings ENABLE ROW LEVEL SECURITY;

-- Open policy — replace with user_id = auth.uid() once auth is added
CREATE POLICY "portfolio_public_read" ON portfolio_holdings
  FOR SELECT USING (true);

CREATE POLICY "portfolio_public_insert" ON portfolio_holdings
  FOR INSERT WITH CHECK (true);

CREATE POLICY "portfolio_public_update" ON portfolio_holdings
  FOR UPDATE USING (true);

CREATE POLICY "portfolio_public_delete" ON portfolio_holdings
  FOR DELETE USING (true);

-- ============================================================
-- accounts
-- ============================================================
CREATE TABLE IF NOT EXISTS accounts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('ISA','연금저축','퇴직연금','일반','기타')),
  user_id    UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "open" ON accounts USING (true) WITH CHECK (true);

-- account_id 컬럼 추가 (이미 테이블이 있는 경우 ALTER TABLE로 실행)
ALTER TABLE portfolio_holdings
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_dividends_stock_id ON dividends(stock_id);
CREATE INDEX IF NOT EXISTS idx_dividends_ex_date ON dividends(ex_dividend_date);
CREATE INDEX IF NOT EXISTS idx_portfolio_stock_id ON portfolio_holdings(stock_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_account_id ON portfolio_holdings(account_id);
CREATE INDEX IF NOT EXISTS idx_api_cache_key ON api_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_api_cache_expires ON api_cache(expires_at);

-- ============================================================
-- infinite_buy_records (무한매수법 매수 기록)
-- ============================================================
CREATE TABLE IF NOT EXISTS infinite_buy_records (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol       TEXT NOT NULL,
  buy_date     DATE NOT NULL,
  price        NUMERIC(14, 4) NOT NULL,
  shares       NUMERIC(14, 6) NOT NULL,
  amount       NUMERIC(14, 4) NOT NULL,
  capital      NUMERIC(14, 4) NOT NULL,
  n            INTEGER NOT NULL,
  target_rate  NUMERIC(6, 4) NOT NULL,
  user_id      UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE infinite_buy_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "infinite_buy_public_read" ON infinite_buy_records
  FOR SELECT USING (true);

CREATE POLICY "infinite_buy_public_insert" ON infinite_buy_records
  FOR INSERT WITH CHECK (true);

CREATE POLICY "infinite_buy_public_update" ON infinite_buy_records
  FOR UPDATE USING (true);

CREATE POLICY "infinite_buy_public_delete" ON infinite_buy_records
  FOR DELETE USING (true);

CREATE INDEX IF NOT EXISTS idx_infinite_buy_symbol ON infinite_buy_records(symbol);
CREATE INDEX IF NOT EXISTS idx_infinite_buy_user ON infinite_buy_records(user_id);

-- ============================================================
-- fibonacci_reports (피보나치 되돌림 리포트)
-- ============================================================
CREATE TABLE IF NOT EXISTS fibonacci_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date  DATE NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  us_data      JSONB NOT NULL DEFAULT '[]',
  kr_data      JSONB NOT NULL DEFAULT '[]',
  indices_data JSONB NOT NULL DEFAULT '[]'
);

ALTER TABLE fibonacci_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fibonacci_reports_public_read" ON fibonacci_reports
  FOR SELECT USING (true);

CREATE POLICY "fibonacci_reports_public_insert" ON fibonacci_reports
  FOR INSERT WITH CHECK (true);

CREATE POLICY "fibonacci_reports_public_update" ON fibonacci_reports
  FOR UPDATE USING (true);

CREATE INDEX IF NOT EXISTS idx_fibonacci_reports_date ON fibonacci_reports(report_date DESC);

-- ============================================================
-- premium_users (유료 구독 사용자)
-- ============================================================
CREATE TABLE IF NOT EXISTS premium_users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  username     TEXT NOT NULL UNIQUE,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE premium_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "premium_users_public_read" ON premium_users
  FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS idx_premium_users_user_id ON premium_users(user_id);
CREATE INDEX IF NOT EXISTS idx_premium_users_username ON premium_users(username);
