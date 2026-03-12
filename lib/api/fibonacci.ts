import type { FibonacciStock } from '@/types/fibonacci';
import {
  calculateFibonacciPosition,
  findNearestFibonacciLevel,
} from '@/lib/utils/fibonacci-calculator';

const FMP_BASE_URL = 'https://financialmodelingprep.com';

function getApiKey(): string {
  const key = process.env.FMP_API_KEY;
  if (!key) throw new Error('FMP_API_KEY is not set');
  return key;
}

interface FMPQuote {
  symbol: string;
  name: string;
  price: number;
  yearHigh: number;
  yearLow: number;
  marketCap: number;
}

interface NaverStock {
  symbol: string;
  name: string;
  marketCap: number;
  rank: number;
}

/**
 * 미국 시총 상위 100개 종목 (하드코딩)
 */
const US_TOP_STOCKS = [
  { symbol: 'AAPL', name: 'Apple' },
  { symbol: 'MSFT', name: 'Microsoft' },
  { symbol: 'NVDA', name: 'NVIDIA' },
  { symbol: 'GOOGL', name: 'Alphabet A' },
  { symbol: 'AMZN', name: 'Amazon' },
  { symbol: 'META', name: 'Meta Platforms' },
  { symbol: 'BRK.B', name: 'Berkshire Hathaway' },
  { symbol: 'TSLA', name: 'Tesla' },
  { symbol: 'AVGO', name: 'Broadcom' },
  { symbol: 'WMT', name: 'Walmart' },
  { symbol: 'JPM', name: 'JPMorgan Chase' },
  { symbol: 'LLY', name: 'Eli Lilly' },
  { symbol: 'V', name: 'Visa' },
  { symbol: 'UNH', name: 'UnitedHealth' },
  { symbol: 'MA', name: 'Mastercard' },
  { symbol: 'XOM', name: 'Exxon Mobil' },
  { symbol: 'COST', name: 'Costco' },
  { symbol: 'HD', name: 'Home Depot' },
  { symbol: 'PG', name: 'Procter & Gamble' },
  { symbol: 'JNJ', name: 'Johnson & Johnson' },
  { symbol: 'NFLX', name: 'Netflix' },
  { symbol: 'ABBV', name: 'AbbVie' },
  { symbol: 'CRM', name: 'Salesforce' },
  { symbol: 'BAC', name: 'Bank of America' },
  { symbol: 'CVX', name: 'Chevron' },
  { symbol: 'MRK', name: 'Merck' },
  { symbol: 'KO', name: 'Coca-Cola' },
  { symbol: 'ORCL', name: 'Oracle' },
  { symbol: 'AMD', name: 'AMD' },
  { symbol: 'PEP', name: 'PepsiCo' },
  { symbol: 'ACN', name: 'Accenture' },
  { symbol: 'TMO', name: 'Thermo Fisher' },
  { symbol: 'ADBE', name: 'Adobe' },
  { symbol: 'MCD', name: 'McDonald\'s' },
  { symbol: 'CSCO', name: 'Cisco' },
  { symbol: 'LIN', name: 'Linde' },
  { symbol: 'ABT', name: 'Abbott' },
  { symbol: 'WFC', name: 'Wells Fargo' },
  { symbol: 'DHR', name: 'Danaher' },
  { symbol: 'IBM', name: 'IBM' },
  { symbol: 'DIS', name: 'Disney' },
  { symbol: 'PM', name: 'Philip Morris' },
  { symbol: 'INTU', name: 'Intuit' },
  { symbol: 'VZ', name: 'Verizon' },
  { symbol: 'QCOM', name: 'Qualcomm' },
  { symbol: 'CAT', name: 'Caterpillar' },
  { symbol: 'NOW', name: 'ServiceNow' },
  { symbol: 'AXP', name: 'American Express' },
  { symbol: 'TXN', name: 'Texas Instruments' },
  { symbol: 'ISRG', name: 'Intuitive Surgical' },
  { symbol: 'GE', name: 'GE Aerospace' },
  { symbol: 'SPGI', name: 'S&P Global' },
  { symbol: 'CMCSA', name: 'Comcast' },
  { symbol: 'GS', name: 'Goldman Sachs' },
  { symbol: 'RTX', name: 'RTX Corporation' },
  { symbol: 'BKNG', name: 'Booking Holdings' },
  { symbol: 'MS', name: 'Morgan Stanley' },
  { symbol: 'NEE', name: 'NextEra Energy' },
  { symbol: 'PFE', name: 'Pfizer' },
  { symbol: 'AMAT', name: 'Applied Materials' },
  { symbol: 'T', name: 'AT&T' },
  { symbol: 'UBER', name: 'Uber' },
  { symbol: 'HON', name: 'Honeywell' },
  { symbol: 'LOW', name: 'Lowe\'s' },
  { symbol: 'BLK', name: 'BlackRock' },
  { symbol: 'UNP', name: 'Union Pacific' },
  { symbol: 'AMGN', name: 'Amgen' },
  { symbol: 'SYK', name: 'Stryker' },
  { symbol: 'DE', name: 'Deere & Company' },
  { symbol: 'PLD', name: 'Prologis' },
  { symbol: 'COP', name: 'ConocoPhillips' },
  { symbol: 'SCHW', name: 'Charles Schwab' },
  { symbol: 'ELV', name: 'Elevance Health' },
  { symbol: 'MDT', name: 'Medtronic' },
  { symbol: 'BA', name: 'Boeing' },
  { symbol: 'GILD', name: 'Gilead Sciences' },
  { symbol: 'VRTX', name: 'Vertex Pharma' },
  { symbol: 'ADP', name: 'ADP' },
  { symbol: 'LMT', name: 'Lockheed Martin' },
  { symbol: 'MMC', name: 'Marsh McLennan' },
  { symbol: 'CB', name: 'Chubb' },
  { symbol: 'SBUX', name: 'Starbucks' },
  { symbol: 'PANW', name: 'Palo Alto Networks' },
  { symbol: 'BMY', name: 'Bristol-Myers Squibb' },
  { symbol: 'ETN', name: 'Eaton' },
  { symbol: 'REGN', name: 'Regeneron' },
  { symbol: 'ADI', name: 'Analog Devices' },
  { symbol: 'CI', name: 'Cigna' },
  { symbol: 'MU', name: 'Micron' },
  { symbol: 'SO', name: 'Southern Company' },
  { symbol: 'LRCX', name: 'Lam Research' },
  { symbol: 'MDLZ', name: 'Mondelez' },
  { symbol: 'ZTS', name: 'Zoetis' },
  { symbol: 'ICE', name: 'Intercontinental Exchange' },
  { symbol: 'DUK', name: 'Duke Energy' },
  { symbol: 'KLAC', name: 'KLA Corporation' },
  { symbol: 'CME', name: 'CME Group' },
  { symbol: 'SHW', name: 'Sherwin-Williams' },
  { symbol: 'CL', name: 'Colgate-Palmolive' },
  { symbol: 'EQIX', name: 'Equinix' },
];

