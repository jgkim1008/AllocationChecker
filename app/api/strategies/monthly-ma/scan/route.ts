import { NextRequest, NextResponse } from 'next/server';
import { KOSPI200_STOCKS } from '@/lib/utils/kospi200-stocks';
import { createClient } from '@/lib/supabase/server';

const CACHE_DAYS = 15; // 캐시 유효 기간 (일)

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 종목 수 증가로 시간 연장 (약 350종목)

export interface MonthlyMAStock {
  symbol: string;
  name: string;
  market: 'US' | 'KR';
  currentPrice: number;
  ma10: number;
  maDeviation: number;                    // % 차이 (+: 위, -: 아래)
  maSlope: number;                        // 3개월 이평 변화율 (%)
  maSlopeDirection: 'UP' | 'DOWN' | 'FLAT'; // 이평선 방향
  signal: 'HOLD' | 'SELL';
  signalChanged: boolean;                 // 이번 달에 신호 전환 여부
  deathCandle: boolean;                   // 저승사자 캔들 여부
  nearMA: boolean;                        // 눌림목 접근 (HOLD + 0~3% 이내)
  sidewaysWarning: boolean;               // 횡보 주의 (이평 무방향)
  consecutiveMonths: number;              // 연속 신호 유지 기간 (개월)
  lastSignalDate: string | null;          // 마지막 신호 전환일
  returnSinceSignal: number | null;       // 전환 이후 수익률 (%)
  fromYearHigh: number;                   // 52주(12개월) 고점 대비 (%)
  monthlyCandles: { date: string; open: number; high: number; low: number; close: number }[];
}

// 지수
const INDICES: { symbol: string; name: string; market: 'US' | 'KR'; yahooSymbol: string }[] = [
  { symbol: '^GSPC',  name: 'S&P 500',              market: 'US', yahooSymbol: '%5EGSPC' },
  { symbol: '^IXIC',  name: 'NASDAQ Composite',     market: 'US', yahooSymbol: '%5EIXIC' },
  { symbol: '^KS11', name: 'KOSPI',                market: 'KR', yahooSymbol: '%5EKS11' },
  { symbol: '^KQ11', name: 'KOSDAQ',               market: 'KR', yahooSymbol: '%5EKQ11' },
];

// 미국 ETF
const US_ETFS: { symbol: string; name: string }[] = [
  { symbol: 'SPY',  name: 'SPDR S&P 500 ETF' },
  { symbol: 'QQQ',  name: 'Invesco QQQ Trust' },
  { symbol: 'SOXL', name: 'Direxion 반도체 3x ETF' },
];

// S&P 500 시총 상위 100개 (종목스캔)
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

// 한국 개별종목 (KOSPI 200)
const KR_STOCKS = KOSPI200_STOCKS;

// BASE_STOCKS 생성
const BASE_STOCKS: { symbol: string; name: string; market: 'US' | 'KR'; yahooSymbol: string }[] = [
  ...INDICES,
  ...US_ETFS.map(s => ({ ...s, market: 'US' as const, yahooSymbol: s.symbol })),
  ...TOP_US_SYMBOLS.map(symbol => ({ symbol, name: symbol, market: 'US' as const, yahooSymbol: symbol })),
  ...KR_STOCKS.map(s => ({ ...s, market: 'KR' as const, yahooSymbol: `${s.symbol}.KS` })),
];

