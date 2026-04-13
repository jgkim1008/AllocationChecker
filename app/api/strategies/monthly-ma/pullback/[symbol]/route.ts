import { NextRequest, NextResponse } from 'next/server';
import { getDailyHistory } from '@/lib/api/yahoo';

export const dynamic = 'force-dynamic';

interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface PullbackZones {
  safeZone: { min: number; max: number };      // 0~25%: 안전지대
  watchZone: { min: number; max: number };     // 25~50%: 관찰지점
  costZone: { min: number; max: number };      // 50~75%: 매입원가
  dangerZone: { min: number; max: number };    // 75~100%: 위험지대
}

interface TimeframePullbackAnalysis {
  timeframe: 'monthly' | 'daily';

  // 기준 장대양봉 정보
  referenceCandle: {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    changePercent: number;
    volume: number;
  } | null;

  // 4분할 구간 (장대양봉 기준)
  zones: PullbackZones | null;

  // 현재 상태
  currentPrice: number;
  currentZone: 'safe' | 'watch' | 'cost' | 'danger' | 'above' | 'below' | null;
  pullbackPercent: number | null;  // 고가 대비 되돌림 %

  // 캔들 데이터
  recentCandles: Candle[];

  // 거래량 추이
  volumeTrend: 'increasing' | 'decreasing' | 'stable';

  // 눌림목 점수 (0~100)
  pullbackScore: number;
  signals: string[];
}

// 장대양봉 찾기
function findReferenceCandle(candles: Candle[], minChangePercent: number): Candle | null {
  let best: Candle | null = null;
  let bestChange = 0;

  for (const c of candles) {
    const change = ((c.close - c.open) / c.open) * 100;
    // 양봉이면서 최소 상승률 이상, 몸통이 전체 범위의 60% 이상
    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low;
    const bodyRatio = range > 0 ? body / range : 0;

    if (change >= minChangePercent && bodyRatio >= 0.5 && change > bestChange) {
      best = c;
      bestChange = change;
    }
  }

  // 장대양봉이 없으면 조건 완화
  if (!best) {
    for (const c of candles.slice(0, Math.min(candles.length, 12))) {
      const change = ((c.close - c.open) / c.open) * 100;
      if (change >= minChangePercent * 0.5 && change > bestChange) {
        best = c;
        bestChange = change;
      }
    }
  }

  return best;
}

// 거래량 추이 분석
function analyzeVolumeTrend(candles: Candle[], periodA: number, periodB: number): 'increasing' | 'decreasing' | 'stable' {
  if (candles.length < periodA + periodB) return 'stable';

  const recentAvg = candles.slice(0, periodA).reduce((sum, c) => sum + c.volume, 0) / periodA;
  const prevAvg = candles.slice(periodA, periodA + periodB).reduce((sum, c) => sum + c.volume, 0) / periodB;

  if (prevAvg === 0) return 'stable';
  const change = ((recentAvg - prevAvg) / prevAvg) * 100;

  if (change > 30) return 'increasing';
  if (change < -30) return 'decreasing';
  return 'stable';
}

// 현재 구간 판단
function determineCurrentZone(
  currentPrice: number,
  zones: PullbackZones
): { zone: 'safe' | 'watch' | 'cost' | 'danger' | 'above' | 'below'; pullbackPercent: number } {
  const low = zones.safeZone.min;
  const high = zones.dangerZone.max;
  const range = high - low;

  let pullbackPercent: number;
  if (currentPrice > high) {
    pullbackPercent = 0;
    return { zone: 'above', pullbackPercent };
  } else if (currentPrice < low) {
    pullbackPercent = 100;
    return { zone: 'below', pullbackPercent };
  }

  pullbackPercent = range > 0 ? ((high - currentPrice) / range) * 100 : 0;

  if (currentPrice <= zones.safeZone.max) {
    return { zone: 'safe', pullbackPercent };
  } else if (currentPrice <= zones.watchZone.max) {
    return { zone: 'watch', pullbackPercent };
  } else if (currentPrice <= zones.costZone.max) {
    return { zone: 'cost', pullbackPercent };
  } else {
    return { zone: 'danger', pullbackPercent };
  }
}

