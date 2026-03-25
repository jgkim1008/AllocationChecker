/**
 * 증권사 API 모듈
 *
 * 지원 증권사:
 * - 한국투자증권 (KIS)
 * - 키움증권 (Kiwoom)
 */

// 공통 타입
export * from './types';

// 공통 인터페이스
export * from './interface';

// 브로커 클라이언트
export { KISClient } from './kis';
export { KiwoomClient } from './kiwoom';

// 브로커 팩토리
import { KISClient } from './kis';
import { KiwoomClient } from './kiwoom';
import type { IBroker } from './interface';
import type { BrokerType, KISCredentials, KiwoomCredentials } from './types';

/**
 * 브로커 클라이언트 생성
 */
export function createBroker(
  type: 'kis',
  credentials: KISCredentials
): IBroker;
export function createBroker(
  type: 'kiwoom',
  credentials: KiwoomCredentials
): IBroker;
export function createBroker(
  type: BrokerType,
  credentials: KISCredentials | KiwoomCredentials
): IBroker {
  switch (type) {
    case 'kis':
      return new KISClient(credentials as KISCredentials);
    case 'kiwoom':
      return new KiwoomClient(credentials as KiwoomCredentials);
    default:
      throw new Error(`Unsupported broker type: ${type}`);
  }
}