// 배당의만장 2WEEKS ETF 목록
const DIVIDEND_ETFS: { code: string; name: string }[] = [
  // 월(초) 미국
  { code: '483280', name: 'KODEX 미국AI테크TOP10타겟커버드콜' },
  { code: '441640', name: 'KODEX 미국배당커버드콜액티브' },
  { code: '446720', name: 'SOL 미국배당다우존스' },
  { code: '468390', name: 'RISE 미국AI빅테크멀티플리어고배당커버드콜' },
  { code: '490590', name: 'RISE 미국AI밸류체인데일리고정커버드콜' },
  { code: '491620', name: 'RISE 미국테크100데일리고정커버드콜' },
  { code: '452360', name: 'SOL 미국배당다우존스(H)' },
  { code: '483290', name: 'KODEX 미국배당다우존스타겟커버드콜' },
  { code: '490600', name: 'RISE 미국배당100데일리고정커버드콜' },
  { code: '493420', name: 'SOL 미국배당다우존스2호' },
  { code: '213630', name: 'PLUS 미국다우존스고배당주(합성H)' },
  // 월(초) 국내
  { code: '472150', name: 'TIGER 배당커버드콜액티브' },
  { code: '161510', name: 'PLUS 고배당주' },
  { code: '489030', name: 'PLUS 고배당주위클리커버드콜' },
  { code: '400410', name: 'KODEX 공모주&리츠자산배분TOP10' },
  { code: '278530', name: 'KODEX 3배당주' },
  { code: '448410', name: 'KODEX 200타겟위클리커버드콜TOP10' },
  { code: '487200', name: 'PLUS 고배당우선배당커버드콜' },
  { code: '475720', name: 'RISE 200위클리커버드콜' },
  { code: '422190', name: 'KODEX 리츠부동산인프라' },
  { code: '329200', name: 'TIGER 리츠부동산인프라' },
  // 월(중순) 미국
  { code: '486290', name: 'TIGER 미국나스닥100타겟데일리커버드콜' },
  { code: '474220', name: 'TIGER 미국테크TOP10타겟커버드콜' },
  { code: '473540', name: 'TIGER 미국AI빅테크10타겟데일리커버드콜' },
  { code: '493810', name: 'TIGER 미국AI빅테크10타겟데일리커버드콜 2호' },
  { code: '458760', name: 'TIGER 미국배당다우존스타겟커버드콜2호' },
  { code: '494300', name: 'KODEX 미국나스닥100데일리커버드콜OTM' },
  { code: '482730', name: 'TIGER 미국S&P500타겟데일리커버드콜' },
  { code: '468380', name: 'ACE 미국500데일리타겟커버드콜(합성)' },
  { code: '480030', name: 'ACE 미국500데일리타겟커버드콜(합성) 2호' },
  { code: '480020', name: 'ACE 미국빅테크7+데일리타겟커버드콜(합성)' },
  { code: '480040', name: 'ACE 미국반도체데일리타겟커버드콜(합성)' },
  { code: '489250', name: 'KODEX 미국배당다우존스' },
  { code: '402970', name: 'ACE 미국배당다우존스' },
  { code: '458750', name: 'TIGER 미국배당다우존스타겟커버드콜 1호' },
  { code: '469760', name: 'TIGER 미국배당다우존스타겟데일리커버드콜' },
  { code: '494420', name: 'PLUS 미국배당증가성장주데일리커버드콜' },
  // 월(중순) 국내
  { code: '498410', name: 'KODEX 금융고배당TOP10타겟위클리커버드콜' },
  { code: '476800', name: 'KODEX 한국부동산리츠인프라' },
  { code: '498400', name: 'KODEX 200타겟위클리커버드콜' },
  { code: '484880', name: 'SOL 금융지주플러스고배당' },
  { code: '469050', name: 'TIGER 200타겟위클리커버드콜' },
  { code: '463160', name: 'RISE 프리미엄클린고배당커버드콜(라코)' },
  { code: '466940', name: 'TIGER 은행고배당플러스TOP10' },
  { code: '458730', name: 'KODEX 글로벌고배당TOP10' },
  { code: '464600', name: 'KODEX 주주환원고배당주' },
  { code: '468420', name: 'PLUS 자사주매입고배당주' },
  { code: '290080', name: 'RISE 200고배당커버드콜ATM' },
];

// ETF를 TARGET_STOCKS 형식으로 변환 (6자리 숫자 코드만 처리)
const ETF_STOCKS = DIVIDEND_ETFS
  .filter(etf => /^\d{6}$/.test(etf.code))
  .map(etf => ({
    symbol: etf.code,
    name: etf.name,
    market: 'KR' as const,
    yahooSymbol: `${etf.code}.KS`,
  }));

