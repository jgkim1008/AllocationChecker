'use client';

import type { PortfolioHoldingWithStock } from '@/types/portfolio';
import { formatCurrency } from '@/lib/utils/dividend-calculator';

interface Props {
  holdings: PortfolioHoldingWithStock[];
}

export function AnalyticsSummary({ holdings: hs }: Props) {
  const usd = hs.filter((h) => h.stock.currency === 'USD');
  const krw = hs.filter((h) => h.stock.currency === 'KRW');

  const totalValueUSD = usd.reduce(
    (s, h) => s + (h.average_cost ? Number(h.shares) * Number(h.average_cost) : 0), 0
  );
  const totalValueKRW = krw.reduce(
    (s, h) => s + (h.average_cost ? Number(h.shares) * Number(h.average_cost) : 0), 0
  );

  const annualUSD = usd.reduce((s, h) => s + (h.estimatedAnnualDividend ?? 0), 0);
  const annualKRW = krw.reduce((s, h) => s + (h.estimatedAnnualDividend ?? 0), 0);

  const ytdUSD = usd.reduce((s, h) => s + (h.ytdDividend ?? 0), 0);
  const ytdKRW = krw.reduce((s, h) => s + (h.ytdDividend ?? 0), 0);

  const yieldUSD = totalValueUSD > 0 ? (annualUSD / totalValueUSD) * 100 : null;
  const yieldKRW = totalValueKRW > 0 ? (annualKRW / totalValueKRW) * 100 : null;

  const formatValues = (usdVal: number, krwVal: number, fmt: (v: number, c: 'USD' | 'KRW') => string) => {
    const parts = [
      usdVal > 0 && fmt(usdVal, 'USD'),
      krwVal > 0 && fmt(krwVal, 'KRW'),
    ].filter(Boolean) as string[];
    return parts.length > 0 ? parts : ['-'];
  };

  const stats = [
    {
      label: '연간 예상 배당',
      values: formatValues(annualUSD, annualKRW, formatCurrency),
      sub: (() => {
        const parts = [
          annualUSD > 0 && `월 ${formatCurrency(annualUSD / 12, 'USD')}`,
          annualKRW > 0 && `월 ${formatCurrency(annualKRW / 12, 'KRW')}`,
        ].filter(Boolean);
        return parts.length > 0 ? parts.join(' · ') : '배당 데이터 없음';
      })(),
      accent: '#3182F6',
    },
    {
      label: '총 보유액',
      values: formatValues(totalValueUSD, totalValueKRW, formatCurrency),
      sub: '평균 단가 입력 종목 기준',
      accent: '#191F28',
    },
    {
      label: `${new Date().getFullYear()}년 수령 배당`,
      values: formatValues(ytdUSD, ytdKRW, formatCurrency),
      sub: '배당락일 기준',
      accent: '#00B493',
    },
    {
      label: '배당 수익률',
      values: (() => {
        const parts = [
          yieldUSD !== null && `${yieldUSD.toFixed(2)}%`,
          yieldKRW !== null && `${yieldKRW.toFixed(2)}%`,
        ].filter(Boolean) as string[];
        return parts.length > 0 ? parts : ['-'];
      })(),
      sub: '연 배당 / 총 보유액',
      accent: '#8B5CF6',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 mb-4">
      {stats.map(({ label, values, sub, accent }) => (
        <div key={label} className="bg-white rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-medium text-[#8B95A1] mb-2">{label}</p>
          {values.map((v, i) => (
            <p
              key={i}
              className="font-bold leading-tight truncate"
              style={{
                color: i === 0 && v !== '-' ? accent : '#8B95A1',
                fontSize: i === 0 ? '1.15rem' : '0.8rem',
                marginTop: i > 0 ? '2px' : 0,
              }}
            >
              {v}
            </p>
          ))}
          <p className="text-xs text-[#B0B8C1] mt-1.5 leading-tight">{sub}</p>
        </div>
      ))}
    </div>
  );
}
