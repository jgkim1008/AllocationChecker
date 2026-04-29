'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Loader2, ShoppingCart, AlertTriangle } from 'lucide-react';
import { STRATEGY_META, type StrategyKey } from '@/lib/utils/chart-strategy-sync';

interface QuickOrderFormProps {
  symbol: string;
  market: 'US' | 'KR';
  currentPrice: number;
  selectedStrategy: StrategyKey | null;
  syncRate?: number;
}

type OrderType = 'limit' | 'market' | 'loc';
type BrokerType = 'kis' | 'kiwoom';

export function QuickOrderForm({
  symbol,
  market,
  currentPrice,
  selectedStrategy,
  syncRate,
}: QuickOrderFormProps) {
  const [orderType, setOrderType] = useState<OrderType>('limit');
  const [broker, setBroker] = useState<BrokerType>('kis');
  const [quantity, setQuantity] = useState('');
  const [amount, setAmount] = useState('');
  const [price, setPrice] = useState('');
  const [takeProfitPct, setTakeProfitPct] = useState('10');
  const [stopLossPct, setStopLossPct] = useState('5');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // 가격 초기화
  useEffect(() => {
    setPrice(currentPrice.toFixed(market === 'US' ? 2 : 0));
  }, [currentPrice, market]);

  // 금액 → 수량 자동 계산
  useEffect(() => {
    if (amount && currentPrice > 0) {
      const qty = Math.floor(Number(amount) / currentPrice);
      setQuantity(qty > 0 ? String(qty) : '');
    }
  }, [amount, currentPrice]);

  // 수량 → 금액 자동 계산 (수량 직접 입력 시)
  const handleQuantityChange = (value: string) => {
    setQuantity(value);
    if (value && currentPrice > 0) {
      const total = Number(value) * currentPrice;
      setAmount(total.toFixed(market === 'US' ? 2 : 0));
    }
  };

  // 금액 입력 시
  const handleAmountChange = (value: string) => {
    setAmount(value);
    // 금액 변경 시 수량은 useEffect에서 자동 계산
  };

  const estimatedTotal = quantity ? Number(quantity) * Number(price || currentPrice) : 0;
  const currency = market === 'US' ? '$' : '₩';

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);

    if (!quantity || Number(quantity) <= 0) {
      setError('수량을 입력해주세요.');
      return;
    }

    if (orderType === 'limit' && (!price || Number(price) <= 0)) {
      setError('주문 가격을 입력해주세요.');
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/signal-trade/quick-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          market: market === 'KR' ? 'domestic' : 'overseas',
          broker_type: broker,
          order_type: orderType,
          side: 'buy',
          quantity: Number(quantity),
          price: orderType === 'limit' ? Number(price) : null,
          take_profit_pct: takeProfitPct ? Number(takeProfitPct) : null,
          stop_loss_pct: stopLossPct ? Number(stopLossPct) : null,
          strategy_type: selectedStrategy
            ? (selectedStrategy === 'maAlignment' ? 'ma-alignment'
              : selectedStrategy === 'inverseAlignment' ? 'inverse-alignment'
              : selectedStrategy === 'dualRsi' ? 'dual-rsi'
              : selectedStrategy === 'rsiDivergence' ? 'rsi-divergence'
              : selectedStrategy === 'fibonacci' ? 'fibonacci'
              : selectedStrategy === 'monthlyMA10' ? 'monthly-ma'
              : selectedStrategy === 'weeklySR' ? 'weekly-sr'
              : null)
            : null,
          sync_rate: syncRate,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '주문 실패');
      }

      // 자동주문 결과 확인
      const autoOrder = data.data?.autoOrder;
      let successMsg = `주문 완료: ${quantity}주 @ ${currency}${Number(price || currentPrice).toLocaleString()}`;

      if (autoOrder?.registered) {
        successMsg += ` | 자동주문 등록 (익절 ${autoOrder.takeProfitPct}%, 손절 ${autoOrder.stopLossPct}%, 30일)`;
      } else if (autoOrder && !autoOrder.registered) {
        successMsg += ` | 자동주문 실패: ${autoOrder.error}`;
      }

      setSuccess(successMsg);
      setQuantity('');
      setAmount('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '주문 실패');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="border-gray-200 bg-white">
      <CardHeader className="py-3 px-4 border-b border-gray-100">
        <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <ShoppingCart className="h-4 w-4" />
          즉시 주문
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {/* 선택된 전략 표시 */}
        {selectedStrategy && syncRate !== undefined && (
          <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
            <div className="flex items-center justify-between">
              <span className="text-sm text-emerald-700 font-medium">
                {STRATEGY_META[selectedStrategy].label}
              </span>
              <Badge className="bg-emerald-100 text-emerald-700 border-0">
                싱크 {syncRate}%
              </Badge>
            </div>
          </div>
        )}

        {/* 증권사 선택 */}
        <div className="space-y-1.5">
          <Label className="text-xs text-gray-600">증권사</Label>
          <Select value={broker} onValueChange={(v) => setBroker(v as BrokerType)}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white">
              <SelectItem value="kis">한국투자증권</SelectItem>
              <SelectItem value="kiwoom">키움증권</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 주문 유형 */}
        <div className="space-y-1.5">
          <Label className="text-xs text-gray-600">주문 유형</Label>
          <Select value={orderType} onValueChange={(v) => setOrderType(v as OrderType)}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-white">
              <SelectItem value="limit">지정가</SelectItem>
              <SelectItem value="market">시장가</SelectItem>
              <SelectItem value="loc">LOC (종가)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 수량 & 금액 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">수량</Label>
            <Input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => handleQuantityChange(e.target.value)}
              placeholder="0"
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">금액 ({currency})</Label>
            <Input
              type="number"
              min="0"
              value={amount}
              onChange={(e) => handleAmountChange(e.target.value)}
              placeholder="0"
              className="h-9 text-sm"
            />
          </div>
        </div>

        {/* 지정가일 때 주문가 */}
        {orderType === 'limit' && (
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">주문가 ({currency})</Label>
            <Input
              type="number"
              min="0"
              step={market === 'US' ? '0.01' : '1'}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
        )}

        {/* 익절/손절 설정 */}
        <div className="pt-2 border-t border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs text-gray-500">청산 조건</Label>
            {broker === 'kis' && market === 'US' && (
              <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-600 border-blue-200">
                자동주문 30일
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600 flex items-center gap-1">
                <span className="text-green-600">익절</span> (%)
              </Label>
              <Input
                type="number"
                min="0"
                step="0.1"
                value={takeProfitPct}
                onChange={(e) => setTakeProfitPct(e.target.value)}
                placeholder="10"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600 flex items-center gap-1">
                <span className="text-red-600">손절</span> (%)
              </Label>
              <Input
                type="number"
                min="0"
                step="0.1"
                value={stopLossPct}
                onChange={(e) => setStopLossPct(e.target.value)}
                placeholder="5"
                className="h-9 text-sm"
              />
            </div>
          </div>
          {broker === 'kis' && market === 'US' && (takeProfitPct || stopLossPct) && (
            <p className="text-[10px] text-blue-600 mt-2">
              한투 자동주문 API로 30일간 익절/손절 조건 유지
            </p>
          )}
          {(broker !== 'kis' || market !== 'US') && (takeProfitPct || stopLossPct) && (
            <p className="text-[10px] text-gray-400 mt-2">
              익절/손절 조건은 참고용으로 저장됩니다 (자동 청산 미지원)
            </p>
          )}
        </div>

        {/* 예상 금액 */}
        <div className="pt-2 border-t border-gray-100">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">예상 금액</span>
            <span className="font-bold text-gray-900">
              {currency}
              {estimatedTotal.toLocaleString(market === 'US' ? 'en-US' : 'ko-KR', {
                minimumFractionDigits: market === 'US' ? 2 : 0,
                maximumFractionDigits: market === 'US' ? 2 : 0,
              })}
            </span>
          </div>
        </div>

        {/* 에러/성공 메시지 */}
        {error && (
          <div className="flex items-center gap-2 p-2 bg-red-50 rounded-lg text-sm text-red-600">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        )}
        {success && (
          <div className="p-2 bg-green-50 rounded-lg text-sm text-green-600">{success}</div>
        )}

        {/* 주문 버튼 */}
        <Button
          className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
          onClick={handleSubmit}
          disabled={submitting || !quantity}
        >
          {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          매수 주문
        </Button>

        <p className="text-[10px] text-gray-400 text-center">
          브로커 계정 연동 필요. 실제 주문이 실행됩니다.
        </p>
      </CardContent>
    </Card>
  );
}
