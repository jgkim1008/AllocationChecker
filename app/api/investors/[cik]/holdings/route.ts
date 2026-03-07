import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/auth-helper';
import { getLatest13FFiling, get13FHoldings } from '@/lib/api/sec-edgar';

const EDGAR_BASE = 'https://data.sec.gov';

function padCik(cik: string): string {
  return cik.replace(/^0+/, '').padStart(10, '0');
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ cik: string }> }
) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { cik } = await params;

    // 기관명 조회
    const paddedCik = padCik(cik);
    const submissionsUrl = `${EDGAR_BASE}/submissions/CIK${paddedCik}.json`;
    const subRes = await fetch(submissionsUrl, {
      next: { revalidate: 3600 },
      headers: { 'User-Agent': 'AllocationChecker/1.0 contact@allocationchecker.local' },
    });

    let institution = '';
    if (subRes.ok) {
      const subData = await subRes.json();
      institution = subData?.name ?? '';
    }

    // 최신 13F-HR 파일링 찾기
    const filing = await getLatest13FFiling(cik);
    if (!filing) {
      return NextResponse.json(
        { error: '13F-HR filing not found for this CIK' },
        { status: 404 }
      );
    }

    // 보유 종목 조회
    const holdings = await get13FHoldings(cik, filing.accession);

    // 총 시장가치 (달러 단위, 그대로 합산)
    const totalValue = holdings.reduce((sum, h) => sum + h.value, 0);

    return NextResponse.json({
      institution,
      filingDate: filing.date,
      totalValue,
      holdings,
    });
  } catch (error) {
    console.error('[investors/holdings GET]', error);
    return NextResponse.json({ error: 'Failed to fetch holdings' }, { status: 500 });
  }
}
