import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getSessionUser } from '@/lib/supabase/auth-helper';
import { scrapeFintAI, getMillisecondsUntilNextMonth } from '@/lib/api/fint';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CACHE_KEY = 'fint-ai-portfolios';

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const refresh = request.nextUrl.searchParams.get('refresh') === 'true';
    const supabase = await createServiceClient();

    // 캐시 확인 (refresh=true가 아닌 경우)
    if (!refresh) {
      const { data: cached, error: cacheError } = await supabase
        .from('ai_reports')
        .select('content, generated_at')
        .eq('symbol', CACHE_KEY)
        .eq('report_type', 'robo_advisor')
        .gt('expires_at', new Date().toISOString())
        .order('generated_at', { ascending: false })
        .limit(1);

      if (cacheError) {
        console.error('[robo-advisor] Cache lookup error:', cacheError);
      }

      if (cached?.[0]?.content) {
        return NextResponse.json({
          ...cached[0].content,
          cached: true,
          generatedAt: cached[0].generated_at,
        });
      }
    }

    // Vercel에서는 Puppeteer가 작동하지 않음
    if (process.env.VERCEL) {
      // 만료된 캐시라도 있으면 반환
      const { data: anyCache } = await supabase
        .from('ai_reports')
        .select('content, generated_at')
        .eq('symbol', CACHE_KEY)
        .eq('report_type', 'robo_advisor')
        .order('generated_at', { ascending: false })
        .limit(1);

      if (anyCache?.[0]?.content) {
        return NextResponse.json({
          ...anyCache[0].content,
          cached: true,
          expired: true,
          generatedAt: anyCache[0].generated_at,
        });
      }

      return NextResponse.json(
        { error: '캐시된 데이터가 없습니다. 로컬에서 새로고침 후 다시 시도해주세요.' },
        { status: 503 }
      );
    }

    // 크롤링 실행 (로컬에서만)
    const portfolios = await scrapeFintAI();
    const payload = { portfolios, source: 'fint.co.kr' };

    // 캐시 저장 (다음 달 1일까지 유효)
    const cacheTTL = getMillisecondsUntilNextMonth();
    try {
      await supabase.from('ai_reports').delete()
        .eq('symbol', CACHE_KEY)
        .eq('report_type', 'robo_advisor');
      await supabase.from('ai_reports').insert({
        symbol: CACHE_KEY,
        report_type: 'robo_advisor',
        content: payload,
        expires_at: new Date(Date.now() + cacheTTL).toISOString(),
      });
    } catch { /* 캐시 저장 실패 무시 */ }

    return NextResponse.json({
      ...payload,
      cached: false,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[robo-advisor] Error:', err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: '로보어드바이저 데이터 조회 실패', details: errorMessage },
      { status: 500 }
    );
  }
}
