'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import Link from 'next/link';
import {
  Loader2,
  Play,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Download,
  ExternalLink,
} from 'lucide-react';
import { fetchTrackerPosition } from '@/lib/infinite-buy/tracker/position';

type BrokerType = 'kis' | 'kiwoom';
type StrategyVersion = 'v2.2' | 'v3.0' | 'v4.0';

interface AutoTradeOrder {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  orderType: string;
  quantity: number;
  targetPrice: number;
  price: number;
  reason: string;
  status: string;
  market: string;
  isReference?: boolean; // 참고용 (수량 부족)
}

interface DailyOrders {
  buyOrders: AutoTradeOrder[];
  sellOrders: AutoTradeOrder[];
  summary: {
    symbol: string;
    t: number;
    starPct: number;
    starPoint: number;
    avgCost: number;
    shares: number;
    invested: number;
    mode: string;
    message: string;
  };
}

interface Quote {
  symbol: string;
  symbolName: string;
  currentPrice: number;
  change: number;
  changeRate: number;
}

interface AutoTradePanelProps {
  defaultSymbol?: string;
  defaultBroker?: BrokerType;
}

export function AutoTradePanel({
  defaultSymbol = 'TQQQ',
  defaultBroker = 'kis',
}: AutoTradePanelProps) {
  const [brokerType, setBrokerType] = useState<BrokerType>(defaultBroker);
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [strategyVersion, setStrategyVersion] = useState<StrategyVersion>('v3.0');
  const [totalCapital, setTotalCapital] = useState(5000);
  const [currentT, setCurrentT] = useState(0);
  const [currentShares, setCurrentShares] = useState(0);
  const [currentInvested, setCurrentInvested] = useState(0);

  const [isLoading, setIsLoading] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isLoadingTracker, setIsLoadingTracker] = useState(false);
  const [trackerLoaded, setTrackerLoaded] = useState(false);

  // 종목 검색 자동완성
  const [suggestions, setSuggestions] = useState<{ symbol: string; name: string }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dailyOrders, setDailyOrders] = useState<DailyOrders | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmedOrders, setConfirmedOrders] = useState<Set<string>>(new Set());
  const [executionResult, setExecutionResult] = useState<{
    success: boolean;
    message: string;
    details?: { orderId: string; side: string; error?: string; duplicate?: boolean }[];
  } | null>(null);
  const [autoTradeEnabled, setAutoTradeEnabled] = useState(false);
  const [isSavingAutoTrade, setIsSavingAutoTrade] = useState(false);
  const [todayDuplicates, setTodayDuplicates] = useState<{
    buyExists: boolean;
    sellExists: boolean;
    orders?: { id: string; broker_order_id: string; side: string; status: string }[];
  } | null>(null);
  const [isCancellingToday, setIsCancellingToday] = useState(false);
  const [cancelResult, setCancelResult] = useState<{ success: boolean; message: string } | null>(null);

  // 종목 검색
  const handleSymbolChange = (value: string) => {
    const upper = value.toUpperCase();
    setSymbol(upper);
    setTrackerLoaded(false);

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (upper.length < 1) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(upper)}`);
        const data = await res.json();
        setSuggestions(data);
        setShowSuggestions(data.length > 0);
      } catch {
        setSuggestions([]);
      }
    }, 300);
  };

  const selectSuggestion = (sym: string) => {
    setSymbol(sym);
    setSuggestions([]);
    setShowSuggestions(false);
    setTrackerLoaded(false);
  };

  // 빠른 종목 선택 + 트래커 동기화
  const quickSelectSymbol = async (sym: string) => {
    setSymbol(sym);
    setSuggestions([]);
    setShowSuggestions(false);
    setTrackerLoaded(false);
    // 트래커 동기화 바로 실행
    await loadFromTracker(sym);
  };

  // 트래커에서 현재 상태 불러오기 (targetSymbol 파라미터로 특정 종목 지정 가능)
  const loadFromTracker = async (targetSymbol?: string) => {
    const sym = targetSymbol || symbol;
    if (!sym) return;
    setIsLoadingTracker(true);
    try {
      const position = await fetchTrackerPosition(sym.toUpperCase());

      if (!position) {
        alert(`트래커에 "${sym}" 포지션이 없습니다. (기록 없음 또는 전량 매도 완료)`);
        setCurrentT(0);
        setCurrentShares(0);
        setCurrentInvested(0);
        setTrackerLoaded(true);
        return;
      }

      const divisions = strategyVersion === 'v3.0' ? 20 : 40;
      const unitBuy = position.capital / divisions;
      const t = Math.ceil((position.invested / unitBuy) * 100) / 100;

      setTotalCapital(position.capital);
      setCurrentT(t);
      setCurrentShares(Math.round(position.shares * 10000) / 10000);
      setCurrentInvested(Math.round(position.invested * 100) / 100);
      setTrackerLoaded(true);
    } catch {
      alert('트래커 데이터를 불러오지 못했습니다.');
    } finally {
      setIsLoadingTracker(false);
    }
  };

  // 주문 계산
  const calculateOrders = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const market = /^\d{6}$/.test(symbol) ? 'domestic' : 'overseas';
      const divisions = strategyVersion === 'v3.0' ? '20' : '40';
      const params = new URLSearchParams({
        brokerType,
        symbol: symbol.toUpperCase(),
        strategy: strategyVersion,
        capital: totalCapital.toString(),
        divisions,
        t: currentT.toString(),
        shares: currentShares.toString(),
        invested: currentInvested.toString(),
        cash: (totalCapital - currentInvested).toString(),
        market,
      });

      const response = await fetch(`/api/auto-trade/infinite-buy?${params}`);
      const data = await response.json();

      if (data.success) {
        setDailyOrders(data.data.orders);
        setQuote(data.data.quote);
        setTodayDuplicates(data.data.todayDuplicates ?? null);
        setConfirmedOrders(new Set());
      } else {
        setError(data.error || '주문 계산에 실패했습니다.');
      }
    } catch (err) {
      setError('서버 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 주문 확인 토글
  const toggleConfirmOrder = (orderId: string) => {
    setConfirmedOrders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };

  // 전체 확인 (참고용 주문 제외)
  const confirmAllOrders = () => {
    if (!dailyOrders) return;
    const allOrders = [...dailyOrders.buyOrders, ...dailyOrders.sellOrders]
      .filter(o => !o.isReference);
    setConfirmedOrders(new Set(allOrders.map(o => o.id)));
  };

  // 오늘 주문 전체 취소
  const cancelTodayOrders = async () => {
    if (!todayDuplicates?.orders?.length) return;
    setIsCancellingToday(true);
    setCancelResult(null);
    try {
      const cancellable = todayDuplicates.orders.filter(o => o.status === 'submitted' || o.status === 'partial');
      const results = await Promise.all(
        cancellable.map(async o => {
          const res = await fetch(`/api/broker/orders?brokerType=${brokerType}&orderId=${o.broker_order_id}`, { method: 'DELETE' });
          const data = await res.json();
          return { side: o.side, success: data.success, error: data.error };
        })
      );
      const succeeded = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);
      if (failed.length > 0) {
        setCancelResult({ success: false, message: `취소 실패 ${failed.length}건: ${failed.map(r => r.error || '오류').join(', ')}` });
      } else {
        setCancelResult({ success: true, message: `${succeeded.map(r => r.side === 'buy' ? '매수' : '매도').join(' · ')} 주문 취소 완료` });
      }
      await calculateOrders();
    } catch {
      setCancelResult({ success: false, message: '주문 취소 중 오류가 발생했습니다.' });
      await calculateOrders();
    } finally {
      setIsCancellingToday(false);
    }
  };

  // 공통 실행 로직
  const runOrders = async (ordersToExecute: AutoTradeOrder[]) => {
    setIsExecuting(true);
    setError(null);
    setExecutionResult(null);
    try {
      const market = /^\d{6}$/.test(symbol) ? 'domestic' : 'overseas';
      const response = await fetch('/api/auto-trade/infinite-buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brokerType, orders: ordersToExecute, market, capital: totalCapital, strategyVersion }),
      });
      const data = await response.json();

      if (!data.success) {
        // 브로커 연결 오류 등 전체 실패
        setError(data.error || '주문 실행에 실패했습니다.');
        return;
      }

      const failCount: number = data.data?.summary?.failed ?? 0;
      const details = (data.data?.results ?? []).map((r: { order: AutoTradeOrder; success: boolean; error?: string; duplicate?: boolean }) => ({
        orderId: r.order.id,
        side: r.order.side,
        error: r.success ? undefined : r.error,
        duplicate: r.duplicate,
      }));

      if (failCount > 0) {
        setExecutionResult({ success: false, message: data.message, details });
      } else {
        setExecutionResult({ success: true, message: data.message });
        setDailyOrders(null);
        setConfirmedOrders(new Set());
      }
    } catch {
      setError('서버 오류가 발생했습니다.');
    } finally {
      setIsExecuting(false);
    }
  };

  // 전체 확인 후 즉시 실행
  // 전체 확인 후 즉시 실행 (참고용 주문 제외)
  const executeAllOrders = async () => {
    if (!dailyOrders) return;
    const allOrders = [...dailyOrders.buyOrders, ...dailyOrders.sellOrders]
      .filter(o => !o.isReference);
    if (allOrders.length === 0) return;
    setConfirmedOrders(new Set(allOrders.map(o => o.id)));
    await runOrders(allOrders.map(o => ({ ...o, status: 'confirmed' })));
  };

  // 확인된 주문만 실행 (참고용 주문 제외)
  const executeOrders = async () => {
    if (!dailyOrders || confirmedOrders.size === 0) return;
    const allOrders = [...dailyOrders.buyOrders, ...dailyOrders.sellOrders]
      .filter(o => !o.isReference);
    const ordersToExecute = allOrders
      .filter(o => confirmedOrders.has(o.id))
      .map(o => ({ ...o, status: 'confirmed' }));
    await runOrders(ordersToExecute);
  };

  const formatPrice = (price: number | null | undefined, isOverseas: boolean) => {
    if (price == null) return '-';
    if (isOverseas) {
      return `$${price.toFixed(2)}`;
    }
    return `${price.toLocaleString()}원`;
  };

  // 자동매매 설정 로드
  const loadAutoTradeSettings = async () => {
    if (!symbol) return;
    try {
      const res = await fetch('/api/auto-trade/settings');
      if (res.ok) {
        const data = await res.json();
        const setting = data.data?.find((s: { symbol: string }) => s.symbol === symbol.toUpperCase());
        setAutoTradeEnabled(setting?.is_enabled ?? false);
      }
    } catch {}
  };

  // 자동매매 설정 토글
  const toggleAutoTrade = async () => {
    if (!symbol) return;
    setIsSavingAutoTrade(true);
    try {
      if (autoTradeEnabled) {
        // 비활성화
        const res = await fetch(`/api/auto-trade/settings?symbol=${symbol}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
          setAutoTradeEnabled(false);
          alert(`${symbol} 자동매매가 해제되었습니다.`);
        } else {
          alert(`해제 실패: ${data.error || '알 수 없는 오류'}`);
        }
      } else {
        // 활성화
        const res = await fetch('/api/auto-trade/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: symbol.toUpperCase(),
            broker_type: brokerType,
            strategy_version: strategyVersion,
            total_capital: totalCapital,
            is_enabled: true,
          }),
        });
        const data = await res.json();
        if (data.success) {
          setAutoTradeEnabled(true);
          alert(`${symbol} 자동매매가 등록되었습니다.\n매일 밤 21:00(서머타임) / 22:00(겨울) 프리장에 자동 실행됩니다.`);
        } else {
          alert(`활성화 실패: ${data.error || '알 수 없는 오류'}`);
        }
      }
    } catch (err) {
      console.error('자동매매 설정 오류:', err);
      alert('자동매매 설정 변경에 실패했습니다.');
    } finally {
      setIsSavingAutoTrade(false);
    }
  };

  // 종목 변경 시 자동매매 설정 로드
  useEffect(() => {
    if (symbol) {
      loadAutoTradeSettings();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  const isOverseas = !/^\d{6}$/.test(symbol);

  return (
    <div className="space-y-4">
      {/* 설정 카드 */}
      <Card className="border-emerald-500/30 bg-white dark:bg-white">
        <CardHeader className="border-b border-emerald-200 bg-emerald-50">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-emerald-700">
                <TrendingUp className="h-5 w-5" />
                무한매수법 자동매매
              </CardTitle>
              <CardDescription className="text-gray-600">
                오늘의 LOC 주문을 계산하고 확인 후 실행합니다
              </CardDescription>
            </div>
            <Link href="/infinite-buy" target="_blank">
              <Button variant="ghost" size="sm" className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-100">
                <ExternalLink className="h-3.5 w-3.5" />
                <span className="ml-1.5">무한매수 트래커</span>
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadFromTracker()}
              disabled={isLoadingTracker || !symbol}
              title="실시간 트래커에서 현재 회차/보유수량/투자금액을 자동으로 불러옵니다"
              className="border-emerald-500 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700"
            >
              {isLoadingTracker
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Download className="h-3.5 w-3.5" />
              }
              <span className="ml-1.5">
                {trackerLoaded ? '트래커 재동기화' : '트래커에서 불러오기'}
              </span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-gray-900">
          <div className="space-y-2">
            <Label className="text-gray-900">증권사</Label>
            <Select
              value={brokerType}
              onValueChange={(v) => setBrokerType(v as BrokerType)}
            >
              <SelectTrigger className="text-gray-900 bg-white border-gray-300">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kis">한국투자증권</SelectItem>
                <SelectItem value="kiwoom">키움증권</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center justify-between text-gray-900">
              <span>종목코드</span>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant={symbol === 'TQQQ' ? 'default' : 'outline'}
                  size="sm"
                  className={`h-6 px-2 text-xs ${symbol === 'TQQQ' ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'border-emerald-500 text-emerald-600 hover:bg-emerald-100'}`}
                  onClick={() => quickSelectSymbol('TQQQ')}
                >
                  TQQQ
                </Button>
                <Button
                  type="button"
                  variant={symbol === 'SOXL' ? 'default' : 'outline'}
                  size="sm"
                  className={`h-6 px-2 text-xs ${symbol === 'SOXL' ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'border-emerald-500 text-emerald-600 hover:bg-emerald-100'}`}
                  onClick={() => quickSelectSymbol('SOXL')}
                >
                  SOXL
                </Button>
              </div>
            </Label>
            <div className="relative">
              <Input
                value={symbol}
                onChange={(e) => handleSymbolChange(e.target.value)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                placeholder="TQQQ, SOXL, 122630"
                className="pr-16 text-gray-900 bg-white border-gray-300"
                autoComplete="off"
              />
              {symbol && (
                <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  isOverseas ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-700'
                }`}>
                  {isOverseas ? '해외' : '국내'}
                </span>
              )}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                  {suggestions.map((s) => (
                    <button
                      key={s.symbol}
                      type="button"
                      onMouseDown={() => selectSuggestion(s.symbol)}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 text-left transition-colors"
                    >
                      <span className="font-bold text-sm text-gray-800 w-16 shrink-0">{s.symbol}</span>
                      <span className="text-xs text-gray-400 truncate">{s.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-gray-900">전략</Label>
            <Select
              value={strategyVersion}
              onValueChange={(v) => setStrategyVersion(v as StrategyVersion)}
            >
              <SelectTrigger className="text-gray-900 bg-white border-gray-300">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="v2.2">V2.2 안정형 (40분할)</SelectItem>
                <SelectItem value="v3.0">V3.0 공격형 (20분할)</SelectItem>
                <SelectItem value="v4.0">V4.0 동적분할 (20/40분할)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center justify-between text-gray-900">
              <span>총 투자금 ({isOverseas ? 'USD' : 'KRW'})</span>
              <span className="text-xs text-emerald-600 font-medium">
                1회매수금: {isOverseas ? '$' : '₩'}{(totalCapital / (strategyVersion === 'v3.0' ? 20 : 40)).toFixed(2)}
              </span>
            </Label>
            <div className="flex gap-2">
              <Input
                type="number"
                value={totalCapital}
                onChange={(e) => setTotalCapital(parseFloat(e.target.value) || 0)}
                className="flex-1 text-gray-900 bg-white border-gray-300"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="px-3 text-xs whitespace-nowrap border-emerald-500 text-emerald-600 hover:bg-emerald-100"
                onClick={async () => {
                  // 평단가 계산 (보유 중이면 평단가, 없으면 현재가 기준)
                  let basePrice: number;
                  if (currentShares > 0 && currentInvested > 0) {
                    basePrice = currentInvested / currentShares;
                  } else {
                    // 현재가 조회
                    let price = quote?.currentPrice;
                    if (!price) {
                      try {
                        const res = await fetch(`/api/stocks/prices?symbols=${symbol}`);
                        const data = await res.json();
                        price = data?.prices?.[symbol]?.price;
                      } catch {}
                    }
                    if (!price || price <= 0) {
                      alert('현재가를 조회할 수 없습니다. 먼저 주문 계산을 실행해주세요.');
                      return;
                    }
                    basePrice = price;
                  }

                  // 최소 투자금 계산: 절반 금액으로 별지점 가격의 1주를 살 수 있어야 함
                  // 별지점 = 평단가 × (1 + 별%) - T=0 기준 최대 별%
                  const divisions = strategyVersion === 'v3.0' ? 20 : 40;
                  const maxStarPct = symbol.toUpperCase() === 'SOXL' ? 0.20 : 0.15;
                  const starPrice = basePrice * (1 + maxStarPct);
                  // 절반 금액 ≥ 별지점 가격 → 1회매수금 ≥ 별지점 × 2
                  const minUnitBuy = Math.ceil(starPrice * 2);
                  const minCapital = minUnitBuy * divisions;
                  setTotalCapital(minCapital);
                }}
                title="전반전 매수가 가능한 최소 투자금 계산 (평단가 기준)"
              >
                최소 투자금
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-gray-900">현재 T값</Label>
            <Input
              type="number"
              value={currentT}
              onChange={(e) => setCurrentT(parseFloat(e.target.value) || 0)}
              min={0}
              step="0.01"
              className="text-gray-900 bg-white border-gray-300"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-gray-900">보유 수량</Label>
            <Input
              type="number"
              value={currentShares}
              onChange={(e) => setCurrentShares(parseFloat(e.target.value) || 0)}
              min={0}
              step="0.0001"
              className="text-gray-900 bg-white border-gray-300"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-gray-900">투자금액 ({isOverseas ? 'USD' : 'KRW'})</Label>
            <Input
              type="number"
              value={currentInvested}
              onChange={(e) => setCurrentInvested(parseFloat(e.target.value) || 0)}
              min={0}
              className="text-gray-900 bg-white border-gray-300"
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3 border-t border-emerald-200 bg-emerald-50">
          <Button
            onClick={calculateOrders}
            disabled={isLoading || !symbol}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                계산 중...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                오늘의 주문 계산
              </>
            )}
          </Button>
          <div className="w-full flex items-center justify-between px-3 py-3 rounded-lg border border-emerald-300 bg-white text-gray-900">
            <div className="text-sm">
              <div className="flex items-center gap-2">
                <p className="font-medium text-gray-900">자동매매 스케줄러</p>
                {autoTradeEnabled ? (
                  <Badge className="bg-emerald-500 text-white border-emerald-400 font-bold">ON</Badge>
                ) : (
                  <Badge variant="outline" className="border-gray-400 text-gray-500">OFF</Badge>
                )}
              </div>
              <p className="text-xs text-gray-600 mt-0.5">
                {autoTradeEnabled
                  ? `${symbol} 매일 밤 21:00(서머타임) / 22:00(겨울) 자동 실행 중`
                  : '활성화하면 매일 프리장에 자동으로 주문이 실행됩니다'
                }
              </p>
            </div>
            <Button
              variant={autoTradeEnabled ? 'destructive' : 'default'}
              size="sm"
              onClick={toggleAutoTrade}
              disabled={isSavingAutoTrade || !symbol}
              className={autoTradeEnabled ? '' : 'bg-emerald-500 hover:bg-emerald-600 text-white'}
            >
              {isSavingAutoTrade ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : autoTradeEnabled ? (
                '해제하기'
              ) : (
                '활성화하기'
              )}
            </Button>
          </div>
        </CardFooter>
      </Card>

      {/* 에러 표시 */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-2 py-4 text-destructive">
            <AlertCircle className="h-5 w-5" />
            {error}
          </CardContent>
        </Card>
      )}

      {/* 오늘 이미 주문한 경우 경고 */}
      {todayDuplicates && (todayDuplicates.buyExists || todayDuplicates.sellExists) && (
        <Card className="border-yellow-300 bg-yellow-50">
          <CardContent className="flex items-start justify-between gap-2 py-4 text-yellow-800">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 mt-0.5 text-yellow-600 shrink-0" />
              <div className="text-sm">
                <p className="font-semibold">오늘 이미 주문이 제출되었습니다</p>
                <p className="text-yellow-700 mt-0.5">
                  {[
                    todayDuplicates.buyExists && '매수',
                    todayDuplicates.sellExists && '매도',
                  ].filter(Boolean).join(' · ')} 주문이 오늘 이미 존재합니다.
                  동일 주문을 다시 실행하면 중복 주문이 차단됩니다.
                </p>
              </div>
            </div>
            {todayDuplicates.orders?.some(o => o.status === 'submitted' || o.status === 'partial') && (
              <button
                onClick={cancelTodayOrders}
                disabled={isCancellingToday}
                className="shrink-0 text-xs px-2 py-1 rounded-lg border border-yellow-400 text-yellow-800 hover:bg-yellow-100 disabled:opacity-50 transition-colors"
              >
                {isCancellingToday ? '취소 중...' : '주문 취소'}
              </button>
            )}
          </CardContent>
        </Card>
      )}

      {/* 주문 취소 결과 */}
      {cancelResult && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${
          cancelResult.success
            ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
            : 'border-red-200 bg-red-50 text-red-800'
        }`}>
          {cancelResult.success ? '✅' : '❌'} {cancelResult.message}
        </div>
      )}

      {/* 시세 정보 */}
      {quote && (
        <Card className="border-emerald-500/30 bg-white">
          <CardContent className="py-4 bg-emerald-50/30">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-semibold">{quote.symbolName}</p>
                <p className="text-sm text-gray-600">{quote.symbol}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold">
                  {quote.currentPrice > 0
                    ? formatPrice(quote.currentPrice, isOverseas)
                    : <span className="text-gray-600 text-lg">장 마감</span>
                  }
                </p>
                {quote.currentPrice > 0 && (
                  <p
                    className={`flex items-center justify-end text-sm font-medium ${
                      quote.change >= 0 ? 'text-emerald-500' : 'text-red-500'
                    }`}
                  >
                    {quote.change >= 0 ? (
                      <TrendingUp className="mr-1 h-4 w-4" />
                    ) : (
                      <TrendingDown className="mr-1 h-4 w-4" />
                    )}
                    {quote.change >= 0 ? '+' : ''}
                    {(quote.changeRate ?? 0).toFixed(2)}%
                  </p>
                )}
              </div>
            </div>
            {/* 내 포지션 수익률 */}
            {currentShares > 0 && currentInvested > 0 && quote.currentPrice > 0 && (
              <div className="mt-3 pt-3 border-t">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">내 포지션</span>
                  <span>{currentShares.toLocaleString()}주 · 평단 {formatPrice(currentInvested / currentShares, isOverseas)}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-gray-600 text-sm">평가손익</span>
                  {(() => {
                    const evalAmount = quote.currentPrice * currentShares;
                    const pnl = evalAmount - currentInvested;
                    const pnlPct = (pnl / currentInvested) * 100;
                    const isProfit = pnl >= 0;
                    return (
                      <span className={`font-bold ${isProfit ? 'text-emerald-500' : 'text-red-500'}`}>
                        {isProfit ? '+' : ''}{formatPrice(pnl, isOverseas)} ({isProfit ? '+' : ''}{pnlPct.toFixed(2)}%)
                      </span>
                    );
                  })()}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 주문 목록 */}
      {dailyOrders && (
        <Card className="border-emerald-500/30 bg-white">
          <CardHeader className="border-b border-emerald-200 bg-emerald-50">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-emerald-700">오늘의 주문</CardTitle>
                <CardDescription>
                {dailyOrders.summary.message}
                {dailyOrders.summary.avgCost > 0 && (
                  <span className="ml-2 text-xs text-gray-400">
                    평단 ${dailyOrders.summary.avgCost.toFixed(2)} · 별% {dailyOrders.summary.starPct.toFixed(2)}% · T={dailyOrders.summary.t.toFixed(2)}
                  </span>
                )}
              </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={confirmAllOrders}>
                  전체 확인
                </Button>
                <Button
                  size="sm"
                  onClick={executeAllOrders}
                  disabled={isExecuting}
                >
                  {isExecuting ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  모두 실행
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {(() => {
              const executableBuys = dailyOrders.buyOrders.filter(o => !o.isReference);
              const referenceBuys = dailyOrders.buyOrders.filter(o => o.isReference);
              const executableSells = dailyOrders.sellOrders.filter(o => !o.isReference);
              const hasNoExecutable = executableBuys.length === 0 && executableSells.length === 0;

              return (
                <>
                  {hasNoExecutable && referenceBuys.length === 0 ? (
                    <p className="py-4 text-center text-gray-600">
                      오늘 실행할 주문이 없습니다.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {/* 참고용 매수 주문 (수량 부족) */}
                      {referenceBuys.length > 0 && (
                        <div className="rounded-lg border border-amber-300 overflow-hidden bg-white">
                          <div className="bg-amber-50 px-3 py-2 border-b border-amber-200">
                            <h4 className="font-semibold text-amber-700 flex items-center gap-1.5">
                              <AlertCircle className="h-4 w-4" />
                              매수 주문 (수량 부족 - 참고용)
                            </h4>
                            <p className="text-xs text-amber-600 mt-1">
                              1회 매수금으로 1주를 살 수 없어 실제 주문이 불가합니다.
                            </p>
                          </div>
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-amber-50/50">
                                <TableHead>사유</TableHead>
                                <TableHead className="text-right">수량</TableHead>
                                <TableHead className="text-right">가격</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {referenceBuys.map((order) => (
                                <TableRow key={order.id} className="bg-amber-50/30">
                                  <TableCell>
                                    <span className="text-sm text-amber-800">{order.reason}</span>
                                    <Badge variant="outline" className="ml-2 border-amber-400 text-amber-700">
                                      {order.orderType.toUpperCase()}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right font-bold text-red-500">
                                    0주
                                  </TableCell>
                                  <TableCell className="text-right text-amber-700">
                                    {formatPrice(order.targetPrice, isOverseas)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}

                      {/* 실행 가능한 매수 주문 */}
                      {executableBuys.length > 0 && (
                        <div className="rounded-lg border border-emerald-200 overflow-hidden bg-white">
                          <div className="bg-emerald-50 px-3 py-2 border-b border-emerald-200">
                            <h4 className="font-semibold text-emerald-700">매수 주문</h4>
                          </div>
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-emerald-50/50">
                                <TableHead className="w-12">확인</TableHead>
                                <TableHead>사유</TableHead>
                                <TableHead className="text-right">수량</TableHead>
                                <TableHead className="text-right">가격</TableHead>
                                <TableHead className="text-right">금액</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {executableBuys.map((order) => (
                                <TableRow
                                  key={order.id}
                                  className={
                                    confirmedOrders.has(order.id)
                                      ? 'bg-emerald-100/50'
                                      : 'hover:bg-emerald-50/30'
                                  }
                                >
                                  <TableCell>
                                    <Button
                                      variant={
                                        confirmedOrders.has(order.id)
                                          ? 'default'
                                          : 'outline'
                                      }
                                      size="sm"
                                      className={`h-6 w-6 p-0 ${confirmedOrders.has(order.id) ? 'bg-emerald-500 hover:bg-emerald-600' : ''}`}
                                      onClick={() => toggleConfirmOrder(order.id)}
                                    >
                                      {confirmedOrders.has(order.id) ? (
                                        <CheckCircle className="h-4 w-4" />
                                      ) : (
                                        ''
                                      )}
                                    </Button>
                                  </TableCell>
                                  <TableCell>
                                    <span className="text-sm">{order.reason}</span>
                                    <Badge variant="outline" className="ml-2 border-emerald-300 text-emerald-700">
                                      {order.orderType.toUpperCase()}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right font-medium text-emerald-700">
                                    {order.quantity}주
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {formatPrice(order.targetPrice, isOverseas)}
                                  </TableCell>
                                  <TableCell className="text-right font-bold text-emerald-600">
                                    {formatPrice(
                                      order.quantity * order.targetPrice,
                                      isOverseas
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}

                      {/* 매도 주문 */}
                      {executableSells.length > 0 && (
                        <div className="rounded-lg border border-red-200 overflow-hidden bg-white">
                          <div className="bg-red-50 px-3 py-2 border-b border-red-200">
                            <h4 className="font-semibold text-red-700">매도 주문</h4>
                          </div>
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-red-50/50">
                                <TableHead className="w-12">확인</TableHead>
                                <TableHead>사유</TableHead>
                                <TableHead className="text-right">수량</TableHead>
                                <TableHead className="text-right">가격</TableHead>
                                <TableHead className="text-right">금액</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {executableSells.map((order) => (
                                <TableRow
                                  key={order.id}
                                  className={
                                    confirmedOrders.has(order.id)
                                      ? 'bg-red-100/50'
                                      : 'hover:bg-red-50/30'
                                  }
                                >
                                  <TableCell>
                                    <Button
                                      variant={
                                        confirmedOrders.has(order.id)
                                          ? 'destructive'
                                          : 'outline'
                                      }
                                      size="sm"
                                      className="h-6 w-6 p-0"
                                      onClick={() => toggleConfirmOrder(order.id)}
                                    >
                                      {confirmedOrders.has(order.id) ? (
                                        <CheckCircle className="h-4 w-4" />
                                      ) : (
                                        ''
                                      )}
                                    </Button>
                                  </TableCell>
                                  <TableCell>
                                    <span className="text-sm">{order.reason}</span>
                                    <Badge variant="outline" className="ml-2 border-red-300 text-red-700">
                                      {order.orderType.toUpperCase()}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right font-medium text-red-700">
                                    {order.quantity}주
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {formatPrice(order.targetPrice, isOverseas)}
                                  </TableCell>
                                  <TableCell className="text-right font-bold text-red-600">
                                    {formatPrice(
                                      order.quantity * order.targetPrice,
                                      isOverseas
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
          </CardContent>
          {(dailyOrders.buyOrders.filter(o => !o.isReference).length > 0 ||
            dailyOrders.sellOrders.filter(o => !o.isReference).length > 0) && (
            <CardFooter className="flex-col gap-2">
              {/* 실행 결과 */}
              {executionResult && (
                <div className={`w-full rounded-lg border px-4 py-3 text-sm ${
                  executionResult.success
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                    : 'border-red-200 bg-red-50 text-red-800'
                }`}>
                  <p className="font-medium">{executionResult.success ? '✅' : '❌'} {executionResult.message}</p>
                  {executionResult.details?.filter(d => d.duplicate).map((d, i) => (
                    <p key={`dup-${i}`} className="mt-1 text-xs text-yellow-700">
                      ⚠️ {d.side === 'buy' ? '매수' : '매도'} 중복 차단: 오늘 이미 주문 존재
                    </p>
                  ))}
                  {executionResult.details?.filter(d => d.error && !d.duplicate).map((d, i) => (
                    <p key={`err-${i}`} className="mt-1 text-xs">
                      {d.side === 'buy' ? '매수' : '매도'} 실패: {d.error}
                    </p>
                  ))}
                </div>
              )}
              <p className="text-sm text-gray-600">
                {confirmedOrders.size}건의 주문이 확인되었습니다.
                확인된 주문만 실행됩니다.
              </p>
              <Button
                onClick={executeOrders}
                disabled={isExecuting || confirmedOrders.size === 0}
                className="w-full"
              >
                {isExecuting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    주문 실행 중...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    확인된 주문 실행 ({confirmedOrders.size}건)
                  </>
                )}
              </Button>
            </CardFooter>
          )}
        </Card>
      )}
    </div>
  );
}
