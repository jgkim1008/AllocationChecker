/**
 * MA 계단식 가격 미리보기 API
 * GET /api/signal-trade/ma-ladder/preview?symbol=TQQQ&market=US&credentialId=uuid
 *
 * - MA(3~240): 일봉 종가 기반
 * - Ichimoku 스팬1/2: 60분봉·240분봉·일봉·주봉 OHLC 기반
 * - credentialId 있으면 KIS API 우선 (원주가), 없으면 Yahoo raw close
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDailyHistory, getHourlyOHLCHistory } from '@/lib/api/yahoo';
import {
  calculateMALadderPrices,
  calculateIchimoku,
  aggregateToWeekly,
  aggregateTo4Hour,
  ICHIMOKU_LEVEL_DEFS,
  type IchimokuPrice,
} from '@/lib/signal-trade/ma-ladder';
import { getBrokerClientByCredentialId } from '@/lib/broker/session';
import type { KISClient } from '@/lib/broker/kis';

export const dynamic = 'force-dynamic';

type OHLC = { high: number; low: number; close: number };

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const market = (searchParams.get('market') ?? 'US') as 'US' | 'KR';
  const credentialId = searchParams.get('credentialId');

  if (!symbol) return NextResponse.json({ error: '종목 코드 필요' }, { status: 400 });

  // ── 1. 일봉 데이터 (MA + 일봉/주봉 일목 공용) ────────────────────────────
  let dailyHistory: { date: string; price: number; high: number; low: number }[] = [];
  let dataSource = 'yahoo';
  let kisError: string | null = null;

  if (credentialId) {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        kisError = '로그인 필요';
      } else {
        const brokerResult = await getBrokerClientByCredentialId(credentialId);
        if (!brokerResult.success || !brokerResult.client) {
          kisError = `계좌 조회 실패: ${brokerResult.error ?? '알 수 없는 오류'}`;
        } else if (brokerResult.client.type !== 'kis') {
          kisError = '한투 계좌만 지원';
        } else {
          const kisClient = brokerResult.client as unknown as KISClient;
          const kisMarket = market === 'KR' ? 'domestic' : 'overseas';
          const kisHistory = await kisClient.getDailyPriceHistory(symbol, kisMarket, 600);
          if (kisHistory.length >= 3) {
            dailyHistory = kisHistory.map(h => ({
              date: h.date,
              price: h.price,
              high: h.high,
              low: h.low,
            }));
            dataSource = 'kis';
          } else {
            kisError = `KIS 데이터 부족 (${kisHistory.length}개) — Yahoo로 대체`;
          }
        }
      }
    } catch (e) {
      kisError = e instanceof Error ? e.message : '알 수 없는 오류';
    }
  }

  if (dailyHistory.length === 0) {
    const yahoo = await getDailyHistory(symbol, market, { useRawClose: true });
    dailyHistory = yahoo.map(h => ({ date: h.date, price: h.price, high: h.high, low: h.low }));
  }

  if (dailyHistory.length < 3) {
    return NextResponse.json({ prices: [], ichimokuPrices: [], dataSource, kisError });
  }

  // ── 2. MA 가격 계산 ───────────────────────────────────────────────────────
  const prices = calculateMALadderPrices(dailyHistory);
  const currentPrice = dailyHistory[0]?.price ?? 0;

  // ── 3. Ichimoku 가격 계산 ─────────────────────────────────────────────────
  const ichimokuPrices: IchimokuPrice[] = [];

  try {
    // 일봉 일목
    const dailyIch = calculateIchimoku(dailyHistory);
    ichimokuPrices.push({ key: 9005, price: dailyIch.span1 });
    ichimokuPrices.push({ key: 9006, price: dailyIch.span2 });

    // 주봉 일목 — 항상 Yahoo 5년치 사용 (KIS는 ~1년치라 부족)
    // 일목 고가/저가 계산은 배당조정 무관하므로 Yahoo로 계산해도 정확
    let weeklySource = dailyHistory;
    if (dataSource === 'kis' || weeklySource.length < 400) {
      const yahooDailyForWeekly = await getDailyHistory(symbol, market, { useRawClose: true });
      if (yahooDailyForWeekly.length > weeklySource.length) {
        weeklySource = yahooDailyForWeekly.map(h => ({
          date: h.date, price: h.price, high: h.high, low: h.low,
        }));
      }
    }
    const weeklyOHLC = aggregateToWeekly(
      weeklySource.map(h => ({ date: h.date, high: h.high, low: h.low, close: h.price }))
    );
    const weeklyIch = calculateIchimoku(weeklyOHLC);
    ichimokuPrices.push({ key: 9007, price: weeklyIch.span1 });
    ichimokuPrices.push({ key: 9008, price: weeklyIch.span2 });

    // 60분봉 / 240분봉 — Yahoo 1h 데이터
    const hourly: OHLC[] = await getHourlyOHLCHistory(symbol, market);

    const h60 = calculateIchimoku(hourly);
    ichimokuPrices.push({ key: 9001, price: h60.span1 });
    ichimokuPrices.push({ key: 9002, price: h60.span2 });

    const hourly4h = aggregateTo4Hour(hourly);
    const h240 = calculateIchimoku(hourly4h);
    ichimokuPrices.push({ key: 9003, price: h240.span1 });
    ichimokuPrices.push({ key: 9004, price: h240.span2 });
  } catch (e) {
    console.error('Ichimoku calculation error:', e);
    // 실패한 키는 null로 채움
    for (const def of ICHIMOKU_LEVEL_DEFS) {
      if (!ichimokuPrices.find(p => p.key === def.key)) {
        ichimokuPrices.push({ key: def.key, price: null });
      }
    }
  }

  // 정의된 순서대로 정렬
  const orderedIchimoku = ICHIMOKU_LEVEL_DEFS.map(def =>
    ichimokuPrices.find(p => p.key === def.key) ?? { key: def.key, price: null }
  );

  return NextResponse.json({
    symbol,
    currentPrice,
    prices,
    ichimokuPrices: orderedIchimoku,
    dataSource,
    kisError,
  });
}
