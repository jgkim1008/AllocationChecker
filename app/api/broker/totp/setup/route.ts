/**
 * TOTP 2FA 설정 API
 * POST: 새 TOTP 시크릿 생성 + QR 코드 반환
 * PUT: 초기 인증 후 활성화
 * DELETE: 2FA 비활성화
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { encrypt, decrypt } from '@/lib/crypto/encryption';
import { generateTOTPSecret, generateQRCodeDataUrl, verifyTOTPToken } from '@/lib/crypto/totp';
import { disconnectAllBrokers } from '@/lib/broker/session';

/**
 * POST: 새 TOTP 시크릿 생성 및 QR 코드 반환
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '인증이 필요합니다.' },
        { status: 401 }
      );
    }

    // 이미 TOTP가 설정되어 있는지 확인
    const { data: existingTotp } = await supabase
      .from('user_totp_secrets')
      .select('id, is_verified')
      .eq('user_id', user.id)
      .single();

    if (existingTotp?.is_verified) {
      return NextResponse.json(
        { success: false, error: '이미 2FA가 설정되어 있습니다. 재설정하려면 먼저 비활성화하세요.' },
        { status: 400 }
      );
    }

    // 새 시크릿 생성
    const secret = generateTOTPSecret();
    const userEmail = user.email || user.id;
    const qrCodeDataUrl = await generateQRCodeDataUrl(secret, userEmail);

    // 암호화
    const { ciphertext, iv, tag } = encrypt(secret);

    // 기존 미인증 레코드가 있으면 업데이트, 없으면 삽입
    if (existingTotp) {
      await supabase
        .from('user_totp_secrets')
        .update({
          encrypted_secret: ciphertext,
          encryption_iv: iv,
          encryption_tag: tag,
          is_verified: false,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id);
    } else {
      await supabase
        .from('user_totp_secrets')
        .insert({
          user_id: user.id,
          encrypted_secret: ciphertext,
          encryption_iv: iv,
          encryption_tag: tag,
          is_verified: false,
        });
    }

    return NextResponse.json({
      success: true,
      data: {
        qrCodeDataUrl,
        // 수동 입력용 시크릿 (포맷팅)
        manualEntryKey: secret.match(/.{1,4}/g)?.join(' ') || secret,
      },
    });
  } catch (error) {
    console.error('TOTP 설정 오류:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

/**
 * PUT: 초기 TOTP 검증 및 활성화
 * Body: { token: "123456" }
 */
export async function PUT(request: NextRequest) {
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

    // 저장된 시크릿 조회
    const { data: totpData, error: totpError } = await supabase
      .from('user_totp_secrets')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (totpError || !totpData) {
      return NextResponse.json(
        { success: false, error: '2FA 설정을 먼저 시작해주세요.' },
        { status: 400 }
      );
    }

    if (totpData.is_verified) {
      return NextResponse.json(
        { success: false, error: '이미 2FA가 활성화되어 있습니다.' },
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

    // 활성화
    await supabase
      .from('user_totp_secrets')
      .update({
        is_verified: true,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    return NextResponse.json({
      success: true,
      message: '2FA가 활성화되었습니다.',
    });
  } catch (error) {
    console.error('TOTP 활성화 오류:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

/**
 * DELETE: 2FA 비활성화
 * Body: { token: "123456" } - 현재 TOTP 코드 필요
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

    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json(
        { success: false, error: '현재 2FA 코드를 입력해주세요.' },
        { status: 400 }
      );
    }

    // 저장된 시크릿 조회
    const { data: totpData, error: totpError } = await supabase
      .from('user_totp_secrets')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (totpError || !totpData) {
      return NextResponse.json(
        { success: false, error: '2FA가 설정되어 있지 않습니다.' },
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

    // 삭제
    await supabase
      .from('user_totp_secrets')
      .delete()
      .eq('user_id', user.id);

    // 관련 세션도 삭제
    await supabase
      .from('credential_access_sessions')
      .delete()
      .eq('user_id', user.id);

    // 2FA 비활성화 시 모든 브로커 연결 해제
    await disconnectAllBrokers(user.id);

    return NextResponse.json({
      success: true,
      message: '2FA가 비활성화되었습니다.',
    });
  } catch (error) {
    console.error('TOTP 비활성화 오류:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

/**
 * GET: 2FA 설정 상태 조회
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

    const { data: totpData } = await supabase
      .from('user_totp_secrets')
      .select('is_verified, created_at')
      .eq('user_id', user.id)
      .single();

    return NextResponse.json({
      success: true,
      data: {
        isEnabled: totpData?.is_verified ?? false,
        setupStarted: !!totpData && !totpData.is_verified,
        enabledAt: totpData?.is_verified ? totpData.created_at : null,
      },
    });
  } catch (error) {
    console.error('TOTP 상태 조회 오류:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
