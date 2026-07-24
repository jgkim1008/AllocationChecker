import { NextRequest, NextResponse } from 'next/server';
import {
  fetchNaverEtfMeta,
  fetchNaverEtfHoldings,
  pickBenchmarkForEtf,
  type EtfHolding,
  type NaverEtfMeta,
} from '@/lib/api/naver-etf';
import { getDailyHistory } from '@/lib/api/yahoo';
import { analyzeETF, type ETFAnalysis } from '@/lib/utils/etf-analyzer-calculator';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export interface EtfDetailResponse {
  code: string;
  symbol: string;
  meta: NaverEtfMeta | null;
  benchmark: { symbol: string; name: string; market: 'US' | 'KR' };
  analysis: ETFAnalysis | null;
  holdings: EtfHolding[];
  history: { date: string; price: number }[];   // 과거순, 최근 ~250일
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol: raw } = await params;
    // URL 디코딩 + 접미사 정리
    const decoded = decodeURIComponent(raw);
    const code = decoded.replace(/\.(KS|KQ)$/i, '');

    // 한국 ETF 코드는 6자리 숫자 또는 알파뉴메릭 (예: 069500, 0193T0)
    if (!/^[0-9A-Z]{6}$/i.test(code)) {
      return NextResponse.json({ error: 'Invalid ETF code' }, { status: 400 });
    }

    const yahooSymbol = `${code}.KS`;

    const [meta, holdings, history] = await Promise.all([
      fetchNaverEtfMeta(code),
      fetchNaverEtfHoldings(code),
      getDailyHistory(yahooSymbol, 'KR'),
    ]);

    const benchmark = pickBenchmarkForEtf(meta?.name ?? code, meta?.baseIndex);
    const benchHistory = await getDailyHistory(benchmark.symbol, benchmark.market);

    const slimEtf = (history ?? []).map(c => ({ date: c.date, price: c.price }));
    const slimBench = (benchHistory ?? []).map(c => ({ date: c.date, price: c.price }));
    const analysis = analyzeETF(slimEtf, slimBench);

    const response: EtfDetailResponse = {
      code,
      symbol: yahooSymbol,
      meta,
      benchmark,
      analysis,
      holdings,
      history: slimEtf.slice(0, 250).reverse(),  // 과거 → 최신
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[ETF Analyzer Detail API Error]', error);
    return NextResponse.json({ error: 'Failed to load ETF detail' }, { status: 500 });
  }
}
