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
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code  = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.json({ error: `카카오 인증 실패: ${error}` }, { status: 400 });
  }
  if (!code) {
    return NextResponse.json({ error: 'code 파라미터가 없습니다.' }, { status: 400 });
  }

  const redirectUri = `${origin}/api/auth/kakao/callback`;
  const ok = await issueTokenFromCode(code, redirectUri);

  if (!ok) {
    return NextResponse.json({ error: '토큰 발급 실패. 서버 로그를 확인해주세요.' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: '카카오톡 알림이 활성화되었습니다. 피보나치 레벨 근접 시 자동으로 알림을 받게 됩니다.',
  });
}
