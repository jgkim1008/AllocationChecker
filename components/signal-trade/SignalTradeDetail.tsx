'use client';

import { useState, useRef, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Search, Loader2, CheckCircle2, XCircle, Star,
} from 'lucide-react';
import { useStockSearch } from '@/hooks/useStockSearch';
import {
  calculateChartStrategySyncs, getSyncColor, STRATEGY_META,
  type ChartStrategySyncs, type StrategyKey, type PriceHistoryItem,
} from '@/lib/utils/chart-strategy-sync';
import type { StockSearchResult } from '@/types/stock';
import { QuickOrderForm } from './QuickOrderForm';
import { AdvancedChart } from '@/components/advanced-chart/AdvancedChart';
import { LeftIconBar } from '@/components/advanced-chart/LeftIconBar';
import { TopToolbar } from '@/components/advanced-chart/TopToolbar';
import { ChartInfoBar } from '@/components/advanced-chart/ChartInfoBar';
import { StrategyOverlayChart } from '@/components/signal-trade/StrategyOverlayChart';
import type { TimeRange, DrawingMode, MagnetMode, Indicators, CustomMA } from '@/app/(dashboard)/advanced-chart/page';
import type { Drawing } from '@/components/advanced-chart/DrawingCanvas';
import { SIGNAL_STRATEGIES, type SignalStrategyType } from '@/lib/signal-trade/types';

// StrategyOverlayChart를 사용하는 전략 키 (전용 오버레이 필요)
const OVERLAY_CHART_KEYS = new Set<StrategyKey>(['inbumBijag', 'fibonacci']);

// ─────────────────────────────────────────────
// Strategy dropdown groups
// ─────────────────────────────────────────────

// SignalStrategyType → StrategyKey 매핑
const SIGNAL_TO_SYNC_KEY: Partial<Record<string, StrategyKey>> = {
  'ma-alignment':      'maAlignment',
  'inverse-alignment': 'inverseAlignment',
  'dual-rsi':          'dualRsi',
  'rsi-divergence':    'rsiDivergence',
  'weekly-sr':         'weeklySR',
  'monthly-ma':        'monthlyMA10',
  'inbum-bijag':       'inbumBijag',
};

// StrategyKey → SignalStrategyType 역매핑
const SYNC_KEY_TO_SIGNAL: Partial<Record<StrategyKey, SignalStrategyType>> = {
  maAlignment:      'ma-alignment',
  inverseAlignment: 'inverse-alignment',
  dualRsi:          'dual-rsi',
  rsiDivergence:    'rsi-divergence',
  weeklySR:         'weekly-sr',
  monthlyMA10:      'monthly-ma',
  inbumBijag:       'inbum-bijag',
};

// KIS 전략 목록
const KIS_STRATEGIES = SIGNAL_STRATEGIES.filter(s => (s.id as string).startsWith('kis-') && s.autoTradeEnabled !== false);

const defaultIndicators: Indicators = {
  ma5: true, ma5Color: '#ec4899', ma20: true, ma20Color: '#3b82f6',
  ma60: true, ma60Color: '#f59e0b', ma120: true, ma120Color: '#10b981',
  customMAs: [], volume: true, rsi: false, macd: false, bollingerBands: false, ichimoku: false,
};

const STRATEGY_TIMEFRAME: Record<string, TimeRange> = {
  maAlignment: '1D', inverseAlignment: '1D', dualRsi: '1D',
  rsiDivergence: '1D', fibonacci: '1D', monthlyMA10: '1M',
  weeklySR: '1W', inbumBijag: '1W',
};

const STRATEGY_PRESETS: Record<string, { indicators?: Partial<Omit<Indicators, 'customMAs'>>; addCustomMAs?: { period: number; color: string }[] }> = {
  maAlignment:      { indicators: { ma5: true, ma20: true, ma60: true, ma120: true, rsi: false, macd: false } },
  inverseAlignment: { indicators: { ma5: true, ma20: true, ma60: true, ma120: true, rsi: false, macd: false } },
  dualRsi:          { indicators: { rsi: true } },
  rsiDivergence:    { indicators: { rsi: true } },
  monthlyMA10:      { addCustomMAs: [{ period: 10, color: '#f59e0b' }] },
  weeklySR:         { indicators: { ma20: true, ma60: true, rsi: false, macd: false } },
  inbumBijag:       { indicators: { ma20: true, ma60: true, rsi: false, macd: false } },
};

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
interface StockData {
  symbol: string;
  fundamentals: { currentPrice: number; name: string; yearHigh: number | null; yearLow: number | null };
  priceHistory: PriceHistoryItem[];
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────
export function SignalTradeDetail() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<StockSearchResult | null>(null);
  const [stockData, setStockData] = useState<StockData | null>(null);
  const [strategySyncs, setStrategySyncs] = useState<ChartStrategySyncs | null>(null);
  const [loading, setLoading] = useState(false);

