'use client';

import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

interface PriceData {
  date: string;
  price: number;
}

interface FibLevels {
  '0': number;
  '0.236': number;
  '0.382': number;
  '0.5': number;
  '0.618': number;
  '0.786': number;
  '0.886': number;
  '1': number;
}

interface FibonacciChartProps {
  history: PriceData[];
  fibLevels: FibLevels;
  yearHigh: number;
  yearLow: number;
  market: 'US' | 'KR';
}

const FIB_COLORS: Record<string, string> = {
  '0': '#ef4444',
  '0.236': '#f97316',
  '0.382': '#3b82f6',
  '0.5': '#8b5cf6',
  '0.618': '#22c55e',
  '0.786': '#14b8a6',
  '0.886': '#f59e0b',
  '1': '#22c55e',
};

const FIB_LABELS: Record<string, string> = {
  '0': '0% (저점)',
  '0.236': '23.6%',
  '0.382': '38.2%',
  '0.5': '50%',
  '0.618': '61.8% (황금비)',
  '0.786': '78.6%',
  '0.886': '88.6%',
  '1': '100% (고점)',
};

function formatPrice(price: number, market: 'US' | 'KR'): string {
  if (market === 'US') {
    return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `₩${price.toLocaleString('ko-KR')}`;
}

export function FibonacciChart({
  history,
  fibLevels,
  yearHigh,
  yearLow,
  market,
}: FibonacciChartProps) {
  const padding = (yearHigh - yearLow) * 0.05;
  const yMin = yearLow - padding;
  const yMax = yearHigh + padding;

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={400}>
        <ComposedChart data={history} margin={{ top: 20, right: 80, left: 20, bottom: 20 }}>
          <defs>
            <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />

          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: '#6b7280' }}
            tickFormatter={(date) => {
              const d = new Date(date);
              return `${d.getMonth() + 1}/${d.getDate()}`;
            }}
            interval="preserveStartEnd"
            minTickGap={50}
          />

          <YAxis
            domain={[yMin, yMax]}
            tick={{ fontSize: 11, fill: '#6b7280' }}
            tickFormatter={(v) => (market === 'US' ? `$${v.toFixed(0)}` : `${(v / 1000).toFixed(0)}K`)}
            width={60}
          />

          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null;
              const data = payload[0].payload as PriceData;
              return (
                <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
                  <p className="text-xs text-gray-500">{data.date}</p>
                  <p className="text-sm font-bold text-gray-900">
                    {formatPrice(data.price, market)}
                  </p>
                </div>
              );
            }}
          />

          {/* 피보나치 레벨 라인 */}
          {Object.entries(fibLevels).map(([level, price]) => (
            <ReferenceLine
              key={level}
              y={price}
              stroke={FIB_COLORS[level]}
              strokeDasharray={level === '0.618' ? '0' : '5 5'}
              strokeWidth={level === '0.618' ? 2 : 1}
              label={{
                value: `${FIB_LABELS[level]} ${formatPrice(price, market)}`,
                position: 'right',
                fill: FIB_COLORS[level],
                fontSize: 10,
              }}
            />
          ))}

          {/* 가격 영역 */}
          <Area
            type="monotone"
            dataKey="price"
            stroke="#8b5cf6"
            strokeWidth={2}
            fill="url(#priceGradient)"
          />

          {/* 가격 라인 */}
          <Line
            type="monotone"
            dataKey="price"
            stroke="#8b5cf6"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* 레벨 범례 */}
      <div className="mt-4 flex flex-wrap gap-3 justify-center">
        {['0.382', '0.5', '0.618', '0.886'].map((level) => (
          <div key={level} className="flex items-center gap-1.5">
            <div
              className="w-3 h-0.5"
              style={{ backgroundColor: FIB_COLORS[level] }}
            />
            <span className="text-xs text-gray-600">
              {FIB_LABELS[level]}: {formatPrice(fibLevels[level as keyof FibLevels], market)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
