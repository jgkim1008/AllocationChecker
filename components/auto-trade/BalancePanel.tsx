'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2, TrendingUp, TrendingDown, Wallet } from 'lucide-react';

type BrokerType = 'kis' | 'kiwoom';

interface Balance {
  totalAsset: number;
  totalDeposit: number;
  totalBuyAmount: number;
  totalEvalAmount: number;
  totalProfitLoss: number;
  totalProfitLossRate: number;
  currency: 'KRW' | 'USD';
}

interface Position {
  symbol: string;
  symbolName: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  evalAmount: number;
  profitLoss: number;
  profitLossRate: number;
  currency: 'KRW' | 'USD';
  market: 'domestic' | 'overseas';
}

interface FullBalance {
  domestic: { balance: Balance; positions: Position[] };
  overseas: { balance: Balance; positions: Position[] };
}

function fmt(value: number, currency: 'KRW' | 'USD') {
  if (currency === 'USD') return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `₩${value.toLocaleString('ko-KR')}`;
}

function PnlText({ value, rate, currency }: { value: number; rate: number; currency: 'KRW' | 'USD' }) {
  const isPos = value >= 0;
  return (
    <span className={`flex items-center gap-0.5 text-xs font-bold ${isPos ? 'text-green-600' : 'text-red-500'}`}>
      {isPos ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {isPos ? '+' : ''}{fmt(value, currency)} ({isPos ? '+' : ''}{rate.toFixed(2)}%)
    </span>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function MarketSection({ title, balance, positions, currency }: {
  title: string;
  balance: Balance;
  positions: Position[];
  currency: 'KRW' | 'USD';
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">{title}</h3>
        <PnlText value={balance.totalProfitLoss} rate={balance.totalProfitLossRate} currency={currency} />
      </div>

      {/* 요약 */}
      <div className="bg-muted/40 rounded-lg p-3 space-y-1.5">
        <SummaryRow label="총 자산" value={fmt(balance.totalAsset, currency)} />
        <SummaryRow label="예수금" value={fmt(balance.totalDeposit, currency)} />
        <SummaryRow label="매입금액" value={fmt(balance.totalBuyAmount, currency)} />
        <SummaryRow label="평가금액" value={fmt(balance.totalEvalAmount, currency)} />
      </div>

      {/* 보유 종목 */}
      {positions.length > 0 && (
        <div className="space-y-1.5">
          {positions.map((p, i) => (
            <div key={`${p.symbol}-${i}`} className="border rounded-lg px-3 py-2.5 space-y-1">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-sm">{p.symbol}</span>
                  <span className="ml-1.5 text-xs text-muted-foreground truncate max-w-[120px] inline-block align-bottom">{p.symbolName}</span>
                </div>
                <PnlText value={p.profitLoss} rate={p.profitLossRate} currency={p.currency} />
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{p.quantity}주</span>
                <span>평균 {fmt(p.avgPrice, p.currency)}</span>
                <span>현재 {fmt(p.currentPrice, p.currency)}</span>
                <span className="ml-auto font-medium text-foreground">{fmt(p.evalAmount, p.currency)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {positions.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">보유 종목 없음</p>
      )}
    </div>
  );
}

interface BalancePanelProps {
  brokerType?: BrokerType;
}

export function BalancePanel({ brokerType = 'kis' }: BalancePanelProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<FullBalance | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/broker/balance?brokerType=${brokerType}&includeOverseas=true`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        setError(json.error || '잔고 조회 실패');
      }
    } catch {
      setError('서버 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4" />
            보유 잔고
          </CardTitle>
          <Button variant="outline" size="sm" onClick={fetchBalance} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            <span className="ml-1.5">{data ? '새로고침' : '잔고 조회'}</span>
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {error && (
          <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
        )}

        {!data && !loading && !error && (
          <p className="text-sm text-muted-foreground text-center py-6">
            잔고 조회 버튼을 눌러 현재 보유 잔고를 확인하세요.
          </p>
        )}

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {data && !loading && (
          <div className="space-y-5">
            <MarketSection
              title="국내 주식"
              balance={data.domestic.balance}
              positions={data.domestic.positions}
              currency="KRW"
            />
            <div className="border-t" />
            <MarketSection
              title="해외 주식"
              balance={data.overseas.balance}
              positions={data.overseas.positions}
              currency="USD"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
