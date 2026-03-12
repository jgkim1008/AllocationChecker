import { NextRequest, NextResponse } from 'next/server';
import { getDailyHistory } from '@/lib/api/yahoo';
import { SMA, BollingerBands } from 'technicalindicators';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol } = await params;
    const { searchParams } = new URL(request.url);
    const market = (searchParams.get('market') || 'US') as 'US' | 'KR';

    const rawHistory = await getDailyHistory(symbol, market);
    if (!rawHistory || rawHistory.length < 5) {
      return NextResponse.json({ error: 'Not enough data' }, { status: 404 });
    }

    // 1. 계산을 위해 과거순으로 정렬
    const prices = [...rawHistory].reverse().map(h => h.price);
    const history = [...rawHistory].reverse();

    // 2. 라이브러리를 이용한 지표 계산
    const calculateMA = (period: number) => {
        const maValues = SMA.calculate({ period, values: prices });
        const result = new Array(prices.length).fill(null);
        for (let i = 0; i < maValues.length; i++) {
            result[i + period - 1] = Number(maValues[i].toFixed(2));
        }
        return result;
    };

    const calculateBB = (period: number, stdDev: number) => {
        const bbValues = BollingerBands.calculate({ period, stdDev, values: prices });
        const result = new Array(prices.length).fill(null);
        for (let i = 0; i < bbValues.length; i++) {
            result[i + period - 1] = Number(bbValues[i].upper.toFixed(2));
        }
        return result;
    };

    const ma5 = calculateMA(5);
    const ma60 = calculateMA(60);
    const ma112 = calculateMA(112);
    const ma224 = calculateMA(224);
    const ma448 = calculateMA(448);
    const bbUpper = calculateBB(20, 2);

    // 3. 결과 합치기
    const processedResults = history.map((h, i) => ({
        ...h,
        ma5: ma5[i],
        ma60: ma60[i],
        ma112: ma112[i],
        ma224: ma224[i],
        ma448: ma448[i],
        bbUpper: bbUpper[i],
    }));

    return NextResponse.json({
      latestHistory: processedResults.slice(-300), // 차트용 (300일치로 확대)
      fullHistory: [...processedResults].reverse() // 분석용 (최신순)
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
