/**
 * 브로커 시세 조회 API
 *
 * GET: 현재가 조회
 */

import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { getBrokerClient } from '@/lib/broker/session';
import type { BrokerType } from '@/lib/broker/types';

export async function GET(request: NextRequest) {
  try {
    if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: '서비스 준비 중입니다.' }, { status: 503 });
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const brokerType = (searchParams.get('brokerType') || 'kis') as BrokerType;
    const symbol = searchParams.get('symbol');

    if (!symbol) {
      return NextResponse.json(
        { success: false, error: 'symbol이 필요합니다.' },
        { status: 400 }
      );
    }

    // 브로커 클라이언트 가져오기
    const clientResult = await getBrokerClient(user.id, brokerType);

    if (!clientResult.success || !clientResult.client) {
      return NextResponse.json(
        { success: false, error: clientResult.error || '브로커에 연결되지 않았습니다.' },
        { status: 400 }
      );
    }

    // 시세 조회
    const quoteResult = await clientResult.client.getQuote(symbol);

    if (!quoteResult.success) {
      return NextResponse.json(
        { success: false, error: quoteResult.error?.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        quote: quoteResult.data,
      },
    });
  } catch (error) {
    console.error('시세 조회 오류:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
