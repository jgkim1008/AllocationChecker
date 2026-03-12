import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDailyHistory } from '@/lib/api/yahoo';
import { calculateInverseAlignment } from '@/lib/utils/inverse-alignment-calculator';
import type { FibonacciReportRow } from '@/types/fibonacci';
import type { InverseAlignmentStock } from '@/types/strategies';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // 1. 피보나치 데이터에서 분석 대상 20개만 선별 (속도를 위해 개수 조절)
    const { data: fibData } = await supabase
      .from('fibonacci_reports')
      .select('*')
      .order('report_date', { ascending: false })
      .limit(1);

    if (!fibData || fibData.length === 0) return NextResponse.json({ stocks: [] });

    const row = fibData[0] as FibonacciReportRow;
    const targetStocks = [
      ...(row.us_data || []).slice(0, 12).map(s => ({ ...s, market: 'US' as const })),
      ...(row.kr_data || []).slice(0, 12).map(s => ({ ...s, market: 'KR' as const })),
    ];

    // 2. 병렬 분석 진행
    const results = await Promise.all(
      targetStocks.map(async (stock) => {
        try {
          const history = await getDailyHistory(stock.symbol, stock.market);
          if (!history || history.length < 100) return null;

          const analysis = calculateInverseAlignment(history, history[0].price, history[0].volume);
          return {
            symbol: stock.symbol,
            name: stock.name,
            market: stock.market,
            ...analysis
          } as InverseAlignmentStock;
        } catch { return null; }
      })
    );

    const validResults = results
      .filter((r): r is InverseAlignmentStock => r !== null)
      .sort((a, b) => b.syncRate - a.syncRate);

    return NextResponse.json({ stocks: validResults });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to scan' }, { status: 500 });
  }
}