/**
 * Yahoo Finance에서 미국 주식 52주 고저가 조회
 */
async function getUSStockData(
  symbol: string
): Promise<{ price: number; yearHigh: number; yearLow: number } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`;

    const res = await fetch(url, {
      cache: 'no-store',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!res.ok) return null;

    const data = await res.json();
    return parseYahooChartData(data);
  } catch (error) {
    console.error(`Error fetching US stock data for ${symbol}:`, error);
    return null;
  }
}

/**
 * 한국 시총 상위 종목 목록 (하드코딩)
 * 네이버 금융 크롤링 시 EUC-KR 인코딩 문제로 하드코딩 사용
 */
function getKRTopStocks(limit: number = 30): NaverStock[] {
  const stocks = [
    { symbol: '005930', name: '삼성전자' },
    { symbol: '000660', name: 'SK하이닉스' },
    { symbol: '373220', name: 'LG에너지솔루션' },
    { symbol: '207940', name: '삼성바이오로직스' },
    { symbol: '005380', name: '현대차' },
    { symbol: '006400', name: '삼성SDI' },
    { symbol: '051910', name: 'LG화학' },
    { symbol: '035420', name: 'NAVER' },
    { symbol: '000270', name: '기아' },
    { symbol: '068270', name: '셀트리온' },
    { symbol: '105560', name: 'KB금융' },
    { symbol: '055550', name: '신한지주' },
    { symbol: '035720', name: '카카오' },
    { symbol: '012330', name: '현대모비스' },
    { symbol: '003670', name: '포스코홀딩스' },
    { symbol: '028260', name: '삼성물산' },
    { symbol: '066570', name: 'LG전자' },
    { symbol: '096770', name: 'SK이노베이션' },
    { symbol: '086790', name: '하나금융지주' },
    { symbol: '003550', name: 'LG' },
    { symbol: '034730', name: 'SK' },
    { symbol: '015760', name: '한국전력' },
    { symbol: '010130', name: '고려아연' },
    { symbol: '032830', name: '삼성생명' },
    { symbol: '033780', name: 'KT&G' },
    { symbol: '316140', name: '우리금융지주' },
    { symbol: '009150', name: '삼성전기' },
    { symbol: '017670', name: 'SK텔레콤' },
    { symbol: '018260', name: '삼성에스디에스' },
    { symbol: '030200', name: 'KT' },
  ];

  return stocks.slice(0, limit).map((s, idx) => ({
    ...s,
    marketCap: 0,
    rank: idx + 1,
  }));
}

/**
 * Yahoo Finance에서 한국 주식 52주 고저가 조회
 */
async function getKRStockData(
  symbol: string
): Promise<{ price: number; yearHigh: number; yearLow: number } | null> {
  try {
    // Yahoo Finance API (한국 주식은 .KS 접미사 필요)
    const yahooSymbol = `${symbol}.KS`;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?range=1y&interval=1d`;

    const res = await fetch(url, {
      cache: 'no-store',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!res.ok) {
      // 코스닥 종목은 .KQ 사용
      const kqUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.KQ?range=1y&interval=1d`;
      const kqRes = await fetch(kqUrl, {
        cache: 'no-store',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (!kqRes.ok) return null;

      const kqData = await kqRes.json();
      return parseYahooChartData(kqData);
    }

    const data = await res.json();
    return parseYahooChartData(data);
  } catch (error) {
    console.error(`Error fetching KR stock data for ${symbol}:`, error);
    return null;
  }
}

function parseYahooChartData(
  data: unknown
): { price: number; yearHigh: number; yearLow: number } | null {
  try {
    const chart = (data as { chart?: { result?: unknown[] } })?.chart?.result?.[0];
    if (!chart) return null;

    const meta = (chart as { meta?: { regularMarketPrice?: number } })?.meta;
    const indicators = (chart as { indicators?: { quote?: { high?: number[]; low?: number[] }[] } })?.indicators;
    const quote = indicators?.quote?.[0];

    if (!meta || !quote) return null;

    const highs = (quote.high ?? []).filter((h): h is number => h !== null);
    const lows = (quote.low ?? []).filter((l): l is number => l !== null);

    if (highs.length === 0 || lows.length === 0) return null;

    return {
      price: meta.regularMarketPrice ?? 0,
      yearHigh: Math.max(...highs),
      yearLow: Math.min(...lows),
    };
  } catch {
    return null;
  }
}

/**
 * 미국 주식 피보나치 분석
 */
export async function analyzeUSStocks(limit: number = 100): Promise<FibonacciStock[]> {
  const stocks = US_TOP_STOCKS.slice(0, limit);
  const results: FibonacciStock[] = [];

  for (let i = 0; i < stocks.length; i++) {
    const stock = stocks[i];
    const data = await getUSStockData(stock.symbol);
    if (!data || data.yearHigh === 0 || data.yearLow === 0) continue;

    const position = calculateFibonacciPosition(
      data.price,
      data.yearLow,
      data.yearHigh
    );
    const { level, distance } = findNearestFibonacciLevel(position);

    results.push({
      symbol: stock.symbol,
      name: stock.name,
      market: 'US',
      currentPrice: data.price,
      yearHigh: data.yearHigh,
      yearLow: data.yearLow,
      fibonacciLevel: level,
      fibonacciValue: position,
      distanceFromLevel: distance,
      marketCap: 0,
      rank: i + 1,
    });

    // Rate limit 방지
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return results;
}

/**
 * 한국 주식 피보나치 분석
 */
export async function analyzeKRStocks(limit: number = 30): Promise<FibonacciStock[]> {
  const stocks = await getKRTopStocks(limit);
  const results: FibonacciStock[] = [];

  // 순차 처리 (Yahoo Finance rate limit 고려)
  for (const stock of stocks) {
    const data = await getKRStockData(stock.symbol);
    if (!data || data.yearHigh === 0 || data.yearLow === 0) continue;

    const position = calculateFibonacciPosition(
      data.price,
      data.yearLow,
      data.yearHigh
    );
    const { level, distance } = findNearestFibonacciLevel(position);

    results.push({
      symbol: stock.symbol,
      name: stock.name,
      market: 'KR',
      currentPrice: data.price,
      yearHigh: data.yearHigh,
      yearLow: data.yearLow,
      fibonacciLevel: level,
      fibonacciValue: position,
      distanceFromLevel: distance,
      marketCap: stock.marketCap,
      rank: stock.rank,
    });

    // Rate limit 방지
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return results;
}

/**
 * 주요 지수 목록
 */
const INDICES = [
  { symbol: '^GSPC', name: 'S&P 500', market: 'US' as const },
  { symbol: '^IXIC', name: 'NASDAQ Composite', market: 'US' as const },
  { symbol: '^KS11', name: 'KOSPI', market: 'KR' as const },
  { symbol: '^KQ11', name: 'KOSDAQ', market: 'KR' as const },
  { symbol: '^N225', name: 'Nikkei 225', market: 'JP' as const },
];

/**
 * Yahoo Finance에서 지수 데이터 조회
 */
async function getIndexData(
  symbol: string
): Promise<{ price: number; yearHigh: number; yearLow: number } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`;

    const res = await fetch(url, {
      cache: 'no-store',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!res.ok) return null;

    const data = await res.json();
    return parseYahooChartData(data);
  } catch (error) {
    console.error(`Error fetching index data for ${symbol}:`, error);
    return null;
  }
}

/**
 * 주요 지수 피보나치 분석
 */
export async function analyzeIndices(): Promise<FibonacciStock[]> {
  const results: FibonacciStock[] = [];

  for (let i = 0; i < INDICES.length; i++) {
    const index = INDICES[i];
    const data = await getIndexData(index.symbol);
    if (!data || data.yearHigh === 0 || data.yearLow === 0) continue;

    const position = calculateFibonacciPosition(
      data.price,
      data.yearLow,
      data.yearHigh
    );
    const { level, distance } = findNearestFibonacciLevel(position);

    results.push({
      symbol: index.symbol,
      name: index.name,
      market: index.market as 'US' | 'KR',
      currentPrice: data.price,
      yearHigh: data.yearHigh,
      yearLow: data.yearLow,
      fibonacciLevel: level,
      fibonacciValue: position,
      distanceFromLevel: distance,
      marketCap: 0,
      rank: i + 1,
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return results;
}

/**
 * 전체 스캔 실행
 */
export async function runFibonacciScan(): Promise<{
  usStocks: FibonacciStock[];
  krStocks: FibonacciStock[];
  indices: FibonacciStock[];
}> {
  const [usStocks, krStocks, indices] = await Promise.all([
    analyzeUSStocks(100),
    analyzeKRStocks(30),
    analyzeIndices(),
  ]);

  return { usStocks, krStocks, indices };
}
