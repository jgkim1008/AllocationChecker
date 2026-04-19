/**
 * 브로커 세션 관리
 *
 * 사용자별 브로커 클라이언트 인스턴스를 관리합니다.
 */

import type { IBroker } from './interface';
import type { BrokerType, KISCredentials, KiwoomCredentials, TokenInfo } from './types';
import { KISClient } from './kis';
import { KiwoomClient } from './kiwoom';
import {
  getBrokerCredentials, getBrokerCredentialsFromDB, getBrokerCredentialByIdFromDB,
  getEnvKISCredentials, getCachedToken, cacheToken, clearCachedToken, clearAllBrokerCaches,
  getCachedTokenById, cacheTokenById, clearCachedTokenById,
  markCredentialConnected, markCredentialDisconnected, getConnectedCredentialIds,
} from './storage';

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
 * 특정 credential ID로 브로커 클라이언트 가져오기
 * DCA 등 다중 계좌가 필요한 경우 사용
 */
export async function getBrokerClientByCredentialId(
  credentialId: string
): Promise<{ success: boolean; client?: IBroker; error?: string }> {
  // 캐시된 인스턴스 확인 (credentialId를 키로 사용)
  let client = brokerCache.get(credentialId);
  if (client && client.isConnected()) {
    return { success: true, client };
  }

  // 메모리 캐시에서 자격증명 조회
  const cachedCreds = (global._brokerCredentialsCache as Map<string, any> | undefined)?.get(credentialId);
  let credentials = cachedCreds;
  let brokerType: BrokerType | undefined;
  let userId: string | undefined;

  if (!credentials) {
    const dbResult = await getBrokerCredentialByIdFromDB(credentialId);
    if (!dbResult.success || !dbResult.data) {
      return { success: false, error: '자격증명을 찾을 수 없습니다.' };
    }
    credentials = dbResult.data.credentials;
    brokerType = dbResult.data.brokerType;
    userId = dbResult.data.userId;
  } else {
    // 메모리에서는 brokerType을 알 수 없으므로 DB에서 타입 정보만 조회
    const dbResult = await getBrokerCredentialByIdFromDB(credentialId);
    if (dbResult.success && dbResult.data) {
      brokerType = dbResult.data.brokerType;
      userId = dbResult.data.userId;
    }
  }

  if (!credentials || !brokerType) {
    return { success: false, error: '자격증명 정보가 불완전합니다.' };
  }

  // 클라이언트 생성
  if (brokerType === 'kis') {
    client = new KISClient(credentials as KISCredentials);
  } else {
    client = new KiwoomClient(credentials as KiwoomCredentials);
  }

  // 캐시된 토큰 확인 (credentialId 키 — 버그 수정: getCachedTokenById 사용)
  const cachedToken = getCachedTokenById(credentialId);
  if (cachedToken) {
    if ('restoreToken' in client) {
      (client as any).restoreToken(cachedToken);
    }
    if (client.isConnected()) {
      brokerCache.set(credentialId, client);
      if (userId) markCredentialConnected(credentialId, brokerType, userId);
      return { success: true, client };
    }
  }

  // 새 토큰 발급
  const connectResult = await client.connect();
  if (!connectResult.success) {
    return { success: false, error: connectResult.error?.message || '연결 실패' };
  }

  if (connectResult.data) {
    cacheTokenById(credentialId, connectResult.data);
  }

  brokerCache.set(credentialId, client);
  if (userId) markCredentialConnected(credentialId, brokerType, userId);
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
 * 특정 credentialId 브로커 연결 해제 (런타임 세션만 해제, DB/2FA 영향 없음)
 */
export async function disconnectBrokerByCredentialId(credentialId: string): Promise<void> {
  const client = brokerCache.get(credentialId);
  if (client) {
    await client.disconnect();
    brokerCache.delete(credentialId);
  }
  clearCachedTokenById(credentialId);
  markCredentialDisconnected(credentialId);
}

/**
 * 사용자의 모든 브로커 연결 해제 + 재연결 차단
 * 수동으로 다시 연결하기 전까지 DB 자동 재연결 금지
 */
export async function disconnectAllBrokers(userId: string): Promise<void> {
  // 레거시 userId:brokerType 키
  for (const [key, client] of brokerCache.entries()) {
    if (key.startsWith(`${userId}:`)) {
      await client.disconnect();
      brokerCache.delete(key);
    }
  }
  // credentialId 기반 연결도 해제
  for (const { credentialId } of getConnectedCredentialIds(userId)) {
    const client = brokerCache.get(credentialId);
    if (client) {
      await client.disconnect();
      brokerCache.delete(credentialId);
    }
  }
  // 메모리 캐시(자격증명 + 토큰 + 연결 상태) 전체 초기화
  clearAllBrokerCaches(userId);
  // 수동 재연결 전까지 DB 자동 재연결 차단
  blockedUsers.add(userId);
}

/**
 * 브로커 연결 상태 확인 (레거시 + credentialId 기반 모두 확인)
 */
export function isBrokerConnected(userId: string, brokerType: BrokerType): boolean {
  // 레거시 userId:brokerType 키
  const legacyClient = brokerCache.get(getCacheKey(userId, brokerType));
  if (legacyClient?.isConnected()) return true;
  // credentialId 기반 연결 확인
  return getConnectedCredentialIds(userId).some(c => c.brokerType === brokerType);
}
