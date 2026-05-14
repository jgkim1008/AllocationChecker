'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import {
  createChart, ColorType, CrosshairMode, LineStyle,
  CandlestickSeries, LineSeries, HistogramSeries, createSeriesMarkers,
  type SeriesMarker, type Time,
} from 'lightweight-charts';
import type { TurtleResult } from '@/lib/utils/turtle-trading-calculator';

interface TurtleTradingChartProps {
  candles: { date: string; open: number; high: number; low: number; close: number; volume: number }[];
  result: TurtleResult;
  market: 'US' | 'KR';
}

// 숫자 포맷 (천 단위 콤마)
function formatNumber(n: number): string {
  return n.toLocaleString('ko-KR');
}

// 금액 포맷 (억/만원 단위)
function formatMoney(n: number): string {
  if (n >= 100000000) {
    return `${(n / 100000000).toFixed(1)}억원`;
  } else if (n >= 10000) {
    return `${formatNumber(Math.round(n / 10000))}만원`;
  }
  return `${formatNumber(n)}원`;
}

export function TurtleTradingChart({ candles, result, market }: TurtleTradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const volumeContainerRef = useRef<HTMLDivElement>(null);

  // 1유닛 계산기 상태
  const [calcAccount, setCalcAccount] = useState<number>(100000000); // 1억
  const [calcRisk, setCalcRisk] = useState<number>(2); // 2%
  const [calcPrice, setCalcPrice] = useState<number>(0);
  const [calcATR, setCalcATR] = useState<number>(0);

  // 차트 데이터에서 현재가와 ATR 자동 설정
  useEffect(() => {
    if (candles.length > 0 && result.atr.length > 0) {
      const lastCandle = candles[candles.length - 1];
      const lastATR = result.atr[result.atr.length - 1];
      if (calcPrice === 0) setCalcPrice(lastCandle.close);
      if (calcATR === 0 && lastATR) setCalcATR(Math.round(lastATR));
    }
  }, [candles, result.atr, calcPrice, calcATR]);

  // 1유닛 계산 결과
  const unitCalc = useMemo(() => {
    if (calcPrice <= 0 || calcATR <= 0) return null;

    const riskAmount = calcAccount * (calcRisk / 100); // 리스크 금액
    const stopRange = calcATR * 2; // 손절폭 (2N)
    const shares = Math.floor(riskAmount / stopRange); // 1유닛 주식수
    const investAmount = shares * calcPrice; // 1유닛 투자금
    const accountPct = (investAmount / calcAccount) * 100; // 계좌 대비 %
    const stopPrice = calcPrice - stopRange; // 손절가

    return {
      riskAmount,
      stopRange,
      shares,
      investAmount,
      accountPct,
      stopPrice,
      // 4유닛 피라미딩 계산
      pyramid: [
        { unit: 1, price: calcPrice, total: investAmount, pct: accountPct },
        { unit: 2, price: calcPrice + calcATR * 0.5, total: investAmount * 2, pct: accountPct * 2 },
        { unit: 3, price: calcPrice + calcATR * 1.0, total: investAmount * 3, pct: accountPct * 3 },
        { unit: 4, price: calcPrice + calcATR * 1.5, total: investAmount * 4, pct: accountPct * 4 },
      ],
    };
  }, [calcAccount, calcRisk, calcPrice, calcATR]);

  useEffect(() => {
    if (!chartContainerRef.current || candles.length < 10) return;

    const sorted = [...candles].sort((a, b) => a.date.localeCompare(b.date));
    const n = sorted.length;

    // ── 메인 차트 ─────────────────────────────────────────────
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 480,
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#6b7280',
        fontFamily: 'Inter, system-ui, sans-serif',
      },
      grid: { vertLines: { color: '#f3f4f6' }, horzLines: { color: '#f3f4f6' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: '#e5e7eb',
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
      timeScale: { borderColor: '#e5e7eb', timeVisible: false },
    });

    // 캔들
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#ef4444', downColor: '#3b82f6',
      borderUpColor: '#ef4444', borderDownColor: '#3b82f6',
      wickUpColor: '#ef4444', wickDownColor: '#3b82f6',
      priceFormat: {
        type: 'price',
        precision: market === 'US' ? 2 : 0,
        minMove: market === 'US' ? 0.01 : 1,
      },
    });
    candleSeries.setData(sorted.map(c => ({
      time: c.date,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    })));

    // 55일 돈키안 채널 (S2 - 파란색)
    const dc55Upper = chart.addSeries(LineSeries, {
      color: '#3b82f6', lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
      title: 'DC55 (S2진입)',
    });
    const dc55Lower = chart.addSeries(LineSeries, {
      color: '#3b82f6', lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
      title: 'DC55 저가',
    });
    dc55Upper.setData(
      result.donchian55
        .map((d, i) => d.upper !== null ? { time: sorted[i].date, value: d.upper } : null)
        .filter(Boolean) as { time: string; value: number }[]
    );
    dc55Lower.setData(
      result.donchian55
        .map((d, i) => d.lower !== null ? { time: sorted[i].date, value: d.lower } : null)
        .filter(Boolean) as { time: string; value: number }[]
    );

    // 20일 돈키안 채널 (S1 - 초록색)
    const dc20Upper = chart.addSeries(LineSeries, {
      color: '#22c55e', lineWidth: 2,
      lineStyle: LineStyle.Solid,
      lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
      title: 'DC20 (S1진입)',
    });
    const dc20Lower = chart.addSeries(LineSeries, {
      color: '#22c55e', lineWidth: 2,
      lineStyle: LineStyle.Solid,
      lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
      title: 'DC20 (S2청산)',
    });
    dc20Upper.setData(
      result.donchian20
        .map((d, i) => d.upper !== null ? { time: sorted[i].date, value: d.upper } : null)
        .filter(Boolean) as { time: string; value: number }[]
    );
    dc20Lower.setData(
      result.donchian20
        .map((d, i) => d.lower !== null ? { time: sorted[i].date, value: d.lower } : null)
        .filter(Boolean) as { time: string; value: number }[]
    );

    // 10일 돈키안 저가 (S1 청산선 - 주황색, 종가 기준)
    const dc10Lower = chart.addSeries(LineSeries, {
      color: '#f97316', lineWidth: 2,
      lineStyle: LineStyle.Dotted,
      lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
      title: 'DC10 (S1청산)',
    });
    dc10Lower.setData(
      result.donchian10
        .map((d, i) => d.lower !== null ? { time: sorted[i].date, value: d.lower } : null)
        .filter(Boolean) as { time: string; value: number }[]
    );

    // ATR×2 손절선 (진입가 기준 - 장중 터치 시 즉시 청산)
    // 원본 규칙: 진입가 - 2N(ATR)에서 손절, 장중 가격이 닿으면 즉시 청산
    // 차트에서는 "현재가 - 2ATR" 영역을 표시하여 잠재적 손절 구간 시각화
    const atrStopData: { time: string; value: number }[] = [];
    for (let i = 0; i < n; i++) {
      const atr = result.atr[i];
      if (atr !== null) {
        // 장중 저가(low)가 이 선 아래로 내려가면 손절 영역
        atrStopData.push({ time: sorted[i].date, value: sorted[i].close - atr * 2 });
      }
    }
    const atrStopSeries = chart.addSeries(LineSeries, {
      color: '#ef4444', lineWidth: 2,
      lineStyle: LineStyle.Dotted,
      lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
      title: '2N손절 (장중)',
    });
    atrStopSeries.setData(atrStopData);

    // 진입/청산 마커 (피라미딩 지원)
    // 원본 규칙:
    // - 진입: 종가가 DC 고가 돌파 시 (최대 4유닛까지 피라미딩)
    // - 피라미딩: 0.5N 상승 시마다 추가 진입, 손절선 상향
    // - DC 청산: 종가가 DC 저가 이탈 시 (장 마감 후 판단) → 전체 청산
    // - ATR 손절: 장중 저가가 최신진입가-2N 이하 시 → 전체 청산
    const markers: SeriesMarker<Time>[] = [];

    // 피라미딩 상태 관리
    interface Position {
      type: 'S1' | 'S2';
      entryPrice: number;
      entryATR: number;
      date: string;
    }
    let positions: Position[] = [];
    const MAX_UNITS = 4; // 터틀 원칙: 최대 4유닛

    // 손절 기준 (최신 진입가 기준)
    const getStopPrice = () => {
      if (positions.length === 0) return 0;
      const lastPos = positions[positions.length - 1];
      return lastPos.entryPrice - lastPos.entryATR * 2;
    };

    // 전체 포지션 청산
    const closeAllPositions = () => {
      positions = [];
    };

    for (let i = 1; i < n; i++) {
      const dc20prev = result.donchian20[i - 1].upper;
      const dc55prev = result.donchian55[i - 1].upper;
      const dc10prevLow = result.donchian10[i - 1].lower;
      const dc20prevLow = result.donchian20[i - 1].lower;
      const c = sorted[i];
      const atr = result.atr[i - 1] ?? 0;

      const inPosition = positions.length > 0;
      const stopPrice = getStopPrice();

      // ── 청산 조건 먼저 체크 (손절 > DC청산 우선순위) ──

      // ATR 손절: 장중 저가가 손절선 이하 → 전체 청산
      if (inPosition && stopPrice > 0 && c.low < stopPrice) {
        const unitCount = positions.length;
        markers.push({
          time: c.date,
          position: 'aboveBar',
          color: '#dc2626',
          shape: 'arrowDown',
          text: `2N손절 (${unitCount}유닛)`
        });
        closeAllPositions();
        continue;
      }

      // S1 DC청산: 종가가 10일 저가 이탈 → 전체 청산 (주황색)
      if (inPosition && dc10prevLow && c.close < dc10prevLow) {
        const unitCount = positions.length;
        markers.push({
          time: c.date,
          position: 'aboveBar',
          color: '#f97316',
          shape: 'arrowDown',
          text: `DC10청산 (${unitCount}유닛)`
        });
        closeAllPositions();
        continue;
      }

      // S2 DC청산: 종가가 20일 저가 이탈 → 전체 청산 (초록색)
      if (inPosition && dc20prevLow && c.close < dc20prevLow) {
        const unitCount = positions.length;
        markers.push({
          time: c.date,
          position: 'aboveBar',
          color: '#22c55e',
          shape: 'arrowDown',
          text: `DC20청산 (${unitCount}유닛)`
        });
        closeAllPositions();
        continue;
      }

      // ── 진입 조건 체크 ──

      // S2 진입: 종가가 55일 고가 돌파 (파란색)
      if (!inPosition && dc55prev && c.close > dc55prev && atr > 0) {
        positions.push({ type: 'S2', entryPrice: c.close, entryATR: atr, date: c.date });
        markers.push({
          time: c.date,
          position: 'belowBar',
          color: '#3b82f6',
          shape: 'arrowUp',
          text: 'S2 진입'
        });
      }
      // S1 진입: 종가가 20일 고가 돌파 (초록색)
      else if (!inPosition && dc20prev && c.close > dc20prev && atr > 0) {
        positions.push({ type: 'S1', entryPrice: c.close, entryATR: atr, date: c.date });
        markers.push({
          time: c.date,
          position: 'belowBar',
          color: '#22c55e',
          shape: 'arrowUp',
          text: 'S1 진입'
        });
      }
      // 피라미딩: 포지션 보유 중 + 0.5N 상승 시 추가 진입 (최대 4유닛)
      else if (inPosition && positions.length < MAX_UNITS && atr > 0) {
        const lastPos = positions[positions.length - 1];
        const pyramidThreshold = lastPos.entryPrice + lastPos.entryATR * 0.5;

        // 가격이 0.5N 이상 상승하고, DC 돌파 상태 유지 시 추가 진입
        if (c.close > pyramidThreshold) {
          const isS2Active = dc55prev && c.close > dc55prev;
          const isS1Active = dc20prev && c.close > dc20prev;

          if (isS2Active || isS1Active) {
            const newType = isS2Active ? 'S2' : 'S1';
            positions.push({ type: newType, entryPrice: c.close, entryATR: atr, date: c.date });
            markers.push({
              time: c.date,
              position: 'belowBar',
              color: isS2Active ? '#3b82f6' : '#22c55e',
              shape: 'arrowUp',
              text: `+${positions.length}유닛`
            });
          }
        }
      }
    }
    createSeriesMarkers(candleSeries, markers);

    // 최근 200개 범위 표시
    if (n > 200) {
      chart.timeScale().setVisibleLogicalRange({ from: n - 200, to: n - 1 });
    }

    // ── 볼륨 차트 ──────────────────────────────────────────────
    let volumeChart: ReturnType<typeof createChart> | null = null;
    if (volumeContainerRef.current) {
      volumeChart = createChart(volumeContainerRef.current, {
        width: volumeContainerRef.current.clientWidth,
        height: 80,
        layout: { background: { type: ColorType.Solid, color: '#ffffff' }, textColor: '#9ca3af' },
        grid: { vertLines: { visible: false }, horzLines: { visible: false } },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: '#e5e7eb', scaleMargins: { top: 0.2, bottom: 0 } },
        timeScale: { borderColor: '#e5e7eb', timeVisible: false },
      });

      const volSeries = volumeChart.addSeries(HistogramSeries, {
        priceFormat: { type: 'volume' },
        priceScaleId: 'right',
      });
      volSeries.setData(sorted.map(c => ({
        time: c.date,
        value: c.volume,
        color: c.close >= c.open ? '#fca5a5' : '#93c5fd',
      })));

      // timeScale 동기화
      chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (range) volumeChart?.timeScale().setVisibleLogicalRange(range);
      });
      volumeChart.timeScale().subscribeVisibleLogicalRangeChange(range => {
        if (range) chart.timeScale().setVisibleLogicalRange(range);
      });
    }

    // 리사이즈
    const observer = new ResizeObserver(() => {
      if (chartContainerRef.current) chart.resize(chartContainerRef.current.clientWidth, 480);
      if (volumeContainerRef.current && volumeChart) volumeChart.resize(volumeContainerRef.current.clientWidth, 80);
    });
    if (chartContainerRef.current) observer.observe(chartContainerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      volumeChart?.remove();
    };
  }, [candles, result, market]);

  return (
    <div className="w-full">
      <div ref={chartContainerRef} className="w-full" />
      <div ref={volumeContainerRef} className="w-full" />

      {/* 범례 및 유닛 설명 */}
      <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
        {/* 라인 범례 */}
        <div className="flex flex-wrap gap-4 mb-3 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-0.5 bg-blue-500" style={{ borderStyle: 'dashed', borderWidth: '1px', borderColor: '#3b82f6' }} />
            <span className="text-gray-600">DC55 (S2진입)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-0.5 bg-green-500" />
            <span className="text-gray-600">DC20 (S1진입/S2청산)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-0.5 bg-orange-500" style={{ borderStyle: 'dotted', borderWidth: '1px', borderColor: '#f97316' }} />
            <span className="text-gray-600">DC10 (S1청산)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-0.5 bg-red-500" style={{ borderStyle: 'dotted', borderWidth: '1px', borderColor: '#ef4444' }} />
            <span className="text-gray-600">2N손절 (장중)</span>
          </div>
        </div>

        {/* 유닛 설명 */}
        <div className="pt-3 border-t border-gray-200">
          <div className="text-xs font-semibold text-gray-700 mb-2">📦 유닛(Unit)이란?</div>
          <ul className="text-xs text-gray-600 space-y-1 ml-4 list-disc">
            <li><strong>1유닛</strong> = ATR(변동성) 기반 포지션 크기. 2% 리스크 시 1N 움직임 = 계좌의 2% 손익</li>
            <li><strong>피라미딩</strong>: 가격이 0.5N(ATR×0.5) 상승할 때마다 1유닛 추가 진입 (최대 4유닛)</li>
            <li><strong>손절 기준</strong>: 마지막 진입가 - 2N에서 전체 포지션 청산 (장중 즉시)</li>
            <li><strong>DC 청산</strong>: S1→10일 저가, S2→20일 저가 이탈 시 종가 기준 청산</li>
          </ul>
        </div>

        {/* 예시 */}
        <div className="pt-3 mt-3 border-t border-gray-200">
          <div className="text-xs font-semibold text-gray-700 mb-2">💡 예시: 계좌 1억원, 삼성전자 80,000원, ATR(N) = 2,000원</div>

          {/* 유닛 계산 */}
          <div className="bg-blue-50 p-3 rounded border border-blue-100 mb-3">
            <div className="font-medium text-blue-800 mb-2">1️⃣ 1유닛 크기 계산 (리스크 2% 기준)</div>
            <div className="text-xs text-blue-700 space-y-1">
              <div>• 1유닛 리스크 금액 = 계좌 × 2% = <strong>1억 × 2% = 200만원</strong></div>
              <div>• 손절폭 = 2N = 2,000원 × 2 = <strong>4,000원</strong></div>
              <div>• 1유닛 주식수 = 리스크금액 ÷ 손절폭 = 200만 ÷ 4,000 = <strong>500주</strong></div>
              <div>• 1유닛 투자금 = 500주 × 80,000원 = <strong>4,000만원 (계좌의 40%)</strong></div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-gray-600">
            <div className="bg-white p-3 rounded border border-gray-100">
              <div className="font-medium text-gray-700 mb-2">2️⃣ 피라미딩 (0.5N = 1,000원 상승마다 추가)</div>
              <div className="space-y-1">
                <div className="flex justify-between"><span>1유닛: 80,000원 진입</span><span className="text-gray-400">4,000만원 (40%)</span></div>
                <div className="flex justify-between"><span>2유닛: 81,000원 (+0.5N)</span><span className="text-gray-400">+4,000만원 (80%)</span></div>
                <div className="flex justify-between"><span>3유닛: 82,000원 (+0.5N)</span><span className="text-gray-400">+4,000만원 (120%)</span></div>
                <div className="flex justify-between"><span>4유닛: 83,000원 (+0.5N)</span><span className="text-gray-400">+4,000만원 (160%)</span></div>
                <div className="pt-1 border-t border-gray-100 font-medium">총 2,000주, 평단 81,500원</div>
              </div>
            </div>
            <div className="bg-white p-3 rounded border border-gray-100">
              <div className="font-medium text-gray-700 mb-2">3️⃣ 손절 시 손실 (최신 진입가 - 2N)</div>
              <div className="space-y-1">
                <div>• 4유닛 손절가 = 83,000 - 4,000 = <strong>79,000원</strong></div>
                <div>• 평단 81,500 → 79,000 손절 시</div>
                <div>• 주당 손실: 2,500원 × 2,000주 = <strong>-500만원</strong></div>
                <div className="text-red-600 font-medium pt-1">→ 계좌의 약 5% 손실</div>
                <div className="text-gray-400 text-[10px] pt-1">* 유닛당 2% × 피라미딩 횟수만큼 손실 가능</div>
              </div>
            </div>
          </div>

          {/* 핵심 포인트 */}
          <div className="mt-3 bg-amber-50 p-3 rounded border border-amber-100">
            <div className="font-medium text-amber-800 mb-1">⚠️ 핵심 포인트</div>
            <div className="text-xs text-amber-700 space-y-0.5">
              <div>• 1유닛 = 계좌의 2% 리스크 (손절 시 2% 손실)</div>
              <div>• 4유닛 피라미딩 시 최대 리스크 = 약 5~8% (손절가가 올라가므로 단순 8%는 아님)</div>
              <div>• 레버리지 사용: 4유닛 = 계좌의 160% → 마진/신용 필요</div>
            </div>
          </div>
        </div>
      </div>

      {/* 1유닛 계산기 */}
      <div className="mt-4 p-4 bg-white rounded-lg border border-gray-200">
        <div className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
          🧮 1유닛 계산기
          <span className="text-xs font-normal text-gray-500">현재 종목 기준으로 자동 입력됩니다</span>
        </div>

        {/* 입력 필드 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">계좌 금액</label>
            <div className="relative">
              <input
                type="number"
                value={calcAccount}
                onChange={(e) => setCalcAccount(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">원</div>
            </div>
            <div className="flex gap-1 mt-1">
              {[5000, 10000, 50000].map((v) => (
                <button
                  key={v}
                  onClick={() => setCalcAccount(v * 10000)}
                  className="text-[10px] px-1.5 py-0.5 bg-gray-100 hover:bg-gray-200 rounded text-gray-600"
                >
                  {v / 10000 >= 1 ? `${v / 10000}억` : `${v}만`}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">리스크 %</label>
            <div className="relative">
              <input
                type="number"
                value={calcRisk}
                onChange={(e) => setCalcRisk(Number(e.target.value))}
                step="0.5"
                min="0.5"
                max="10"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</div>
            </div>
            <div className="flex gap-1 mt-1">
              {[1, 2, 3].map((v) => (
                <button
                  key={v}
                  onClick={() => setCalcRisk(v)}
                  className="text-[10px] px-1.5 py-0.5 bg-gray-100 hover:bg-gray-200 rounded text-gray-600"
                >
                  {v}%
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">현재가 (진입가)</label>
            <div className="relative">
              <input
                type="number"
                value={calcPrice}
                onChange={(e) => setCalcPrice(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">{market === 'US' ? '$' : '원'}</div>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">ATR (N값)</label>
            <div className="relative">
              <input
                type="number"
                value={calcATR}
                onChange={(e) => setCalcATR(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">{market === 'US' ? '$' : '원'}</div>
            </div>
          </div>
        </div>

        {/* 계산 결과 */}
        {unitCalc && (
          <div className="space-y-4">
            {/* 1유닛 계산 결과 */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-100">
              <div className="text-xs font-semibold text-blue-800 mb-3">📊 1유닛 계산 결과</div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-white p-2 rounded border border-blue-100">
                  <div className="text-[10px] text-gray-500">리스크 금액</div>
                  <div className="text-sm font-bold text-gray-800">{formatMoney(unitCalc.riskAmount)}</div>
                  <div className="text-[10px] text-gray-400">계좌 × {calcRisk}%</div>
                </div>
                <div className="bg-white p-2 rounded border border-blue-100">
                  <div className="text-[10px] text-gray-500">손절폭 (2N)</div>
                  <div className="text-sm font-bold text-red-600">{formatNumber(unitCalc.stopRange)}{market === 'US' ? '$' : '원'}</div>
                  <div className="text-[10px] text-gray-400">ATR × 2</div>
                </div>
                <div className="bg-white p-2 rounded border border-blue-100">
                  <div className="text-[10px] text-gray-500">1유닛 주식수</div>
                  <div className="text-sm font-bold text-gray-800">{formatNumber(unitCalc.shares)}주</div>
                  <div className="text-[10px] text-gray-400">리스크 ÷ 손절폭</div>
                </div>
                <div className="bg-white p-2 rounded border border-blue-100">
                  <div className="text-[10px] text-gray-500">1유닛 투자금</div>
                  <div className="text-sm font-bold text-blue-600">{formatMoney(unitCalc.investAmount)}</div>
                  <div className="text-[10px] text-gray-400">주식수 × 현재가</div>
                </div>
                <div className="bg-white p-2 rounded border border-blue-100">
                  <div className="text-[10px] text-gray-500">계좌 대비</div>
                  <div className={`text-sm font-bold ${unitCalc.accountPct > 100 ? 'text-red-600' : 'text-green-600'}`}>
                    {unitCalc.accountPct.toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-gray-400">1유닛당 비중</div>
                </div>
              </div>
            </div>

            {/* 피라미딩 시뮬레이션 */}
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <div className="text-xs font-semibold text-gray-800 mb-3">📈 피라미딩 시뮬레이션 (0.5N = {formatNumber(calcATR * 0.5)}{market === 'US' ? '$' : '원'} 상승마다)</div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-300">
                      <th className="text-left py-2 text-gray-800 font-bold">유닛</th>
                      <th className="text-right py-2 text-gray-800 font-bold">진입가</th>
                      <th className="text-right py-2 text-gray-800 font-bold">손절가</th>
                      <th className="text-right py-2 text-gray-800 font-bold">누적 투자금</th>
                      <th className="text-right py-2 text-gray-800 font-bold">계좌 대비</th>
                      <th className="text-right py-2 text-gray-800 font-bold">손절 시 손실</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unitCalc.pyramid.map((p, idx) => {
                      const stopPrice = p.price - calcATR * 2;
                      const avgPrice = unitCalc.pyramid.slice(0, idx + 1).reduce((acc, curr) => acc + curr.price, 0) / (idx + 1);
                      const totalShares = unitCalc.shares * (idx + 1);
                      const lossPerShare = avgPrice - stopPrice;
                      const totalLoss = lossPerShare * totalShares;
                      const lossPct = (totalLoss / calcAccount) * 100;

                      return (
                        <tr key={p.unit} className="border-b border-gray-200">
                          <td className="py-2">
                            <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-[10px] font-bold ${
                              idx === 0 ? 'bg-blue-500' : idx === 1 ? 'bg-green-500' : idx === 2 ? 'bg-yellow-500' : 'bg-red-500'
                            }`}>
                              {p.unit}
                            </span>
                          </td>
                          <td className="text-right py-2 font-medium text-gray-900">{formatNumber(Math.round(p.price))}{market === 'US' ? '$' : '원'}</td>
                          <td className="text-right py-2 font-medium text-red-700">{formatNumber(Math.round(stopPrice))}{market === 'US' ? '$' : '원'}</td>
                          <td className="text-right py-2 text-gray-900">{formatMoney(p.total)}</td>
                          <td className={`text-right py-2 font-bold ${p.pct > 100 ? 'text-red-700' : 'text-gray-900'}`}>
                            {p.pct.toFixed(0)}%
                            {p.pct > 100 && <span className="text-[10px] ml-1">⚠️</span>}
                          </td>
                          <td className="text-right py-2 font-medium text-red-700">-{formatMoney(Math.round(totalLoss))} ({lossPct.toFixed(1)}%)</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {unitCalc.accountPct > 25 && (
                <div className="mt-3 text-xs text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
                  ⚠️ 1유닛이 계좌의 {unitCalc.accountPct.toFixed(0)}%입니다. 4유닛 피라미딩 시 {(unitCalc.accountPct * 4).toFixed(0)}%로 마진/신용이 필요합니다.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
