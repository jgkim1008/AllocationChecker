/**
 * 브로커 인증 API
 *
 * POST: 브로커 연결 (API 키 등록 및 토큰 발급)
 * DELETE: 브로커 연결 해제
 * GET: 연결 상태 확인
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { saveBrokerCredentials, deleteBrokerCredentials, getConnectedBrokers } from '@/lib/broker/storage';
import { getBrokerClient, disconnectBroker } from '@/lib/broker/session';
import type { BrokerType, KISCredentials, KiwoomCredentials } from '@/lib/broker/types';

// POST: 브로커 연결
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { brokerType, credentials } = body as {
      brokerType: BrokerType;
      credentials: KISCredentials | KiwoomCredentials;
    };

    if (!brokerType || !credentials) {
      return NextResponse.json(
        { success: false, error: '필수 파라미터가 누락되었습니다.' },
        { status: 400 }
      );
    }

    // 자격증명 검증 (실제 연결 시도)
    const clientResult = await getBrokerClient(user.id, brokerType);

    // 먼저 저장 (연결 실패해도 저장은 해둠)
    await saveBrokerCredentials(user.id, brokerType, credentials);

    // 다시 연결 시도
    const retryResult = await getBrokerClient(user.id, brokerType);

    if (!retryResult.success) {
      return NextResponse.json(
        { success: false, error: retryResult.error || '연결에 실패했습니다.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '브로커 연결이 완료되었습니다.',
      data: {
        brokerType,
        connected: true,
      },
    });
  } catch (error) {
    console.error('브로커 연결 오류:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// DELETE: 브로커 연결 해제
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const brokerType = searchParams.get('brokerType') as BrokerType;

    if (!brokerType) {
      return NextResponse.json(
        { success: false, error: 'brokerType이 필요합니다.' },
        { status: 400 }
      );
    }

    // 연결 해제
    await disconnectBroker(user.id, brokerType);

    // 설정 삭제
    await deleteBrokerCredentials(user.id, brokerType);

    return NextResponse.json({
      success: true,
      message: '브로커 연결이 해제되었습니다.',
    });
  } catch (error) {
    console.error('브로커 연결 해제 오류:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// GET: 연결 상태 확인
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const result = await getConnectedBrokers(user.id);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        connectedBrokers: result.data || [],
      },
    });
  } catch (error) {
    console.error('연결 상태 확인 오류:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
