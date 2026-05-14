'use client';

import { useState, useEffect, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Plus,
  RefreshCw,
  ChevronLeft,
  Pause,
  Trash2,
  XCircle,
  TrendingUp,
  TrendingDown,
  Clock,
  AlertTriangle,
  Loader2,
  ChevronRight,
  DollarSign,
  Percent,
  Wallet,
  FileText,
} from 'lucide-react';
import { useInfiniteBuyRecords } from '@/hooks/useInfiniteBuyRecords';

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
  // 계산된 값
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

interface SavedAccount {
  id: string;
  brokerType: BrokerType;
  accountAlias: string;
}

export function InfiniteBuyDashboard() {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<'all' | 'profit' | 'loss'>('all');
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
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

  // 계좌 정보 로드
  useEffect(() => {
    fetch('/api/broker/credentials')
      .then(r => r.json())
      .then(data => {
        if (data.success && data.data) {
          setSavedAccounts(data.data.map((c: any) => ({
            id: c.id,
            brokerType: (c.brokerType ?? c.broker_type) as BrokerType,
            accountAlias: c.accountAlias ?? c.account_alias ?? 'default',
          })));
        }
      })
      .catch(() => {});
  }, []);

  // 포트폴리오 데이터 로드
  const loadPortfolios = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    else setLoading(true);

    try {
      // 1. 자동매매 설정 조회
      const settingsRes = await fetch('/api/auto-trade/settings');
      const settingsData = await settingsRes.json();
      const settings: Portfolio[] = settingsData.data ?? [];

      if (settings.length === 0) {
        setPortfolios([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // 2. 각 종목의 현재가 조회
      const symbols = settings.map(s => s.symbol);
      const pricesRes = await fetch(`/api/stocks/prices?symbols=${symbols.join(',')}`);
      const pricesData = await pricesRes.json();
      const prices = pricesData.prices ?? {};

      // 3. 각 종목의 트래커 데이터 조회 (매수/매도 기록)
      const enrichedPortfolios = await Promise.all(
        settings.map(async (s) => {
          const price = prices[s.symbol];
          const currentPrice = price?.price ?? 0;
          const change = price?.change ?? 0;
          const changeRate = price?.changePercent ?? 0;

          // 트래커에서 보유수량/투자금액 조회
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

          // T값, 별%, 익절가 계산
          const divisions = s.strategy_version.toLowerCase() === 'v3.0' ? 20 : 40;
          const unitBuy = s.total_capital / divisions;
          const currentT = invested > 0 ? Math.ceil((invested / unitBuy) * 100) / 100 : 0;

          // SOXL은 20%, 나머지는 15%
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

      // 대기중 주문 조회
      let pendingCount = 0;
      try {
        const pendingRes = await fetch('/api/auto-trade/pending-orders');
        const pendingData = await pendingRes.json();
        pendingCount = (pendingData.orders ?? []).filter(
          (o: any) => o.status === 'submitted' || o.status === 'partial'
        ).length;
      } catch {}

      // Summary 계산
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

  // 필터링된 포트폴리오
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
    return `$${price.toFixed(price >= 1 ? 2 : 4)}`;
  };

  const formatMoney = (amount: number, symbol?: string) => {
    const isKR = symbol ? /^\d{6}$/.test(symbol) : false;
    if (isKR) return `₩${Math.round(amount).toLocaleString()}`;
    return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // 상세 뷰
  if (selectedPortfolio) {
    const p = selectedPortfolio;
    const isOverseas = !/^\d{6}$/.test(p.symbol);
    const divisions = p.strategy_version.toLowerCase() === 'v3.0' ? 20 : 40;
    const unitBuy = p.total_capital / divisions;
    const remainingCapital = p.total_capital - (p.invested ?? 0);
    const investedPct = p.total_capital > 0 ? ((p.invested ?? 0) / p.total_capital * 100) : 0;

    // 다음 단계 계산
    const t = p.currentT ?? 0;
    let nextStep = '초기 매수';
    let nextStepDesc = '발자점 + 평단 LOC';
    if (t >= 1) {
      if (t < 10) {
        nextStep = '전반전 매수';
        nextStepDesc = '발자점 + 평단 LOC';
      } else if (t < 20) {
        nextStep = '후반전 매수';
        nextStepDesc = '물타기 구간';
      } else {
        nextStep = '사이클 종료';
        nextStepDesc = '익절 또는 추가 전략';
      }
    }

    return (
      <div className="space-y-4">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setSelectedSymbol(null)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="text-sm">목록</span>
            <span className="font-bold text-lg text-gray-900">{p.symbol}</span>
            <span className="text-xs text-gray-400">{p.symbol} · {isOverseas ? 'AMEX' : 'KRX'} · {p.strategy_version}</span>
          </button>
        </div>

        {/* 액션 버튼 */}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="text-gray-600">
            <Pause className="h-3.5 w-3.5 mr-1.5" />
            일시정지
          </Button>
          <Button variant="outline" size="sm" className="text-gray-600">
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            삭제
          </Button>
          <Button variant="outline" size="sm" className="text-red-500 border-red-200 hover:bg-red-50">
            <XCircle className="h-3.5 w-3.5 mr-1.5" />
            전량 청산
          </Button>
        </div>

        {/* 현재가 섹션 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="text-xs text-gray-400 mb-1">현재가</div>
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold text-gray-900">
              {formatPrice(p.currentPrice ?? 0, p.symbol)}
            </span>
            {(p.changeRate ?? 0) !== 0 && (
              <span className={`flex items-center text-sm font-medium ${
                (p.changeRate ?? 0) >= 0 ? 'text-red-500' : 'text-blue-500'
              }`}>
                <span className="mr-0.5">{(p.changeRate ?? 0) >= 0 ? '▲' : '▼'}</span>
                {formatPrice(Math.abs(p.change ?? 0), p.symbol)}
                <span className="ml-1">({(p.changeRate ?? 0) >= 0 ? '+' : ''}{(p.changeRate ?? 0).toFixed(2)}%)</span>
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4 mt-5 pt-5 border-t border-gray-100">
            <div>
              <div className="text-xs text-gray-400 mb-1">평단가</div>
              <div className="font-medium text-gray-900">{formatPrice(p.avgCost ?? 0, p.symbol)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">익절 (+{p.starPct?.toFixed(0)}%)</div>
              <div className="font-medium text-red-500">{formatPrice(p.targetPrice ?? 0, p.symbol)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">보유 수량</div>
              <div className="font-medium text-gray-900">{(p.shares ?? 0).toLocaleString()} 주</div>
            </div>
          </div>
        </div>

        {/* V4.0 사이클 상태 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="font-medium text-gray-900">{p.strategy_version.toUpperCase()} 사이클 상태</span>
            <Badge variant="outline" className="text-xs">일반 모드</Badge>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="text-xs text-gray-400 mb-1">T 값</div>
              <div className="text-2xl font-bold text-gray-900">{(p.currentT ?? 0).toFixed(1)}</div>
              <div className="text-xs text-gray-400 mt-1">{investedPct.toFixed(1)}% (N={divisions})</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">잔금 ({isOverseas ? 'USD' : 'KRW'})</div>
              <div className="text-2xl font-bold text-gray-900">{formatMoney(remainingCapital, p.symbol)}</div>
              <div className="text-xs text-gray-400 mt-1">1회매수: 잔금/(N-T)</div>
            </div>
          </div>

          <div className="mt-5 pt-5 border-t border-gray-100">
            <div className="text-xs text-gray-400 mb-2">다음 단계</div>
            <div className="font-medium text-gray-900">{nextStep}</div>
            <div className="text-xs text-gray-400 mt-1">{nextStepDesc}</div>
            <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-red-400 to-red-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, (t / divisions) * 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* 예산 현황 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="font-medium text-gray-900">예산 현황</span>
            <span className="text-xs text-gray-400">투입률 {investedPct.toFixed(1)}%</span>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="text-xs text-gray-400 mb-1">원금</div>
              <div className="font-medium text-gray-900">{formatMoney(p.total_capital, p.symbol)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">투입액</div>
              <div className="font-medium text-gray-900">{formatMoney(p.invested ?? 0, p.symbol)}</div>
              <div className="text-xs text-gray-400">{investedPct.toFixed(1)}%</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">잔여 예산</div>
              <div className="font-medium text-gray-900">{formatMoney(remainingCapital, p.symbol)}</div>
              <div className="text-xs text-gray-400">{(100 - investedPct).toFixed(1)}%</div>
              <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-red-400 rounded-full"
                  style={{ width: `${100 - investedPct}%` }}
                />
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">평가액</div>
              <div className="font-medium text-gray-900">{formatMoney(p.evalAmount ?? 0, p.symbol)}</div>
              <div className={`text-xs ${(p.pnl ?? 0) >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                {(p.pnl ?? 0) >= 0 ? '+' : ''}{formatMoney(p.pnl ?? 0, p.symbol)} ({(p.pnl ?? 0) >= 0 ? '+' : ''}{(p.pnlRate ?? 0).toFixed(2)}%)
              </div>
              <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-400 rounded-full"
                  style={{ width: `${Math.min(100, ((p.evalAmount ?? 0) / p.total_capital) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 대시보드 목록 뷰
  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">대시보드</h2>
          <p className="text-xs text-gray-400">
            {portfolios.length}개 종목 자동 운용중
            {lastUpdate && ` · 마지막 갱신 ${lastUpdate.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => loadPortfolios(true)}
          disabled={refreshing}
          className="gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          새로고침
        </Button>
      </div>

      {/* 신규 포트폴리오 생성 버튼 */}
      <Button variant="outline" className="w-full justify-start gap-2 h-11 border-dashed">
        <Plus className="h-4 w-4" />
        신규 포트폴리오 생성
      </Button>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : portfolios.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="font-medium">등록된 포트폴리오가 없습니다</p>
          <p className="text-sm mt-1">위 버튼을 눌러 새 포트폴리오를 추가하세요</p>
        </div>
      ) : (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-2 gap-3">
            {/* 총 평가액 */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                <DollarSign className="h-3.5 w-3.5" />
                총 평가액
              </div>
              <div className="text-xl font-bold text-gray-900">
                {formatMoney(summary.totalEval)}
              </div>
              <div className={`text-sm font-medium mt-1 ${summary.totalPnl >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                ({summary.totalPnlRate >= 0 ? '+' : ''}{summary.totalPnlRate.toFixed(2)}%)
                <span className="ml-2">
                  {summary.totalPnl >= 0 ? '+' : ''}{formatMoney(summary.totalPnl)}
                </span>
              </div>
            </div>

            {/* 시드 투입률 */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                <Percent className="h-3.5 w-3.5" />
                시드 투입률
              </div>
              <div className="text-xl font-bold text-gray-900">
                {summary.investedRate.toFixed(1)}%
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {formatMoney(summary.totalInvested)} / {formatMoney(summary.totalCapital)}
              </div>
            </div>

            {/* 미투입 예산 */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                <Wallet className="h-3.5 w-3.5" />
                미투입 예산
              </div>
              <div className="text-xl font-bold text-gray-900">
                {formatMoney(summary.remainingBudget)}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                총 원금 {formatMoney(summary.totalCapital)}
              </div>
            </div>

            {/* 대기중 주문 */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                <Clock className="h-3.5 w-3.5" />
                대기중 주문
              </div>
              <div className="text-xl font-bold text-gray-900">
                {summary.pendingOrders} 건
              </div>
              <div className="text-xs text-gray-400 mt-1">
                LOC · 장마감 체결 대기
              </div>
            </div>
          </div>

          {/* 운용중 포트폴리오 */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">운용중 포트폴리오</span>
                <Badge variant="secondary" className="text-xs">{portfolios.length}</Badge>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setFilterTab('all')}
                  className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
                    filterTab === 'all' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  전체 {portfolios.length}
                </button>
                <button
                  onClick={() => setFilterTab('profit')}
                  className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
                    filterTab === 'profit' ? 'bg-red-500 text-white' : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  수익 {profitCount}
                </button>
                <button
                  onClick={() => setFilterTab('loss')}
                  className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
                    filterTab === 'loss' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  손실 {lossCount}
                </button>
              </div>
            </div>

            <div className="divide-y divide-gray-50">
              {filteredPortfolios.map((p) => {
                const isOverseas = !/^\d{6}$/.test(p.symbol);
                const isProfit = (p.pnlRate ?? 0) >= 0;

                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedSymbol(p.symbol)}
                    className="w-full flex items-center justify-between px-4 py-4 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900">{p.symbol}</span>
                        <span className="text-xs text-gray-400">{p.strategy_version}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                        <span>평단 {formatPrice(p.avgCost ?? 0, p.symbol)}</span>
                        <span>T+{p.starPct?.toFixed(0)}%</span>
                        <span className={isProfit ? 'text-red-400' : 'text-blue-400'}>
                          {formatPrice(p.targetPrice ?? 0, p.symbol)}
                        </span>
                        <span className="text-gray-300">—</span>
                        <span>{p.cycle}회차</span>
                        <span>·</span>
                        <span>{((p.invested ?? 0) / p.total_capital * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                    <div className="text-right ml-4">
                      <div className="flex items-center gap-2 justify-end">
                        <span className="font-bold text-gray-900">
                          {formatPrice(p.currentPrice ?? 0, p.symbol)}
                        </span>
                        <span className="text-gray-400">·</span>
                        <span className="text-gray-600">{(p.shares ?? 0).toLocaleString()}주</span>
                        <span className={`font-bold ${isProfit ? 'text-red-500' : 'text-blue-500'}`}>
                          {isProfit ? '+' : ''}{(p.pnlRate ?? 0).toFixed(2)}%
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-300 ml-2" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* 금일 체결 */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="font-medium text-gray-900">금일 체결</span>
              <span className="flex items-center gap-1 text-xs text-green-500">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                LIVE
              </span>
            </div>
            <div className="text-sm text-gray-500">
              체결 내역이 없습니다.
            </div>
            <button className="text-xs text-gray-400 hover:text-gray-600 mt-2">
              전체 로그 보기 →
            </button>
          </div>

          {/* 주의 알림 */}
          <div className="bg-red-50 rounded-2xl border border-red-200 p-4">
            <div className="flex items-center gap-2 text-red-600 mb-2">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-medium">주의 알림</span>
            </div>
            <p className="text-sm text-red-600/80">
              현재 주의가 필요한 종목이 없습니다.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
