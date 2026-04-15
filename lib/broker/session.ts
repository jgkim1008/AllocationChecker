/**
 * 브로커 세션 관리
 *
 * 사용자별 브로커 클라이언트 인스턴스를 관리합니다.
 */

import type { IBroker } from './interface';
import type { BrokerType, KISCredentials, KiwoomCredentials, TokenInfo } from './types';
import { KISClient } from './kis';
import { KiwoomClient } from './kiwoom';
import { getBrokerCredentials, getBrokerCredentialsFromDB, getEnvKISCredentials, getCachedToken, cacheToken, clearCachedToken, clearAllBrokerCaches } from './storage';

// 브로커 인스턴스 캐시
const brokerCache = new Map<string, IBroker>();

// 수동 재연결 전까지 DB 자동 재연결 차단 (2FA 비활성화 후 등)
declare global { var _brokerBlockedUsers: Set<string> | undefined; }
const blockedUsers: Set<string> = global._brokerBlockedUsers ?? (global._brokerBlockedUsers = new Set());

/**
 * 캐시 키 생성
 */
function getCacheKey(userId: string, brokerType: BrokerType): string {
  return `${userId}:${brokerType}`;
}

/**
 * 브로커 클라이언트 가져오기 (연결된 상태)
 */
export async function getBrokerClient(
  userId: string,
  brokerType: BrokerType,
  options: { skipBlockCheck?: boolean } = {}
): Promise<{ success: boolean; client?: IBroker; error?: string }> {
  const cacheKey = getCacheKey(userId, brokerType);

  // 캐시된 인스턴스 확인
  let client = brokerCache.get(cacheKey);

  if (client && client.isConnected()) {
    return { success: true, client };
  }

  // 자격증명 조회: 메모리 캐시 → DB(암호화 저장) → .env.local 순으로 폴백
  const credResult = await getBrokerCredentials(userId, brokerType);
  let credentials = credResult.data;

  // 메모리에 없으면 DB에서 복호화하여 로드 (서버리스/크론 환경 대응)
  // 단, 수동 재연결 전까지 차단된 사용자는 DB 자동 재연결 금지 (크론은 예외)
  if (!credentials && (!blockedUsers.has(userId) || options.skipBlockCheck)) {
    const dbResult = await getBrokerCredentialsFromDB(userId, brokerType);
    if (dbResult.success && dbResult.data) {
      credentials = dbResult.data;
    }
  }

  if (!credentials && brokerType === 'kis') {
    const envCreds = getEnvKISCredentials();
    if (envCreds) {
      credentials = envCreds;
    }
  }

  if (!credentials) {
    return { success: false, error: '브로커 설정이 없습니다. 연결 탭에서 API 키를 입력하거나 .env.local에 KIS_APP_KEY를 설정하세요.' };
  }

  // 클라이언트 생성
  if (brokerType === 'kis') {
    client = new KISClient(credentials as KISCredentials);
  } else {
    client = new KiwoomClient(credentials as KiwoomCredentials);
  }

  // 캐시된 토큰 확인
  const cachedToken = getCachedToken(userId, brokerType);
  if (cachedToken) {
    if ('restoreToken' in client) {
      (client as any).restoreToken(cachedToken);
    }

    if (client.isConnected()) {
      brokerCache.set(cacheKey, client);
      return { success: true, client };
    }
  }

  // 새 토큰 발급
  const connectResult = await client.connect();
  if (!connectResult.success) {
    return { success: false, error: connectResult.error?.message || '연결 실패' };
  }

  // 토큰 캐시
  if (connectResult.data) {
    cacheToken(userId, brokerType, connectResult.data);
  }

  // 인스턴스 캐시
  brokerCache.set(cacheKey, client);
  // 연결 성공 시 차단 해제
  blockedUsers.delete(userId);

  return { success: true, client };
}

/**
 * 브로커 연결 해제
 */
export async function disconnectBroker(
  userId: string,
  brokerType: BrokerType
): Promise<void> {
  const cacheKey = getCacheKey(userId, brokerType);
  const client = brokerCache.get(cacheKey);

  if (client) {
    await client.disconnect();
    brokerCache.delete(cacheKey);
  }
  clearCachedToken(userId, brokerType);
}

/**
 * 사용자의 모든 브로커 연결 해제 + 재연결 차단
 * 수동으로 다시 연결하기 전까지 DB 자동 재연결 금지
 */
export async function disconnectAllBrokers(userId: string): Promise<void> {
  for (const [key, client] of brokerCache.entries()) {
    if (key.startsWith(`${userId}:`)) {
      await client.disconnect();
      brokerCache.delete(key);
    }
  }
  // 메모리 캐시(자격증명 + 토큰) 전체 초기화
  clearAllBrokerCaches(userId);
  // 수동 재연결 전까지 DB 자동 재연결 차단
  blockedUsers.add(userId);
}

/**
 * 브로커 연결 상태 확인
 */
export function isBrokerConnected(userId: string, brokerType: BrokerType): boolean {
  const cacheKey = getCacheKey(userId, brokerType);
  const client = brokerCache.get(cacheKey);
  return client?.isConnected() ?? false;
}
