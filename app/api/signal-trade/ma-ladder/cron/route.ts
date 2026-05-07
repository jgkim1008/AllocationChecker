/**
 * MA 계단식 자동매수 크론 — 매일 09:00 KST (00:00 UTC)
 *
 * GET /api/signal-trade/ma-ladder/cron
 * - 전날 미체결 지정가 주문 취소
 * - 최신 이동평균선 가격으로 신규 지정가 주문 등록
 */

import { NextRequest, NextResponse } from 'next/server';

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  // Vercel Cron 인증
  const authHeader = request.headers.get('authorization');
  if (process.env.NODE_ENV === 'production' && CRON_SECRET) {
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/signal-trade/ma-ladder/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CRON_SECRET ?? ''}`,
      },
    });

    const data = await res.json();
    return NextResponse.json({
      success: true,
      message: `MA 계단식 크론 완료 — ${data.processed ?? 0}개 처리`,
      data,
    });
  } catch (err) {
    console.error('MA Ladder cron error:', err);
    return NextResponse.json({ error: '크론 실행 오류' }, { status: 500 });
  }
}
