/**
 * TOTP 인증 및 세션 생성 API
 * POST: TOTP 검증 → 2시간 세션 생성
 * GET: 현재 세션 상태 확인
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/crypto/encryption';
import {
  generateSessionToken,
  hashSessionToken,
  getSessionExpiry,
  isSessionValid,
} from '@/lib/crypto/encryption';
import { verifyTOTPToken } from '@/lib/crypto/totp';

const SESSION_COOKIE_NAME = 'broker_session';
const SESSION_COOKIE_MAX_AGE = 2 * 60 * 60; // 2시간 (초)

/**
 * POST: TOTP 검증 및 세션 생성
 * Body: { token: "123456" }
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
    const { token } = body;

    if (!token) {
      return NextResponse.json(
        { success: false, error: '인증 코드를 입력해주세요.' },
        { status: 400 }
      );
    }

    // 저장된 TOTP 시크릿 조회
    const { data: totpData, error: totpError } = await supabase
      .from('user_totp_secrets')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_verified', true)
      .single();

    if (totpError || !totpData) {
      return NextResponse.json(
        { success: false, error: '2FA가 설정되어 있지 않습니다. 먼저 2FA를 설정해주세요.' },
        { status: 400 }
      );
    }

    // 시크릿 복호화
    const secret = decrypt(
      totpData.encrypted_secret,
      totpData.encryption_iv,
      totpData.encryption_tag
    );

    // TOTP 검증
    if (!verifyTOTPToken(secret, token)) {
      return NextResponse.json(
        { success: false, error: '인증 코드가 올바르지 않습니다.' },
        { status: 400 }
      );
    }

    // 세션 토큰 생성
    const sessionToken = generateSessionToken();
    const sessionTokenHash = hashSessionToken(sessionToken);
    const expiresAt = getSessionExpiry();

    // 기존 세션 삭제 후 새 세션 생성 (upsert)
    await supabase
      .from('credential_access_sessions')
      .upsert({
        user_id: user.id,
        session_token_hash: sessionTokenHash,
        expires_at: expiresAt.toISOString(),
        created_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      });

    // 쿠키 설정
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: SESSION_COOKIE_MAX_AGE,
      path: '/',
    });

    return NextResponse.json({
      success: true,
      message: '인증되었습니다. 2시간 동안 API Key에 접근할 수 있습니다.',
      data: {
        expiresAt: expiresAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('TOTP 인증 오류:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

/**
 * GET: 현재 세션 상태 확인
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '인증이 필요합니다.' },
        { status: 401 }
      );
    }

    // 쿠키에서 세션 토큰 확인
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (!sessionToken) {
      return NextResponse.json({
        success: true,
        data: {
          hasValidSession: false,
          reason: 'no_session',
        },
      });
    }

    // DB에서 세션 확인
    const sessionTokenHash = hashSessionToken(sessionToken);
    const { data: session } = await supabase
      .from('credential_access_sessions')
      .select('expires_at')
      .eq('user_id', user.id)
      .eq('session_token_hash', sessionTokenHash)
      .single();

    if (!session) {
      // 쿠키는 있지만 DB에 없음 → 쿠키 삭제
      cookieStore.delete(SESSION_COOKIE_NAME);
      return NextResponse.json({
        success: true,
        data: {
          hasValidSession: false,
          reason: 'session_not_found',
        },
      });
    }

    if (!isSessionValid(session.expires_at)) {
      // 만료됨 → 쿠키 삭제
      cookieStore.delete(SESSION_COOKIE_NAME);
      return NextResponse.json({
        success: true,
        data: {
          hasValidSession: false,
          reason: 'session_expired',
        },
      });
    }

    // 유효한 세션
    const expiresAt = new Date(session.expires_at);
    const remainingMs = expiresAt.getTime() - Date.now();
    const remainingMinutes = Math.floor(remainingMs / 60000);

    return NextResponse.json({
      success: true,
      data: {
        hasValidSession: true,
        expiresAt: session.expires_at,
        remainingMinutes,
      },
    });
  } catch (error) {
    console.error('세션 상태 조회 오류:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

/**
 * DELETE: 세션 종료 (로그아웃)
 */
export async function DELETE() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '인증이 필요합니다.' },
        { status: 401 }
      );
    }

    // DB에서 세션 삭제
    await supabase
      .from('credential_access_sessions')
      .delete()
      .eq('user_id', user.id);

    // 쿠키 삭제
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE_NAME);

    return NextResponse.json({
      success: true,
      message: '세션이 종료되었습니다.',
    });
  } catch (error) {
    console.error('세션 종료 오류:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
