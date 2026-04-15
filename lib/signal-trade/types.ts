// 신호 전략 타입 정의

export type SignalStrategyType =
  | 'ma-alignment'           // 이평선 정배열 전략
  | 'inverse-alignment'      // 이평선 역배열 전략
  | 'dual-rsi'               // MTF RSI + Dual RSI 크로스
  | 'rsi-divergence'         // RSI 다이버전스 + RSI 필터
  | 'fibonacci'              // 피보나치 되돌림
  | 'chart-pattern'          // 차트 패턴
  | 'monthly-ma'             // 월봉 10이평 전략
  | 'forking'                // 월봉 포킹 전략
  | 'infinite-buy';          // 무한매수법

export type ExitReason =
  | 'take_profit'
  | 'stop_loss'
  | 'max_hold'
  | 'signal_loss'
  | 'manual';

export type PositionStatus = 'open' | 'closed';

// DB 테이블 타입
export interface SignalTradeSettings {
  id: string;
  user_id: string;
  symbol: string;
  broker_type: string;
  strategy_type: SignalStrategyType;

  // 진입 조건
  min_sync_rate: number;

  // 청산 조건
  take_profit_pct: number | null;
  stop_loss_pct: number | null;
  max_hold_days: number | null;
  exit_on_signal_loss: boolean;

  // 투자 설정
  investment_amount: number;
  max_positions: number;

  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface SignalTradePosition {
  id: string;
  setting_id: string;
  user_id: string;
  symbol: string;
  broker_type: string;

  // 포지션 정보
  entry_price: number;
  shares: number;
  entry_date: string;
  entry_signal_type: SignalStrategyType;
  entry_sync_rate: number | null;

  // 상태
  status: PositionStatus;
  exit_price: number | null;
  exit_date: string | null;
  exit_reason: ExitReason | null;
  realized_pnl: number | null;
  realized_pnl_pct: number | null;

  created_at: string;
  updated_at: string;
}

// 신호 평가 결과
export interface SignalResult {
  isActive: boolean;
  syncRate: number;
  criteria: Record<string, boolean>;
}

// 청산 평가 결과
export interface ExitResult {
  shouldExit: boolean;
  reason: ExitReason | null;
  currentPnL: number;  // 현재 손익률 %
}

// API 요청/응답 타입
export interface CreateSignalSettingsRequest {
  symbol: string;
  broker_type: string;
  strategy_type: SignalStrategyType;
  min_sync_rate?: number;
  take_profit_pct?: number | null;
  stop_loss_pct?: number | null;
  max_hold_days?: number | null;
  exit_on_signal_loss?: boolean;
  investment_amount: number;
  max_positions?: number;
  is_enabled?: boolean;
}

export interface UpdateSignalSettingsRequest {
  min_sync_rate?: number;
  take_profit_pct?: number | null;
  stop_loss_pct?: number | null;
  max_hold_days?: number | null;
  exit_on_signal_loss?: boolean;
  investment_amount?: number;
  max_positions?: number;
  is_enabled?: boolean;
}

// UI용 전략 정보
export interface SignalStrategyInfo {
  id: SignalStrategyType;
  name: string;
  description: string;
  requiredHistory: number;  // 필요한 최소 히스토리 일수
  category: 'daily' | 'monthly' | 'pattern' | 'system';  // 전략 카테고리
  autoTradeEnabled: boolean;  // 자동매매 지원 여부
}

export const SIGNAL_STRATEGIES: SignalStrategyInfo[] = [
  // ── 일봉 기반 전략 ──
  {
    id: 'ma-alignment',
    name: '이평선 정배열',
    description: '이동평균선이 정배열(MA20>MA60>MA120)일 때 매수',
    requiredHistory: 125,
    category: 'daily',
    autoTradeEnabled: true,
  },
  {
    id: 'inverse-alignment',
    name: '이평선 역배열',
    description: '장기 역배열 상태에서 60일선 돌파 시 매수',
    requiredHistory: 450,
    category: 'daily',
    autoTradeEnabled: true,
  },
  {
    id: 'dual-rsi',
    name: 'MTF RSI + Dual RSI',
    description: 'RSI 과매도 + RSI(7)이 RSI(14)를 상향돌파할 때 매수',
    requiredHistory: 30,
    category: 'daily',
    autoTradeEnabled: true,
  },
  {
    id: 'rsi-divergence',
    name: 'RSI 다이버전스',
    description: '가격은 저점 갱신, RSI는 저점 상승(상승 다이버전스)일 때 매수',
    requiredHistory: 60,
    category: 'daily',
    autoTradeEnabled: true,
  },
  {
    id: 'fibonacci',
    name: '피보나치 되돌림',
    description: '52주 고저가 기준 피보나치 지지/저항 레벨 근접 시 매매',
    requiredHistory: 252,
    category: 'daily',
    autoTradeEnabled: true,
  },

  // ── 차트 패턴 전략 ──
  {
    id: 'chart-pattern',
    name: '차트 패턴',
    description: '헤드앤숄더, 더블탑/바텀, 삼각수렴 등 19개 패턴 감지',
    requiredHistory: 60,
    category: 'pattern',
    autoTradeEnabled: true,
  },

  // ── 월봉 기반 전략 ──
  {
    id: 'monthly-ma',
    name: '월봉 10이평',
    description: '월봉 기준 10개월 이동평균선 돌파/이탈 시 매매',
    requiredHistory: 12,
    category: 'monthly',
    autoTradeEnabled: true,
  },
  {
    id: 'forking',
    name: '월봉 포킹',
    description: '월봉 기준 이평선 수렴 후 방향성 돌파 시 매매',
    requiredHistory: 24,
    category: 'monthly',
    autoTradeEnabled: true,
  },

  // ── 시스템 전략 ──
  {
    id: 'infinite-buy',
    name: '무한매수법',
    description: '분할매수 + 별지점 매도 시스템 (V2.2/V3.0/V4.0)',
    requiredHistory: 1,
    category: 'system',
    autoTradeEnabled: true,
  },
];

// 전략별 핵심 조건 매핑
export const STRATEGY_ENTRY_CONDITIONS: Record<SignalStrategyType, string[]> = {
  'ma-alignment': ['isGoldenAlignment'],
  'inverse-alignment': ['isMaInverse', 'isMa60Breakout'],
  'dual-rsi': ['isMtfOversold', 'isFreshCross'],  // 둘 다 필요 또는 isFastAboveSlow
  'rsi-divergence': ['isDivergence', 'isOversold'],
  'fibonacci': ['isNearSupportLevel'],  // 지지 레벨 근접
  'chart-pattern': ['hasPattern', 'isBuySignal'],  // 패턴 감지 + 매수 신호
  'monthly-ma': ['isAboveMA10', 'isCrossUp'],  // 월봉 10이평 위 + 상향 돌파
  'forking': ['isConverging', 'isBreakout'],  // 수렴 + 돌파
  'infinite-buy': [],  // 별도 로직 (무한매수법 모듈 사용)
};
