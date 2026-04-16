import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * 프리미엄 전용 API 경로 목록
 */
const PREMIUM_API_PATHS = [
  '/api/ai/chat',
  '/api/ai/compare',
  '/api/ai/dividend-picks',
  '/api/ai/report',
  '/api/ai/sentiment',
  '/api/ai/stock-picks',
];

function isPremiumApiPath(pathname: string): boolean {
  return PREMIUM_API_PATHS.some(path => pathname.startsWith(path));
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // ── 프리미엄 API 체크 (프로덕션만) ──
  if (isPremiumApiPath(pathname)) {
    // 로컬 개발 환경에서는 우회
    if (process.env.NODE_ENV === 'development') {
      return supabaseResponse;
    }

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'AUTH_REQUIRED' },
        { status: 401 }
      );
    }

    // 프리미엄 상태 확인
    const { data } = await supabase
      .from('premium_users')
      .select('is_active, expires_at')
      .eq('user_id', user.id)
      .maybeSingle();

    const isPremium = data?.is_active &&
      (!data.expires_at || new Date(data.expires_at) > new Date());

    if (!isPremium) {
      return NextResponse.json(
        {
          error: 'Premium subscription required',
          message: '이 기능은 프리미엄 구독자만 이용할 수 있습니다.',
          code: 'PREMIUM_REQUIRED'
        },
        { status: 403 }
      );
    }

    return supabaseResponse;
  }

  // ── 페이지 라우트 인증 체크 ──
  const isAuthPage = pathname === '/login' || pathname === '/signup';
  const isPublicApi = pathname.startsWith('/api/auth/kakao') ||
                      pathname.startsWith('/api/telegram-bot') ||
                      pathname.startsWith('/api/kakao-bot') ||
                      pathname.startsWith('/api/test/kakao') ||
                      pathname.startsWith('/api/fibonacci/scan') ||
                      pathname.startsWith('/api/auto-trade/cron') ||
                      pathname.startsWith('/api/auto-trade/check-fills') ||
                      pathname.startsWith('/api/auto-trade/morning-alert') ||
                      pathname.startsWith('/api/admin/');

  if (!user && !isAuthPage && !isPublicApi) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (user && isAuthPage) {
    return NextResponse.redirect(new URL('/portfolio', request.url));
  }

  return supabaseResponse;
}

export const config = {
  // 정적 파일 제외, 페이지 + 프리미엄 API 라우트에 적용
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
