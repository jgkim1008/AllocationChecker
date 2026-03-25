/**
 * 브로커 인증 정보 저장/조회
 *
 * ⚠️  현재는 서버 메모리에만 저장합니다 (DB 저장 없음).
 *     서버 재시작 시 초기화되며, credentials는 어디에도 기록되지 않습니다.
 *
 * 로컬 개발 편의: .env.local에 KIS_APP_KEY / KIS_APP_SECRET /
 *   KIS_ACCOUNT_NUMBER / KIS_IS_VIRTUAL 이 모두 있으면 'dev-user:kis' 로 자동 등록합니다.
 */

import type { BrokerType, KISCredentials, KiwoomCredentials, TokenInfo } from './types';

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
    isVirtual: process.env.KIS_IS_VIRTUAL !== 'false',
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