  // 전략 선택
  const [selectedSignalStrategy, setSelectedSignalStrategy] = useState<SignalStrategyType | null>(null);

  // 전략 싱크 카드용 (상세 criteria 표시)
  const [selectedSyncKey, setSelectedSyncKey] = useState<StrategyKey | null>(null);

  // 차트 상태
  const [timeRange, setTimeRange] = useState<TimeRange>('1D');
  const [indicators, setIndicators] = useState<Indicators>(defaultIndicators);
  const [drawingMode, setDrawingMode] = useState<DrawingMode>(null);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [magnetMode, setMagnetMode] = useState<MagnetMode>(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);

  const { results, loading: searchLoading, search, reset } = useStockSearch();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ── 차트 핸들러 ──────────────────────────
  const handleIndicatorChange = useCallback((key: keyof Indicators, value: boolean) => {
    setIndicators(prev => ({ ...prev, [key]: value }));
  }, []);
  const handleCustomMAAdd = useCallback((ma: CustomMA) => {
    setIndicators(prev => ({ ...prev, customMAs: [...prev.customMAs, ma] }));
  }, []);
  const handleCustomMARemove = useCallback((id: string) => {
    setIndicators(prev => ({ ...prev, customMAs: prev.customMAs.filter(m => m.id !== id) }));
  }, []);
  const handleCustomMAToggle = useCallback((id: string) => {
    setIndicators(prev => ({ ...prev, customMAs: prev.customMAs.map(m => m.id === id ? { ...m, enabled: !m.enabled } : m) }));
  }, []);
  const handleToggleLock = useCallback(() => {
    if (!selectedDrawingId) return;
    setDrawings(prev => prev.map(d => d.id === selectedDrawingId ? { ...d, locked: !d.locked } : d));
  }, [selectedDrawingId]);
  const handleDeleteDrawing = useCallback(() => {
    if (!selectedDrawingId) return;
    setDrawings(prev => prev.filter(d => d.id !== selectedDrawingId));
    setSelectedDrawingId(null);
  }, [selectedDrawingId]);

  // ── 전략 선택 ──────────────────────────────
  const handleStrategySelect = useCallback((id: SignalStrategyType) => {
    setSelectedSignalStrategy(id);

    const syncKey = SIGNAL_TO_SYNC_KEY[id];
    if (syncKey) {
      const tf = STRATEGY_TIMEFRAME[syncKey];
      if (tf) setTimeRange(tf);
      const preset = STRATEGY_PRESETS[syncKey];
      if (preset) {
        setIndicators(prev => {
          let next = { ...prev, ...(preset.indicators ?? {}) };
          if (preset.addCustomMAs) {
            const existingPeriods = new Set(prev.customMAs.map(m => m.period));
            const toAdd: CustomMA[] = preset.addCustomMAs
              .filter(m => !existingPeriods.has(m.period))
              .map(m => ({ id: `strategy-${id}-${m.period}`, period: m.period, color: m.color, enabled: true }));
            if (toAdd.length > 0) next = { ...next, customMAs: [...next.customMAs, ...toAdd] };
          }
          return next;
        });
      }
    }
  }, []);

