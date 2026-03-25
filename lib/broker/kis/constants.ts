/**
 * 한국투자증권 API 상수
 */

// API 기본 URL
export const KIS_API_BASE_URL = {
  REAL: 'https://openapi.koreainvestment.com:9443',
  VIRTUAL: 'https://openapivts.koreainvestment.com:29443',
} as const;

// API 엔드포인트
export const KIS_ENDPOINTS = {
  // 인증
  AUTH: {
    TOKEN: '/oauth2/tokenP',           // 토큰 발급
    REVOKE: '/oauth2/revokeP',         // 토큰 폐기
  },

  // 국내주식
  DOMESTIC: {
    // 시세
    PRICE: '/uapi/domestic-stock/v1/quotations/inquire-price',
    DAILY_PRICE: '/uapi/domestic-stock/v1/quotations/inquire-daily-price',

    // 잔고
    BALANCE: '/uapi/domestic-stock/v1/trading/inquire-balance',

    // 주문
    ORDER: '/uapi/domestic-stock/v1/trading/order-cash',
    ORDER_REVISE: '/uapi/domestic-stock/v1/trading/order-rvsecncl',

    // 체결내역
    ORDERS: '/uapi/domestic-stock/v1/trading/inquire-daily-ccld',
  },

  // 해외주식
  OVERSEAS: {
    // 시세
    PRICE: '/uapi/overseas-price/v1/quotations/price',
    DAILY_PRICE: '/uapi/overseas-price/v1/quotations/dailyprice',

    // 잔고
    BALANCE: '/uapi/overseas-stock/v1/trading/inquire-balance',

    // 주문
    ORDER: '/uapi/overseas-stock/v1/trading/order',
    ORDER_REVISE: '/uapi/overseas-stock/v1/trading/order-rvsecncl',

    // 체결내역
    ORDERS: '/uapi/overseas-stock/v1/trading/inquire-ccnl',
  },
} as const;

// 거래구분 코드 (국내)
export const KIS_DOMESTIC_ORDER_TYPE = {
  // 매수
  BUY_LIMIT: '00',        // 지정가
  BUY_MARKET: '01',       // 시장가
  BUY_CONDITIONAL: '02',  // 조건부지정가
  BUY_BEST_LIMIT: '03',   // 최유리지정가
  BUY_FIRST_LIMIT: '04',  // 최우선지정가
  BUY_PRE_MARKET: '05',   // 장전 시간외
  BUY_POST_MARKET: '06',  // 장후 시간외
  BUY_OVERNIGHT: '07',    // 시간외 단일가

  // 매도
  SELL_LIMIT: '00',
  SELL_MARKET: '01',
  SELL_CONDITIONAL: '02',
  SELL_BEST_LIMIT: '03',
  SELL_FIRST_LIMIT: '04',
  SELL_PRE_MARKET: '05',
  SELL_POST_MARKET: '06',
  SELL_OVERNIGHT: '07',
} as const;

// 거래구분 코드 (해외)
export const KIS_OVERSEAS_ORDER_TYPE = {
  LIMIT: '00',            // 지정가
  MARKET: '01',           // 시장가 (나스닥 불가)
  LOC: '32',              // LOC (장마감 지정가)
  MOC: '34',              // MOC (장마감 시장가)
  EXTENDED_LIMIT: '05',   // 장전/장후 지정가
} as const;

// 해외 거래소 코드
export const KIS_EXCHANGE_CODE = {
  NASDAQ: 'NASD',
  NYSE: 'NYSE',
  AMEX: 'AMEX',
  HONG_KONG: 'SEHK',
  SHANGHAI: 'SHAA',
  SHENZHEN: 'SZAA',
  TOKYO: 'TKSE',
  VIETNAM_HANOI: 'HASE',
  VIETNAM_HOCHIMINH: 'VNSE',
} as const;

// TR ID (거래 식별자)
export const KIS_TR_ID = {
  // 국내주식 - 실전
  DOMESTIC: {
    PRICE: 'FHKST01010100',
    DAILY_PRICE: 'FHKST01010400',
    BALANCE: 'TTTC8434R',
    BUY: 'TTTC0802U',
    SELL: 'TTTC0801U',
    CANCEL: 'TTTC0803U',
    ORDERS: 'TTTC8001R',
  },
  // 국내주식 - 모의
  DOMESTIC_VIRTUAL: {
    PRICE: 'FHKST01010100',
    DAILY_PRICE: 'FHKST01010400',
    BALANCE: 'VTTC8434R',
    BUY: 'VTTC0802U',
    SELL: 'VTTC0801U',
    CANCEL: 'VTTC0803U',
    ORDERS: 'VTTC8001R',
  },
  // 해외주식 - 실전
  OVERSEAS: {
    PRICE: 'HHDFS00000300',
    DAILY_PRICE: 'HHDFS76240000',
    BALANCE: 'TTTS3012R',
    BUY: 'TTTS0308U',     // 미국 매수
    SELL: 'TTTS0307U',    // 미국 매도
    CANCEL: 'TTTS0309U',  // 미국 정정취소
    ORDERS: 'TTTS3035R',
  },
  // 해외주식 - 모의
  OVERSEAS_VIRTUAL: {
    PRICE: 'HHDFS00000300',
    DAILY_PRICE: 'HHDFS76240000',
    BALANCE: 'VTTS3012R',
    BUY: 'VTTS0308U',
    SELL: 'VTTS0307U',
    CANCEL: 'VTTS0309U',
    ORDERS: 'VTTS3035R',
  },
} as const;

// 에러 메시지 매핑
export const KIS_ERROR_MESSAGES: Record<string, string> = {
  'EGW00121': '토큰이 만료되었습니다.',
  'EGW00123': '유효하지 않은 토큰입니다.',
  'IGW00001': 'API 호출 횟수를 초과했습니다.',
  'APBK0919': '계좌번호가 올바르지 않습니다.',
  'APBK0656': '주문 수량이 올바르지 않습니다.',
  'APBK0658': '주문 가격이 올바르지 않습니다.',
  'APBK1634': '주문 가능 금액이 부족합니다.',
  'APBK1635': '주문 가능 수량이 부족합니다.',
  'APBK0013': '장이 닫혔습니다.',
};