// 눌림목 점수 계산 (0~100)
function calculatePullbackScore(
  currentZone: string | null,
  volumeTrend: string,
  pullbackPercent: number | null,
  recentCandles: Candle[],
  timeframe: 'monthly' | 'daily'
): { score: number; signals: string[] } {
  let score = 50;
  const signals: string[] = [];
  const tfLabel = timeframe === 'monthly' ? '월봉' : '일봉';

  // 1. 현재 구간 점수 (최대 30점)
  switch (currentZone) {
    case 'safe':
      score += 30;
      signals.push(`[${tfLabel}] 안전지대(0~25%) - 최적 매수 구간`);
      break;
    case 'watch':
      score += 20;
      signals.push(`[${tfLabel}] 관찰지점(25~50%) - 매집 구간`);
      break;
    case 'cost':
      score += 5;
      signals.push(`[${tfLabel}] 매입원가(50~75%) - 에너지 소화 중`);
      break;
    case 'danger':
      score -= 15;
      signals.push(`[${tfLabel}] 위험지대(75~100%) - 반전 가능성`);
      break;
    case 'above':
      score += 10;
      signals.push(`[${tfLabel}] 장대양봉 고가 돌파 - 추세 지속`);
      break;
    case 'below':
      score -= 20;
      signals.push(`[${tfLabel}] 장대양봉 저가 이탈 - 추세 약화`);
      break;
  }

  // 2. 거래량 추이 점수 (최대 20점)
  if (currentZone === 'safe' || currentZone === 'watch') {
    if (volumeTrend === 'decreasing') {
      score += 20;
      signals.push(`[${tfLabel}] 거래량 감소 - 자연스러운 조정`);
    } else if (volumeTrend === 'stable') {
      score += 10;
    } else {
      score -= 5;
      signals.push(`[${tfLabel}] 거래량 증가 - 매도 압력 주의`);
    }
  }

  // 3. 되돌림 비율 점수 (최대 20점)
  if (pullbackPercent !== null) {
    if (pullbackPercent <= 25) {
      score += 20;
    } else if (pullbackPercent <= 50) {
      score += 10;
    } else if (pullbackPercent <= 75) {
      score += 0;
    } else {
      score -= 10;
    }
  }

  // 4. 최근 캔들 패턴 (최대 10점)
  const checkCount = timeframe === 'monthly' ? 2 : 3;
  if (recentCandles.length >= checkCount) {
    const lastN = recentCandles.slice(0, checkCount);
    const bearishCount = lastN.filter(c => c.close < c.open).length;
    const bodyPercents = lastN.map(c => Math.abs(c.close - c.open) / c.open * 100);
    const avgBody = bodyPercents.reduce((a, b) => a + b, 0) / checkCount;

    const threshold = timeframe === 'monthly' ? 3 : 2;
    if (bearishCount >= Math.ceil(checkCount * 0.6) && avgBody < threshold) {
      score += 10;
      signals.push(`[${tfLabel}] 소형 음봉 조정 - 눌림목 마무리 패턴`);
    }
  }

  return { score: Math.max(0, Math.min(100, score)), signals };
}

// 일봉 → 월봉 변환
function aggregateToMonthly(dailyCandles: Candle[]): Candle[] {
  const monthlyMap = new Map<string, Candle>();

  // 오래된 순으로 정렬
  const sorted = [...dailyCandles].sort((a, b) => a.date.localeCompare(b.date));

  for (const d of sorted) {
    const monthKey = d.date.slice(0, 7); // "2024-01"

    if (!monthlyMap.has(monthKey)) {
      monthlyMap.set(monthKey, {
        date: monthKey,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
        volume: d.volume,
      });
    } else {
      const m = monthlyMap.get(monthKey)!;
      m.high = Math.max(m.high, d.high);
      m.low = Math.min(m.low, d.low);
      m.close = d.close; // 마지막 날 종가
      m.volume += d.volume;
    }
  }

  // 최신순으로 반환
  return Array.from(monthlyMap.values()).sort((a, b) => b.date.localeCompare(a.date));
}

