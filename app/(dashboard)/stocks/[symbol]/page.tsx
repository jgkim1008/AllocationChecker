import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { detectMarket } from '@/lib/utils/market';
import { getDividendHistory } from '@/lib/api/dividend-router';
import { formatCurrency } from '@/lib/utils/dividend-calculator';

interface Props {
  params: Promise<{ symbol: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { symbol } = await params;
  return { title: `${symbol.toUpperCase()} 배당 내역 | AllocationChecker` };
}

export default async function StockDetailPage({ params }: Props) {
  const { symbol } = await params;
  const market = detectMarket(symbol);
  const dividends = await getDividendHistory(symbol).catch(() => []);

  if (!dividends) notFound();

  const latest = dividends[0];

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">{symbol.toUpperCase()}</h1>
        <Badge variant={market === 'US' ? 'default' : 'secondary'}>{market}</Badge>
      </div>

      {latest && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-500">최근 배당금</p>
            <p className="text-xl font-bold mt-1">
              {formatCurrency(latest.dividendAmount, latest.currency)}
            </p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-500">배당락일</p>
            <p className="text-xl font-bold mt-1">{latest.exDividendDate}</p>
          </div>
          {latest.paymentDate && (
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500">지급일</p>
              <p className="text-xl font-bold mt-1">{latest.paymentDate}</p>
            </div>
          )}
          {latest.frequency && (
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500">지급 주기</p>
              <p className="text-xl font-bold mt-1 capitalize">{latest.frequency}</p>
            </div>
          )}
        </div>
      )}

      <h2 className="text-lg font-semibold mb-3">배당 내역</h2>
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-3 font-medium">배당락일</th>
              <th className="text-left p-3 font-medium">지급일</th>
              <th className="text-right p-3 font-medium">배당금</th>
            </tr>
          </thead>
          <tbody>
            {dividends.slice(0, 20).map((d, i) => (
              <tr key={i} className="border-t">
                <td className="p-3">{d.exDividendDate}</td>
                <td className="p-3 text-gray-500">{d.paymentDate ?? '-'}</td>
                <td className="p-3 text-right font-medium">
                  {formatCurrency(d.dividendAmount, d.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
