/**
 * 증권사 API 공통 타입 정의
 */

// 브로커 종류
export type BrokerType = 'kis' | 'kiwoom';

// 시장 구분
export type MarketType = 'domestic' | 'overseas';

// 주문 유형
export type OrderType = 'market' | 'limit' | 'loc' | 'moc'; // LOC = Limit On Close, MOC = Market On Close

// 주문 방향
export type OrderSide = 'buy' | 'sell';

// 주문 상태
export type OrderStatus =
  | 'pending'      // 대기
  | 'submitted'    // 제출됨
  | 'partial'      // 일부 체결
  | 'filled'       // 전량 체결
  | 'cancelled'    // 취소됨
  | 'rejected';    // 거부됨

// 통화
export type Currency = 'KRW' | 'USD';

// 계좌 정보
export interface BrokerAccount {
  accountNumber: string;      // 계좌번호
  accountName: string;        // 계좌명
  brokerType: BrokerType;     // 증권사
  isConnected: boolean;       // 연결 상태
  lastSyncedAt?: Date;        // 마지막 동기화 시간
}

// 잔고 정보
export interface Balance {
  totalAsset: number;         // 총 자산
  totalDeposit: number;       // 예수금
  totalBuyAmount: number;     // 총 매입금액
  totalEvalAmount: number;    // 총 평가금액
  totalProfitLoss: number;    // 총 손익
  totalProfitLossRate: number; // 총 수익률
  currency: Currency;
}

// 보유 종목
export interface Position {
  symbol: string;             // 종목코드
  symbolName: string;         // 종목명
  quantity: number;           // 보유수량
  avgPrice: number;           // 평균단가
  currentPrice: number;       // 현재가
  evalAmount: number;         // 평가금액
  profitLoss: number;         // 손익
  profitLossRate: number;     // 수익률
  currency: Currency;
  market: MarketType;
}

// 주문 요청
export interface OrderRequest {
  symbol: string;             // 종목코드
  side: OrderSide;            // 매수/매도
  orderType: OrderType;       // 주문유형
  quantity: number;           // 수량
  price?: number;             // 가격 (지정가 주문시)
  market: MarketType;         // 시장
}

// 주문 결과
export interface Order {
  orderId: string;            // 주문번호
  symbol: string;             // 종목코드
  symbolName: string;         // 종목명
  side: OrderSide;            // 매수/매도
  orderType: OrderType;       // 주문유형
  status: OrderStatus;        // 주문상태
  orderQuantity: number;      // 주문수량
  filledQuantity: number;     // 체결수량
  orderPrice: number;         // 주문가격
  filledPrice?: number;       // 체결가격
  filledAmount?: number;      // 체결금액
  orderTime: Date;            // 주문시간
  filledTime?: Date;          // 체결시간
  currency: Currency;
  market: MarketType;
}

// 현재가 정보
export interface Quote {
  symbol: string;
  symbolName: string;
  currentPrice: number;
  change: number;
  changeRate: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  prevClose: number;
  currency: Currency;
  market: MarketType;
  updatedAt: Date;
}

// API 인증 정보 (KIS)
export interface KISCredentials {
  appKey: string;
  appSecret: string;
  accountNumber: string;      // XXXXXXXX-XX 형식
  isVirtual: boolean;         // 모의투자 여부
}

// API 인증 정보 (키움)
export interface KiwoomCredentials {
  appKey: string;
  appSecret: string;
  accountNumber: string;
}

// 토큰 정보
export interface TokenInfo {
  accessToken: string;
  tokenType: string;
  expiresAt: Date;
}

// 브로커 설정
export interface BrokerConfig {
  type: BrokerType;
  credentials: KISCredentials | KiwoomCredentials;
  token?: TokenInfo;
}

// 자동매매 주문 (무한매수법용)
export interface AutoTradeOrder {
  id: string;
  symbol: string;
  symbolName: string;
  side: OrderSide;
  orderType: OrderType;
  quantity: number;
  targetPrice: number;
  reason: string;             // 주문 사유 (예: "40분할 1회차", "목표가 도달")
  cycleNumber: number;        // 사이클 번호
  roundNumber: number;        // 회차 번호
  status: 'pending' | 'confirmed' | 'executed' | 'cancelled';
  createdAt: Date;
  executedAt?: Date;
  order?: Order;              // 실제 주문 결과
}

// 자동매매 상태
export interface AutoTradeStatus {
  isEnabled: boolean;
  symbol: string;
  strategyType: 'V2.2' | 'V3.0';
  currentCycle: number;
  currentRound: number;
  pendingOrders: AutoTradeOrder[];
  executedOrders: AutoTradeOrder[];
  lastUpdatedAt: Date;
}

// API 응답 래퍼
export interface BrokerResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

// 오류 코드
export const BrokerErrorCodes = {
  // 인증 관련
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',

  // 주문 관련
  ORDER_INSUFFICIENT_BALANCE: 'ORDER_INSUFFICIENT_BALANCE',
  ORDER_INVALID_QUANTITY: 'ORDER_INVALID_QUANTITY',
  ORDER_INVALID_PRICE: 'ORDER_INVALID_PRICE',
  ORDER_MARKET_CLOSED: 'ORDER_MARKET_CLOSED',
  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',

  // 시스템 관련
  SYSTEM_MAINTENANCE: 'SYSTEM_MAINTENANCE',
  SYSTEM_RATE_LIMIT: 'SYSTEM_RATE_LIMIT',
  SYSTEM_UNKNOWN_ERROR: 'SYSTEM_UNKNOWN_ERROR',
} as const;

export type BrokerErrorCode = typeof BrokerErrorCodes[keyof typeof BrokerErrorCodes];
