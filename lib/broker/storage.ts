/**
 * 브로커 인증 정보 저장/조회
 *
 * 보안 참고:
 * - 실제 운영 시에는 Supabase의 암호화된 컬럼이나 환경 변수를 사용해야 합니다.
 * - 현재는 개발 편의를 위해 메모리에 저장합니다.
 */

import { createServiceClient } from '../supabase/server';
import type { BrokerType, KISCredentials, KiwoomCredentials, TokenInfo } from './types';

// 메모리 캐시 (서버 재시작 시 초기화)
const tokenCache = new Map<string, TokenInfo>();

/**
 * 브로커 설정 저장
 */
export async function saveBrokerCredentials(
  userId: string,
  brokerType: BrokerType,
  credentials: KISCredentials | KiwoomCredentials
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createServiceClient();

    // broker_configs 테이블에 저장 (없으면 생성 필요)
    const { error } = await supabase
      .from('broker_configs')
      .upsert({
        user_id: userId,
        broker_type: brokerType,
        // 실제 운영에서는 암호화 필요
        credentials: JSON.stringify(credentials),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,broker_type',
      });

    if (error) {
      console.error('브로커 설정 저장 오류:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('브로커 설정 저장 실패:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류',
    };
  }
}

/**
 * 브로커 설정 조회
 */
export async function getBrokerCredentials(
  userId: string,
  brokerType: BrokerType
): Promise<{ success: boolean; data?: KISCredentials | KiwoomCredentials; error?: string }> {
  try {
    const supabase = await createServiceClient();

    const { data, error } = await supabase
      .from('broker_configs')
      .select('credentials')
      .eq('user_id', userId)
      .eq('broker_type', brokerType)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return { success: false, error: '브로커 설정이 없습니다.' };
      }
      return { success: false, error: error.message };
    }

    const credentials = JSON.parse(data.credentials);
    return { success: true, data: credentials };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류',
    };
  }
}

/**
 * 브로커 설정 삭제
 */
export async function deleteBrokerCredentials(
  userId: string,
  brokerType: BrokerType
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createServiceClient();

    const { error } = await supabase
      .from('broker_configs')
      .delete()
      .eq('user_id', userId)
      .eq('broker_type', brokerType);

    if (error) {
      return { success: false, error: error.message };
    }

    // 캐시 삭제
    tokenCache.delete(`${userId}:${brokerType}`);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류',
    };
  }
}

/**
 * 토큰 캐시 저장
 */
export function cacheToken(userId: string, brokerType: BrokerType, token: TokenInfo): void {
  tokenCache.set(`${userId}:${brokerType}`, token);
}

/**
 * 토큰 캐시 조회
 */
export function getCachedToken(userId: string, brokerType: BrokerType): TokenInfo | null {
  const token = tokenCache.get(`${userId}:${brokerType}`);
  if (!token) return null;

  // 만료 확인
  const now = new Date();
  const bufferTime = 5 * 60 * 1000; // 5분
  if (token.expiresAt.getTime() - now.getTime() < bufferTime) {
    tokenCache.delete(`${userId}:${brokerType}`);
    return null;
  }

  return token;
}

/**
 * 토큰 캐시 삭제
 */
export function clearCachedToken(userId: string, brokerType: BrokerType): void {
  tokenCache.delete(`${userId}:${brokerType}`);
}

/**
 * 연결된 브로커 목록 조회
 */
export async function getConnectedBrokers(
  userId: string
): Promise<{ success: boolean; data?: BrokerType[]; error?: string }> {
  try {
    const supabase = await createServiceClient();

    const { data, error } = await supabase
      .from('broker_configs')
      .select('broker_type')
      .eq('user_id', userId);

    if (error) {
      return { success: false, error: error.message };
    }

    const brokers = data.map((d: { broker_type: string }) => d.broker_type as BrokerType);
    return { success: true, data: brokers };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류',
    };
  }
}
