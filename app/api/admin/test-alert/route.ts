import { NextRequest, NextResponse } from 'next/server';
import { sendMarketCloseAlert } from '@/lib/notifications/fibonacci-alert';

/**
 * GET /api/admin/test-alert?market=US|KR
 * 마감 알림을 즉시 테스트 발송
 */
export async function GET(request: NextRequest) {
  const market = (request.nextUrl.searchParams.get('market') ?? 'US') as 'US' | 'KR';

  try {
    await sendMarketCloseAlert(market);
    return NextResponse.json({ ok: true, message: `${market} 마감 알림 발송 완료` });
  } catch (error) {
    console.error('[TestAlert]', error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
