/**
 * 키움증권 API 상수
 */

// API 기본 URL
export const KIWOOM_API_BASE_URL = {
  REAL: 'https://openapi.koreainvestment.com:9443', // 키움 REST API
  VIRTUAL: 'https://openapivts.koreainvestment.com:29443',
} as const;

// API 엔드포인트
export const KIWOOM_ENDPOINTS = {
  // 인증
  AUTH: {
    TOKEN: '/oauth2/token',
    REVOKE: '/oauth2/revoke',
  },

  // 국내주식
  DOMESTIC: {
    // 시세
    PRICE: '/uapi/domestic-stock/v1/quotations/inquire-price',

    // 잔고
    BALANCE: '/uapi/domestic-stock/v1/trading/inquire-balance',

    // 주문
    ORDER: '/uapi/domestic-stock/v1/trading/order-cash',
    ORDER_CANCEL: '/uapi/domestic-stock/v1/trading/order-rvsecncl',

    // 체결내역
    ORDERS: '/uapi/domestic-stock/v1/trading/inquire-daily-ccld',
  },

  // 해외주식
  OVERSEAS: {
    // 시세
    PRICE: '/uapi/overseas-price/v1/quotations/price',

    // 잔고
    BALANCE: '/uapi/overseas-stock/v1/trading/inquire-balance',

    // 주문
    ORDER: '/uapi/overseas-stock/v1/trading/order',
    ORDER_CANCEL: '/uapi/overseas-stock/v1/trading/order-rvsecncl',

    // 체결내역
    ORDERS: '/uapi/overseas-stock/v1/trading/inquire-ccnl',
  },
} as const;

// TR ID
export const KIWOOM_TR_ID = {
  DOMESTIC: {
    PRICE: 'FHKST01010100',
    BALANCE: 'TTTC8434R',
    BUY: 'TTTC0802U',
    SELL: 'TTTC0801U',
    CANCEL: 'TTTC0803U',
    ORDERS: 'TTTC8001R',
  },
  DOMESTIC_VIRTUAL: {
    PRICE: 'FHKST01010100',
    BALANCE: 'VTTC8434R',
    BUY: 'VTTC0802U',
    SELL: 'VTTC0801U',
    CANCEL: 'VTTC0803U',
    ORDERS: 'VTTC8001R',
  },
  OVERSEAS: {
    PRICE: 'HHDFS00000300',
    BALANCE: 'TTTS3012R',
    BUY: 'TTTS0308U',
    SELL: 'TTTS0307U',
    CANCEL: 'TTTS0309U',
    ORDERS: 'TTTS3035R',
  },
  OVERSEAS_VIRTUAL: {
    PRICE: 'HHDFS00000300',
    BALANCE: 'VTTS3012R',
    BUY: 'VTTS0308U',
    SELL: 'VTTS0307U',
    CANCEL: 'VTTS0309U',
    ORDERS: 'VTTS3035R',
  },
} as const;

// 거래소 코드
export const KIWOOM_EXCHANGE_CODE = {
  NASDAQ: 'NASD',
  NYSE: 'NYSE',
  AMEX: 'AMEX',
} as const;

// 주문 유형
export const KIWOOM_ORDER_TYPE = {
  LIMIT: '00',
  MARKET: '01',
} as const;
