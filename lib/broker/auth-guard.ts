/**
 * 브로커 API 접근 인증 가드
 *
 * 2FA가 활성화된 사용자는 credential_access_session이 필요합니다.
 * 2FA가 없는 사용자는 통과합니다.
 */

import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { hashSessionToken, isSessionValid } from '@/lib/crypto/encryption';

const SESSION_COOKIE_NAME = 'broker_session';

/**
 * 브로커 접근 권한 확인
 * - 2FA 미설정 유저: 통과
 * - 2FA 설정 유저: 유효한 credential_access_session 필요
 */
export async function checkBrokerAccess(userId: string): Promise<{ allowed: boolean; error?: string }> {
  const supabase = await createClient();

  // 2FA 활성화 여부 확인
  const { data: totpData } = await supabase
    .from('user_totp_secrets')
    .select('is_verified')
    .eq('user_id', userId)
    .single();

  // 2FA 미설정 → 통과
  if (!totpData?.is_verified) {
    return { allowed: true };
  }

  // 2FA 설정됨 → 세션 쿠키 검증
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionToken) {
    return { allowed: false, error: '2FA 인증이 필요합니다.' };
  }

  const sessionTokenHash = hashSessionToken(sessionToken);
  const { data: session } = await supabase
    .from('credential_access_sessions')
    .select('expires_at')
    .eq('user_id', userId)
    .eq('session_token_hash', sessionTokenHash)
    .single();

  if (!session) {
    return { allowed: false, error: '인증 세션이 유효하지 않습니다. 다시 인증해주세요.' };
  }

  if (!isSessionValid(session.expires_at)) {
    return { allowed: false, error: '인증 세션이 만료되었습니다. 다시 인증해주세요.' };
  }

  return { allowed: true };
}
