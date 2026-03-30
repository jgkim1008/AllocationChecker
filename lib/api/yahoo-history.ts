const YAHOO_URL = 'https://query1.finance.yahoo.com';
const NAVER_CHART_URL = 'https://fchart.stock.naver.com/sise.nhn';

export interface PricePoint {
  date: string;  // 'YYYY-MM'
  value: number; // close price
}

function isKoreanSymbol(symbol: string): boolean {
  const upper = symbol.toUpperCase();
  return upper.endsWith('.KS') || upper.endsWith('.KQ') || /^\d{6}$/.test(upper) || (/^\d[0-9A-Z]{5}$/.test(upper) && /[A-Z]/.test(upper));
}

function extractKrCode(symbol: string): string {
  return symbol.toUpperCase().replace(/\.(KS|KQ)$/i, '');
}

function ensureSuffix(symbol: string): string {
  const upper = symbol.toUpperCase();
  if (upper.endsWith('.KS') || upper.endsWith('.KQ')) return upper;
  if (/^\d{6}$/.test(upper) || (/^\d[0-9A-Z]{5}$/.test(upper) && /[A-Z]/.test(upper))) return `${upper}.KS`;
  return upper;
}

/**
 * 네이버 차트 API에서 한국 주식/ETF 월별 종가 조회
 * - 실제 종가 사용 (배당 조정 없음, ETF Check와 유사)
 */
async function getNaverMonthlyClose(
  symbol: string,
  rangeYears: number = 10
): Promise<PricePoint[]> {
  const code = extractKrCode(symbol);
  const count = rangeYears * 12 + 2;

  try {
    const res = await fetch(
      `${NAVER_CHART_URL}?symbol=${code}&timeframe=month&count=${count}&requestType=0`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return [];

    const text = await res.text();
    const points: PricePoint[] = [];

    // XML 파싱: <item data="YYYYMMDD|시가|고가|저가|종가|거래량" />
    const itemRegex = /<item data="(\d{8})\|[^|]+\|[^|]+\|[^|]+\|(\d+)\|[^"]*"/g;
    let match;

    while ((match = itemRegex.exec(text)) !== null) {
      const dateStr = match[1]; // YYYYMMDD
      const closePrice = parseInt(match[2], 10);

      if (closePrice > 0) {
        const year = dateStr.substring(0, 4);
        const month = dateStr.substring(4, 6);
        points.push({
          date: `${year}-${month}`,
          value: closePrice,
        });
      }
    }

    return points;
  } catch {
    return [];
  }
}

/**
 * Yahoo Finance에서 미국 주식 월별 수정종가 조회
 * - adjclose 사용 (배당 재투자 반영, 토탈리턴)
 */
async function getYahooMonthlyAdjClose(
  symbol: string,
  rangeYears: number = 10
): Promise<PricePoint[]> {
  const ticker = ensureSuffix(symbol);
  const url = `${YAHOO_URL}/v8/finance/chart/${encodeURIComponent(ticker)}?range=${rangeYears}y&interval=1mo`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return [];

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return [];

    const timestamps: number[] = result.timestamp ?? [];
    const adjcloseArr: number[] = result.indicators?.adjclose?.[0]?.adjclose ?? [];

    if (timestamps.length === 0 || adjcloseArr.length === 0) return [];

    const points: PricePoint[] = [];
    for (let i = 0; i < Math.min(timestamps.length, adjcloseArr.length); i++) {
      const val = adjcloseArr[i];
      if (val == null || isNaN(val) || val <= 0) continue;

      const d = new Date(timestamps[i] * 1000);
      const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      points.push({ date, value: val });
    }

    return points;
  } catch {
    return [];
  }
}

/**
 * 월별 가격 데이터 조회
 * - 한국 주식/ETF: 네이버 (실제 종가)
 * - 미국 주식: Yahoo Finance (수정종가, 토탈리턴)
 */
export async function getMonthlyAdjClose(
  symbol: string,
  rangeYears: number = 10
): Promise<PricePoint[]> {
  if (isKoreanSymbol(symbol)) {
    const naverData = await getNaverMonthlyClose(symbol, rangeYears);
    if (naverData.length > 0) return naverData;
    // 네이버 실패 시 Yahoo 폴백 (close 가격 사용)
    return getYahooMonthlyClose(symbol, rangeYears);
  }

  return getYahooMonthlyAdjClose(symbol, rangeYears);
}

/**
 * Yahoo Finance에서 한국 주식 월별 종가 조회 (폴백용)
 * - close 가격 사용 (adjclose 대신)
 */
async function getYahooMonthlyClose(
  symbol: string,
  rangeYears: number = 10
): Promise<PricePoint[]> {
  const ticker = ensureSuffix(symbol);
  const url = `${YAHOO_URL}/v8/finance/chart/${encodeURIComponent(ticker)}?range=${rangeYears}y&interval=1mo`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return [];

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return [];

    const timestamps: number[] = result.timestamp ?? [];
    const closeArr: number[] = result.indicators?.quote?.[0]?.close ?? [];

    if (timestamps.length === 0 || closeArr.length === 0) return [];

    const points: PricePoint[] = [];
    for (let i = 0; i < Math.min(timestamps.length, closeArr.length); i++) {
      const val = closeArr[i];
      if (val == null || isNaN(val) || val <= 0) continue;

      const d = new Date(timestamps[i] * 1000);
      const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      points.push({ date, value: val });
    }

    return points;
  } catch {
    return [];
  }
}
