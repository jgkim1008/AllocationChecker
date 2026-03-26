'use client';

import { Badge } from '@/components/ui/badge';
import type { DividendCalendarEvent } from '@/types/dividend';
import { formatCurrency } from '@/lib/utils/dividend-calculator';

interface Props {
  event: DividendCalendarEvent | null;
  onClose: () => void;
}

export function DividendEventPopover({ event, onClose }: Props) {
  if (!event) return null;

  const { extendedProps } = event;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{extendedProps.symbol}</h3>
          <Badge variant={extendedProps.market === 'US' ? 'default' : 'secondary'}>
            {extendedProps.market}
          </Badge>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">배당금 (세전)</span>
            <span className="font-medium">
              {formatCurrency(extendedProps.dividendAmount, extendedProps.currency)}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-500">배당락일</span>
            <span>{event.date}</span>
          </div>

          {extendedProps.paymentDate && (
            <div className="flex justify-between">
              <span className="text-gray-500">지급일</span>
              <span>{extendedProps.paymentDate}</span>
            </div>
          )}

          {extendedProps.frequency && (
            <div className="flex justify-between">
              <span className="text-gray-500">지급 주기</span>
              <span className="capitalize">{extendedProps.frequency}</span>
            </div>
          )}

          <div className="flex justify-between">
            <span className="text-gray-500">데이터 출처</span>
            <span className="uppercase">{extendedProps.source}</span>
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full text-sm text-gray-500 hover:text-gray-700"
        >
          닫기
        </button>
      </div>
    </div>
  );
}
