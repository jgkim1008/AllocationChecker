/**
 * 브로커 자격증명 저장/조회/삭제 API
 * POST: 자격증명 암호화 저장
 * GET: 자격증명 조회 (세션 필요)
 * DELETE: 자격증명 삭제
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import {
  encryptCredentials,
  decryptCredentials,
  hashSessionToken,
  isSessionValid,
} from '@/lib/crypto/encryption';
import type { KISCredentials, KiwoomCredentials, BrokerType } from '@/lib/broker/types';

const SESSION_COOKIE_NAME = 'broker_session';

/**
 * 세션 유효성 검증
 */
async function validateSession(userId: string): Promise<{ valid: boolean; error?: string }> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionToken) {
    return { valid: false, error: '세션이 없습니다. 2FA 인증이 필요합니다.' };
  }

  const supabase = await createClient();
  const sessionTokenHash = hashSessionToken(sessionToken);

  const { data: session } = await supabase
    .from('credential_access_sessions')
    .select('expires_at')
    .eq('user_id', userId)
    .eq('session_token_hash', sessionTokenHash)
    .single();

  if (!session) {
    cookieStore.delete(SESSION_COOKIE_NAME);
    return { valid: false, error: '세션이 유효하지 않습니다. 다시 인증해주세요.' };
  }

  if (!isSessionValid(session.expires_at)) {
    cookieStore.delete(SESSION_COOKIE_NAME);
    return { valid: false, error: '세션이 만료되었습니다. 다시 인증해주세요.' };
  }

  return { valid: true };
}

/**
 * POST: 자격증명 암호화 저장
 * Body: { brokerType: "kis", credentials: {...} }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '인증이 필요합니다.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { brokerType, credentials, accountAlias } = body as {
      brokerType: BrokerType;
      credentials: KISCredentials | KiwoomCredentials;
      accountAlias?: string;
    };

    if (!brokerType || !credentials) {
      return NextResponse.json(
        { success: false, error: 'brokerType과 credentials가 필요합니다.' },
        { status: 400 }
      );
    }

    if (!['kis', 'kiwoom'].includes(brokerType)) {
      return NextResponse.json(
        { success: false, error: '지원하지 않는 증권사입니다.' },
        { status: 400 }
      );
    }

    const alias = accountAlias?.trim() || 'default';

    // 2FA 설정 확인 (저장 시에도 2FA 필요)
    const { data: totpData } = await supabase
      .from('user_totp_secrets')
      .select('is_verified')
      .eq('user_id', user.id)
      .single();

    if (!totpData?.is_verified) {
      return NextResponse.json({
        success: false,
        error: 'API Key를 저장하려면 먼저 2FA를 설정해야 합니다.',
        requiresTotpSetup: true,
      }, { status: 400 });
    }

    // 세션 유효성 검증
    const sessionCheck = await validateSession(user.id);
    if (!sessionCheck.valid) {
      return NextResponse.json({
        success: false,
        error: sessionCheck.error,
        requiresTotpVerify: true,
      }, { status: 401 });
    }

    // 자격증명 암호화
    const encryptedData = encryptCredentials(credentials);

    // DB에 저장 (upsert — user_id+broker_type+account_alias 기준)
    const { error: upsertError } = await supabase
      .from('broker_credentials')
      .upsert({
        user_id: user.id,
        broker_type: brokerType,
        account_alias: alias,
        encrypted_credentials: encryptedData.encrypted_credentials,
        encryption_iv: encryptedData.encryption_iv,
        encryption_tag: encryptedData.encryption_tag,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,broker_type,account_alias',
      });

    if (upsertError) {
      console.error('자격증명 저장 오류:', upsertError);
      return NextResponse.json(
        { success: false, error: '저장에 실패했습니다.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'API Key가 안전하게 저장되었습니다.',
    });
  } catch (error) {
    console.error('자격증명 저장 오류:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

/**
 * GET: 자격증명 조회 (세션 필요)
 * Query: ?brokerType=kis
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '인증이 필요합니다.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const brokerType = searchParams.get('brokerType') as BrokerType | null;

    // 특정 브로커 자격증명 복호화 조회 시에만 세션 필요
    if (brokerType) {
      const sessionCheck = await validateSession(user.id);
      if (!sessionCheck.valid) {
        return NextResponse.json({
          success: false,
          error: sessionCheck.error,
          requiresTotpVerify: true,
        }, { status: 401 });
      }
    }

    if (brokerType) {
      // 특정 브로커 자격증명 조회
      const { data: credData, error: credError } = await supabase
        .from('broker_credentials')
        .select('*')
        .eq('user_id', user.id)
        .eq('broker_type', brokerType)
        .single();

      if (credError || !credData) {
        return NextResponse.json({
          success: false,
          error: '저장된 API Key가 없습니다.',
        }, { status: 404 });
      }

      // 복호화
      const credentials = decryptCredentials<KISCredentials | KiwoomCredentials>(
        credData.encrypted_credentials,
        credData.encryption_iv,
        credData.encryption_tag
      );

      return NextResponse.json({
        success: true,
        data: {
          brokerType,
          credentials,
          updatedAt: credData.updated_at,
        },
      });
    } else {
      // 모든 저장된 브로커 목록 조회 (자격증명 내용은 제외 — 세션 불필요)
      const { data: credList } = await supabase
        .from('broker_credentials')
        .select('id, broker_type, account_alias, created_at, updated_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      return NextResponse.json({
        success: true,
        data: (credList || []).map(c => ({
          id: c.id,
          brokerType: c.broker_type,
          accountAlias: c.account_alias,
          savedAt: c.created_at,
          updatedAt: c.updated_at,
        })),
      });
    }
  } catch (error) {
    console.error('자격증명 조회 오류:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

/**
 * DELETE: 자격증명 삭제
 * Query: ?brokerType=kis
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '인증이 필요합니다.' },
        { status: 401 }
      );
    }

    // 세션 유효성 검증
    const sessionCheck = await validateSession(user.id);
    if (!sessionCheck.valid) {
      return NextResponse.json({
        success: false,
        error: sessionCheck.error,
        requiresTotpVerify: true,
      }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const credentialId = searchParams.get('credentialId');
    const brokerType = searchParams.get('brokerType') as BrokerType | null;

    if (!credentialId && !brokerType) {
      return NextResponse.json(
        { success: false, error: 'credentialId 또는 brokerType 파라미터가 필요합니다.' },
        { status: 400 }
      );
    }

    let deleteQuery = supabase.from('broker_credentials').delete().eq('user_id', user.id);
    if (credentialId) {
      deleteQuery = deleteQuery.eq('id', credentialId) as any;
    } else {
      deleteQuery = deleteQuery.eq('broker_type', brokerType!) as any;
    }

    const { error: deleteError } = await deleteQuery;

    if (deleteError) {
      console.error('자격증명 삭제 오류:', deleteError);
      return NextResponse.json(
        { success: false, error: '삭제에 실패했습니다.' },
        { status: 500 }
      );
    }

    // 브로커 연결 해제 시 2FA 세션도 무효화
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

    return NextResponse.json({
      success: true,
      message: 'API Key가 삭제되었습니다.',
    });
  } catch (error) {
    console.error('자격증명 삭제 오류:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