// 단일 시간 프레임 분석
function analyzeTimeframe(
  candles: Candle[],
  timeframe: 'monthly' | 'daily',
  searchRange: number,
  minChangePercent: number
): TimeframePullbackAnalysis {
  const currentPrice = candles[0]?.close || 0;
  const searchCandles = candles.slice(0, searchRange);
  const referenceCandle = findReferenceCandle(searchCandles, minChangePercent);

  const volumePeriodA = timeframe === 'monthly' ? 2 : 5;
  const volumePeriodB = timeframe === 'monthly' ? 2 : 5;
  const volumeTrend = analyzeVolumeTrend(candles, volumePeriodA, volumePeriodB);

  const recentCount = timeframe === 'monthly' ? 12 : 20;
  const recentCandles = candles.slice(0, recentCount);

  let zones: PullbackZones | null = null;
  let currentZone: TimeframePullbackAnalysis['currentZone'] = null;
  let pullbackPercent: number | null = null;

  if (referenceCandle) {
    const low = referenceCandle.low;
    const high = referenceCandle.high;
    const range = high - low;

    zones = {
      safeZone: { min: low, max: low + range * 0.25 },
      watchZone: { min: low + range * 0.25, max: low + range * 0.5 },
      costZone: { min: low + range * 0.5, max: low + range * 0.75 },
      dangerZone: { min: low + range * 0.75, max: high },
    };

    const zoneResult = determineCurrentZone(currentPrice, zones);
    currentZone = zoneResult.zone;
    pullbackPercent = zoneResult.pullbackPercent;
  }

  const { score, signals } = calculatePullbackScore(
    currentZone,
    volumeTrend,
    pullbackPercent,
    recentCandles,
    timeframe
  );

  return {
    timeframe,
    referenceCandle: referenceCandle ? {
      ...referenceCandle,
      changePercent: ((referenceCandle.close - referenceCandle.open) / referenceCandle.open) * 100,
    } : null,
    zones,
    currentPrice,
    currentZone,
    pullbackPercent,
    recentCandles,
    volumeTrend,
    pullbackScore: score,
    signals,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  const { searchParams } = new URL(req.url);
  const market = (searchParams.get('market') || 'US') as 'US' | 'KR';
  const decodedSymbol = decodeURIComponent(symbol);

  try {
    const history = await getDailyHistory(decodedSymbol, market);

    if (!history || history.length < 60) {
      return NextResponse.json(
        { error: '충분한 데이터가 없습니다.' },
        { status: 404 }
      );
    }

    // 일봉 데이터 변환
    const dailyCandles: Candle[] = history.map(h => ({
      date: h.date,
      open: h.open,
      high: h.high,
      low: h.low,
      close: h.price,
      volume: h.volume,
    }));

    // 월봉 데이터 생성
    const monthlyCandles = aggregateToMonthly(dailyCandles);

    // 월봉 분석 (최근 24개월 내 장대양봉, 최소 8% 상승)
    const monthlyAnalysis = analyzeTimeframe(monthlyCandles, 'monthly', 24, 8);

    // 일봉 분석 (최근 60일 내 장대양봉, 최소 5% 상승)
    const dailyAnalysis = analyzeTimeframe(dailyCandles, 'daily', 60, 5);

    return NextResponse.json({
      symbol: decodedSymbol,
      market,
      monthly: monthlyAnalysis,
      daily: dailyAnalysis,
    });
  } catch (error) {
    console.error('Pullback analysis error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze pullback' },
      { status: 500 }
    );
  }
}
