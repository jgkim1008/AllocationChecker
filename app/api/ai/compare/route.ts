import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { createCompletion } from '@/lib/ai/github-models';

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

interface StockData {
  symbol: string;
  fundamentals: {
    currentPrice: number;
    pe: number | null;
    pb: number | null;
    eps: number | null;
    roe: number | null;
    beta: number | null;
    revenue: number | null;
    revenueGrowth: number | null;
    marketCap: number | null;
    name: string;
    sector: string;
    industry: string;
  };
  dividendInfo?: {
    hasDividend: boolean;
    yield: number | null;
    frequency: string | null;
  };
  priceTarget?: {
    avg: number;
    high: number;
    low: number;
  } | null;
}

// 섹터별 대표 종목 (US)
const SECTOR_PEERS_US: Record<string, string[]> = {
  'Technology': ['AAPL', 'MSFT', 'GOOGL', 'META', 'NVDA', 'AMD', 'INTC', 'CRM', 'ORCL', 'ADBE'],
  'Financial Services': ['JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'AXP', 'BLK', 'SCHW', 'USB'],
  'Healthcare': ['JNJ', 'UNH', 'PFE', 'ABBV', 'MRK', 'TMO', 'ABT', 'LLY', 'BMY', 'AMGN'],
  'Consumer Cyclical': ['AMZN', 'TSLA', 'HD', 'NKE', 'MCD', 'SBUX', 'TGT', 'LOW', 'TJX', 'BKNG'],
  'Communication Services': ['GOOGL', 'META', 'DIS', 'NFLX', 'CMCSA', 'VZ', 'T', 'TMUS', 'CHTR', 'EA'],
  'Consumer Defensive': ['PG', 'KO', 'PEP', 'WMT', 'COST', 'PM', 'MO', 'CL', 'GIS', 'KHC'],
  'Energy': ['XOM', 'CVX', 'COP', 'SLB', 'EOG', 'MPC', 'PSX', 'VLO', 'OXY', 'HAL'],
  'Industrials': ['UPS', 'HON', 'UNP', 'CAT', 'BA', 'RTX', 'LMT', 'GE', 'DE', 'MMM'],
  'Basic Materials': ['LIN', 'APD', 'ECL', 'SHW', 'FCX', 'NEM', 'NUE', 'DOW', 'DD', 'PPG'],
  'Real Estate': ['AMT', 'PLD', 'CCI', 'EQIX', 'PSA', 'SPG', 'O', 'WELL', 'DLR', 'AVB'],
  'Utilities': ['NEE', 'DUK', 'SO', 'D', 'AEP', 'EXC', 'SRE', 'XEL', 'WEC', 'ED'],
};

// 섹터별 대표 종목 (KR)
const SECTOR_PEERS_KR: Record<string, string[]> = {
  '반도체': ['005930', '000660', '042700', '034730'],
  '자동차': ['005380', '000270', '012330', '003620'],
  '은행': ['105560', '055550', '086790', '024110'],
  '화학': ['051910', '006400', '010950', '011170'],
  '철강': ['005490', '004020', '001040', '000240'],
  '전자': ['005930', '066570', '035420', '035720'],
  '바이오': ['207940', '068270', '091990', '096530'],
  '통신': ['017670', '030200', '032640'],
  '유통': ['139480', '004170', '023530', '069960'],
  '건설': ['000720', '047040', '006360', '000210'],
};

async function fetchStockDataDirect(symbol: string, market: string): Promise<StockData | null> {
  try {
    // 내부 analyst-alpha API 사용
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/strategies/analyst-alpha/${symbol}?market=${market}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    if (!res.ok) return null;

    const data = await res.json();
    const f = data.fundamentals;

    return {
      symbol: symbol.toUpperCase(),
      fundamentals: {
        currentPrice: f?.currentPrice ?? 0,
        pe: f?.pe ?? null,
        pb: f?.pb ?? null,
        eps: f?.eps ?? null,
        roe: f?.roe ?? null,
        beta: f?.beta ?? null,
        revenue: f?.revenue ?? null,
        revenueGrowth: f?.revenueGrowth ?? null,
        marketCap: f?.marketCap ?? null,
        name: f?.name ?? symbol,
        sector: f?.sector ?? '',
        industry: f?.industry ?? '',
      },
      dividendInfo: data.dividendInfo ?? {
        hasDividend: false,
        yield: null,
        frequency: null,
      },
      priceTarget: data.priceTarget ?? null,
    };
  } catch (e) {
    console.error(`Failed to fetch ${symbol}:`, e);
    return null;
  }
}

function getSectorPeers(symbol: string, sector: string, market: string): string[] {
  const sectorMap = market === 'KR' ? SECTOR_PEERS_KR : SECTOR_PEERS_US;

  // 섹터 이름으로 매칭 시도
  for (const [sectorKey, peers] of Object.entries(sectorMap)) {
    if (sector.toLowerCase().includes(sectorKey.toLowerCase()) ||
        sectorKey.toLowerCase().includes(sector.toLowerCase())) {
      return peers.filter(p => p.toUpperCase() !== symbol.toUpperCase()).slice(0, 3);
    }
  }

  // 매칭 실패 시 기본 종목 반환
  if (market === 'KR') {
    return ['005930', '000660', '005380'].filter(p => p !== symbol).slice(0, 3);
  }
  return ['AAPL', 'MSFT', 'GOOGL'].filter(p => p.toUpperCase() !== symbol.toUpperCase()).slice(0, 3);
}

function formatNumber(n: number | null | undefined, decimals = 2): string {
  if (n == null) return 'N/A';
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatMarketCap(n: number | null | undefined, currency: string): string {
  if (n == null) return 'N/A';
  if (n >= 1e12) return `${currency}${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${currency}${(n / 1e9).toFixed(1)}B`;
  return `${currency}${(n / 1e6).toFixed(0)}M`;
}

function buildComparisonPrompt(mainStock: StockData, peers: StockData[], market: string): string {
  const currency = market === 'KR' ? '₩' : '$';

  const formatStock = (s: StockData) => {
    const f = s.fundamentals;
    return `### ${s.symbol} (${f.name})
- 현재가: ${currency}${f.currentPrice?.toLocaleString() ?? 'N/A'}
- 시가총액: ${formatMarketCap(f.marketCap, currency)}
- PER: ${f.pe?.toFixed(1) ?? 'N/A'}배
- PBR: ${f.pb?.toFixed(2) ?? 'N/A'}배
- ROE: ${f.roe?.toFixed(1) ?? 'N/A'}%
- EPS: ${currency}${formatNumber(f.eps)}
- 매출 성장률: ${f.revenueGrowth?.toFixed(1) ?? 'N/A'}%
- Beta: ${f.beta?.toFixed(2) ?? 'N/A'}
- 배당수익률: ${s.dividendInfo?.yield?.toFixed(2) ?? 'N/A'}%
- 목표주가: ${s.priceTarget?.avg ? `${currency}${s.priceTarget.avg.toLocaleString()}` : 'N/A'}`;
  };

  const allStocks = [mainStock, ...peers];
  const stocksInfo = allStocks.map(formatStock).join('\n\n');

  return `당신은 전문 주식 애널리스트입니다. 다음 종목들을 비교 분석해주세요.

## 비교 대상 종목

${stocksInfo}

## 분석 요청

1. **밸류에이션 관점**: PER, PBR 기준으로 가장 저평가된 종목
2. **성장성 관점**: 매출 성장률, ROE 기준으로 가장 성장성이 좋은 종목
3. **배당 관점**: 배당수익률 기준으로 가장 매력적인 종목 (배당이 있는 경우)
4. **안정성 관점**: Beta, 재무건전성 기준으로 가장 안정적인 종목

각 관점별로 1위 종목을 선정하고, 이유를 1-2문장으로 설명해주세요.
마지막에 종합 의견을 2-3문장으로 작성해주세요.

자연스러운 텍스트 형식으로 작성하되, 각 관점별로 명확히 구분해주세요.`;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const symbol = searchParams.get('symbol')?.toUpperCase();
  const market = searchParams.get('market') ?? 'US';
  const peersParam = searchParams.get('peers'); // 쉼표로 구분된 종목 코드

  if (!symbol) {
    return NextResponse.json({ error: 'symbol 파라미터가 필요합니다.' }, { status: 400 });
  }

  try {
    // 1. 캐시 확인 (1시간) - 테이블이 없어도 무시
    const supabase = await createServiceClient();
    const cacheKey = `compare:${symbol}`;

    try {
      const { data: cached } = await supabase
        .from('ai_reports')
        .select('content, generated_at')
        .eq('symbol', cacheKey)
        .eq('report_type', 'compare')
        .gt('expires_at', new Date().toISOString())
        .order('generated_at', { ascending: false })
        .limit(1)
        .single();

      if (cached?.content) {
        return NextResponse.json({
          symbol,
          comparison: cached.content.comparison,
          stocks: cached.content.stocks,
          modelUsed: cached.content.modelUsed ?? 'gpt-4o-mini',
          cached: true,
          generatedAt: cached.generated_at,
        });
      }
    } catch {
      // 캐시 테이블 없음 - 무시
    }

    // 2. 메인 종목 데이터 가져오기
    const mainStock = await fetchStockDataDirect(symbol, market);
    if (!mainStock) {
      return NextResponse.json({ error: '종목 데이터를 가져올 수 없습니다.' }, { status: 404 });
    }

    // 3. 비교 종목 결정
    let peerSymbols: string[];
    if (peersParam) {
      peerSymbols = peersParam.split(',').map(s => s.trim().toUpperCase()).slice(0, 3);
    } else {
      peerSymbols = getSectorPeers(symbol, mainStock.fundamentals.sector, market);
    }

    // 4. 비교 종목 데이터 가져오기
    const peerDataPromises = peerSymbols.map(s => fetchStockDataDirect(s, market));
    const peerResults = await Promise.all(peerDataPromises);
    const peers = peerResults.filter((p): p is StockData => p !== null);

    if (peers.length === 0) {
      return NextResponse.json({
        symbol,
        comparison: '비교할 종목을 찾을 수 없습니다.',
        stocks: [symbol],
        cached: false,
        generatedAt: new Date().toISOString(),
      });
    }

    // 5. GitHub Models API 호출 (자동 폴백)
    const prompt = buildComparisonPrompt(mainStock, peers, market);
    const { result, modelUsed } = await createCompletion({
      messages: [{ role: 'user', content: prompt }],
    });
    const comparison = result.choices[0]?.message?.content ?? '';

    // 6. 응답 데이터 구성
    const stocks = [mainStock, ...peers].map(s => ({
      symbol: s.symbol,
      name: s.fundamentals.name,
      pe: s.fundamentals.pe,
      pb: s.fundamentals.pb,
      roe: s.fundamentals.roe,
      revenueGrowth: s.fundamentals.revenueGrowth,
      dividendYield: s.dividendInfo?.yield,
    }));

    // 7. 캐시 저장 (실패해도 무시)
    try {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await supabase.from('ai_reports').insert({
        symbol: cacheKey,
        report_type: 'compare',
        content: { comparison, stocks, modelUsed },
        expires_at: expiresAt,
      });
    } catch {
      // 캐시 저장 실패 - 무시
    }

    return NextResponse.json({
      symbol,
      comparison,
      stocks,
      modelUsed,
      cached: false,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('AI Compare error:', error);
    return NextResponse.json(
      { error: 'AI 비교 분석 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
