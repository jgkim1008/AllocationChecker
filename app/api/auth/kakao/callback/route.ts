import { NextRequest, NextResponse } from 'next/server';
import { issueTokenFromCode } from '@/lib/notifications/kakao';

/**
 * 카카오 OAuth2 Callback
 * 최초 1회만 실행. 이후 토큰은 자동 갱신됨.
 *
 * 사용법:
 * 1. developers.kakao.com → 앱 생성 → REST API 키 확인
 * 2. .env.local에 KAKAO_REST_API_KEY, KAKAO_CLIENT_SECRET 저장
 * 3. 카카오 로그인 → Redirect URI 추가: {NEXT_PUBLIC_APP_URL}/api/auth/kakao/callback
 * 4. 브라우저에서 인증 URL 접속:
 *    https://kauth.kakao.com/oauth/authorize?client_id={REST_API_KEY}&redirect_uri={REDIRECT_URI}&response_type=code&scope=talk_message
 * 5. 인증 완료되면 자동으로 이 endpoint로 리다이렉트 → Supabase에 토큰 저장
 */
const REDIRECT_URI = 'https://allocation-checker-mu.vercel.app/api/auth/kakao/callback';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code  = searchParams.get('code');
  const error = searchParams.get('error');

  // 디버그: env var 확인
  const hasApiKey = !!process.env.KAKAO_REST_API_KEY;

  if (error) {
    return NextResponse.json({ step: 'kakao_error', error }, { status: 400 });
  }
  if (!code) {
    return NextResponse.json({ step: 'no_code', hasApiKey }, { status: 400 });
  }
  if (!hasApiKey) {
    return NextResponse.json({ step: 'no_api_key', message: 'KAKAO_REST_API_KEY 환경변수가 없습니다.' }, { status: 500 });
  }

  let ok = false;
  let errorDetail = '';
  try {
    ok = await issueTokenFromCode(code, REDIRECT_URI);
  } catch (e) {
    errorDetail = String(e);
  }

  if (!ok) {
    return NextResponse.json({ step: 'token_issue_failed', error: errorDetail, redirectUri: REDIRECT_URI }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: '카카오톡 알림 활성화 완료!',
  });
}
