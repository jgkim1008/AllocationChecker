'use client';

import { useRef, useEffect, useMemo } from 'react';
import { createChart, ColorType, CrosshairMode, CandlestickSeries, createSeriesMarkers } from 'lightweight-charts';

interface PriceData {
  date: string;
  price: number;
  high: number;
  low: number;
  open?: number;
}

interface FibLevels {
  '0': number;
  '0.14': number;
  '0.236': number;
  '0.382': number;
  '0.5': number;
  '0.618': number;
  '0.764': number;
  '0.854': number;
  '1': number;
}

interface ExtTarget {
  ratioLabel: string;
  label: string;
  color: string;
  price: number;
  isGolden: boolean;
}

interface AbcPoints {
  A: { date: string; price: number };
  B: { date: string; price: number };
  C: { date: string; price: number; isReal: boolean }; // isReal=false → C=B (되돌림 없음)
}

interface FibonacciChartProps {
  history: PriceData[];
  fibLevels: FibLevels;
  yearHigh: number;
  yearLow: number;
  market: 'US' | 'KR';
  showExtension: boolean;
}

const FIB_COLORS: Record<string, string> = {
  '0': '#ef4444',
  '0.14': '#f97316',
  '0.236': '#06b6d4',
  '0.382': '#3b82f6',
  '0.5': '#8b5cf6',
  '0.618': '#16a34a',
  '0.764': '#14b8a6',
  '0.854': '#eab308',
  '1': '#dc2626',
};

const FIB_LABELS: Record<string, string> = {
  '0': '0%',
  '0.14': '14%',
  '0.236': '23.6%',
  '0.382': '38.2%',
  '0.5': '50%',
  '0.618': '61.8%',
  '0.764': '76.4%',
  '0.854': '85.4%',
  '1': '100%',
};

