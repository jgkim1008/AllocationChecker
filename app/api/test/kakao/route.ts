import { NextResponse } from 'next/server';
import { sendMarketCloseAlert } from '@/lib/notifications/fibonacci-alert';

/**
 * 카카오 알림 테스트 API
 * GET /api/test/kakao?market=US 또는 ?market=KR
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const market = searchParams.get('market') as 'US' | 'KR' | null;

  // 환경변수 체크
  const hasKakaoKey = !!process.env.KAKAO_REST_API_KEY;

  if (!hasKakaoKey) {
    return NextResponse.json({
      error: 'KAKAO_REST_API_KEY 환경변수가 설정되지 않았습니다.',
      hint: 'Vercel Dashboard → Settings → Environment Variables에서 설정하세요.',
    }, { status: 500 });
  }

  if (!market || !['US', 'KR'].includes(market)) {
    return NextResponse.json({
      error: 'market 파라미터가 필요합니다. (?market=US 또는 ?market=KR)',
      hasKakaoKey,
    }, { status: 400 });
  }

  try {
    await sendMarketCloseAlert(market);
    return NextResponse.json({
      success: true,
      message: `${market} 마감 알림 발송 완료!`,
      market,
    });
  } catch (error) {
    return NextResponse.json({
      error: '알림 발송 실패',
      details: String(error),
    }, { status: 500 });
  }
}
