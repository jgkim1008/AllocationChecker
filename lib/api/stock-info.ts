import { detectMarket } from '@/lib/utils/market';

const FMP_BASE = 'https://financialmodelingprep.com';
const NAVER_STOCK_API = 'https://m.stock.naver.com/api/stock';

/** 한국 종목코드 추출: 005387.KQ → 005387 */
function extractKrCode(symbol: string): string {
  return symbol.toUpperCase().replace(/\.(KS|KQ)$/i, '');
}

/** 네이버 증권 API로 한국 주식 종목명 조회 */
async function getNaverStockName(symbol: string): Promise<string | null> {
  const code = extractKrCode(symbol);
  try {
    const res = await fetch(`${NAVER_STOCK_API}/${code}/basic`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 604800 }, // 7일 캐시
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.stockName as string) ?? null;
  } catch {
    return null;
  }
}

/** FMP로 미국 주식 종목명 조회 */
async function getFMPName(symbol: string): Promise<string | null> {
  const key = process.env.FMP_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `${FMP_BASE}/stable/search-symbol?query=${encodeURIComponent(symbol)}&limit=1&apikey=${key}`,
      { next: { revalidate: 604800 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) && data[0]?.name ? (data[0].name as string) : null;
  } catch {
    return null;
  }
}

/** 심볼로 종목명 조회 */
export async function resolveStockName(symbol: string): Promise<string> {
  const market = detectMarket(symbol);

  if (market === 'KR') {
    const name = await getNaverStockName(symbol);
    if (name) return name;
    // fallback: 접미사 제거
    return extractKrCode(symbol);
  }

  const name = await getFMPName(symbol);
  if (name) return name;

  return symbol.toUpperCase();
}
