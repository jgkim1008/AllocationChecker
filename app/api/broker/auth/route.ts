/**
 * 브로커 인증 API
 *
 * POST: 브로커 연결 (API 키 등록 및 토큰 발급)
 * DELETE: 브로커 연결 해제
 * GET: 연결 상태 확인
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { createClient } from '@/lib/supabase/server';
import { saveBrokerCredentials, deleteBrokerCredentials, getConnectedBrokers, getConnectedCredentialIds } from '@/lib/broker/storage';
import { getBrokerClient, getBrokerClientByCredentialId, disconnectBroker, disconnectBrokerByCredentialId } from '@/lib/broker/session';
import { hashSessionToken } from '@/lib/crypto/encryption';
import type { BrokerType, KISCredentials, KiwoomCredentials } from '@/lib/broker/types';

const SESSION_COOKIE_NAME = 'broker_session';

// POST: 브로커 연결
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { credentialId, brokerType, credentials } = body as {
      credentialId?: string;
      brokerType?: BrokerType;
      credentials?: KISCredentials | KiwoomCredentials;
    };

    // credentialId 기반 연결 (저장된 계좌 직접 연결)
    if (credentialId) {
      const connectResult = await getBrokerClientByCredentialId(credentialId);
      if (!connectResult.success) {
        return NextResponse.json(
          { success: false, error: connectResult.error || '연결에 실패했습니다.' },
          { status: 400 }
        );
      }
      return NextResponse.json({
        success: true,
        message: '브로커 연결이 완료되었습니다.',
        data: { credentialId, connected: true },
      });
    }

    // 레거시: {brokerType, credentials} 기반 임시 연결
    if (!brokerType || !credentials) {
      return NextResponse.json(
        { success: false, error: '필수 파라미터가 누락되었습니다.' },
        { status: 400 }
      );
    }

    // 기존 연결 해제 (캐시된 토큰/클라이언트 클리어)
    await disconnectBroker(user.id, brokerType);

    // 새 자격증명 저장
    await saveBrokerCredentials(user.id, brokerType, credentials);

    // 새 연결 시도
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
      data: { brokerType, connected: true },
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
    const credentialId = searchParams.get('credentialId');
    const brokerType = searchParams.get('brokerType') as BrokerType | null;

    if (!credentialId && !brokerType) {
      return NextResponse.json(
        { success: false, error: 'credentialId 또는 brokerType이 필요합니다.' },
        { status: 400 }
      );
    }

    // credentialId 기반: 런타임 세션만 해제, 2FA/DB 유지
    if (credentialId) {
      await disconnectBrokerByCredentialId(credentialId);
      return NextResponse.json({ success: true, message: '연결이 해제되었습니다.' });
    }

    // 레거시 brokerType 기반: 메모리 + 2FA 세션 무효화
    await disconnectBroker(user.id, brokerType!);
    await deleteBrokerCredentials(user.id, brokerType!);

    // 2FA 세션 무효화
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (sessionToken) {
      const sessionTokenHash = hashSessionToken(sessionToken);
      await supabase
        .from('credential_access_sessions')
        .delete()
        .eq('user_id', user.id)
        .eq('session_token_hash', sessionTokenHash);
      cookieStore.delete(SESSION_COOKIE_NAME);
    }

    return NextResponse.json({ success: true, message: '브로커 연결이 해제되었습니다.' });
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
    if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: '서비스 준비 중입니다.' }, { status: 503 });
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

    const connectedCredentials = getConnectedCredentialIds(user.id);

    return NextResponse.json({
      success: true,
      data: {
        connectedBrokers: result.data || [],
        connectedCredentials,
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
