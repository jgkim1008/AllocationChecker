/**
 * 브로커 잔고 조회 API
 *
 * GET: 잔고 조회
 */

import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { getBrokerClient, getBrokerClientByCredentialId } from '@/lib/broker/session';
import { checkBrokerAccess } from '@/lib/broker/auth-guard';
import type { BrokerType } from '@/lib/broker/types';
import { KISClient } from '@/lib/broker/kis';

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

    // 브로커 접근 권한 확인 (2FA 설정 시 세션 필요)
    const access = await checkBrokerAccess(user.id);
    if (!access.allowed) {
      return NextResponse.json({ success: false, error: access.error }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const credentialId = searchParams.get('credentialId');
    const brokerType = (searchParams.get('brokerType') || 'kis') as BrokerType;
    const includeOverseas = searchParams.get('includeOverseas') === 'true';

    const clientResult = credentialId
      ? await getBrokerClientByCredentialId(credentialId)
      : await getBrokerClient(user.id, brokerType);

    if (!clientResult.success || !clientResult.client) {
      return NextResponse.json(
        { success: false, error: clientResult.error || '브로커에 연결되지 않았습니다.' },
        { status: 400 }
      );
    }

    const client = clientResult.client;

    // KIS의 경우 통합 잔고 조회 가능
    const effectiveBrokerType = credentialId ? 'kis' : brokerType; // credentialId 기반은 KIS로 가정
    if ((effectiveBrokerType === 'kis' || brokerType === 'kis') && includeOverseas && client instanceof KISClient) {
      const fullBalanceResult = await client.getFullBalance();

      if (!fullBalanceResult.success) {
        return NextResponse.json(
          { success: false, error: fullBalanceResult.error?.message },
          { status: 400 }
        );
      }

      const fullData = fullBalanceResult.data!;
      console.log('[balance] domestic positions:', fullData.domestic.positions.length, fullData.domestic.positions.map(p => p.symbol));
      console.log('[balance] overseas positions:', fullData.overseas.positions.length, fullData.overseas.positions.map(p => p.symbol));
      return NextResponse.json({
        success: true,
        data: fullData,
      });
    }

    // 기본 잔고 조회
    const balanceResult = await client.getBalance();

    if (!balanceResult.success) {
      return NextResponse.json(
        { success: false, error: balanceResult.error?.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        balance: balanceResult.data,
      },
    });
  } catch (error) {
    console.error('잔고 조회 오류:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
