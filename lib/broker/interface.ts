/**
 * 증권사 API 공통 인터페이스
 *
 * 모든 증권사 클라이언트는 이 인터페이스를 구현합니다.
 */

import type {
  Balance,
  Position,
  OrderRequest,
  Order,
  Quote,
  BrokerResponse,
  BrokerType,
  TokenInfo,
} from './types';

export interface IBroker {
  /**
   * 브로커 타입
   */
  readonly type: BrokerType;

  /**
   * 연결 상태 확인
   */
  isConnected(): boolean;

  /**
   * API 연결 (토큰 발급)
   */
  connect(): Promise<BrokerResponse<TokenInfo>>;

  /**
   * 연결 해제
   */
  disconnect(): Promise<void>;

  /**
   * 토큰 갱신
   */
  refreshToken(): Promise<BrokerResponse<TokenInfo>>;

  /**
   * 잔고 조회
   */
  getBalance(): Promise<BrokerResponse<Balance>>;

  /**
   * 보유 종목 조회
   */
  getPositions(): Promise<BrokerResponse<Position[]>>;

  /**
   * 현재가 조회
   */
  getQuote(symbol: string): Promise<BrokerResponse<Quote>>;

  /**
   * 주문 생성 (실행 대기)
   */
  createOrder(request: OrderRequest): Promise<BrokerResponse<Order>>;

  /**
   * 주문 실행
   */
  executeOrder(orderId: string): Promise<BrokerResponse<Order>>;

  /**
   * 주문 취소
   */
  cancelOrder(orderId: string, hint?: { symbol: string; quantity: number; market: 'domestic' | 'overseas'; exchange?: string }): Promise<BrokerResponse<void>>;

  /**
   * 주문 조회
   */
  getOrder(orderId: string): Promise<BrokerResponse<Order>>;

  /**
   * 당일 주문 내역 조회
   */
  getOrders(): Promise<BrokerResponse<Order[]>>;

  /**
   * 체결 내역 조회
   */
  getFilledOrders(startDate?: Date, endDate?: Date): Promise<BrokerResponse<Order[]>>;
}

/**
 * 브로커 팩토리 함수 타입
 */
export type BrokerFactory<T> = (credentials: T) => IBroker;