function formatPrice(price: number, market: 'US' | 'KR'): string {
  if (market === 'US') {
    return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `₩${price.toLocaleString('ko-KR')}`;
}

export function FibonacciChart({
  history,
  fibLevels,
  yearHigh,
  yearLow,
  market,
  showExtension,
}: FibonacciChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // ── ABC 3점 피보나치 익스텐션 계산 ───────────────────────────────
  const { extTargets, abcPoints } = useMemo<{
    extTargets: ExtTarget[];
    abcPoints: AbcPoints | null;
  }>(() => {
    const empty = { extTargets: [], abcPoints: null };
    if (!history || history.length < 20) return empty;

    const sorted = [...history]
      .sort((a, b) => a.date.localeCompare(b.date))
      .filter((item, idx, arr) => idx === 0 || item.date !== arr[idx - 1].date);
    const n = sorted.length;
    const PW = 10; // 일봉 기준 ±10일 → 노이즈 피벗 제거

    // 피벗 고점 / 저점 탐지
    const pivotHighs: { idx: number; price: number; date: string }[] = [];
    const pivotLows:  { idx: number; price: number; date: string }[] = [];
    for (let i = PW; i < n - PW; i++) {
      const h = sorted[i].high;
      if ([...Array(PW * 2 + 1)].every((_, j) => j === PW || sorted[i - PW + j].high <= h))
        pivotHighs.push({ idx: i, price: h, date: sorted[i].date });
      const l = sorted[i].low;
      if ([...Array(PW * 2 + 1)].every((_, j) => j === PW || sorted[i - PW + j].low >= l))
        pivotLows.push({ idx: i, price: l, date: sorted[i].date });
    }

    if (pivotHighs.length === 0) return empty;

    // 모든 유효한 (A, B) 쌍 탐색
    // A = B 직전 피벗 저점, 조건: B > A (상승 임펄스), 상승폭 5% 이상
    type Pivot = { idx: number; price: number; date: string };
    let bestA: Pivot | null = null;
    let bestB: Pivot | null = null;
    let bestScore = -Infinity;

    for (const ph of pivotHighs) {
      const priorLows = pivotLows.filter(l => l.idx < ph.idx);
      if (priorLows.length === 0) continue;
      const a = priorLows[priorLows.length - 1]; // B 직전 가장 최근 저점
      const rangePct = (ph.price - a.price) / a.price;
      if (rangePct < 0.05) continue; // 5% 미만 이동은 제외
      // 점수: 상승폭 60% + 최신성 40%
      const score = rangePct * 0.6 + (ph.idx / n) * 0.4;
      if (score > bestScore) {
        bestScore = score;
        bestA = a;
        bestB = ph;
      }
    }

    if (!bestA || !bestB) return empty;
    const A = bestA;
    const B = bestB;

    const range = B.price - A.price;
    if (range <= 0) return empty;

    // C = B 이후 최저점 (되돌림 20~85% 사이)
    let cPrice = B.price;
    let cDate  = B.date;
    let cIsReal = false;
    const afterB = sorted.slice(B.idx + 1);
    if (afterB.length >= 3) {
      let minLow = afterB[0].low;
      let minDate = afterB[0].date;
      for (const c of afterB) {
        if (c.low < minLow) { minLow = c.low; minDate = c.date; }
      }
      const retrace = (B.price - minLow) / range;
      if (retrace >= 0.2 && retrace <= 0.85) {
        cPrice = minLow; cDate = minDate; cIsReal = true;
      }
    }

    const targets: ExtTarget[] = [
      { ratioLabel: '0.618', label: '61.8% 확인선',          color: '#10b981', isGolden: false },
      { ratioLabel: '1.0',   label: '100% 1차 목표',         color: '#f59e0b', isGolden: false },
      { ratioLabel: '1.13',  label: '113% 2차 목표',         color: '#f97316', isGolden: false },
      { ratioLabel: '1.272', label: '127.2% 3차 목표',       color: '#fb923c', isGolden: false },
      { ratioLabel: '1.414', label: '141.4% 4차 목표',       color: '#ef4444', isGolden: false },
      { ratioLabel: '1.618', label: '161.8% 목표 (황금비)',   color: '#dc2626', isGolden: true  },
    ].map(t => ({ ...t, price: cPrice + range * parseFloat(t.ratioLabel) }));

    return {
      extTargets: targets,
      abcPoints: {
        A: { date: A.date, price: A.price },
        B: { date: B.date, price: B.price },
        C: { date: cDate,  price: cPrice, isReal: cIsReal },
      },
    };
  }, [history, yearHigh, yearLow]);

  useEffect(() => {
    if (!chartContainerRef.current || history.length < 2) return;

    // 데이터 정렬 (오래된 순) 및 중복 날짜 제거
    const sortedData = [...history]
      .sort((a, b) => a.date.localeCompare(b.date))
      .filter((item, index, arr) => index === 0 || item.date !== arr[index - 1].date);

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 500,
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#6b7280',
        fontFamily: 'Inter, system-ui, sans-serif',
      },
      grid: {
        vertLines: { color: '#f3f4f6' },
        horzLines: { color: '#f3f4f6' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: '#e5e7eb',
        scaleMargins: { top: 0.05, bottom: 0.05 },
      },
      timeScale: {
        borderColor: '#e5e7eb',
        timeVisible: false,
      },
    });

    // 캔들스틱 차트
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#ef4444',
      downColor: '#3b82f6',
      borderUpColor: '#ef4444',
      borderDownColor: '#3b82f6',
      wickUpColor: '#ef4444',
      wickDownColor: '#3b82f6',
    });

    const candleData = sortedData.map((h) => ({
      time: h.date as string,
      open: h.open ?? h.price,
      high: h.high,
      low: h.low,
      close: h.price,
    }));
    candleSeries.setData(candleData);

    // 피보나치 레벨 Price Lines 추가
    const fibLevelEntries = Object.entries(fibLevels) as [keyof FibLevels, number][];

    fibLevelEntries.forEach(([level, price]) => {
      const isGoldenRatio = level === '0.618';

      candleSeries.createPriceLine({
        price: price,
        color: FIB_COLORS[level],
        lineWidth: isGoldenRatio ? 2 : 1,
        lineStyle: isGoldenRatio ? 0 : 2, // 0 = solid, 2 = dashed
        axisLabelVisible: true,
        title: FIB_LABELS[level],
      });
    });

    // ── 피보나치 익스텐션 목표가 + ABC 마커 ──────────────────────────
    if (showExtension && extTargets.length > 0) {
      extTargets.forEach(t => {
        candleSeries.createPriceLine({
          price: t.price,
          color: t.color,
          lineWidth: t.isGolden ? 2 : 1,
          lineStyle: t.isGolden ? 0 : 2,
          axisLabelVisible: true,
          title: t.label,
        });
      });

      // A / B / C 마커
      if (abcPoints) {
        const markers: Parameters<typeof createSeriesMarkers>[1] = [];

        markers.push({
          time: abcPoints.A.date as string,
          position: 'belowBar',
          shape: 'arrowUp',
          color: '#16a34a',
          text: 'A',
          size: 2,
        });
        markers.push({
          time: abcPoints.B.date as string,
          position: 'aboveBar',
          shape: 'arrowDown',
          color: '#ef4444',
          text: 'B',
          size: 2,
        });
        if (abcPoints.C.isReal) {
          markers.push({
            time: abcPoints.C.date as string,
            position: 'belowBar',
            shape: 'arrowUp',
            color: '#3b82f6',
            text: 'C',
            size: 2,
          });
        }

        // 날짜 오름차순 정렬 (required by lightweight-charts)
        markers.sort((a, b) => (a.time as string).localeCompare(b.time as string));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        createSeriesMarkers(candleSeries as any, markers);
      }
    }

    // 리사이즈 핸들러
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    chart.timeScale().fitContent();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [history, fibLevels, showExtension, extTargets, abcPoints]);

  if (history.length < 2) {
    return (
      <div className="h-[500px] flex items-center justify-center text-gray-400">
        차트 데이터가 부족합니다.
      </div>
    );
  }

  return (
    <div className="w-full">
      <div ref={chartContainerRef} className="w-full" />

      {/* 피보나치 되돌림 범례 */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {(['0', '0.14', '0.236', '0.382', '0.5', '0.618', '0.764', '0.854', '1'] as const).map((level) => (
          <div
            key={level}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
              level === '0.618' ? 'bg-green-50 border border-green-200' : 'bg-gray-50'
            }`}
          >
            <div className="w-4 h-1" style={{ backgroundColor: FIB_COLORS[level] }} />
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-medium truncate ${level === '0.618' ? 'text-green-700' : 'text-gray-600'}`}>
                {FIB_LABELS[level]} {level === '0.618' && '(황금비)'}
              </p>
              <p className={`text-xs font-bold ${level === '0.618' ? 'text-green-800' : 'text-gray-900'}`}>
                {formatPrice(fibLevels[level], market)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* 피보나치 익스텐션 목표가 범례 + ABC 설명 */}
      {showExtension && extTargets.length > 0 && abcPoints && (
        <div className="mt-3 space-y-3">
          {/* 목표가 범례 */}
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">
              Projection 확장 목표가 (ABC 3점)
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {extTargets.map(t => (
                <div
                  key={t.ratioLabel}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                    t.isGolden
                      ? 'bg-red-50 border-red-200'
                      : t.ratioLabel === '0.618'
                      ? 'bg-emerald-50 border-emerald-200'
                      : 'bg-gray-50 border-transparent'
                  }`}
                >
                  <div className="w-4 h-1 shrink-0" style={{ backgroundColor: t.color }} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-medium truncate ${
                      t.isGolden ? 'text-red-700' : t.ratioLabel === '0.618' ? 'text-emerald-700' : 'text-gray-600'
                    }`}>
                      {t.label}
                    </p>
                    <p className={`text-xs font-bold ${
                      t.isGolden ? 'text-red-800' : t.ratioLabel === '0.618' ? 'text-emerald-800' : 'text-gray-900'
                    }`}>
                      {formatPrice(t.price, market)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ABC 포인트 설명 */}
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-100">
              <p className="text-xs font-black text-gray-700">Projection 기법 — ABC 3점</p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                A(상승 시작) → B(고점) → C(되돌림 저점) 순으로 작도 &nbsp;·&nbsp;
                차트 마커: <span className="text-green-600 font-bold">▲A</span>&nbsp;
                <span className="text-red-600 font-bold">▼B</span>&nbsp;
                {abcPoints.C.isReal && <span className="text-blue-600 font-bold">▲C</span>}
              </p>
            </div>
            <div className="divide-y divide-gray-100">
              {/* A */}
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center text-xs font-black text-green-700">A</div>
                  <div>
                    <p className="text-xs font-bold text-gray-800">1파 시작 저점</p>
                    <p className="text-[10px] text-gray-400">{abcPoints.A.date}</p>
                  </div>
                </div>
                <p className="text-sm font-black text-green-700">{formatPrice(abcPoints.A.price, market)}</p>
              </div>
              {/* B */}
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center text-xs font-black text-red-700">B</div>
                  <div>
                    <p className="text-xs font-bold text-gray-800">1파 고점</p>
                    <p className="text-[10px] text-gray-400">{abcPoints.B.date}</p>
                  </div>
                </div>
                <p className="text-sm font-black text-red-700">{formatPrice(abcPoints.B.price, market)}</p>
              </div>
              {/* C */}
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${
                    abcPoints.C.isReal ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                  }`}>C</div>
                  <div>
                    <p className="text-xs font-bold text-gray-800">
                      {abcPoints.C.isReal ? '2파 저점 (되돌림)' : 'C 미확정 — B 기준 연장'}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {abcPoints.C.isReal
                        ? `${abcPoints.C.date} · 되돌림 ${(((abcPoints.B.price - abcPoints.C.price) / (abcPoints.B.price - abcPoints.A.price)) * 100).toFixed(1)}%`
                        : 'B 이후 유효한 되돌림(20~85%) 없음'}
                    </p>
                  </div>
                </div>
                <p className={`text-sm font-black ${abcPoints.C.isReal ? 'text-blue-700' : 'text-gray-400'}`}>
                  {abcPoints.C.isReal ? formatPrice(abcPoints.C.price, market) : '-'}
                </p>
              </div>
              {/* 상승폭 + 0.618 확인선 설명 */}
              <div className="px-4 py-2.5 bg-amber-50 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-amber-700 font-bold">1파 상승폭 (B−A)</p>
                  <p className="text-xs font-black text-amber-800">
                    {formatPrice(abcPoints.B.price - abcPoints.A.price, market)}
                    &nbsp;(+{(((abcPoints.B.price - abcPoints.A.price) / abcPoints.A.price) * 100).toFixed(1)}%)
                  </p>
                </div>
                <p className="text-[10px] text-emerald-700">
                  ✦ 61.8% 확인선 돌파 시 3파 확장 신뢰도 상승 (전고점 부근에 위치하는 경우가 많음)
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
