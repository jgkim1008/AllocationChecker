import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { fetchNaverEtfScanList, pickBenchmarkForEtf, type NaverEtfItemWithTheme } from '@/lib/api/naver-etf';
import { getDailyHistory } from '@/lib/api/yahoo';
import { analyzeETF, type ETFAnalysis } from '@/lib/utils/etf-analyzer-calculator';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CACHE_HOURS = 24;
const CACHE_KEY = 'etf_analyzer_scan_v2';
const TOP_N = 50;
const BATCH_SIZE = 6;

export interface EtfScanResult {
  code: string;             // '069500'
  symbol: string;           // '069500.KS'
  name: string;
  price: number;
  changeRate: number;
  volume: number;
  marketCap: number;
  theme: string | null;
  benchmark: { symbol: string; name: string };
  analysis: ETFAnalysis | null;
}

async function processInBatches<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  batchSize: number,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const r = await Promise.all(batch.map(fn));
    out.push(...r);
  }
  return out;
}

export async function GET(request: NextRequest) {
  try {
    const forceRefresh = ['1', 'true'].includes(request.nextUrl.searchParams.get('refresh') ?? '');
    const supabase = await createServiceClient();

    if (!forceRefresh) {
      const { data: cached } = await supabase
        .from('strategy_cache')
        .select('*')
        .eq('cache_key', CACHE_KEY)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (cached) {
        const age = Date.now() - new Date(cached.created_at).getTime();
        if (age < CACHE_HOURS * 3600 * 1000) {
          const data = (cached.data ?? []) as EtfScanResult[];
          return NextResponse.json({
            stocks: data,
            count: data.length,
            timestamp: cached.created_at,
            cached: true,
          });
        }
      }
    }

    // 1) 거래량 상위 + 테마 ETF 합쳐서 가져오기
    const etfs: NaverEtfItemWithTheme[] = await fetchNaverEtfScanList({
      topByVolume: TOP_N,
      perThemeLimit: 3,
    });

    // 2) 벤치마크 캐시 — ETF별 동일 벤치마크면 중복 fetch 방지
    const benchCache = new Map<string, { date: string; price: number }[]>();
    const fetchBench = async (symbol: string, market: 'US' | 'KR') => {
      if (benchCache.has(symbol)) return benchCache.get(symbol)!;
      const h = await getDailyHistory(symbol, market);
      const slim = (h ?? []).map(c => ({ date: c.date, price: c.price }));
      benchCache.set(symbol, slim);
      return slim;
    };

    // 3) 각 ETF 분석 (배치)
    const results: EtfScanResult[] = await processInBatches(etfs, async (etf) => {
      const benchmark = pickBenchmarkForEtf(etf.name);
      try {
        const [etfHist, benchHist] = await Promise.all([
          getDailyHistory(`${etf.code}.KS`, 'KR'),
          fetchBench(benchmark.symbol, benchmark.market),
        ]);

        const slimEtf = (etfHist ?? []).map(c => ({ date: c.date, price: c.price }));
        const analysis = analyzeETF(slimEtf, benchHist);

        return {
          code: etf.code,
          symbol: `${etf.code}.KS`,
          name: etf.name,
          price: etf.price,
          changeRate: etf.changeRate,
          volume: etf.volume,
          marketCap: etf.marketCap,
          theme: etf.theme,
          benchmark: { symbol: benchmark.symbol, name: benchmark.name },
          analysis,
        };
      } catch (e) {
        console.error(`[ETF Analyzer] ${etf.code} ${etf.name} failed:`, e);
        return {
          code: etf.code,
          symbol: `${etf.code}.KS`,
          name: etf.name,
          price: etf.price,
          changeRate: etf.changeRate,
          volume: etf.volume,
          marketCap: etf.marketCap,
          theme: etf.theme,
          benchmark: { symbol: benchmark.symbol, name: benchmark.name },
          analysis: null,
        };
      }
    }, BATCH_SIZE);

    // 4) 정렬: BUY 신호 > syncRate desc > 거래량 desc
    const signalRank: Record<string, number> = {
      STRONG_BUY: 4, BUY: 3, NEUTRAL: 2, SELL: 1, STRONG_SELL: 0,
    };
    results.sort((a, b) => {
      const sa = a.analysis ? signalRank[a.analysis.signal] ?? -1 : -1;
      const sb = b.analysis ? signalRank[b.analysis.signal] ?? -1 : -1;
      if (sb !== sa) return sb - sa;
      const ra = a.analysis?.syncRate ?? 0;
      const rb = b.analysis?.syncRate ?? 0;
      if (rb !== ra) return rb - ra;
      return b.volume - a.volume;
    });

    await supabase.from('strategy_cache').upsert(
      { cache_key: CACHE_KEY, data: results, created_at: new Date().toISOString() },
      { onConflict: 'cache_key' }
    );

    return NextResponse.json({
      stocks: results,
      count: results.length,
      timestamp: new Date().toISOString(),
      cached: false,
    });
  } catch (error) {
    console.error('[ETF Analyzer Scan API Error]', error);
    return NextResponse.json({ error: 'Failed to scan ETF strategy' }, { status: 500 });
  }
}
