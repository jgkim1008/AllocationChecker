import { createServiceClient } from '@/lib/supabase/server';
import { getDividendHistory } from '@/lib/api/dividend-router';
import { detectMarket, getCurrency } from '@/lib/utils/market';
import type { NormalizedDividend } from '@/types/dividend';

// TTL constants in seconds
const TTL = {
  STOCK_META: 7 * 24 * 3600,
  DIVIDEND_HISTORY: 24 * 3600,
  UPCOMING_DIVIDENDS: 6 * 3600,
  CALENDAR_RANGE: 3600,
};

function cacheKey(type: string, ...parts: string[]): string {
  return `${type}:${parts.join(':')}`;
}

async function isCacheValid(key: string): Promise<boolean> {
  const supabase = await createServiceClient();
  const { data } = await supabase
    .from('api_cache')
    .select('expires_at')
    .eq('cache_key', key)
    .single();

  if (!data) return false;
  return new Date(data.expires_at) > new Date();
}

async function touchCache(key: string, ttlSeconds: number): Promise<void> {
  const supabase = await createServiceClient();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  await supabase
    .from('api_cache')
    .upsert({ cache_key: key, expires_at: expiresAt }, { onConflict: 'cache_key' });
}

/**
 * @param force true 시 캐시를 무시하고 외부 API에서 강제 재조회합니다.
 *              frequency=null로 저장된 기존 종목 재정비에 사용합니다.
 */
export async function getOrFetchDividends(symbol: string, force = false): Promise<NormalizedDividend[]> {
  const supabase = await createServiceClient();
  const key = cacheKey('dividends', symbol.toUpperCase());
  const valid = !force && await isCacheValid(key);

  if (valid) {
    // Return from DB cache
    const { data: stock } = await supabase
      .from('stocks')
      .select('id')
      .eq('symbol', symbol.toUpperCase())
      .single();

    if (stock) {
      const { data: dividends } = await supabase
        .from('dividends')
        .select('*')
        .eq('stock_id', stock.id)
        .order('ex_dividend_date', { ascending: false });

      if (dividends && dividends.length > 0) {
        const market = detectMarket(symbol);
        const currency = getCurrency(market);

        return dividends.map((d) => ({
          symbol: symbol.toUpperCase(),
          market,
          exDividendDate: d.ex_dividend_date,
          paymentDate: d.payment_date,
          dividendAmount: d.dividend_amount,
          frequency: d.frequency as NormalizedDividend['frequency'],
          currency,
          source: d.source as NormalizedDividend['source'],
        }));
      }
    }
  }

  // Fetch from external API
  const dividends = await getDividendHistory(symbol);
  if (dividends.length === 0) return [];

  // Upsert stock record
  const market = detectMarket(symbol);
  const currency = getCurrency(market);

  const { data: stock } = await supabase
    .from('stocks')
    .upsert(
      {
        symbol: symbol.toUpperCase(),
        market,
        currency,
        name: symbol.toUpperCase(),
        last_fetched_at: new Date().toISOString(),
      },
      { onConflict: 'symbol' }
    )
    .select('id')
    .single();

  if (stock) {
    // Upsert dividends — frequency도 함께 갱신 (force 시 기존 null → 감지값으로 업데이트)
    const rows = dividends.map((d) => ({
      stock_id: stock.id,
      ex_dividend_date: d.exDividendDate,
      payment_date: d.paymentDate,
      dividend_amount: d.dividendAmount,
      frequency: d.frequency,
      source: d.source,
      is_estimated: false,
    }));

    await supabase.from('dividends').upsert(rows, { onConflict: 'stock_id,ex_dividend_date' });
    await touchCache(key, TTL.DIVIDEND_HISTORY);
  }

  return dividends;
}
