'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Pause,
  Trash2,
  X,
  Loader2,
  Menu,
  AlertTriangle,
} from 'lucide-react';

type StrategyVersion = 'v2.2' | 'v3.0' | 'v4.0';
type BrokerType = 'kis' | 'kiwoom';

interface Portfolio {
  id: string;
  symbol: string;
  broker_type: BrokerType;
  broker_credential_id?: string;
  strategy_version: string;
  total_capital: number;
  is_enabled: boolean;
  currentPrice?: number;
  change?: number;
  changeRate?: number;
  shares?: number;
  invested?: number;
  avgCost?: number;
  evalAmount?: number;
  pnl?: number;
  pnlRate?: number;
  currentT?: number;
  starPct?: number;
  targetPrice?: number;
  cycle?: number;
}

interface DashboardSummary {
  totalEval: number;
  totalInvested: number;
  totalPnl: number;
  totalPnlRate: number;
  totalCapital: number;
  investedRate: number;
  remainingBudget: number;
  pendingOrders: number;
}

export function InfiniteBuyDashboard() {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<'all' | 'profit' | 'loss'>('all');
  const [activePreset, setActivePreset] = useState<'laor' | 'v4' | 'real'>('laor');
  const [summary, setSummary] = useState<DashboardSummary>({
    totalEval: 0,
    totalInvested: 0,
    totalPnl: 0,
    totalPnlRate: 0,
    totalCapital: 0,
    investedRate: 0,
    remainingBudget: 0,
    pendingOrders: 0,
  });

  // 포트폴리오 데이터 로드
  const loadPortfolios = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    else setLoading(true);

    try {
      const settingsRes = await fetch('/api/auto-trade/settings');
      const settingsData = await settingsRes.json();
      const settings: Portfolio[] = settingsData.data ?? [];

      if (settings.length === 0) {
        setPortfolios([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const symbols = settings.map(s => s.symbol);
      const pricesRes = await fetch(`/api/stocks/prices?symbols=${symbols.join(',')}`);
      const pricesData = await pricesRes.json();
      const prices = pricesData.prices ?? {};

      const enrichedPortfolios = await Promise.all(
        settings.map(async (s) => {
          const price = prices[s.symbol];
          const currentPrice = price?.price ?? 0;
          const change = price?.change ?? 0;
          const changeRate = price?.changePercent ?? 0;

          const cycle = typeof window !== 'undefined'
            ? parseInt(localStorage.getItem(`inf-buy-cycle-${s.symbol.toUpperCase()}`) || '1', 10)
            : 1;

          let shares = 0;
          let invested = 0;

          try {
            const recordsRes = await fetch(`/api/infinite-buy/records?symbol=${s.symbol}`);
            const recordsData = await recordsRes.json();
            const buyRecords = (recordsData.buyRecords ?? []).filter((r: any) => r.cycle === cycle);
            const sellRecords = (recordsData.sellRecords ?? []).filter((r: any) => r.cycle === cycle);

            const totalBuyShares = buyRecords.reduce((sum: number, r: any) => sum + (r.shares || 0), 0);
            const totalBuyInvested = buyRecords.reduce((sum: number, r: any) => sum + (r.amount || 0), 0);
            const totalSoldShares = sellRecords.reduce((sum: number, r: any) => sum + (r.shares || 0), 0);

            shares = Math.max(0, totalBuyShares - totalSoldShares);
            invested = totalBuyInvested;
          } catch {}

          const avgCost = shares > 0 ? invested / shares : 0;
          const evalAmount = currentPrice * shares;
          const pnl = evalAmount - invested;
          const pnlRate = invested > 0 ? (pnl / invested) * 100 : 0;

          const divisions = s.strategy_version.toLowerCase() === 'v3.0' ? 20 : 40;
          const unitBuy = s.total_capital / divisions;
          const currentT = invested > 0 ? Math.ceil((invested / unitBuy) * 100) / 100 : 0;

          const baseStarPct = s.symbol.toUpperCase() === 'SOXL' ? 20 : 15;
          const starPct = currentT > 0 ? baseStarPct + currentT : baseStarPct;
          const targetPrice = avgCost > 0 ? avgCost * (1 + starPct / 100) : 0;

          return {
            ...s,
            currentPrice,
            change,
            changeRate,
            shares,
            invested,
            avgCost,
            evalAmount,
            pnl,
            pnlRate,
            currentT,
            starPct,
            targetPrice,
            cycle,
          };
        })
      );

      setPortfolios(enrichedPortfolios);

      let pendingCount = 0;
      try {
        const pendingRes = await fetch('/api/auto-trade/pending-orders');
        const pendingData = await pendingRes.json();
        pendingCount = (pendingData.orders ?? []).filter(
          (o: any) => o.status === 'submitted' || o.status === 'partial'
        ).length;
      } catch {}

      const totalEval = enrichedPortfolios.reduce((sum, p) => sum + (p.evalAmount || 0), 0);
      const totalInvested = enrichedPortfolios.reduce((sum, p) => sum + (p.invested || 0), 0);
      const totalCapital = enrichedPortfolios.reduce((sum, p) => sum + (p.total_capital || 0), 0);
      const totalPnl = totalEval - totalInvested;
      const totalPnlRate = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;
      const investedRate = totalCapital > 0 ? (totalInvested / totalCapital) * 100 : 0;
      const remainingBudget = totalCapital - totalInvested;

      setSummary({
        totalEval,
        totalInvested,
        totalPnl,
        totalPnlRate,
        totalCapital,
        investedRate,
        remainingBudget,
        pendingOrders: pendingCount,
      });

      setLastUpdate(new Date());
    } catch (err) {
      console.error('포트폴리오 로드 실패:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadPortfolios();
  }, [loadPortfolios]);

  const filteredPortfolios = portfolios.filter(p => {
    if (filterTab === 'profit') return (p.pnlRate ?? 0) > 0;
    if (filterTab === 'loss') return (p.pnlRate ?? 0) < 0;
    return true;
  });

  const profitCount = portfolios.filter(p => (p.pnlRate ?? 0) > 0).length;
  const lossCount = portfolios.filter(p => (p.pnlRate ?? 0) < 0).length;

  const selectedPortfolio = selectedSymbol
    ? portfolios.find(p => p.symbol === selectedSymbol)
    : null;

  const formatPrice = (price: number, symbol?: string) => {
    const isKR = symbol ? /^\d{6}$/.test(symbol) : false;
    if (isKR) return `₩${Math.round(price).toLocaleString()}`;
    return `$${price.toLocaleString(undefined, { minimumFractionDigits: price >= 100 ? 2 : 4, maximumFractionDigits: 4 })}`;
  };

  const formatMoney = (amount: number, symbol?: string) => {
    const isKR = symbol ? /^\d{6}$/.test(symbol) : false;
    if (isKR) return `₩${Math.round(amount).toLocaleString()}`;
    return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // ========== 상세 뷰 ==========
  if (selectedPortfolio) {
    const p = selectedPortfolio;
    const isOverseas = !/^\d{6}$/.test(p.symbol);
    const divisions = p.strategy_version.toLowerCase() === 'v3.0' ? 20 : 40;
    const unitBuy = p.total_capital / divisions;
    const remainingCapital = p.total_capital - (p.invested ?? 0);
    const investedPct = p.total_capital > 0 ? ((p.invested ?? 0) / p.total_capital * 100) : 0;
    const remainingPct = 100 - investedPct;
    const evalPct = p.total_capital > 0 ? ((p.evalAmount ?? 0) / p.total_capital * 100) : 0;

    const t = p.currentT ?? 0;
    const tPct = divisions > 0 ? (t / divisions) * 100 : 0;
    let nextStep = '초기 매수';
    let nextStepDesc = '발자점 + 평단 LOC';
    if (t >= 1 && t < 10) {
      nextStep = '전반전 매수';
      nextStepDesc = '발자점 + 평단 LOC';
    } else if (t >= 10 && t < 20) {
      nextStep = '후반전 매수';
      nextStepDesc = '물타기 구간';
    } else if (t >= 20) {
      nextStep = '사이클 종료';
      nextStepDesc = '익절 또는 추가 전략';
    }

    // 1회매수금 = 잔금 / (N - T)
    const oneTimeBuy = (divisions - t) > 0 ? remainingCapital / (divisions - t) : 0;

    return (
      <div className="space-y-3">
        {/* 헤더 */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedSymbol(null)}
            className="flex items-center gap-1.5 text-gray-500 hover:text-gray-900 transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="text-sm">목록</span>
          </button>
          <div className="flex items-center gap-2">
            <span className="font-bold text-xl">{p.symbol}</span>
            <span className="text-sm text-gray-400">{p.symbol} · {isOverseas ? 'AMEX' : 'KRX'} · {p.strategy_version}</span>
          </div>
        </div>

        {/* 액션 버튼 */}
        <div className="flex gap-2">
          <button className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <Menu className="h-4 w-4" />
            일시정지
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <Trash2 className="h-4 w-4" />
            삭제
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-500 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
            <X className="h-4 w-4" />
            전량 청산
          </button>
        </div>

        {/* 현재가 카드 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="text-xs text-gray-400 mb-1">현재가</div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold tracking-tight">{formatPrice(p.currentPrice ?? 0, p.symbol)}</span>
            {(p.change ?? 0) !== 0 && (
              <span className={`text-sm font-medium ${(p.changeRate ?? 0) >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                ▲ {formatPrice(Math.abs(p.change ?? 0), p.symbol)} ({(p.changeRate ?? 0) >= 0 ? '+' : ''}{(p.changeRate ?? 0).toFixed(2)}%)
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4 mt-6 pt-4 border-t border-gray-100">
            <div>
              <div className="text-xs text-gray-400 mb-1">평단가</div>
              <div className="text-sm font-medium">{formatPrice(p.avgCost ?? 0, p.symbol)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">익절 (+{(p.starPct ?? 0).toFixed(0)}%)</div>
              <div className="text-sm font-medium text-red-500">{formatPrice(p.targetPrice ?? 0, p.symbol)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">보유 수량</div>
              <div className="text-sm font-medium">{(p.shares ?? 0).toLocaleString()} 주</div>
            </div>
          </div>
        </div>

        {/* V4.0 사이클 상태 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-5">
            <span className="font-medium">{p.strategy_version.toUpperCase()} 사이클 상태</span>
            <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-md">일반 모드</span>
          </div>

          <div className="grid grid-cols-2 gap-8">
            <div>
              <div className="text-xs text-gray-400 mb-1">T 값</div>
              <div className="text-3xl font-bold">{t.toFixed(1)}</div>
              <div className="text-xs text-gray-400 mt-1">{investedPct.toFixed(1)}% (N={divisions})</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">잔금 ({isOverseas ? 'USD' : 'KRW'})</div>
              <div className="text-3xl font-bold">{formatMoney(remainingCapital, p.symbol)}</div>
              <div className="text-xs text-gray-400 mt-1">1회매수: 잔금/(N-T)</div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-gray-100">
            <div className="text-xs text-gray-400 mb-1">다음 단계</div>
            <div className="font-medium">{nextStep}</div>
            <div className="text-xs text-gray-400 mt-0.5">{nextStepDesc}</div>
            <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-red-400 rounded-full transition-all"
                style={{ width: `${Math.min(100, tPct)}%` }}
              />
            </div>
          </div>
        </div>

        {/* 예산 현황 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-5">
            <span className="font-medium">예산 현황</span>
            <span className="text-xs text-gray-400">투입률 {investedPct.toFixed(1)}%</span>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-5">
            <div>
              <div className="text-xs text-gray-400 mb-1">원금</div>
              <div className="font-medium">{formatMoney(p.total_capital, p.symbol)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">투입액</div>
              <div className="font-medium">{formatMoney(p.invested ?? 0, p.symbol)}</div>
              <div className="text-xs text-gray-400">{investedPct.toFixed(1)}%</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">잔여 예산</div>
              <div className="font-medium">{formatMoney(remainingCapital, p.symbol)}</div>
              <div className="text-xs text-gray-400">{remainingPct.toFixed(1)}%</div>
              <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-red-400 rounded-full" style={{ width: `${remainingPct}%` }} />
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">평가액</div>
              <div className="font-medium">{formatMoney(p.evalAmount ?? 0, p.symbol)}</div>
              <div className={`text-xs ${(p.pnl ?? 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {(p.pnl ?? 0) >= 0 ? '+' : ''}{formatMoney(p.pnl ?? 0, p.symbol)} ({(p.pnl ?? 0) >= 0 ? '+' : ''}{(p.pnlRate ?? 0).toFixed(2)}%)
              </div>
              <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-green-400 rounded-full" style={{ width: `${Math.min(100, evalPct)}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ========== 대시보드 목록 뷰 ==========
  return (
    <div className="space-y-3">
      {/* 헤더 + 프리셋 탭 */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h2 className="text-xl font-bold">대시보드</h2>
          <div className="flex gap-1">
            <button
              onClick={() => setActivePreset('laor')}
              className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                activePreset === 'laor'
                  ? 'bg-red-500 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              라오어 무한매수법
            </button>
            <button
              onClick={() => setActivePreset('v4')}
              className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                activePreset === 'v4'
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              무매 V4.0
            </button>
            <button
              onClick={() => setActivePreset('real')}
              className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                activePreset === 'real'
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              실계좌
            </button>
          </div>
        </div>
        <p className="text-sm text-gray-400">
          {portfolios.length}개 종목 자동 운용중
          {lastUpdate && ` · 마지막 갱신 ${lastUpdate.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
        </p>
      </div>

      {/* 신규 포트폴리오 생성 버튼 */}
      <button className="w-full flex items-center justify-center gap-2 h-11 text-sm text-green-600 border-2 border-dashed border-green-300 rounded-xl hover:bg-green-50 transition-colors">
        <Plus className="h-4 w-4" />
        신규 포트폴리오 생성
      </button>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : portfolios.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">📊</div>
          <p className="font-medium">등록된 포트폴리오가 없습니다</p>
          <p className="text-sm mt-1">위 버튼을 눌러 새 포트폴리오를 추가하세요</p>
        </div>
      ) : (
        <>
          {/* 요약 카드 */}
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {/* 총 평가액 */}
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-gray-500">총 평가액</span>
              <div className="text-right">
                <span className="font-bold text-green-600">{formatMoney(summary.totalEval)}</span>
                <span className="text-green-600 ml-2">
                  ({summary.totalPnlRate >= 0 ? '+' : ''}{summary.totalPnlRate.toFixed(2)}%)
                </span>
                <div className="text-xs text-green-500">
                  {summary.totalPnl >= 0 ? '+' : ''}{formatMoney(summary.totalPnl)}
                </div>
              </div>
            </div>
            {/* 시드 투입률 */}
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-gray-500">시드 투입률</span>
              <div className="text-right">
                <span className="font-bold">{summary.investedRate.toFixed(1)}%</span>
                <div className="text-xs text-gray-400">
                  {formatMoney(summary.totalInvested)} / {formatMoney(summary.totalCapital)}
                </div>
              </div>
            </div>
            {/* 미투입 예산 */}
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-gray-500">미투입 예산</span>
              <div className="text-right">
                <span className="font-bold">{formatMoney(summary.remainingBudget)}</span>
                <div className="text-xs text-gray-400">
                  총 원금 {formatMoney(summary.totalCapital)}
                </div>
              </div>
            </div>
            {/* 대기중 주문 */}
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-gray-500">대기중 주문</span>
              <div className="text-right">
                <span className="font-bold">{summary.pendingOrders} 건</span>
                <div className="text-xs text-gray-400">
                  LOC · 장마감 체결 대기
                </div>
              </div>
            </div>
          </div>

          {/* 운용중 포트폴리오 */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className="font-medium">운용중 포트폴리오</span>
                <span className="text-sm text-gray-400">{portfolios.length}</span>
              </div>
              <div className="flex gap-1 text-xs">
                <button
                  onClick={() => setFilterTab('all')}
                  className={`px-2 py-1 rounded transition-colors ${
                    filterTab === 'all' ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-100'
                  }`}
                >
                  전체 {portfolios.length}
                </button>
                <button
                  onClick={() => setFilterTab('profit')}
                  className={`px-2 py-1 rounded transition-colors ${
                    filterTab === 'profit' ? 'bg-red-500 text-white' : 'text-gray-400 hover:bg-gray-100'
                  }`}
                >
                  수익 {profitCount}
                </button>
                <button
                  onClick={() => setFilterTab('loss')}
                  className={`px-2 py-1 rounded transition-colors ${
                    filterTab === 'loss' ? 'bg-blue-500 text-white' : 'text-gray-400 hover:bg-gray-100'
                  }`}
                >
                  손실 {lossCount}
                </button>
              </div>
            </div>

            <div className="divide-y divide-gray-50">
              {filteredPortfolios.map((p) => {
                const isProfit = (p.pnlRate ?? 0) >= 0;
                const investedPct = p.total_capital > 0 ? ((p.invested ?? 0) / p.total_capital * 100) : 0;

                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedSymbol(p.symbol)}
                    className="w-full flex items-center justify-between px-4 py-4 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{p.symbol}</span>
                        <span className="text-xs text-gray-400">{p.strategy_version}</span>
                      </div>
                      <div className="flex items-center gap-1 mt-1 text-xs text-gray-400 flex-wrap">
                        <span>평단 {formatPrice(p.avgCost ?? 0, p.symbol)}</span>
                        <span className={isProfit ? 'text-red-400' : 'text-blue-400'}>
                          T+{(p.starPct ?? 0).toFixed(0)}%
                        </span>
                        <span className={isProfit ? 'text-red-400' : 'text-blue-400'}>
                          {formatPrice(p.targetPrice ?? 0, p.symbol)}
                        </span>
                        <span className="text-gray-300">—</span>
                        <span>{p.cycle}회차</span>
                        <span>·</span>
                        <span>{investedPct.toFixed(0)}%</span>
                      </div>
                    </div>
                    <div className="text-right ml-4 shrink-0">
                      <div className="flex items-center gap-2 justify-end">
                        <span className="font-bold">{formatPrice(p.currentPrice ?? 0, p.symbol)}</span>
                        <span className="text-gray-400">·</span>
                        <span className="text-gray-500">{(p.shares ?? 0).toLocaleString()}주</span>
                        <span className={`font-bold ${isProfit ? 'text-red-500' : 'text-blue-500'}`}>
                          {isProfit ? '+' : ''}{(p.pnlRate ?? 0).toFixed(2)}%
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-300 ml-2 shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* 금일 체결 */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="font-medium">금일 체결</span>
              <span className="flex items-center gap-1 text-xs text-green-500">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                LIVE
              </span>
            </div>
            <div className="text-sm text-gray-400">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-300">01:14:48</span>
                <span className="text-gray-500">일반</span>
                <span>무한매수 SOXL · v4.0</span>
              </div>
              <div className="text-xs text-gray-400 mt-1 ml-14">11건 모두 건너뛰었습니다.</div>
            </div>
            <button className="text-xs text-gray-400 hover:text-gray-600 mt-3 block">
              전체 로그 보기 →
            </button>
          </div>

          {/* 주의 알림 */}
          <div className="bg-white rounded-xl border border-red-200 p-4">
            <div className="flex items-center gap-2 text-red-500 mb-2">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-medium">주의 알림</span>
            </div>
            <p className="text-sm text-gray-500">
              현재 주의가 필요한 종목이 없습니다.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
