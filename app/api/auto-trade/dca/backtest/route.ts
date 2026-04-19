/**
 * DCA 전략 백테스팅 API
 *
 * 3년치 일봉 데이터를 기반으로 DCA 전략(지정가 + LOC 폴백)을 시뮬레이션하고
 * 단순 LOC 매수 전략과 성과를 비교합니다.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDailyHistory } from '@/lib/api/yahoo';

function calcLimitPrice(basePrice: number, pct: number, market: 'domestic' | 'overseas'): number {
  const raw = basePrice * (1 + pct / 100);
  if (market === 'overseas') return Math.floor(raw * 100) / 100;
  if (raw >= 500000) return Math.floor(raw / 1000) * 1000;
  if (raw >= 100000) return Math.floor(raw / 500) * 500;
  if (raw >= 50000) return Math.floor(raw / 100) * 100;
  if (raw >= 10000) return Math.floor(raw / 50) * 50;
  if (raw >= 1000) return Math.floor(raw / 10) * 10;
  return Math.floor(raw / 5) * 5;
}

function calcCAGR(totalReturn: number, years: number): number {
  return (Math.pow(1 + totalReturn / 100, 1 / years) - 1) * 100;
}

function calcMDD(values: number[]): number {
  let peak = values[0];
  let mdd = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    const drawdown = (peak - v) / peak;
    if (drawdown > mdd) mdd = drawdown;
  }
  return mdd * 100;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const market = (searchParams.get('market') || 'overseas') as 'domestic' | 'overseas';
    const threshold1_pct = parseFloat(searchParams.get('threshold1_pct') || '-1');
    const threshold2_pct = parseFloat(searchParams.get('threshold2_pct') || '-2');
    const daily_quantity = parseInt(searchParams.get('daily_quantity') || '1', 10);

    if (!symbol) {
      return NextResponse.json({ error: 'symbol 파라미터 필요' }, { status: 400 });
    }

    const yahooMarket = market === 'domestic' ? 'KR' : 'US';
    // getDailyHistory는 5년치 반환 → 최신순. 3년치만 사용
    const allHistory = await getDailyHistory(symbol, yahooMarket);
    if (!allHistory || allHistory.length === 0) {
      return NextResponse.json({ error: '가격 데이터를 가져올 수 없습니다' }, { status: 404 });
    }

    // 오래된 순으로 정렬 (getDailyHistory는 최신순 반환)
    const sorted = [...allHistory].reverse();

    // 3년치 필터
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 3);
    const history = sorted.filter(d => new Date(d.date) >= cutoff);

    if (history.length < 30) {
      return NextResponse.json({ error: '데이터가 부족합니다 (최소 30거래일 필요)' }, { status: 404 });
    }

    // 주문 수량 분배 (morning cron과 동일한 로직)
    const qty1 = Math.ceil(daily_quantity / 2);
    const qty2 = Math.floor(daily_quantity / 2);
    const totalDailyQty = qty1 + qty2;

    // ── 시뮬레이션 ──
    // DCA 전략: 1차(threshold1) + 2차(threshold2) 지정가, 미체결 시 LOC
    // 단순 LOC: 매일 종가에 totalDailyQty 매수

    let dcaShares = 0;
    let dcaInvested = 0;
    let simpleShares = 0;
    let simpleInvested = 0;

    const chartData: {
      date: string;
      dcaReturn: number;   // DCA 수익률 % (투자금 대비)
      simpleReturn: number; // 단순 LOC 수익률 %
      dcaInvested: number;
      simpleInvested: number;
    }[] = [];

    for (let i = 1; i < history.length; i++) {
      const prev = history[i - 1];
      const today = history[i];

      const prevClose = prev.price;
      const todayLow = today.low;
      const todayClose = today.price;

      // DCA: 지정가 체결 시뮬레이션
      const price1 = calcLimitPrice(prevClose, threshold1_pct, market);
      const price2 = calcLimitPrice(prevClose, threshold2_pct, market);

      let filled1 = false;
      let filled2 = false;

      if (qty1 > 0 && todayLow <= price1) {
        dcaShares += qty1;
        dcaInvested += price1 * qty1;
        filled1 = true;
      }
      if (qty2 > 0 && todayLow <= price2) {
        dcaShares += qty2;
        dcaInvested += price2 * qty2;
        filled2 = true;
      }

      // 미체결분 LOC
      const locQty = (!filled1 ? qty1 : 0) + (!filled2 ? qty2 : 0);
      if (locQty > 0) {
        dcaShares += locQty;
        dcaInvested += todayClose * locQty;
      }

      // 단순 LOC: 매일 종가 매수
      simpleShares += totalDailyQty;
      simpleInvested += todayClose * totalDailyQty;

      // 수익률 % (투자금 대비 평가손익)
      const dcaValue = dcaShares * todayClose;
      const simpleValue = simpleShares * todayClose;
      chartData.push({
        date: today.date,
        dcaReturn: dcaInvested > 0 ? Math.round(((dcaValue - dcaInvested) / dcaInvested) * 10000) / 100 : 0,
        simpleReturn: simpleInvested > 0 ? Math.round(((simpleValue - simpleInvested) / simpleInvested) * 10000) / 100 : 0,
        dcaInvested,
        simpleInvested,
      });
    }

    const lastClose = history[history.length - 1].price;
    const years = history.length / 252; // 연간 거래일 약 252일

    // 메트릭 계산
    const dcaTotalReturn = dcaInvested > 0
      ? ((dcaShares * lastClose - dcaInvested) / dcaInvested) * 100 : 0;
    const simpleTotalReturn = simpleInvested > 0
      ? ((simpleShares * lastClose - simpleInvested) / simpleInvested) * 100 : 0;

    const dcaAvgCost = dcaShares > 0 ? dcaInvested / dcaShares : 0;
    const simpleAvgCost = simpleShares > 0 ? simpleInvested / simpleShares : 0;

    const dcaMDD = calcMDD(chartData.map(d => 1 + d.dcaReturn / 100));
    const simpleMDD = calcMDD(chartData.map(d => 1 + d.simpleReturn / 100));

    return NextResponse.json({
      success: true,
      data: {
        symbol: symbol.toUpperCase(),
        market,
        period: {
          from: history[0].date,
          to: history[history.length - 1].date,
          tradingDays: history.length - 1,
        },
        strategy: {
          threshold1_pct,
          threshold2_pct,
          qty1,
          qty2,
          totalDailyQty,
        },
        dca: {
          totalInvested: Math.round(dcaInvested * 100) / 100,
          totalShares: dcaShares,
          avgCost: Math.round(dcaAvgCost * 100) / 100,
          currentValue: Math.round(dcaShares * lastClose * 100) / 100,
          totalReturn: Math.round(dcaTotalReturn * 100) / 100,
          cagr: Math.round(calcCAGR(dcaTotalReturn, years) * 100) / 100,
          mdd: Math.round(dcaMDD * 100) / 100,
        },
        simple: {
          totalInvested: Math.round(simpleInvested * 100) / 100,
          totalShares: simpleShares,
          avgCost: Math.round(simpleAvgCost * 100) / 100,
          currentValue: Math.round(simpleShares * lastClose * 100) / 100,
          totalReturn: Math.round(simpleTotalReturn * 100) / 100,
          cagr: Math.round(calcCAGR(simpleTotalReturn, years) * 100) / 100,
          mdd: Math.round(simpleMDD * 100) / 100,
        },
        chartData,
      },
    });
  } catch (err) {
    console.error('DCA backtest 오류:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
