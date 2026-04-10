/**
 * 브로커 인증 정보 저장/조회
 *
 * - 메모리 캐시: 서버 런타임 중 빠른 접근 (핫리로드 시에도 유지)
 * - DB 저장: AES-256-GCM 암호화하여 Supabase에 영구 저장 (TOTP 2FA 필요)
 *
 * 로컬 개발 편의: .env.local에 KIS_APP_KEY / KIS_APP_SECRET /
 *   KIS_ACCOUNT_NUMBER 이 모두 있으면 'dev-user:kis' 로 자동 등록합니다.
 */

import type { BrokerType, KISCredentials, KiwoomCredentials, TokenInfo } from './types';
import { createClient } from '@/lib/supabase/server';
import { encryptCredentials, decryptCredentials } from '@/lib/crypto/encryption';

// global에 저장 → Next.js 핫리로드 후에도 유지 (서버 재시작 시엔 초기화)
declare global {
  // eslint-disable-next-line no-var
  var _brokerCredentialsCache: Map<string, KISCredentials | KiwoomCredentials> | undefined;
  // eslint-disable-next-line no-var
  var _brokerTokenCache: Map<string, TokenInfo> | undefined;
}

const credentialsCache: Map<string, KISCredentials | KiwoomCredentials> =
  global._brokerCredentialsCache ?? (global._brokerCredentialsCache = new Map());
const tokenCache: Map<string, TokenInfo> =
  global._brokerTokenCache ?? (global._brokerTokenCache = new Map());

function cacheKey(userId: string, brokerType: BrokerType) {
  return `${userId}:${brokerType}`;
}

/**
 * .env.local에 KIS 키가 있으면 KISCredentials 반환 (없으면 null)
 */
export function getEnvKISCredentials(): KISCredentials | null {
  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  const accountNumber = process.env.KIS_ACCOUNT_NUMBER;
  if (!appKey || !appSecret || !accountNumber) return null;
  return {
    appKey,
    appSecret,
    accountNumber,
  };
}

/**
 * 브로커 설정 저장 (메모리만)
 */
export async function saveBrokerCredentials(
  userId: string,
  brokerType: BrokerType,
  credentials: KISCredentials | KiwoomCredentials
): Promise<{ success: boolean; error?: string }> {
  credentialsCache.set(cacheKey(userId, brokerType), credentials);
  return { success: true };
}

/**
 * 브로커 설정 조회 (메모리만)
 */
export async function getBrokerCredentials(
  userId: string,
  brokerType: BrokerType
): Promise<{ success: boolean; data?: KISCredentials | KiwoomCredentials; error?: string }> {
  const data = credentialsCache.get(cacheKey(userId, brokerType));
  if (!data) return { success: false, error: '브로커 설정이 없습니다.' };
  return { success: true, data };
}

/**
 * 브로커 설정 삭제 (메모리만)
 */
export async function deleteBrokerCredentials(
  userId: string,
  brokerType: BrokerType
): Promise<{ success: boolean; error?: string }> {
  credentialsCache.delete(cacheKey(userId, brokerType));
  tokenCache.delete(cacheKey(userId, brokerType));
  return { success: true };
}

/**
 * 연결된 브로커 목록 조회 (메모리만)
 */
export async function getConnectedBrokers(
  userId: string
): Promise<{ success: boolean; data?: BrokerType[]; error?: string }> {
  const brokers: BrokerType[] = [];
  for (const key of credentialsCache.keys()) {
    if (key.startsWith(`${userId}:`)) {
      brokers.push(key.split(':')[1] as BrokerType);
    }
  }
  return { success: true, data: brokers };
}

/**
 * 토큰 캐시 저장
 */
export function cacheToken(userId: string, brokerType: BrokerType, token: TokenInfo): void {
  tokenCache.set(cacheKey(userId, brokerType), token);
}

/**
 * 토큰 캐시 조회
 */
