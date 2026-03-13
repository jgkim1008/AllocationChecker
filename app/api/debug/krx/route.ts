import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol') ?? '000660';
  const mktId  = request.nextUrl.searchParams.get('mkt')    ?? 'STK';

  const d = new Date();
  // 오늘 포함 최근 3 영업일
  const dates: string[] = [];
  while (dates.length < 3) {
    if (d.getDay() !== 0 && d.getDay() !== 6) {
      dates.push(d.toISOString().slice(0, 10).replace(/-/g, ''));
    }
    d.setDate(d.getDate() - 1);
  }

  const results: Record<string, unknown>[] = [];

  for (const trdDd of dates) {
    try {
      const res = await fetch('https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Referer':  'https://data.krx.co.kr/',
          'Origin':   'https://data.krx.co.kr',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: new URLSearchParams({ bld: 'dbms/MDC/STAT/standard/MDCSTAT03501', mktId, trdDd }).toString(),
      });

      const text = await res.text();
      let parsed: unknown = null;
      try { parsed = JSON.parse(text); } catch { /* not json */ }

      const rows = (parsed as Record<string, unknown>)?.output as Record<string, string>[] | undefined;
      const matchedRow = rows?.find(r => r.ISU_SRT_CD === symbol) ?? null;

      results.push({
        trdDd,
        status: res.status,
        ok: res.ok,
        totalRows: rows?.length ?? 0,
        matchedRow,
        // 첫 번째 행 구조 확인용
        sampleRow: rows?.[0] ?? null,
        rawSnippet: text.slice(0, 300),
      });

      if (matchedRow) break; // 찾았으면 종료
    } catch (e) {
      results.push({ trdDd, error: String(e) });
    }
  }

  return NextResponse.json({ symbol, mktId, results });
}