  // ── 종목 검색 ──────────────────────────────
  const handleQueryChange = (value: string) => {
    setQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (value.trim().length >= 1) search(value.trim());
      else reset();
    }, 300);
  };

  const fetchStockData = useCallback(async (symbol: string, market: 'US' | 'KR') => {
    setLoading(true);
    setStockData(null);
    setStrategySyncs(null);
    try {
      const res = await fetch(`/api/strategies/stock-scan/${symbol}?market=${market}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data: StockData = await res.json();
      setStockData(data);
      if (data.priceHistory?.length > 0) {
        setStrategySyncs(calculateChartStrategySyncs(data.priceHistory, data.fundamentals.currentPrice));
      }
    } catch {}
    finally { setLoading(false); }
  }, []);

  const handleSelect = (stock: StockSearchResult) => {
    setSelected(stock);
    setQuery(stock.symbol);
    reset();
    fetchStockData(stock.symbol, stock.market);
  };

  const handleClear = () => {
    setSelected(null); setStockData(null); setStrategySyncs(null);
    setQuery(''); reset();
  };

  const selectedStrategyInfo = selectedSignalStrategy
    ? SIGNAL_STRATEGIES.find(s => s.id === selectedSignalStrategy)
    : null;

  const market = selected?.market ?? 'US';

  return (
    <div className="flex flex-col gap-3">

      {/* ─── TOP: 차트 (full width) ─────────────── */}
      {selected && stockData && !loading ? (
        selectedSyncKey && OVERLAY_CHART_KEYS.has(selectedSyncKey) ? (
          /* 인범빗각+이치모쿠 / 피보나치 → StrategyOverlayChart */
          <div style={{ height: '650px' }}>
            <StrategyOverlayChart
              priceHistory={stockData.priceHistory}
              market={market}
              symbol={selected.symbol}
              selectedStrategy={selectedSyncKey}
              onStrategyChange={() => {}}
            />
          </div>
        ) : (
          /* 나머지 전략 → AdvancedChart */
          <div className="flex bg-gray-950 rounded-xl overflow-hidden" style={{ height: '650px' }}>
            <LeftIconBar drawingMode={drawingMode} magnetMode={magnetMode} onDrawingModeChange={setDrawingMode} onMagnetModeChange={setMagnetMode} />
            <div className="flex-1 flex flex-col overflow-hidden">
              <TopToolbar
                symbol={selected.symbol} market={market} timeRange={timeRange} indicators={indicators}
                onTimeRangeChange={setTimeRange} onIndicatorChange={handleIndicatorChange}
                onIndicatorsChange={setIndicators} onCustomMAAdd={handleCustomMAAdd}
                onCustomMARemove={handleCustomMARemove} onCustomMAToggle={handleCustomMAToggle}
                onSymbolSelect={() => {}} onClearDrawings={() => setDrawings([])}
                selectedDrawingId={selectedDrawingId}
                selectedDrawingLocked={drawings.find(d => d.id === selectedDrawingId)?.locked}
                onToggleLock={handleToggleLock} onDeleteDrawing={handleDeleteDrawing}
              />
              <ChartInfoBar symbol={selected.symbol} timeRange={timeRange} indicators={indicators} onIndicatorChange={handleIndicatorChange} />
              <div className="flex-1 relative bg-gray-900 overflow-hidden">
                <AdvancedChart
                  symbol={selected.symbol} market={market} timeRange={timeRange} indicators={indicators}
                  drawingMode={drawingMode} magnetMode={magnetMode} drawings={drawings}
                  onDrawingsChange={setDrawings} onSelectedDrawingChange={setSelectedDrawingId}
                  strategyId={selectedSignalStrategy ?? undefined}
                />
              </div>
            </div>
          </div>
        )
      ) : (
        /* 빈 상태 */
        <div className="flex bg-gray-950 rounded-xl items-center justify-center" style={{ height: '650px' }}>
          <div className="text-center">
            <p className="text-sm text-gray-500">종목을 선택하면 차트가 표시됩니다</p>
          </div>
        </div>
      )}

      {/* ─── BOTTOM: 3 columns ─────────────────── */}
      <div className="flex gap-3 items-start">

        {/* 종목 검색 */}
        <div className="w-72 shrink-0">
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">종목 검색</p>

            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                placeholder="예: TQQQ, SOXL, 삼성전자"
                value={query}
                onChange={e => handleQueryChange(e.target.value)}
                className="pl-9 bg-white border-gray-200 text-sm"
                disabled={!!selected}
              />

              {results.length > 0 && !selected && (
                <div className="absolute z-50 mt-1 w-full bg-white rounded-xl border border-gray-200 shadow-lg max-h-48 overflow-auto">
                  {results
                    .filter((s, i, arr) => arr.findIndex(x => x.symbol === s.symbol) === i)
                    .map(stock => (
                      <button
                        key={stock.symbol}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center justify-between transition-colors"
                        onClick={() => handleSelect(stock)}
                      >
                        <div>
                          <span className="font-semibold text-gray-900 text-sm">{stock.symbol}</span>
                          <span className="text-xs text-gray-400 ml-1.5">{stock.name}</span>
                        </div>
                        <Badge className={`shrink-0 border-0 text-xs ${stock.market === 'US' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}`}>
                          {stock.market}
                        </Badge>
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* 빠른 선택 */}
            {!selected && (
              <div className="mt-2.5">
                <p className="text-[10px] text-gray-400 mb-1.5">빠른 선택</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { symbol: 'SOXL', market: 'US' as const },
                    { symbol: 'TQQQ', market: 'US' as const },
                    { symbol: 'QLD',  market: 'US' as const },
                    { symbol: 'NVDA', market: 'US' as const },
                  ].map(({ symbol, market: m }) => (
                    <button
                      key={symbol}
                      onClick={() => {
                        setQuery(symbol);
                        search(symbol);
                      }}
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700 transition-colors"
                    >
                      {symbol}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 선택된 종목 */}
            {selected && (
              <div className="mt-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge className={`border-0 text-xs ${market === 'US' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                    {market}
                  </Badge>
                  <span className="font-bold text-sm text-gray-900">{selected.symbol}</span>
                </div>
                <button onClick={handleClear} className="text-xs text-gray-400 hover:text-gray-600 transition-colors underline">
                  변경
                </button>
              </div>
            )}

            {loading && (
              <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>데이터 로딩 중...</span>
              </div>
            )}
          </div>
        </div>

        {/* ─── 전략 선택 · 싱크 통합 카드 ─────────── */}
        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-bold text-gray-700">전략 선택 · 싱크</p>
              {selectedStrategyInfo && (
                <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                  {selectedStrategyInfo.name}
                </span>
              )}
            </div>
            <div className="p-3">
              {!strategySyncs ? (
                <>
                  {loading && (
                    <div className="text-center py-3 text-xs text-gray-400">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-1.5">
                    {Object.entries(STRATEGY_META).map(([key, meta]) => {
                      const signalId = SYNC_KEY_TO_SIGNAL[key as StrategyKey];
                      if (!signalId) return null;
                      const isActive = selectedSignalStrategy === signalId;
                      return (
                        <button
                          key={key}
                          onClick={() => handleStrategySelect(signalId)}
                          className={`w-full text-left p-2.5 rounded-lg border transition-all ${
                            isActive ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300 bg-white'
                          }`}
                        >
                          <span className={`text-xs font-semibold ${isActive ? 'text-blue-700' : 'text-gray-800'}`}>{meta.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-1.5">
                  {Object.entries(STRATEGY_META).map(([key, meta]) => {
                    const sync = strategySyncs[key as StrategyKey];
                    if (!sync) return null;
                    const signalId = SYNC_KEY_TO_SIGNAL[key as StrategyKey];
                    const isActive = signalId ? selectedSignalStrategy === signalId : false;
                    const isExpanded = selectedSyncKey === key;
                    const colors = getSyncColor(sync.syncRate);
                    return (
                      <button
                        key={key}
                        onClick={() => {
                          if (signalId) handleStrategySelect(signalId);
                          setSelectedSyncKey(isExpanded ? null : key as StrategyKey);
                        }}
                        className={`w-full text-left p-2.5 rounded-lg border transition-all ${
                          isActive ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <div className={`w-1.5 h-1.5 rounded-full ${colors.bar}`} />
                            <span className={`text-xs font-semibold ${isActive ? 'text-blue-700' : 'text-gray-800'}`}>{meta.label}</span>
                          </div>
                          <Badge className={`${colors.badge} border-0 text-[10px] font-bold px-1.5 py-0.5`}>
                            {sync.syncRate}%
                          </Badge>
                        </div>
                        <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full ${colors.bar} rounded-full`} style={{ width: `${sync.syncRate}%` }} />
                        </div>
                        {isExpanded && sync.criteria.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {sync.criteria.map((c, i) => (
                              <div key={i} className="flex items-center gap-1.5 text-[11px]">
                                {c.pass
                                  ? <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                                  : <XCircle className="h-3 w-3 text-gray-300 shrink-0" />}
                                <span className={c.pass ? 'text-gray-700' : 'text-gray-400'}>{c.label}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* KIS 전략 섹션 */}
              <div className="pt-2 mt-2 border-t border-amber-100">
                <div className="flex items-center gap-1.5 px-1 pb-1.5">
                  <Star className="h-3 w-3 text-amber-500" />
                  <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">KIS 전략</span>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {KIS_STRATEGIES.map(s => {
                    const isActive = selectedSignalStrategy === s.id;
                    return (
                      <button
                        key={s.id}
                        onClick={() => handleStrategySelect(s.id as SignalStrategyType)}
                        className={`w-full text-left p-2 rounded-lg border transition-all ${
                          isActive ? 'border-amber-400 bg-amber-50' : 'border-gray-200 hover:border-amber-200 bg-white'
                        }`}
                      >
                        <div className={`text-xs font-semibold ${isActive ? 'text-amber-700' : 'text-gray-800'}`}>{s.name}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5 leading-tight line-clamp-1">{s.description}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 즉시 주문 폼 */}
        <div className="w-72 shrink-0">
          {selected && stockData && !loading ? (
            <QuickOrderForm
              symbol={stockData.symbol} market={market}
              currentPrice={stockData.fundamentals.currentPrice}
              selectedStrategy={selectedSyncKey}
              syncRate={selectedSyncKey && strategySyncs ? strategySyncs[selectedSyncKey]?.syncRate : undefined}
            />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">즉시 주문</p>
              <p className="text-xs text-gray-400">종목 선택 후 주문할 수 있습니다</p>
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
