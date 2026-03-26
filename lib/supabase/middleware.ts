import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

/**
 * 미들웨어에서 사용할 Supabase 클라이언트 생성
 * cookies()가 아닌 request/response 기반으로 동작
 */
export function createMiddlewareClient(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  return { supabase, response };
}

/**
 * 프리미엄 사용자 여부 확인
 */
export async function checkPremiumStatus(request: NextRequest): Promise<{
  isPremium: boolean;
  response: NextResponse;
}> {
  const { supabase, response } = createMiddlewareClient(request);

  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return { isPremium: false, response };
    }

    const { data } = await supabase
      .from('premium_users')
      .select('is_active, expires_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (data) {
      const isActive = data.is_active;
      const notExpired = !data.expires_at || new Date(data.expires_at) > new Date();
      return { isPremium: isActive && notExpired, response };
    }

    return { isPremium: false, response };
  } catch (error) {
    console.error('Premium check error in middleware:', error);
    return { isPremium: false, response };
  }
}
