'use client';

interface ChartInfoProps {
  symbol: string;
  market: 'US' | 'KR';
}

export function ChartInfo({ symbol, market }: ChartInfoProps) {
  return (
    <div className="w-64 bg-gray-900 border-r border-gray-800"></div>
  );
}