// 중복 제거하여 최종 목록 생성
const seenSymbols = new Set<string>();
const TARGET_STOCKS: { symbol: string; name: string; market: 'US' | 'KR'; yahooSymbol: string }[] = [];

for (const stock of [...BASE_STOCKS, ...ETF_STOCKS]) {
  if (!seenSymbols.has(stock.symbol)) {
    seenSymbols.add(stock.symbol);
    TARGET_STOCKS.push(stock);
  }
}

async function fetchMonthlyCandles(yahooSymbol: string): Promise<{ date: string; open: number; high: number; low: number; close: number }[] | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1mo&range=3y`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    if (!res.ok) return null;

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const timestamps: number[] = result.timestamps ?? result.timestamp ?? [];
    const quote = result.indicators?.quote?.[0];
    if (!quote || timestamps.length === 0) return null;

    const candles: { date: string; open: number; high: number; low: number; close: number }[] = [];

    for (let i = 0; i < timestamps.length; i++) {
      const o = quote.open?.[i];
      const h = quote.high?.[i];
      const l = quote.low?.[i];
      const c = quote.close?.[i];
      if (o == null || h == null || l == null || c == null) continue;

      const d = new Date(timestamps[i] * 1000);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      candles.push({ date: dateStr, open: o, high: h, low: l, close: c });
    }

    return candles;
  } catch {
    return null;
  }
}

function calcMA(values: number[], period: number, endIdx: number): number | null {
  if (endIdx < period - 1) return null;
  const slice = values.slice(endIdx - period + 1, endIdx + 1);
  if (slice.some(v => v == null)) return null;
  return slice.reduce((a, b) => a + b, 0) / period;
}

function analyzeStock(
  stock: (typeof TARGET_STOCKS)[number],
  candles: { date: string; open: number; high: number; low: number; close: number }[]
): MonthlyMAStock | null {
  if (candles.length < 12) return null;

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lastIdx = candles.length - 1;

  const ma10 = calcMA(closes, 10, lastIdx);
  const ma10Prev = calcMA(closes, 10, lastIdx - 1);
  if (!ma10 || !ma10Prev) return null;

  const currentClose = closes[lastIdx];
  const prevClose = closes[lastIdx - 1];

  const signal: 'HOLD' | 'SELL' = currentClose >= ma10 ? 'HOLD' : 'SELL';
  const prevSignal: 'HOLD' | 'SELL' = prevClose >= ma10Prev ? 'HOLD' : 'SELL';
  const signalChanged = signal !== prevSignal;

  // 저승사자 캔들 (개선된 정의): SELL + 고가가 MA에 닿았다가 음봉 마감 (지지→저항 전환)
  const lastCandle = candles[lastIdx];
  const body = Math.abs(lastCandle.close - lastCandle.open);
  const bodyPct = (body / lastCandle.open) * 100;
  const isBearish = lastCandle.close < lastCandle.open;
  const deathCandle = signal === 'SELL' && lastCandle.high >= ma10 && isBearish && bodyPct >= 3;

  const maDeviation = ((currentClose - ma10) / ma10) * 100;

  // MA 방향: 3개월 전 대비 이평 변화율
  const ma10_3mAgo = calcMA(closes, 10, lastIdx - 3);
  const maSlope = ma10_3mAgo
    ? Math.round(((ma10 - ma10_3mAgo) / ma10_3mAgo) * 10000) / 100
    : 0;
  const maSlopeDirection: 'UP' | 'DOWN' | 'FLAT' =
    maSlope > 1.5 ? 'UP' : maSlope < -1.5 ? 'DOWN' : 'FLAT';

  // 눌림목 접근: HOLD + 현재가 10MA 0~3% 위 (최적 매수 구간)
  const nearMA = signal === 'HOLD' && maDeviation >= 0 && maDeviation <= 3;

  // 횡보 주의: 3개월 MA 변화율 ±1.5% 이내
  const sidewaysWarning = Math.abs(maSlope) < 1.5;

  // 연속 신호 유지 기간 & 마지막 전환일 & 전환 이후 수익률
  let consecutiveMonths = 1;
  let lastSignalDate: string | null = null;
  let signalChangePrice: number | null = null;

  for (let i = lastIdx - 1; i >= 10; i--) {
    const maAtI = calcMA(closes, 10, i);
    if (!maAtI) break;
    const signalAtI: 'HOLD' | 'SELL' = closes[i] >= maAtI ? 'HOLD' : 'SELL';

    if (signalAtI === signal) {
      consecutiveMonths++;
    } else {
      // 신호 전환 지점 발견
      lastSignalDate = candles[i + 1].date;
      signalChangePrice = closes[i + 1];
      break;
    }
  }

  const returnSinceSignal = signalChangePrice
    ? Math.round(((currentClose - signalChangePrice) / signalChangePrice) * 10000) / 100
    : null;

  // 52주(12개월) 고점 대비
  const recent12Highs = highs.slice(Math.max(0, lastIdx - 11), lastIdx + 1);
  const yearHigh = Math.max(...recent12Highs);
  const fromYearHigh = Math.round(((currentClose - yearHigh) / yearHigh) * 10000) / 100;

  // 최근 14개 캔들
  const recentCandles = candles.slice(Math.max(0, candles.length - 14));

  return {
    symbol: stock.symbol,
    name: stock.name,
    market: stock.market,
    currentPrice: Math.round(currentClose * 100) / 100,
    ma10: Math.round(ma10 * 100) / 100,
    maDeviation: Math.round(maDeviation * 100) / 100,
    maSlope,
    maSlopeDirection,
    signal,
    signalChanged,
    deathCandle,
    nearMA,
    sidewaysWarning,
    consecutiveMonths,
    lastSignalDate,
    returnSinceSignal,
    fromYearHigh,
    monthlyCandles: recentCandles,
  };
}

export async function GET(_req: NextRequest) {
  const { searchParams } = new URL(_req.url);
  const forceRefresh = searchParams.get('refresh') === 'true';

  try {
    const supabase = await createClient();

    // 1. 캐시 확인 (강제 새로고침이 아닌 경우)
    if (!forceRefresh) {
      const { data: cached } = await supabase
        .from('monthly_ma_cache')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (cached) {
        const cacheAge = Date.now() - new Date(cached.created_at).getTime();
        const cacheDaysMs = CACHE_DAYS * 24 * 60 * 60 * 1000;

        if (cacheAge < cacheDaysMs) {
          console.log(`[MonthlyMA] Using cached data (${Math.round(cacheAge / (1000 * 60 * 60))}h old)`);
          return NextResponse.json({
            stocks: cached.data,
            count: cached.data.length,
            timestamp: cached.created_at,
            cached: true,
            cacheAge: Math.round(cacheAge / (1000 * 60 * 60)), // hours
          });
        }
      }
    }

    // 2. 새로 스캔
    console.log(`[MonthlyMA] Starting fresh scan for ${TARGET_STOCKS.length} stocks...`);
    const results: MonthlyMAStock[] = [];

    for (const stock of TARGET_STOCKS) {
      const candles = await fetchMonthlyCandles(stock.yahooSymbol);
      if (!candles) {
        console.warn(`[MonthlyMA] No candles for ${stock.symbol}`);
        continue;
      }
      const analyzed = analyzeStock(stock, candles);
      if (analyzed) results.push(analyzed);
      await new Promise(r => setTimeout(r, 150));
    }

    // 3. 캐시 저장
    const { error: upsertError } = await supabase
      .from('monthly_ma_cache')
      .upsert({
        id: 'latest',
        data: results,
        created_at: new Date().toISOString(),
      });

    if (upsertError) {
      console.warn('[MonthlyMA] Cache save failed:', upsertError.message);
    }

    return NextResponse.json({
      stocks: results,
      count: results.length,
      timestamp: new Date().toISOString(),
      cached: false,
    });
  } catch (error) {
    console.error('[MonthlyMA Scan API Error]', error);
    return NextResponse.json({ error: 'Failed to scan strategy' }, { status: 500 });
  }
}
