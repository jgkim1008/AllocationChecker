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

type BrokerType = 'kis' | 'kiwoom';
type StrategyVersion = 'V2.2' | 'V3.0';

interface AutoTradeOrder {
  id: string;
  symbol: string;
  symbolName: string;
  side: 'buy' | 'sell';
  orderType: string;
  quantity: number;
  targetPrice: number;
  reason: string;
  cycleNumber: number;
  roundNumber: number;
  status: string;
}

interface DailyOrders {
  buyOrders: AutoTradeOrder[];
  sellOrders: AutoTradeOrder[];
  summary: {
    symbol: string;
    symbolName: string;
    currentPrice: number;
    avgCost: number;
    currentRound: number;
    totalBuyAmount: number;
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
  const [strategyVersion, setStrategyVersion] = useState<StrategyVersion>('V2.2');
  const [totalCapital, setTotalCapital] = useState(5000);
  const [currentCycle, setCurrentCycle] = useState(1);
  const [currentRound, setCurrentRound] = useState(0);
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
    details?: { orderId: string; side: string; error?: string }[];
  } | null>(null);

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

  // 트래커에서 현재 상태 불러오기
  const loadFromTracker = async () => {
    if (!symbol) return;
    setIsLoadingTracker(true);
    try {
      const res = await fetch(`/api/infinite-buy/records?symbol=${symbol.toUpperCase()}`);
      const records: { capital: number; shares: number; amount: number }[] = await res.json();

      if (!Array.isArray(records) || records.length === 0) {
        alert(`트래커에 "${symbol}" 매수 기록이 없습니다.`);
        return;
      }

      const totalShares = records.reduce((sum, r) => sum + r.shares, 0);
      const totalInvested = records.reduce((sum, r) => sum + r.amount, 0);
      const capital = records[0].capital;

      const savedCycle = parseInt(localStorage.getItem(`inf-buy-cycle-${symbol.toUpperCase()}`) || '1', 10);

      setTotalCapital(capital);
      setCurrentCycle(savedCycle);
      setCurrentRound(records.length);
      setCurrentShares(Math.round(totalShares * 10000) / 10000);
      setCurrentInvested(Math.round(totalInvested * 100) / 100);
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
      const params = new URLSearchParams({
        brokerType,
        symbol: symbol.toUpperCase(),
        strategy: strategyVersion,
        capital: totalCapital.toString(),
        cycle: currentCycle.toString(),
        round: currentRound.toString(),
        shares: currentShares.toString(),
        invested: currentInvested.toString(),
        market,
      });

      const response = await fetch(`/api/auto-trade/infinite-buy?${params}`);
      const data = await response.json();

      if (data.success) {
        setDailyOrders(data.data.orders);
        setQuote(data.data.quote);
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

  // 전체 확인
  const confirmAllOrders = () => {
    if (!dailyOrders) return;
    const allOrders = [...dailyOrders.buyOrders, ...dailyOrders.sellOrders];
    setConfirmedOrders(new Set(allOrders.map(o => o.id)));
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
        body: JSON.stringify({ brokerType, orders: ordersToExecute, market }),
      });
      const data = await response.json();

      if (!data.success) {
        // 브로커 연결 오류 등 전체 실패
        setError(data.error || '주문 실행에 실패했습니다.');
        return;
      }

      const failCount: number = data.data?.summary?.failed ?? 0;
      const details = (data.data?.results ?? []).map((r: { order: AutoTradeOrder; success: boolean; error?: string }) => ({
        orderId: r.order.id,
        side: r.order.side,
        error: r.success ? undefined : r.error,
      }));

      if (failCount > 0) {
        // 일부 또는 전체 실패 → UI 유지, 이유 표시
        setExecutionResult({ success: false, message: data.message, details });
      } else {
        // 전부 성공 → UI 초기화
        setExecutionResult({ success: true, message: data.message });
        setCurrentRound(prev => prev + 1);
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
  const executeAllOrders = async () => {
    if (!dailyOrders) return;
    const allOrders = [...dailyOrders.buyOrders, ...dailyOrders.sellOrders];
    if (allOrders.length === 0) return;
    setConfirmedOrders(new Set(allOrders.map(o => o.id)));
    await runOrders(allOrders.map(o => ({ ...o, status: 'confirmed' })));
  };

  // 확인된 주문만 실행
  const executeOrders = async () => {
    if (!dailyOrders || confirmedOrders.size === 0) return;
    const allOrders = [...dailyOrders.buyOrders, ...dailyOrders.sellOrders];
    const ordersToExecute = allOrders
      .filter(o => confirmedOrders.has(o.id))
      .map(o => ({ ...o, status: 'confirmed' }));
    await runOrders(ordersToExecute);
  };

  const formatPrice = (price: number, isOverseas: boolean) => {
    if (isOverseas) {
      return `$${price.toFixed(2)}`;
    }
    return `${price.toLocaleString()}원`;
  };

  const isOverseas = !/^\d{6}$/.test(symbol);

  return (
    <div className="space-y-4">
      {/* 설정 카드 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                무한매수법 자동매매
              </CardTitle>
              <CardDescription>
                오늘의 LOC 주문을 계산하고 확인 후 실행합니다
              </CardDescription>
            </div>
            <Link href="/infinite-buy" target="_blank">
              <Button variant="ghost" size="sm">
                <ExternalLink className="h-3.5 w-3.5" />
                <span className="ml-1.5">무한매수 트래커</span>
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={loadFromTracker}
              disabled={isLoadingTracker || !symbol}
              title="실시간 트래커에서 현재 회차/보유수량/투자금액을 자동으로 불러옵니다"
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
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label>증권사</Label>
            <Select
              value={brokerType}
              onValueChange={(v) => setBrokerType(v as BrokerType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kis">한국투자증권</SelectItem>
                <SelectItem value="kiwoom">키움증권</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>종목코드</Label>
            <div className="relative">
              <Input
                value={symbol}
                onChange={(e) => handleSymbolChange(e.target.value)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                placeholder="TQQQ, SOXL, 122630"
                className="pr-16"
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
            <Label>전략</Label>
            <Select
              value={strategyVersion}
              onValueChange={(v) => setStrategyVersion(v as StrategyVersion)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="V2.2">V2.2 안정형 (40분할)</SelectItem>
                <SelectItem value="V3.0">V3.0 공격형 (20분할)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>총 투자금 ({isOverseas ? 'USD' : 'KRW'})</Label>
            <Input
              type="number"
              value={totalCapital}
              onChange={(e) => setTotalCapital(parseFloat(e.target.value) || 0)}
            />
          </div>

          <div className="space-y-2">
            <Label>현재 회차 (T)</Label>
            <Input
              type="number"
              value={currentRound}
              onChange={(e) => setCurrentRound(parseInt(e.target.value) || 0)}
              min={0}
            />
          </div>

          <div className="space-y-2">
            <Label>보유 수량</Label>
            <Input
              type="number"
              value={currentShares}
              onChange={(e) => setCurrentShares(parseFloat(e.target.value) || 0)}
              min={0}
              step="0.0001"
            />
          </div>

          <div className="space-y-2">
            <Label>투자금액 ({isOverseas ? 'USD' : 'KRW'})</Label>
            <Input
              type="number"
              value={currentInvested}
              onChange={(e) => setCurrentInvested(parseFloat(e.target.value) || 0)}
              min={0}
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button
            onClick={calculateOrders}
            disabled={isLoading || !symbol}
            className="w-full"
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

      {/* 시세 정보 */}
      {quote && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-semibold">{quote.symbolName}</p>
                <p className="text-sm text-muted-foreground">{quote.symbol}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold">
                  {formatPrice(quote.currentPrice, isOverseas)}
                </p>
                <p
                  className={`flex items-center justify-end text-sm ${
                    quote.change >= 0 ? 'text-green-500' : 'text-red-500'
                  }`}
                >
                  {quote.change >= 0 ? (
                    <TrendingUp className="mr-1 h-4 w-4" />
                  ) : (
                    <TrendingDown className="mr-1 h-4 w-4" />
                  )}
                  {quote.change >= 0 ? '+' : ''}
                  {quote.changeRate.toFixed(2)}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 주문 목록 */}
      {dailyOrders && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>오늘의 주문</CardTitle>
                <CardDescription>{dailyOrders.summary.message}</CardDescription>
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
            {dailyOrders.buyOrders.length === 0 &&
            dailyOrders.sellOrders.length === 0 ? (
              <p className="py-4 text-center text-muted-foreground">
                오늘 실행할 주문이 없습니다.
              </p>
            ) : (
              <div className="space-y-4">
                {/* 매수 주문 */}
                {dailyOrders.buyOrders.length > 0 && (
                  <div>
                    <h4 className="mb-2 font-medium text-green-600">매수 주문</h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">확인</TableHead>
                          <TableHead>사유</TableHead>
                          <TableHead className="text-right">수량</TableHead>
                          <TableHead className="text-right">가격</TableHead>
                          <TableHead className="text-right">금액</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dailyOrders.buyOrders.map((order) => (
                          <TableRow
                            key={order.id}
                            className={
                              confirmedOrders.has(order.id)
                                ? 'bg-green-500/10'
                                : ''
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
                              <Badge variant="outline" className="ml-2">
                                {order.orderType.toUpperCase()}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {order.quantity}주
                            </TableCell>
                            <TableCell className="text-right">
                              {formatPrice(order.targetPrice, isOverseas)}
                            </TableCell>
                            <TableCell className="text-right font-medium">
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
                {dailyOrders.sellOrders.length > 0 && (
                  <div>
                    <h4 className="mb-2 font-medium text-red-600">매도 주문</h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">확인</TableHead>
                          <TableHead>사유</TableHead>
                          <TableHead className="text-right">수량</TableHead>
                          <TableHead className="text-right">가격</TableHead>
                          <TableHead className="text-right">금액</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dailyOrders.sellOrders.map((order) => (
                          <TableRow
                            key={order.id}
                            className={
                              confirmedOrders.has(order.id)
                                ? 'bg-red-500/10'
                                : ''
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
                              <Badge variant="outline" className="ml-2">
                                {order.orderType.toUpperCase()}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {order.quantity}주
                            </TableCell>
                            <TableCell className="text-right">
                              {formatPrice(order.targetPrice, isOverseas)}
                            </TableCell>
                            <TableCell className="text-right font-medium">
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
          </CardContent>
          {(dailyOrders.buyOrders.length > 0 ||
            dailyOrders.sellOrders.length > 0) && (
            <CardFooter className="flex-col gap-2">
              {/* 실행 결과 */}
              {executionResult && (
                <div className={`w-full rounded-lg border px-4 py-3 text-sm ${
                  executionResult.success
                    ? 'border-green-200 bg-green-50 text-green-800'
                    : 'border-red-200 bg-red-50 text-red-800'
                }`}>
                  <p className="font-medium">{executionResult.success ? '✅' : '❌'} {executionResult.message}</p>
                  {executionResult.details?.filter(d => d.error).map((d, i) => (
                    <p key={i} className="mt-1 text-xs">
                      {d.side === 'buy' ? '매수' : '매도'} 실패: {d.error}
                    </p>
                  ))}
                </div>
              )}
              <p className="text-sm text-muted-foreground">
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
