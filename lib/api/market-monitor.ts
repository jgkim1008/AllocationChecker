import { createServiceClient } from '@/lib/supabase/server';

const POLYGON_KEY = process.env.POLYGON_API_KEY;
const FMP_KEY = process.env.FMP_API_KEY;

const INDICES = [
  { symbol: '^GSPC', name: 'S&P 500', market: 'US' },
  { symbol: '^IXIC', name: 'NASDAQ Composite', market: 'US' },
  { symbol: '^KS11', name: 'KOSPI', market: 'KR' },
  { symbol: '^KQ11', name: 'KOSDAQ', market: 'KR' },
  { symbol: '^N225', name: 'Nikkei 225', market: 'JP' },
];

// S&P 500 시총 상위 100개 고정 목록 (FMP v3 screener 폐기 대응)
const TOP_US_SYMBOLS = [
  'AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','BRK.B','AVGO','JPM',
  'LLY','V','UNH','XOM','MA','COST','HD','PG','WMT','NFLX',
  'ORCL','BAC','CRM','CVX','KO','ABBV','MRK','AMD','PEP','ACN',
  'TMO','LIN','ADBE','MCD','CSCO','WFC','DHR','TXN','ABT','MS',
  'AMGN','IBM','GE','PM','ISRG','CAT','RTX','INTU','NOW','SPGI',
  'GS','BLK','HON','QCOM','NEE','LOW','AMAT','PFE','UBER','UNP',
  'ELV','T','DE','BKNG','SBUX','C','AXP','TJX','VRTX','PANW',
  'GILD','BSX','REGN','SYK','ADI','MDLZ','MU','MMC','BX','CI',
  'PLD','ZTS','EOG','DUK','SO','APH','KLAC','CME','INTC','ETN',
  'SHW','CB','MCO','LRCX','AON','WELL','ICE','MAR','HCA','GD',
];

/**
 * 미국 시총 상위 100개 종목 심볼 가져오기
 */
async function fetchTopUSSymbols(): Promise<string[]> {
  return TOP_US_SYMBOLS;
}

/**
 * 한국 시총 상위 30개 종목 심볼 가져오기 (네이버 금융 활용)
 */
