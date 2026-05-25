'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Trash2,
  X,
  Loader2,
  Menu,
  AlertTriangle,
  Check,
  Pencil,
} from 'lucide-react';
import { getV22StarPct, getV3StarPct } from '@/components/infinite-buy/StrategyCalc';
import { TradingGuide } from '@/components/infinite-buy/TradingGuide';

// 전략 버전별 별%(목표 익절률) 계산 — 정식 공식 (StrategyCalc.tsx)
function computeStarPct(strategyVersion: string, symbol: string, t: number, divisions: number): number {
  const v = strategyVersion.toLowerCase();
  if (v === 'v3.0' || v === 'v4.0') return getV3StarPct(symbol, t);
  return getV22StarPct(symbol, t, divisions);
}

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
  divisionsUsed?: number;  // 자동 계산: 현재 회차의 매수 기록 수 (BuyTracker와 동일 소스)
  smart_skip_loc?: boolean;  // 스마트 스킵: 일일 체결 수 달성 시 LOC 주문 생략
}

interface PendingOrder {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  order_type: string;
  order_quantity: number;
  order_price: number;
  status: string;
  order_time: string;
  strategy_version?: string;
}

interface Warning {
  symbol: string;
  type: 'high-loss' | 'high-t' | 'paused' | 'low-budget';
  message: string;
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

interface InfiniteBuyDashboardProps {
  onNavigateToManual?: () => void;
}

export function InfiniteBuyDashboard({ onNavigateToManual }: InfiniteBuyDashboardProps) {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<'all' | 'profit' | 'loss'>('all');
  const [activePreset, setActivePreset] = useState<'laor' | 'v4' | 'real'>('laor');
  // 선택된 포트폴리오의 자금 모드 (실제/가상) — 종목별 localStorage 공유
  const [detailFundMode, setDetailFundMode] = useState<'real' | 'virtual'>('virtual');

  useEffect(() => {
    if (!selectedSymbol || typeof window === 'undefined') return;
    const saved = localStorage.getItem(`inf-buy-mode-${selectedSymbol.toUpperCase()}`);
    setDetailFundMode(saved === 'real' ? 'real' : 'virtual');
  }, [selectedSymbol]);

  const handleDetailFundModeChange = (mode: 'real' | 'virtual') => {
    if (!selectedSymbol || typeof window === 'undefined') return;
    setDetailFundMode(mode);
    localStorage.setItem(`inf-buy-mode-${selectedSymbol.toUpperCase()}`, mode);
  };

  // 원금(total_capital) 인라인 편집 state
  const [editingCapital, setEditingCapital] = useState(false);
  const [capitalEditValue, setCapitalEditValue] = useState('');
  const [savingCapital, setSavingCapital] = useState(false);

  // 진행 상태(divisionsUsed) 수동 오버라이드 — BuyTracker와 동일 localStorage 키 공유
  const [divisionsOverride, setDivisionsOverride] = useState<number | null>(null);
  const [editingDivisions, setEditingDivisions] = useState(false);
  const [divisionsEditValue, setDivisionsEditValue] = useState('');

  // 선택된 포트폴리오의 cycle 기준으로 오버라이드 로드
  useEffect(() => {
    if (!selectedSymbol || typeof window === 'undefined') {
      setDivisionsOverride(null);
      return;
    }
    const p = portfolios.find(x => x.symbol === selectedSymbol);
    if (!p) {
      setDivisionsOverride(null);
      return;
    }
    const key = `inf-buy-divisions-${selectedSymbol.toUpperCase()}-${p.cycle ?? 1}`;
    const saved = localStorage.getItem(key);
    setDivisionsOverride(saved !== null ? parseInt(saved, 10) : null);
  }, [selectedSymbol, portfolios]);

  function saveDivisionsOverride(value: number | null) {
    if (!selectedSymbol || typeof window === 'undefined') return;
    const p = portfolios.find(x => x.symbol === selectedSymbol);
    if (!p) return;
    const key = `inf-buy-divisions-${selectedSymbol.toUpperCase()}-${p.cycle ?? 1}`;
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, String(value));
    setDivisionsOverride(value);
  }

  // 실제 모드: 브로커 잔액 (싱크한 계좌의 totalAsset)
  const [brokerBalance, setBrokerBalance] = useState<number | null>(null);
  const [balanceSource, setBalanceSource] = useState<'positions' | 'records' | 'none'>('none');
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  // USD → KRW 환율 (KIS 응답의 frst_bltn_exrt). 0이면 미표시
  const [exchangeRate, setExchangeRate] = useState<number>(0);
  // 예산 현황 표시 통화 (해외 포트폴리오용 토글)
  const [displayCurrency, setDisplayCurrency] = useState<'USD' | 'KRW'>('USD');

