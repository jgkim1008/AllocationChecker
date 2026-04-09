'use client';

import { useState } from 'react';
import { RefreshCw, CheckCircle, AlertTriangle, AlertCircle, ChevronDown, ChevronUp, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type BrokerType = 'kis' | 'kiwoom';

interface SyncResult {
  symbol: string;
  inSync: boolean;
  broker: {
    shares: number;
    avgCost: number;
    currentPrice: number | null;
    evalAmount: number | null;
    profitLoss: number | null;
    profitLossRate: number | null;
    found: boolean;
  };
  db: {
    shares: number;
    avgCost: number;
    buyCount: number;
    sellCount: number;
    totalBuyShares: number;
    totalSellShares: number;
  };
  diff: {
    shares: number;
    avgCostPct: number;
    sharesMatch: boolean;
    avgCostMatch: boolean;
  };
}

const PRESET_SYMBOLS = ['TQQQ', 'UPRO', 'SOXL', 'FNGU', 'TECL'];

export function PositionSync() {
  const [brokerType, setBrokerType] = useState<BrokerType>('kis');
  const [symbol, setSymbol] = useState('TQQQ');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 수동 조정 폼
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjDate, setAdjDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [adjPrice, setAdjPrice] = useState('');
  const [adjShares, setAdjShares] = useState('');
  const [adjCapital, setAdjCapital] = useState('');
  const [adjN, setAdjN] = useState('40');
  const [adjTargetRate, setAdjTargetRate] = useState('10');
  const [adjusting, setAdjusting] = useState(false);
  const [adjustResult, setAdjustResult] = useState<string | null>(null);

  const checkSync = async () => {
    if (!symbol) return;
    setIsLoading(true);
    setError(null);
    setResult(null);
    setAdjustResult(null);
    try {
      const res = await fetch(
        `/api/auto-trade/sync-check?brokerType=${brokerType}&symbol=${encodeURIComponent(symbol.toUpperCase())}`
      );
      const data = await res.json();
      if (data.success) {
        setResult(data.data);
      } else {
        setError(data.error || '싱크 확인 실패');
      }
    } catch {
      setError('서버 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdjust = async () => {
    const price = parseFloat(adjPrice);
    const shares = parseFloat(adjShares);
    if (!adjDate || isNaN(price) || isNaN(shares) || price <= 0 || shares <= 0) return;

    setAdjusting(true);
    setAdjustResult(null);
    try {
      const res = await fetch('/api/auto-trade/sync-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: symbol.toUpperCase(),
          shares,
          price,
          buy_date: adjDate,
          capital: parseFloat(adjCapital) || 0,
          n: parseInt(adjN) || 40,
          target_rate: (parseFloat(adjTargetRate) || 10) / 100,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setAdjustResult('✅ 매수 기록 추가 완료. 싱크 재확인을 눌러 검증하세요.');
        setShowAdjust(false);
        setAdjPrice('');
        setAdjShares('');
      } else {
        setAdjustResult(`❌ ${data.error}`);
      }
    } catch {
      setAdjustResult('❌ 서버 오류');
    } finally {
      setAdjusting(false);
    }
  };

  const isOverseas = !/^\d{6}$/.test(symbol);

  const fmt = (v: number) =>
    isOverseas ? `$${v.toFixed(2)}` : `₩${Math.round(v).toLocaleString('ko-KR')}`;

  return (
    <div className="space-y-4">
      {/* 설정 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <RefreshCw className="h-4 w-4" />
            포지션 싱크 검증
          </CardTitle>
          <CardDescription>
            증권사 실제 잔고와 DB 기록을 비교하여 불일치를 감지합니다
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1.5">
              <Label>증권사</Label>
              <Select value={brokerType} onValueChange={(v) => setBrokerType(v as BrokerType)}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kis">한국투자증권</SelectItem>
                  <SelectItem value="kiwoom">키움증권</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>종목</Label>
              <div className="flex gap-1.5 flex-wrap">
                {PRESET_SYMBOLS.map((sym) => (
                  <button
                    key={sym}
                    onClick={() => setSymbol(sym)}
                    className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                      symbol === sym
                        ? 'bg-green-600 text-white border-green-600'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-green-400'
                    }`}
                  >
                    {sym}
                  </button>
                ))}
                <Input
                  placeholder="직접 입력"
                  value={PRESET_SYMBOLS.includes(symbol) ? '' : symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  className="w-28 h-8 text-xs"
                />
              </div>
            </div>

            <Button onClick={checkSync} disabled={isLoading || !symbol} className="h-9">
              {isLoading ? (
                <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />확인 중...</>
              ) : (
                <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />싱크 확인</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 에러 */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-2 py-4 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </CardContent>
        </Card>
      )}

      {/* 결과 */}
      {result && (
        <Card className={result.inSync ? 'border-green-300' : 'border-yellow-400'}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {result.inSync ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                )}
                <CardTitle className="text-base">
                  {result.symbol} 포지션 싱크 결과
                </CardTitle>
                <Badge variant={result.inSync ? 'default' : 'destructive'} className={result.inSync ? 'bg-green-500' : 'bg-yellow-500 text-white'}>
                  {result.inSync ? '일치' : '불일치'}
                </Badge>
              </div>
              <Button variant="ghost" size="sm" onClick={checkSync} disabled={isLoading}>
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 비교 테이블 */}
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">항목</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-blue-600">증권사 실제</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-600">DB 기록</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">차이</th>
                    <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500">상태</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-gray-100">
                    <td className="px-4 py-3 text-gray-700 font-medium">보유 수량</td>
                    <td className="px-4 py-3 text-right font-semibold text-blue-700">
                      {result.broker.found ? `${result.broker.shares.toFixed(4)}주` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {result.db.shares.toFixed(4)}주
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${
                      result.diff.sharesMatch ? 'text-gray-400' : 'text-yellow-600'
                    }`}>
                      {result.diff.shares > 0 ? '+' : ''}{result.diff.shares.toFixed(4)}주
                    </td>
                    <td className="px-4 py-3 text-center">
                      {result.diff.sharesMatch
                        ? <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                        : <AlertTriangle className="h-4 w-4 text-yellow-500 mx-auto" />}
                    </td>
                  </tr>
                  <tr className="border-t border-gray-100">
                    <td className="px-4 py-3 text-gray-700 font-medium">평균단가</td>
                    <td className="px-4 py-3 text-right font-semibold text-blue-700">
                      {result.broker.found && result.broker.avgCost > 0 ? fmt(result.broker.avgCost) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">
                      {result.db.avgCost > 0 ? fmt(result.db.avgCost) : '—'}
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${
                      result.diff.avgCostMatch ? 'text-gray-400' : 'text-yellow-600'
                    }`}>
                      {result.diff.avgCostPct !== 0
                        ? `${result.diff.avgCostPct > 0 ? '+' : ''}${result.diff.avgCostPct.toFixed(2)}%`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {result.diff.avgCostMatch
                        ? <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                        : <AlertTriangle className="h-4 w-4 text-yellow-500 mx-auto" />}
                    </td>
                  </tr>
                  {result.broker.found && result.broker.currentPrice && (
                    <tr className="border-t border-gray-100 bg-gray-50/50">
                      <td className="px-4 py-3 text-gray-500 text-xs">현재가 (참고)</td>
                      <td className="px-4 py-3 text-right text-gray-700 text-xs">{fmt(result.broker.currentPrice)}</td>
                      <td className="px-4 py-3 text-right text-gray-400 text-xs">—</td>
                      <td className="px-4 py-3 text-right text-gray-400 text-xs">
                        {result.broker.profitLossRate != null
                          ? `${result.broker.profitLossRate >= 0 ? '+' : ''}${result.broker.profitLossRate.toFixed(2)}%`
                          : '—'}
                      </td>
                      <td />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* DB 요약 */}
            <div className="flex flex-wrap gap-3 text-xs text-gray-500">
              <span className="bg-gray-100 px-2.5 py-1 rounded-full">
                매수 {result.db.buyCount}건 ({result.db.totalBuyShares.toFixed(2)}주)
              </span>
              <span className="bg-gray-100 px-2.5 py-1 rounded-full">
                매도 {result.db.sellCount}건 ({result.db.totalSellShares.toFixed(2)}주)
              </span>
              <span className="bg-gray-100 px-2.5 py-1 rounded-full">
                순 보유 {result.db.shares.toFixed(4)}주
              </span>
              {!result.broker.found && (
                <span className="bg-yellow-100 text-yellow-700 px-2.5 py-1 rounded-full">
                  ⚠ 증권사에 해당 종목 없음
                </span>
              )}
            </div>

            {/* 불일치 원인 안내 */}
            {!result.inSync && (
              <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-800 space-y-1">
                <p className="font-semibold">불일치 가능 원인</p>
                {!result.diff.sharesMatch && (
                  <p>• 수량 차이 {Math.abs(result.diff.shares).toFixed(4)}주 — 미기록 매수/매도, 부분체결 누락 가능성</p>
                )}
                {!result.diff.avgCostMatch && (
                  <p>• 평단가 차이 {Math.abs(result.diff.avgCostPct).toFixed(2)}% — 수수료 반영 여부나 환율 차이 확인 필요</p>
                )}
              </div>
            )}

            {/* 수동 조정 */}
            {!result.inSync && (
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowAdjust((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <Plus className="h-4 w-4" />
                    수동 조정 — DB에 매수 기록 추가
                  </span>
                  {showAdjust ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>

                {showAdjust && (
                  <div className="px-4 pb-4 pt-2 bg-gray-50 border-t border-gray-100 space-y-3">
                    <p className="text-xs text-gray-500">
                      증권사 잔고 기준으로 누락된 매수 기록을 수동으로 추가합니다.
                    </p>
                    <div className="flex flex-wrap gap-3 items-end">
                      <div className="space-y-1">
                        <Label className="text-xs">매수일</Label>
                        <Input type="date" value={adjDate} onChange={(e) => setAdjDate(e.target.value)} className="h-8 text-xs w-36" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">매수가</Label>
                        <Input
                          type="number" step="0.01" placeholder="0.00" value={adjPrice}
                          onChange={(e) => setAdjPrice(e.target.value)}
                          className="h-8 text-xs w-28"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">수량 (주)</Label>
                        <Input
                          type="number" step="0.0001" placeholder="0" value={adjShares}
                          onChange={(e) => setAdjShares(e.target.value)}
                          className="h-8 text-xs w-28"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">총투자금 (C)</Label>
                        <Input
                          type="number" placeholder="5000" value={adjCapital}
                          onChange={(e) => setAdjCapital(e.target.value)}
                          className="h-8 text-xs w-24"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">분할 (N)</Label>
                        <Input
                          type="number" placeholder="40" value={adjN}
                          onChange={(e) => setAdjN(e.target.value)}
                          className="h-8 text-xs w-20"
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={handleAdjust}
                        disabled={adjusting || !adjPrice || !adjShares}
                        className="h-8"
                      >
                        {adjusting ? <><RefreshCw className="h-3 w-3 mr-1 animate-spin" />추가 중</> : '기록 추가'}
                      </Button>
                    </div>
                    {adjPrice && adjShares && parseFloat(adjPrice) > 0 && parseFloat(adjShares) > 0 && (
                      <p className="text-xs text-gray-500">
                        예상 금액: {isOverseas
                          ? `$${(parseFloat(adjPrice) * parseFloat(adjShares)).toFixed(2)}`
                          : `₩${Math.round(parseFloat(adjPrice) * parseFloat(adjShares)).toLocaleString('ko-KR')}`
                        }
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {adjustResult && (
              <p className={`text-sm ${adjustResult.startsWith('✅') ? 'text-green-700' : 'text-red-600'}`}>
                {adjustResult}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
