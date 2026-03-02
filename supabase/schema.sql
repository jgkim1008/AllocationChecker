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
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_dividends_stock_id ON dividends(stock_id);
CREATE INDEX IF NOT EXISTS idx_dividends_ex_date ON dividends(ex_dividend_date);
CREATE INDEX IF NOT EXISTS idx_portfolio_stock_id ON portfolio_holdings(stock_id);
CREATE INDEX IF NOT EXISTS idx_api_cache_key ON api_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_api_cache_expires ON api_cache(expires_at);
