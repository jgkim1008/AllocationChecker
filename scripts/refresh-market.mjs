import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function updateStock(symbol, market) {
  let ticker = symbol;
  if (market === 'KR') {
    ticker = `${symbol}.KS`;
  }

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1y&interval=1d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });

    if (!res.ok) {
      console.log(`❌ ${symbol}: HTTP ${res.status}`);
      return false;
    }

    const data = await res.json();
    const result = data?.chart?.result?.[0];

    if (!result) {
      console.log(`❌ ${symbol}: No data`);
      return false;
    }

    const meta = result.meta;
    const quote = result.indicators?.quote?.[0];
    const highs = (quote?.high ?? []).filter(h => h !== null);
    const lows = (quote?.low ?? []).filter(l => l !== null);

    const currentPrice = meta.regularMarketPrice || meta.chartPreviousClose;
    const yearHigh = highs.length > 0 ? Math.max(...highs) : null;
    const yearLow = lows.length > 0 ? Math.min(...lows) : null;

    if (currentPrice && yearHigh && yearLow) {
      await supabase.from('stocks').update({
        current_price: currentPrice,
        year_high: yearHigh,
        year_low: yearLow,
        last_fetched_at: new Date().toISOString()
      }).eq('symbol', symbol);

      console.log(`✅ ${symbol}: $${currentPrice} (H:${yearHigh.toFixed(2)} L:${yearLow.toFixed(2)})`);
      return true;
    } else {
      console.log(`❌ ${symbol}: Missing price data`);
      return false;
    }
  } catch (e) {
    console.log(`❌ ${symbol}: ${e.message}`);
    return false;
  }
}

async function main() {
  // Get stocks with missing data
  const { data: stocks } = await supabase
    .from('stocks')
    .select('symbol, market')
    .or('current_price.is.null,year_high.is.null,year_low.is.null');

  console.log(`Found ${stocks.length} stocks with missing data\n`);

  let success = 0;
  let failed = 0;

  for (const s of stocks) {
    const ok = await updateStock(s.symbol, s.market);
    if (ok) success++;
    else failed++;

    // Rate limit: 500ms between requests
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\nDone! Success: ${success}, Failed: ${failed}`);
}

main();