  // 실제 모드일 때 브로커 잔액 fetch
  // - includeOverseas=true로 국내·해외 통합 조회
  // - 종목 시장(KR/US)에 맞는 쪽의 totalAsset만 사용
  // - broker_credential_id 없으면 broker_type로 fallback
  const loadBrokerBalance = useCallback(async (portfolio: Portfolio | null | undefined, silent = false) => {
    if (!portfolio) {
      setBrokerBalance(null);
      setBalanceError('포트폴리오 정보 없음');
      return;
    }
    if (!silent) setLoadingBalance(true);
    setBalanceError(null);
    try {
      const params = new URLSearchParams();
      if (portfolio.broker_credential_id) {
        params.set('credentialId', portfolio.broker_credential_id);
      } else if (portfolio.broker_type) {
        params.set('brokerType', portfolio.broker_type);
      } else {
        setBalanceError('계좌 연결 정보 없음 — 자동매매 > 계좌 연결에서 등록해주세요');
        setBrokerBalance(null);
        return;
      }
      // 국내·해외 통합 조회 (KIS만 해당, 키움은 단일 응답)
      params.set('includeOverseas', 'true');
      const res = await fetch(`/api/broker/balance?${params.toString()}`);
      const data = await res.json();
      console.log('[dashboard] balance API 응답:', {
        success: data.success,
        exchangeRate: data.exchangeRate,
        hasOverseas: !!data.data?.overseas,
        overseasTotalAsset: data.data?.overseas?.balance?.totalAsset,
        error: data.error,
      });
      if (data.exchangeRate && data.exchangeRate > 0) {
        setExchangeRate(data.exchangeRate);
      }
      if (!data.success) {
        setBalanceError(data.error || '잔액 조회 실패');
        setBrokerBalance(null);
        setBalanceSource('none');
        return;
      }
      const isOverseasPortfolio = !/^\d{6}$/.test(portfolio.symbol);
      // includeOverseas 응답 → { domestic: {...}, overseas: {...} }
      const overseas = data.data?.overseas?.balance;
      const domestic = data.data?.domestic?.balance;
      const single = data.data?.balance;
      const targetBalance = isOverseasPortfolio
        ? (overseas ?? single)
        : (domestic ?? single);
      const positionAsset = targetBalance?.totalAsset ?? 0;

      // KIS 해외 잔고 API는 USD 예수금을 별도 endpoint로만 조회 가능 →
      // 평가금이 0이면 누적 매수금(records 기반)을 fallback으로 표시
      if (positionAsset > 0) {
        setBrokerBalance(positionAsset);
        setBalanceSource('positions');
      } else if (portfolio.invested && portfolio.invested > 0) {
        setBrokerBalance(portfolio.invested);
        setBalanceSource('records');
      } else {
        setBrokerBalance(0);
        setBalanceSource('none');
      }
    } catch {
      setBalanceError('잔액 조회 중 오류');
      setBrokerBalance(null);
    } finally {
      if (!silent) setLoadingBalance(false);
    }
  }, []);

  // 상세 뷰 진입 시 잔액 로드 — 환율(exchangeRate) 정보를 받기 위해 가상 모드에서도 silent 호출
  // 실제 모드일 때만 brokerBalance를 화면에 반영, 가상 모드는 환율만 활용
  const selectedPortfolioForBalance = selectedSymbol ? portfolios.find(p => p.symbol === selectedSymbol) : null;
  useEffect(() => {
    if (!selectedPortfolioForBalance) {
      setBrokerBalance(null);
      setBalanceError(null);
      return;
    }
    if (detailFundMode === 'real') {
      // 실제 모드: 표시용 + 30초 폴링
      loadBrokerBalance(selectedPortfolioForBalance, false);
      const interval = setInterval(() => loadBrokerBalance(selectedPortfolioForBalance, true), 30000);
      return () => clearInterval(interval);
    } else {
      // 가상 모드: 환율 표시용으로만 1회 silent fetch
      setBrokerBalance(null);
      setBalanceError(null);
      loadBrokerBalance(selectedPortfolioForBalance, true);
    }
  }, [detailFundMode, selectedPortfolioForBalance, loadBrokerBalance]);

  // 원금 저장 — DB(auto_trade_settings)에 반영
  async function handleSaveCapital(portfolio: Portfolio) {
    const newCapital = parseFloat(capitalEditValue);
    if (isNaN(newCapital) || newCapital <= 0) {
      alert('유효한 금액을 입력하세요.');
      return;
    }
    setSavingCapital(true);
    try {
      const res = await fetch('/api/auto-trade/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: portfolio.symbol,
          broker_type: portfolio.broker_type,
          broker_credential_id: portfolio.broker_credential_id,
          strategy_version: portfolio.strategy_version,
          total_capital: newCapital,
          is_enabled: portfolio.is_enabled,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEditingCapital(false);
        await loadPortfolios(true);
      } else {
        alert(data.error || '저장 실패');
      }
    } catch (err) {
      console.error('원금 저장 오류:', err);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setSavingCapital(false);
    }
  }
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
          let divisionsUsed = 0;

          try {
            // 매수·매도 기록을 cycle_number로 서버 필터링하여 병렬 조회
            const [buyRes, sellRes] = await Promise.all([
              fetch(`/api/infinite-buy/records?symbol=${s.symbol}&cycle_number=${cycle}`),
              fetch(`/api/infinite-buy/sell-records?symbol=${s.symbol}&cycle_number=${cycle}`),
            ]);
            const buyJson = await buyRes.json();
            const sellJson = await sellRes.json();
            const buyRecords: Array<{ shares?: number; amount?: number }> = Array.isArray(buyJson) ? buyJson : [];
            const sellRecords: Array<{ shares?: number }> = Array.isArray(sellJson) ? sellJson : [];

            const totalBuyShares = buyRecords.reduce((sum, r) => sum + (r.shares || 0), 0);
            const totalBuyInvested = buyRecords.reduce((sum, r) => sum + (r.amount || 0), 0);
            const totalSoldShares = sellRecords.reduce((sum, r) => sum + (r.shares || 0), 0);

            shares = Math.max(0, totalBuyShares - totalSoldShares);
            invested = totalBuyInvested;
            divisionsUsed = buyRecords.length;  // BuyTracker와 동일 소스 (현재 회차 매수 기록 수)
          } catch {}