export function getCachedToken(userId: string, brokerType: BrokerType): TokenInfo | null {
  const token = tokenCache.get(cacheKey(userId, brokerType));
  if (!token) return null;

  const bufferTime = 5 * 60 * 1000;
  if (token.expiresAt.getTime() - Date.now() < bufferTime) {
    tokenCache.delete(cacheKey(userId, brokerType));
    return null;
  }

  return token;
}

/**
 * 토큰 캐시 삭제
 */
export function clearCachedToken(userId: string, brokerType: BrokerType): void {
  tokenCache.delete(cacheKey(userId, brokerType));
}

// ============================================================
// DB 저장 함수 (암호화 + TOTP 인증 필요)
// ============================================================

/**
 * 브로커 자격증명을 DB에 암호화하여 저장
 * 주의: TOTP 세션 검증은 API 레이어에서 수행
 */
export async function saveBrokerCredentialsToDB(
  userId: string,
  brokerType: BrokerType,
  credentials: KISCredentials | KiwoomCredentials
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const encryptedData = encryptCredentials(credentials);

    const { error } = await supabase
      .from('broker_credentials')
      .upsert({
        user_id: userId,
        broker_type: brokerType,
        encrypted_credentials: encryptedData.encrypted_credentials,
        encryption_iv: encryptedData.encryption_iv,
        encryption_tag: encryptedData.encryption_tag,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,broker_type',
      });

    if (error) {
      console.error('DB 저장 오류:', error);
      return { success: false, error: '자격증명 저장에 실패했습니다.' };
    }

    // 메모리 캐시에도 저장
    credentialsCache.set(cacheKey(userId, brokerType), credentials);

    return { success: true };
  } catch (error) {
    console.error('자격증명 DB 저장 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

/**
 * DB에서 브로커 자격증명 조회 및 복호화
 * 주의: TOTP 세션 검증은 API 레이어에서 수행
 */
export async function getBrokerCredentialsFromDB(
  userId: string,
  brokerType: BrokerType
): Promise<{ success: boolean; data?: KISCredentials | KiwoomCredentials; error?: string }> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('broker_credentials')
      .select('*')
      .eq('user_id', userId)
      .eq('broker_type', brokerType)
      .single();

    if (error || !data) {
      return { success: false, error: '저장된 자격증명이 없습니다.' };
    }

    const credentials = decryptCredentials<KISCredentials | KiwoomCredentials>(
      data.encrypted_credentials,
      data.encryption_iv,
      data.encryption_tag
    );

    // 메모리 캐시에도 저장
    credentialsCache.set(cacheKey(userId, brokerType), credentials);

    return { success: true, data: credentials };
  } catch (error) {
    console.error('자격증명 DB 조회 오류:', error);
    return { success: false, error: '복호화에 실패했습니다.' };
  }
}

/**
 * DB에서 브로커 자격증명 삭제
 */
export async function deleteBrokerCredentialsFromDB(
  userId: string,
  brokerType: BrokerType
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    const { error } = await supabase
      .from('broker_credentials')
      .delete()
      .eq('user_id', userId)
      .eq('broker_type', brokerType);

    if (error) {
      console.error('DB 삭제 오류:', error);
      return { success: false, error: '삭제에 실패했습니다.' };
    }

    // 메모리 캐시에서도 삭제
    credentialsCache.delete(cacheKey(userId, brokerType));
    tokenCache.delete(cacheKey(userId, brokerType));

    return { success: true };
  } catch (error) {
    console.error('자격증명 DB 삭제 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

/**
 * DB에 저장된 브로커 목록 조회 (자격증명 내용 제외)
 */
export async function getSavedBrokersFromDB(
  userId: string
): Promise<{ success: boolean; data?: { brokerType: BrokerType; savedAt: string }[]; error?: string }> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('broker_credentials')
      .select('broker_type, created_at')
      .eq('user_id', userId);

    if (error) {
      console.error('DB 조회 오류:', error);
      return { success: false, error: '조회에 실패했습니다.' };
    }

    return {
      success: true,
      data: (data || []).map(row => ({
        brokerType: row.broker_type as BrokerType,
        savedAt: row.created_at,
      })),
    };
  } catch (error) {
    console.error('저장된 브로커 목록 조회 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}
