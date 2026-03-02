'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, Wallet, CalendarCheck, BarChart2 } from 'lucide-react';
import type { PortfolioHoldingWithStock } from '@/types/portfolio';
import { formatCurrency } from '@/lib/utils/dividend-calculator';

interface Props {
  holdings: PortfolioHoldingWithStock[];
}

export function AnalyticsSummary({ holdings: hs }: Props) {
  const usd = hs.filter((h) => h.stock.currency === 'USD');
  const krw = hs.filter((h) => h.stock.currency === 'KRW');

  // 총 보유액 (평균 단가 있는 종목만)
  const totalValueUSD = usd.reduce(
    (s, h) => s + (h.average_cost ? Number(h.shares) * Number(h.average_cost) : 0), 0
  );
  const totalValueKRW = krw.reduce(
    (s, h) => s + (h.average_cost ? Number(h.shares) * Number(h.average_cost) : 0), 0
  );

  // 연간 예상 배당
  const annualUSD = usd.reduce((s, h) => s + (h.estimatedAnnualDividend ?? 0), 0);
  const annualKRW = krw.reduce((s, h) => s + (h.estimatedAnnualDividend ?? 0), 0);

  // 올해 수령 배당금
  const ytdUSD = usd.reduce((s, h) => s + (h.ytdDividend ?? 0), 0);
  const ytdKRW = krw.reduce((s, h) => s + (h.ytdDividend ?? 0), 0);

  // 배당 수익률 (연 배당 / 총 보유액)
  const yieldUSD = totalValueUSD > 0 ? (annualUSD / totalValueUSD) * 100 : null;
  const yieldKRW = totalValueKRW > 0 ? (annualKRW / totalValueKRW) * 100 : null;

  const cards = [
    {
      title: '총 보유액',
      icon: Wallet,
      color: 'text-slate-700',
      values: [
        totalValueUSD > 0 && formatCurrency(totalValueUSD, 'USD'),
        totalValueKRW > 0 && formatCurrency(totalValueKRW, 'KRW'),
      ].filter(Boolean),
      sub: '평균 단가 입력 종목 기준',
    },
    {
      title: '연간 예상 배당',
      icon: TrendingUp,
      color: 'text-green-600',
      values: [
        annualUSD > 0 && formatCurrency(annualUSD, 'USD'),
        annualKRW > 0 && formatCurrency(annualKRW, 'KRW'),
      ].filter(Boolean),
      sub: `월 평균 ${[
        annualUSD > 0 && formatCurrency(annualUSD / 12, 'USD'),
        annualKRW > 0 && formatCurrency(annualKRW / 12, 'KRW'),
      ].filter(Boolean).join(' · ') || '-'}`,
    },
    {
      title: '올해 수령 배당금',
      icon: CalendarCheck,
      color: 'text-blue-600',
      values: [
        ytdUSD > 0 && formatCurrency(ytdUSD, 'USD'),
        ytdKRW > 0 && formatCurrency(ytdKRW, 'KRW'),
      ].filter(Boolean),
      sub: `${new Date().getFullYear()}년 배당락 기준`,
    },
    {
      title: '배당 수익률',
      icon: BarChart2,
      color: 'text-purple-600',
      values: [
        yieldUSD !== null && `${yieldUSD.toFixed(2)}% (USD)`,
        yieldKRW !== null && `${yieldKRW.toFixed(2)}% (KRW)`,
      ].filter(Boolean),
      sub: '연 배당 / 총 보유액',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {cards.map(({ title, icon: Icon, color, values, sub }) => (
        <Card key={title}>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-xs font-medium text-gray-500">{title}</CardTitle>
            <Icon className={`h-4 w-4 ${color}`} />
          </CardHeader>
          <CardContent>
            {values.length > 0 ? (
              values.map((v, i) => (
                <p key={i} className={`font-bold leading-tight ${i === 0 ? `text-xl ${color}` : 'text-sm text-gray-600 mt-0.5'}`}>
                  {v}
                </p>
              ))
            ) : (
              <p className="text-xl font-bold text-gray-300">-</p>
            )}
            <p className="text-xs text-gray-400 mt-1">{sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
