'use client';

import { useState, useCallback } from 'react';
import type { DividendCalendarEvent } from '@/types/dividend';
import { format } from 'date-fns';

export function useDividendCalendar() {
  const [events, setEvents] = useState<DividendCalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async (from: Date, to: Date) => {
    setLoading(true);
    setError(null);

    try {
      const fromStr = format(from, 'yyyy-MM-dd');
      const toStr = format(to, 'yyyy-MM-dd');
      const res = await fetch(`/api/dividends/calendar?from=${fromStr}&to=${toStr}`);

      if (!res.ok) throw new Error('Failed to fetch calendar events');

      const data: DividendCalendarEvent[] = await res.json();
      setEvents(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  return { events, loading, error, fetchEvents };
}