          const avgCost = shares > 0 ? invested / shares : 0;
          const evalAmount = currentPrice * shares;
          const pnl = evalAmount - invested;
          const pnlRate = invested > 0 ? (pnl / invested) * 100 : 0;

          // V3.0/V4.0: 20분할 · V2.2: 40분할
          const versionLower = s.strategy_version.toLowerCase();
          const divisions = (versionLower === 'v3.0' || versionLower === 'v4.0') ? 20 : 40;
          const unitBuy = s.total_capital / divisions;
          const currentT = invested > 0 ? Math.ceil((invested / unitBuy) * 100) / 100 : 0;

          // 별%(목표 익절률) — 전략 버전별 정식 공식
          const starPct = computeStarPct(s.strategy_version, s.symbol, currentT, divisions);
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
            divisionsUsed,
          };
        })
      );

      setPortfolios(enrichedPortfolios);

      // Fetch pending orders from check-fills API
      let pendingCount = 0;
      let fetchedOrders: PendingOrder[] = [];
      try {
        const pendingRes = await fetch('/api/auto-trade/check-fills');
        const pendingData = await pendingRes.json();
        if (pendingData.success && Array.isArray(pendingData.data)) {
          fetchedOrders = pendingData.data;
          pendingCount = fetchedOrders.length;
        }
      } catch {}
      setPendingOrders(fetchedOrders);

      // Calculate warnings based on portfolio conditions
      const newWarnings: Warning[] = [];
      for (const p of enrichedPortfolios) {
        // High loss warning (> -20%)
        if ((p.pnlRate ?? 0) < -20) {
          newWarnings.push({
            symbol: p.symbol,
            type: 'high-loss',
            message: `${p.symbol}: 손실률 ${(p.pnlRate ?? 0).toFixed(1)}% — 리밸런싱 검토 필요`,
          });
        }
        // High T value warning (T > 15)
        if ((p.currentT ?? 0) > 15) {
          newWarnings.push({
            symbol: p.symbol,
            type: 'high-t',
            message: `${p.symbol}: T값 ${(p.currentT ?? 0).toFixed(1)} — 후반전 구간 진입`,
          });
        }
        // Paused portfolio warning
        if (!p.is_enabled) {
          newWarnings.push({
            symbol: p.symbol,
            type: 'paused',
            message: `${p.symbol}: 자동매매 일시정지 중`,
          });
        }
        // Low remaining budget warning (< 10%)
        const remainingPct = p.total_capital > 0
          ? ((p.total_capital - (p.invested ?? 0)) / p.total_capital) * 100
          : 0;
        if (remainingPct < 10 && remainingPct >= 0) {
          newWarnings.push({
            symbol: p.symbol,
            type: 'low-budget',
            message: `${p.symbol}: 잔여 예산 ${remainingPct.toFixed(1)}% — 추가 자금 필요`,
          });
        }
      }
      setWarnings(newWarnings);

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

  // 스마트 스킵 토글
  const handleToggleSmartSkip = async (portfolio: Portfolio) => {
    setActionLoading(`smart-${portfolio.symbol}`);
    try {
      const res = await fetch('/api/auto-trade/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: portfolio.symbol,
          broker_type: portfolio.broker_type,
          broker_credential_id: portfolio.broker_credential_id,
          strategy_version: portfolio.strategy_version,
          total_capital: portfolio.total_capital,
          is_enabled: portfolio.is_enabled,
          smart_skip_loc: !portfolio.smart_skip_loc,
        }),
      });
      const data = await res.json();
      if (data.success) {
        await loadPortfolios(true);
      } else {
        alert(data.error || '설정 변경 실패');
      }
    } catch {
      alert('Smart Skip 토글 중 오류가 발생했습니다.');
    } finally {
      setActionLoading(null);
    }
  };

  // Toggle pause/resume
  const handleTogglePause = async (portfolio: Portfolio) => {
    setActionLoading(`pause-${portfolio.symbol}`);
    try {
      const res = await fetch('/api/auto-trade/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: portfolio.symbol,
          broker_type: portfolio.broker_type,
          broker_credential_id: portfolio.broker_credential_id,
          strategy_version: portfolio.strategy_version,
          total_capital: portfolio.total_capital,
          is_enabled: !portfolio.is_enabled,
        }),
      });
      const data = await res.json();
      if (data.success) {
        await loadPortfolios(true);
      } else {
        alert(data.error || '설정 변경 실패');
      }
    } catch (err) {
      console.error('일시정지 토글 오류:', err);
      alert('설정 변경 중 오류가 발생했습니다.');
    } finally {
      setActionLoading(null);
    }
  };

  // Delete portfolio setting
  const handleDelete = async (symbol: string) => {
    if (!confirm(`${symbol} 포트폴리오를 삭제하시겠습니까?\n매매 기록은 유지됩니다.`)) {
      return;
    }
    setActionLoading(`delete-${symbol}`);
    try {
      const res = await fetch(`/api/auto-trade/settings?symbol=${symbol}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setSelectedSymbol(null);
        await loadPortfolios(true);
      } else {
        alert(data.error || '삭제 실패');
      }
    } catch (err) {
      console.error('삭제 오류:', err);
      alert('삭제 중 오류가 발생했습니다.');
    } finally {
      setActionLoading(null);
    }
  };

  // Full liquidation (sell all shares)
  const handleLiquidate = async (portfolio: Portfolio) => {
    const shares = portfolio.shares ?? 0;
    if (shares <= 0) {
      alert('청산할 주식이 없습니다.');
      return;
    }
    if (!confirm(`${portfolio.symbol} ${shares}주를 전량 매도하시겠습니까?\n시장가 주문으로 즉시 체결됩니다.`)) {
      return;
    }
    setActionLoading(`liquidate-${portfolio.symbol}`);
    try {
      const res = await fetch('/api/auto-trade/infinite-buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: portfolio.symbol,
          action: 'sell',
          shares,
          orderType: 'market',
          brokerType: portfolio.broker_type,
          credentialId: portfolio.broker_credential_id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`${portfolio.symbol} 전량 매도 주문이 접수되었습니다.`);
        await loadPortfolios(true);
      } else {
        alert(data.error || '매도 주문 실패');
      }
    } catch (err) {
      console.error('청산 오류:', err);
      alert('청산 주문 중 오류가 발생했습니다.');
    } finally {
      setActionLoading(null);
    }
  };

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

    // 통화 토글에 따른 포맷터 (해외+환율 보유 시에만 KRW 모드 활성)
    const canConvert = isOverseas && exchangeRate > 0;
    const fmtCurrency = (usdAmount: number): string => {
      if (!isOverseas) return formatMoney(usdAmount, p.symbol);
      if (displayCurrency === 'KRW' && canConvert) {
        return `₩${Math.round(usdAmount * exchangeRate).toLocaleString('ko-KR')}`;
      }
      return `$${usdAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };
    const fmtSub = (usdAmount: number): string => {
      if (!canConvert) return '';
      if (displayCurrency === 'KRW') {
        return `≈ $${usdAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
      return `≈ ₩${Math.round(usdAmount * exchangeRate).toLocaleString('ko-KR')}`;
    };
    // V3.0/V4.0: 20분할 · V2.2: 40분할
    const detailVersionLower = p.strategy_version.toLowerCase();
    const divisions = (detailVersionLower === 'v3.0' || detailVersionLower === 'v4.0') ? 20 : 40;
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
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setSelectedSymbol(null)}
            className="flex items-center gap-1.5 text-slate-600 hover:text-black transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="text-sm">목록</span>
          </button>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-xl">{p.symbol}</span>
            <span className="text-sm text-slate-500">{p.symbol} · {isOverseas ? 'AMEX' : 'KRX'} · {p.strategy_version}</span>
            {!p.is_enabled && (
              <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full font-medium">
                일시정지 중
              </span>
            )}
            {/* 실제/가상 자금 모드 토글 */}
            <span className="inline-flex rounded-md border border-gray-200 overflow-hidden text-[10px] font-bold ml-1">
              <button
                type="button"
                onClick={() => handleDetailFundModeChange('real')}
                className={`px-2 py-0.5 transition-colors ${
                  detailFundMode === 'real'
                    ? 'bg-green-600 text-white'
                    : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}
                title="실제 자금"
              >
                실제
              </button>
              <button
                type="button"
                onClick={() => handleDetailFundModeChange('virtual')}
                className={`px-2 py-0.5 transition-colors border-l border-gray-200 ${
                  detailFundMode === 'virtual'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}
                title="가상자금"
              >
                가상
              </button>
            </span>
          </div>
        </div>
        {detailFundMode === 'virtual' && (
          <p className="text-[11px] text-purple-600 font-medium px-1">
            💡 가상자금 모드 — 다른 화면(트래커·전략계산기)과 동기화됩니다
          </p>
        )}

        {/* 액션 버튼 */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => handleTogglePause(p)}
            disabled={actionLoading === `pause-${p.symbol}`}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm bg-white border rounded-lg transition-colors disabled:opacity-50 ${
              p.is_enabled
                ? 'text-slate-700 border-gray-200 hover:bg-gray-50'
                : 'text-green-600 border-green-200 hover:bg-green-50'
            }`}
          >
            {actionLoading === `pause-${p.symbol}` ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : p.is_enabled ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {p.is_enabled ? '일시정지' : '재개'}
          </button>
          {/* Smart Skip 토글: 오늘 체결 수 >= 일일 예상 주문 수면 LOC 생략 */}
          <button
            onClick={() => handleToggleSmartSkip(p)}
            disabled={actionLoading === `smart-${p.symbol}`}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm border-2 rounded-lg transition-colors disabled:opacity-50 font-bold ${
              p.smart_skip_loc
                ? 'bg-black text-white border-black hover:bg-gray-800'
                : 'bg-white text-black border-black hover:bg-gray-50'
            }`}
            title={p.smart_skip_loc
              ? '활성: 오늘 체결 수 >= 일일 예상이면 LOC 주문 생략'
              : '비활성: 항상 LOC 주문 제출 (전반전 2건 · 후반전 1건)'}
          >
            {actionLoading === `smart-${p.symbol}` ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <span className="text-xs">{p.smart_skip_loc ? '✓ ' : ''}Smart Skip</span>
            )}
          </button>
          <button
            onClick={() => handleDelete(p.symbol)}
            disabled={actionLoading === `delete-${p.symbol}`}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {actionLoading === `delete-${p.symbol}` ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            삭제
          </button>
          <button
            onClick={() => handleLiquidate(p)}
            disabled={actionLoading === `liquidate-${p.symbol}` || (p.shares ?? 0) <= 0}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-500 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            {actionLoading === `liquidate-${p.symbol}` ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <X className="h-4 w-4" />
            )}
            전량 청산
          </button>
        </div>

        {/* 현재가 카드 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="text-xs text-slate-600 font-medium mb-1">현재가</div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold tracking-tight text-black">{formatPrice(p.currentPrice ?? 0, p.symbol)}</span>
            {(p.change ?? 0) !== 0 && (
              <span className={`text-sm font-medium ${(p.changeRate ?? 0) >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                ▲ {formatPrice(Math.abs(p.change ?? 0), p.symbol)} ({(p.changeRate ?? 0) >= 0 ? '+' : ''}{(p.changeRate ?? 0).toFixed(2)}%)
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4 mt-6 pt-4 border-t border-gray-100">
            <div>
              <div className="text-xs text-slate-600 font-medium mb-1">평단가</div>
              <div className="text-sm font-bold text-black">{formatPrice(p.avgCost ?? 0, p.symbol)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-600 font-medium mb-1">익절 (+{(p.starPct ?? 0).toFixed(0)}%)</div>
              <div className="text-sm font-bold text-red-500">{formatPrice(p.targetPrice ?? 0, p.symbol)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-600 font-medium mb-1">보유 수량</div>
              <div className="text-sm font-bold text-black">{(p.shares ?? 0).toLocaleString()} 주</div>
            </div>
          </div>
        </div>

        {/* 진행 상태 */}
        {(() => {
          const autoDivisions = p.divisionsUsed ?? 0;
          const effectiveDivisions = divisionsOverride !== null ? divisionsOverride : autoDivisions;
          const progressPct = Math.min((effectiveDivisions / divisions) * 100, 100);
          return (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="font-medium text-black">진행 상태</span>
                {!editingDivisions ? (
                  <div className="flex items-center gap-1">
                    {divisionsOverride !== null && (
                      <button
                        onClick={() => saveDivisionsOverride(null)}
                        className="text-[10px] text-slate-400 hover:text-slate-700 px-1.5 py-0.5 rounded hover:bg-slate-100"
                        title="자동(매수 기록 수)으로 복귀"
                      >
                        자동
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setDivisionsEditValue(String(effectiveDivisions));
                        setEditingDivisions(true);
                      }}
                      className="text-slate-400 hover:text-slate-700"
                      title="진행 회차 수동 조정"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        const v = parseInt(divisionsEditValue, 10);
                        if (!isNaN(v) && v >= 0 && v <= 999) {
                          saveDivisionsOverride(v);
                          setEditingDivisions(false);
                        }
                      }}
                      className="text-green-600 hover:text-green-700"
                      title="저장"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setEditingDivisions(false)}
                      className="text-slate-400 hover:text-slate-600"
                      title="취소"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
              {editingDivisions ? (
                <div className="flex items-baseline gap-1 mb-2">
                  <input
                    type="number"
                    min={0}
                    max={999}
                    value={divisionsEditValue}
                    onChange={(e) => setDivisionsEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const v = parseInt(divisionsEditValue, 10);
                        if (!isNaN(v) && v >= 0 && v <= 999) {
                          saveDivisionsOverride(v);
                          setEditingDivisions(false);
                        }
                      } else if (e.key === 'Escape') {
                        setEditingDivisions(false);
                      }
                    }}
                    autoFocus
                    className="w-20 text-2xl font-bold text-black border border-gray-300 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <span className="text-base font-normal text-slate-400">/ {divisions}회</span>
                </div>
              ) : (
                <p className="text-2xl font-bold text-black mb-2">
                  {effectiveDivisions} <span className="text-base font-normal text-slate-400">/ {divisions}회</span>
                  {divisionsOverride !== null && (
                    <span className="ml-2 text-[10px] font-medium text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded align-middle">수동</span>
                  )}
                </p>
              )}
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">{progressPct.toFixed(0)}% 소진</p>
            </div>
          );
        })()}

        {/* V4.0 사이클 상태 */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-5">
            <span className="font-medium text-black">{p.strategy_version.toUpperCase()} 사이클 상태</span>
            <span className="text-xs px-2 py-1 bg-gray-100 text-slate-800 rounded-md font-medium">일반 모드</span>
          </div>

          <div className="grid grid-cols-2 gap-8">
            <div>
              <div className="text-xs text-slate-600 font-medium mb-1">T 값</div>
              <div className="text-3xl font-bold text-black">{t.toFixed(1)}</div>
              <div className="text-xs text-slate-700 mt-1">{investedPct.toFixed(1)}% (N={divisions})</div>
            </div>
            <div>
              <div className="text-xs text-slate-600 font-medium mb-1">잔금 ({isOverseas ? 'USD' : 'KRW'})</div>
              <div className="text-3xl font-bold text-black">{formatMoney(remainingCapital, p.symbol)}</div>
              <div className="text-xs text-slate-700 mt-1">1회매수: 잔금/(N-T)</div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-gray-100">
            <div className="text-xs text-slate-600 font-medium mb-1">다음 단계</div>
            <div className="font-medium text-black">{nextStep}</div>
            <div className="text-xs text-slate-700 mt-0.5">{nextStepDesc}</div>
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
            <div className="flex items-center gap-2">
              <span className="font-medium text-black">예산 현황</span>
              {/* 해외 포트폴리오면 항상 토글 노출 (환율 없으면 KRW 비활성화) */}
              {isOverseas && (
                <span className="inline-flex rounded-md border-2 border-black overflow-hidden text-xs font-black shadow-sm">
                  <button
                    type="button"
                    onClick={() => setDisplayCurrency('USD')}
                    className={`px-3 py-1 transition-colors ${
                      displayCurrency === 'USD'
                        ? 'bg-black text-white'
                        : 'bg-white text-black hover:bg-gray-100'
                    }`}
                    title="USD 기준 표시"
                  >
                    USD
                  </button>
                  <button
                    type="button"
                    onClick={() => exchangeRate > 0 && setDisplayCurrency('KRW')}
                    disabled={exchangeRate <= 0}
                    className={`px-3 py-1 transition-colors border-l-2 border-black ${
                      displayCurrency === 'KRW'
                        ? 'bg-black text-white'
                        : exchangeRate > 0
                          ? 'bg-white text-black hover:bg-gray-100'
                          : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                    title={exchangeRate > 0 ? '원화 환산 기준 표시' : '환율 로딩 중 — 실제 모드 토글 시 갱신'}
                  >
                    KRW{exchangeRate <= 0 ? '⏳' : ''}
                  </button>
                </span>
              )}
            </div>
            <span className="text-xs text-slate-700 font-medium">투입률 {investedPct.toFixed(1)}%</span>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-5">
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs text-slate-600 font-medium flex items-center gap-1.5">
                  원금
                  {detailFundMode === 'real' && (
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                      balanceSource === 'positions' ? 'bg-green-100 text-green-700'
                        : balanceSource === 'records'   ? 'bg-amber-100 text-amber-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {balanceSource === 'positions' ? '계좌 평가금'
                        : balanceSource === 'records'   ? '누적 매수금'
                        : '데이터 없음'}
                    </span>
                  )}
                </div>
                {/* 실제 모드: 새로고침 버튼 / 가상 모드: 편집 컨트롤 */}
                {detailFundMode === 'real' ? (
                  <button
                    onClick={() => loadBrokerBalance(p, false)}
                    disabled={loadingBalance}
                    className="text-slate-400 hover:text-slate-700 transition-colors disabled:opacity-40"
                    title="브로커 잔액 새로고침"
                  >
                    <RefreshCw className={`h-3 w-3 ${loadingBalance ? 'animate-spin' : ''}`} />
                  </button>
                ) : !editingCapital ? (
                  <button
                    onClick={() => {
                      setCapitalEditValue(String(p.total_capital));
                      setEditingCapital(true);
                    }}
                    className="text-slate-400 hover:text-slate-700 transition-colors"
                    title="가상 원금 변경"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                ) : (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleSaveCapital(p)}
                      disabled={savingCapital}
                      className="text-green-600 hover:text-green-700 disabled:opacity-40"
                      title="저장 (DB 반영)"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setEditingCapital(false)}
                      className="text-slate-400 hover:text-slate-600"
                      title="취소"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
              {detailFundMode === 'real' ? (
                <>
                  {balanceError ? (
                    <div className="font-bold text-red-500 text-xs">{balanceError}</div>
                  ) : brokerBalance != null ? (
                    <>
                      <div className="font-bold text-black">{fmtCurrency(brokerBalance)}</div>
                      {fmtSub(brokerBalance) && (
                        <div className="text-[10px] text-slate-400 mt-0.5">{fmtSub(brokerBalance)}</div>
                      )}
                      {balanceSource === 'records' && (
                        <div className="text-[10px] text-amber-600 mt-0.5">
                          KIS 해외 평가금이 0 → 누적 매수금으로 표시
                        </div>
                      )}
                      {balanceSource === 'none' && (
                        <div className="text-[10px] text-gray-500 mt-0.5">
                          포지션·매수 기록 없음 (USD 예수금은 KIS API 별도 조회 필요)
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="font-bold text-slate-400 text-sm">{loadingBalance ? '조회 중...' : '—'}</div>
                  )}
                </>
              ) : editingCapital ? (
                <input
                  type="number"
                  value={capitalEditValue}
                  onChange={(e) => setCapitalEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveCapital(p);
                    else if (e.key === 'Escape') setEditingCapital(false);
                  }}
                  autoFocus
                  min={0}
                  step="any"
                  className="w-full font-bold text-black bg-white border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 border-purple-300 focus:ring-purple-500"
                />
              ) : (
                <>
                  <div className="font-bold text-black">{fmtCurrency(p.total_capital)}</div>
                  {fmtSub(p.total_capital) && (
                    <div className="text-[10px] text-slate-400 mt-0.5">{fmtSub(p.total_capital)}</div>
                  )}
                </>
              )}
            </div>
            <div>
              <div className="text-xs text-slate-600 font-medium mb-1">투입액</div>
              <div className="font-bold text-black">{fmtCurrency(p.invested ?? 0)}</div>
              {fmtSub(p.invested ?? 0) && (
                <div className="text-[10px] text-slate-400">{fmtSub(p.invested ?? 0)}</div>
              )}
              <div className="text-xs text-slate-700">{investedPct.toFixed(1)}%</div>
            </div>
            <div>
              <div className="text-xs text-slate-600 font-medium mb-1">잔여 예산</div>
              <div className="font-bold text-black">{fmtCurrency(remainingCapital)}</div>
              {fmtSub(remainingCapital) && (
                <div className="text-[10px] text-slate-400">{fmtSub(remainingCapital)}</div>
              )}
              <div className="text-xs text-slate-700">{remainingPct.toFixed(1)}%</div>
              <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-red-400 rounded-full" style={{ width: `${remainingPct}%` }} />
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-600 font-medium mb-1">평가액</div>
              <div className="font-bold text-black">{fmtCurrency(p.evalAmount ?? 0)}</div>
              {fmtSub(p.evalAmount ?? 0) && (
                <div className="text-[10px] text-slate-400">{fmtSub(p.evalAmount ?? 0)}</div>
              )}
              <div className={`text-xs font-medium ${(p.pnl ?? 0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {(p.pnl ?? 0) >= 0 ? '+' : ''}{fmtCurrency(p.pnl ?? 0)} ({(p.pnl ?? 0) >= 0 ? '+' : ''}{(p.pnlRate ?? 0).toFixed(2)}%)
              </div>
              <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-green-400 rounded-full" style={{ width: `${Math.min(100, evalPct)}%` }} />
              </div>
            </div>
          </div>
          {isOverseas && exchangeRate > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100 text-[10px] text-slate-400">
              💱 환율: ₩{exchangeRate.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}/USD (KIS 응답 기준)
            </div>
          )}
        </div>

        {/* 오늘의 매매 가이드 */}
        <TradingGuide
          symbol={p.symbol}
          version={(detailVersionLower === 'v2.2' || detailVersionLower === 'v3.0' || detailVersionLower === 'v4.0') ? detailVersionLower : 'v3.0'}
          capital={p.total_capital}
          n={divisions}
          market={isOverseas ? 'US' : 'KR'}
          currentCycle={p.cycle ?? 1}
        />
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
                  : 'bg-gray-100 text-slate-600 hover:bg-gray-200'
              }`}
            >
              라오어 무한매수법
            </button>
            <button
              onClick={() => setActivePreset('v4')}
              className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                activePreset === 'v4'
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-100 text-slate-600 hover:bg-gray-200'
              }`}
            >
              무매 V4.0
            </button>
            <button
              onClick={() => setActivePreset('real')}
              className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                activePreset === 'real'
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-100 text-slate-600 hover:bg-gray-200'
              }`}
            >
              실계좌
            </button>
          </div>
          <button
            onClick={() => loadPortfolios(true)}
            disabled={refreshing}
            className="ml-auto p-2 text-slate-600 hover:text-black hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            title="새로고침"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <p className="text-sm text-slate-500">
          {portfolios.length}개 종목 자동 운용중
          {lastUpdate && ` · 마지막 갱신 ${lastUpdate.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`}
        </p>
      </div>

      {/* 신규 포트폴리오 생성 버튼 */}
      <button
        onClick={() => onNavigateToManual?.()}
        className="w-full flex items-center justify-center gap-2 h-11 text-sm text-green-600 border-2 border-dashed border-green-300 rounded-xl hover:bg-green-50 transition-colors"
      >
        <Plus className="h-4 w-4" />
        신규 포트폴리오 생성
      </button>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
        </div>
      ) : portfolios.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
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
              <span className="text-sm text-slate-800 font-medium">총 평가액</span>
              <div className="text-right">
                <span className="font-bold text-green-600">{formatMoney(summary.totalEval)}</span>
                <span className="text-green-600 ml-2">
                  ({summary.totalPnlRate >= 0 ? '+' : ''}{summary.totalPnlRate.toFixed(2)}%)
                </span>
                <div className="text-xs text-green-500 font-medium">
                  {summary.totalPnl >= 0 ? '+' : ''}{formatMoney(summary.totalPnl)}
                </div>
              </div>
            </div>
            {/* 시드 투입률 */}
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-slate-800 font-medium">시드 투입률</span>
              <div className="text-right">
                <span className="font-bold text-black">{summary.investedRate.toFixed(1)}%</span>
                <div className="text-xs text-slate-700">
                  {formatMoney(summary.totalInvested)} / {formatMoney(summary.totalCapital)}
                </div>
              </div>
            </div>
            {/* 미투입 예산 */}
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-slate-800 font-medium">미투입 예산</span>
              <div className="text-right">
                <span className="font-bold text-black">{formatMoney(summary.remainingBudget)}</span>
                <div className="text-xs text-slate-700">
                  총 원금 {formatMoney(summary.totalCapital)}
                </div>
              </div>
            </div>
            {/* 대기중 주문 */}
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-slate-800 font-medium">대기중 주문</span>
              <div className="text-right">
                <span className="font-bold text-black">{summary.pendingOrders} 건</span>
                <div className="text-xs text-slate-700">
                  LOC · 장마감 체결 대기
                </div>
              </div>
            </div>
          </div>

          {/* 운용중 포트폴리오 */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className="font-medium text-black">운용중 포트폴리오</span>
                <span className="text-sm text-slate-700">{portfolios.length}</span>
              </div>
              <div className="flex gap-1 text-xs">
                <button
                  onClick={() => setFilterTab('all')}
                  className={`px-2 py-1 rounded transition-colors ${
                    filterTab === 'all' ? 'bg-gray-800 text-white' : 'text-slate-700 hover:bg-gray-100'
                  }`}
                >
                  전체 {portfolios.length}
                </button>
                <button
                  onClick={() => setFilterTab('profit')}
                  className={`px-2 py-1 rounded transition-colors ${
                    filterTab === 'profit' ? 'bg-red-500 text-white' : 'text-slate-700 hover:bg-gray-100'
                  }`}
                >
                  수익 {profitCount}
                </button>
                <button
                  onClick={() => setFilterTab('loss')}
                  className={`px-2 py-1 rounded transition-colors ${
                    filterTab === 'loss' ? 'bg-blue-500 text-white' : 'text-slate-700 hover:bg-gray-100'
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
                        <span className="font-bold text-black">{p.symbol}</span>
                        <span className="text-xs text-slate-600">{p.strategy_version}</span>
                        {!p.is_enabled && (
                          <span className="text-xs px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded font-medium">
                            일시정지
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 mt-1 text-xs text-slate-700 flex-wrap">
                        <span>평단 {formatPrice(p.avgCost ?? 0, p.symbol)}</span>
                        <span className={isProfit ? 'text-red-500' : 'text-blue-500'}>
                          T+{(p.starPct ?? 0).toFixed(0)}%
                        </span>
                        <span className={isProfit ? 'text-red-500' : 'text-blue-500'}>
                          {formatPrice(p.targetPrice ?? 0, p.symbol)}
                        </span>
                        <span className="text-slate-500">—</span>
                        <span>{p.cycle}회차</span>
                        <span>·</span>
                        <span>{investedPct.toFixed(0)}%</span>
                      </div>
                    </div>
                    <div className="text-right ml-4 shrink-0">
                      <div className="flex items-center gap-2 justify-end">
                        <span className="font-bold text-black">{formatPrice(p.currentPrice ?? 0, p.symbol)}</span>
                        <span className="text-slate-600">·</span>
                        <span className="text-slate-800">{(p.shares ?? 0).toLocaleString()}주</span>
                        <span className={`font-bold ${isProfit ? 'text-red-500' : 'text-blue-500'}`}>
                          {isProfit ? '+' : ''}{(p.pnlRate ?? 0).toFixed(2)}%
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-500 ml-2 shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* 금일 체결 / 대기 주문 */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="font-medium text-black">대기 주문</span>
              {pendingOrders.length > 0 && (
                <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                  {pendingOrders.length}건 대기중
                </span>
              )}
            </div>
            {pendingOrders.length === 0 ? (
              <p className="text-sm text-slate-600">대기중인 주문이 없습니다.</p>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {pendingOrders.slice(0, 5).map((order) => {
                  const orderTime = new Date(order.order_time);
                  const timeStr = orderTime.toLocaleTimeString('ko-KR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  });
                  const isKR = /^\d{6}$/.test(order.symbol);
                  const priceStr = isKR
                    ? `₩${Math.round(order.order_price).toLocaleString()}`
                    : `$${order.order_price.toFixed(2)}`;

                  return (
                    <div key={order.id} className="text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-600">{timeStr}</span>
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                          order.side === 'buy'
                            ? 'bg-red-50 text-red-600'
                            : 'bg-blue-50 text-blue-600'
                        }`}>
                          {order.side === 'buy' ? '매수' : '매도'}
                        </span>
                        <span className="text-black font-medium">{order.symbol}</span>
                        <span className="text-slate-600">
                          {order.order_quantity}주 @ {priceStr}
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 mt-0.5 ml-16">
                        {order.order_type?.toUpperCase()} · {order.strategy_version || '무한매수'}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {pendingOrders.length > 5 && (
              <button className="text-xs text-slate-600 hover:text-slate-800 mt-3 block font-medium">
                전체 {pendingOrders.length}건 보기 →
              </button>
            )}
          </div>

          {/* 주의 알림 */}
          <div className={`bg-white rounded-xl border p-4 ${
            warnings.length > 0 ? 'border-red-200' : 'border-gray-200'
          }`}>
            <div className={`flex items-center gap-2 mb-2 ${
              warnings.length > 0 ? 'text-red-600' : 'text-slate-600'
            }`}>
              {warnings.length > 0 ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              <span className="font-medium">
                {warnings.length > 0 ? `주의 알림 (${warnings.length})` : '상태 정상'}
              </span>
            </div>
            {warnings.length === 0 ? (
              <p className="text-sm text-slate-600">
                현재 주의가 필요한 종목이 없습니다.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {warnings.map((w, i) => (
                  <li key={`${w.symbol}-${w.type}-${i}`} className="text-sm text-slate-800 flex items-start gap-2">
                    <span className={`shrink-0 mt-0.5 w-2 h-2 rounded-full ${
                      w.type === 'high-loss' ? 'bg-red-500' :
                      w.type === 'high-t' ? 'bg-orange-500' :
                      w.type === 'paused' ? 'bg-yellow-500' :
                      'bg-blue-500'
                    }`} />
                    {w.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