async function fetchTopKRSymbols(): Promise<string[]> {
  try {
    // 네이버 금융 시가총액 상위 페이지 (코스피 기준)
    const res = await fetch('https://finance.naver.com/sise/sise_market_sum.naver', {
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const html = await res.text();
    // 심볼(code=숫자6자리) 추출 정규식
    const matches = html.match(/item\.naver\?code=(\d{6})/g);
    if (matches) {
      const symbols = matches.map(m => m.split('=')[1]);
      return [...new Set(symbols)].slice(0, 30);
    }
  } catch (e) {
    console.error('[MarketMonitor] Failed to fetch KR Top 30:', e);
  }
  return [];
}

export async function refreshMarketData(marketType?: 'US' | 'KR' | 'INDEX') {
  console.log(`[MarketMonitor] Starting market data refresh for: ${marketType || 'all'}`);
  const supabase = await createServiceClient();

  // 1. 최신 시총 상위 리스트 확보
  const topUS = (marketType === 'US' || !marketType) ? await fetchTopUSSymbols() : [];
  const topKR = (marketType === 'KR' || !marketType) ? await fetchTopKRSymbols() : [];

  // 2. DB에 저장된 기존 종목 가져오기 (사용자 커스텀 종목 포함)
  const { data: existingStocks } = await supabase.from('stocks').select('symbol, name, market');
  const dbSymbols = existingStocks || [];

  if (!marketType || marketType === 'INDEX') {
    for (const idx of INDICES) {
      await updateStockData(idx.symbol, idx.name, idx.market as any);
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  if (!marketType || marketType === 'US') {
    const targetUS = new Set([...topUS, ...dbSymbols.filter(s => s.market === 'US').map(s => s.symbol)]);
    console.log(`[MarketMonitor] Updating ${targetUS.size} US stocks...`);
    for (const symbol of targetUS) {
      const name = dbSymbols.find(s => s.symbol === symbol)?.name || symbol;
      await updateStockData(symbol, name, 'US');
      await new Promise(r => setTimeout(r, 2000)); // 2초 간격 (안전)
    }
  }

  if (!marketType || marketType === 'KR') {
    const targetKR = new Set([...topKR, ...dbSymbols.filter(s => s.market === 'KR').map(s => s.symbol)]);
    console.log(`[MarketMonitor] Updating ${targetKR.size} KR stocks...`);
    for (const symbol of targetKR) {
      const name = dbSymbols.find(s => s.symbol === symbol)?.name || symbol;
      await updateStockData(symbol, name, 'KR');
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  console.log('[MarketMonitor] Market data refresh completed.');
}

async function updateStockData(symbol: string, name: string, market: 'US' | 'KR' | 'JP') {
  const supabase = await createServiceClient();
  const cleanSymbol = symbol.split('.')[0].toUpperCase();
  let currentPrice = null;
  let yearHigh = null;
  let yearLow = null;
  let previousClose = null;
  let changePercent = null;
  let fetchedName = name;

  try {
    // Yahoo Finance 시도
    let ticker = cleanSymbol;
    // 지수(^로 시작)는 변환하지 않음
    if (market === 'KR' && !cleanSymbol.startsWith('^')) {
      ticker = symbol.includes('.KQ') ? `${cleanSymbol}.KQ` : `${cleanSymbol}.KS`;
    }

    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1y&interval=1d`;
    const yahooRes = await fetch(yahooUrl, { 
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } 
    });
    
    if (yahooRes.ok) {
      const data = await yahooRes.json();
      const result = data?.chart?.result?.[0];
      if (result) {
        const meta = result.meta;
        const quote = result.indicators?.quote?.[0];
        const highs = (quote?.high ?? []).filter((h: any) => h !== null);
        const lows = (quote?.low ?? []).filter((l: any) => l !== null);
        const closes = (quote?.close ?? []).filter((c: any) => c !== null);

        currentPrice = meta.regularMarketPrice || meta.chartPreviousClose;
        // 전일 종가: 차트 데이터의 마지막 이전 값 (더 정확함)
        if (closes.length >= 2) {
          previousClose = closes[closes.length - 2];
        } else {
          previousClose = meta.chartPreviousClose || meta.previousClose;
        }
        if (currentPrice && previousClose) {
          changePercent = ((currentPrice - previousClose) / previousClose) * 100;
        }
        if (highs.length > 0) yearHigh = Math.max(...highs);
        if (lows.length > 0) yearLow = Math.min(...lows);

        // 이름이 기호와 같으면 야후에서 제공하는 이름 사용 시도
        if (fetchedName === cleanSymbol && meta.symbol) {
            // 야후는 이름을 메타데이터에 안 주는 경우가 많아 기존 이름 유지
        }
      }
    }

    // 2. 백업: Polygon (미국 주식 전용)
    if (!currentPrice && market === 'US' && POLYGON_KEY) {
      const polyRes = await fetch(`https://api.polygon.io/v2/aggs/ticker/${cleanSymbol}/prev?adjusted=true&apiKey=${POLYGON_KEY}`);
      if (polyRes.ok) {
        const polyData = await polyRes.json();
        if (polyData.results?.[0]) {
          const r = polyData.results[0];
          currentPrice = r.c;
          if (!yearHigh) yearHigh = r.h;
          if (!yearLow) yearLow = r.l;
        }
      }
    }

    // 3. DB 업데이트
    if (currentPrice !== null && yearHigh !== null && yearLow !== null) {
      await supabase.from('stocks').upsert({
        symbol: cleanSymbol,
        name: fetchedName,
        market: market === 'JP' ? 'US' : market,
        currency: market === 'KR' ? 'KRW' : 'USD',
        current_price: Number(currentPrice),
        year_high: Number(yearHigh),
        year_low: Number(yearLow),
        previous_close: previousClose ? Number(previousClose) : null,
        change_percent: changePercent ? Number(changePercent.toFixed(2)) : null,
        last_fetched_at: new Date().toISOString()
      }, { onConflict: 'symbol' });
      console.log(`✅ [${market}] Updated: ${cleanSymbol}`);
    }

  } catch (error) {
    console.error(`❌ Error updating ${symbol}:`, error);
  }
}
