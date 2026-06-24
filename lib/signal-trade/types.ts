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
  | 'weekly-sr'              // 주봉 SR채널 전략
  | 'decline-box'            // 하락 박스 전략
  | 'inbum-bijag'            // 인범 빗각채널 + 구름대 전략
  | 'turtle-trading'         // 터틀 투자법 (돈키안 채널 돌파)
  | 'elliott-wave'           // 엘리어트 파동 (ZigZag 5파 임펄스)
  | 'etf-analyzer'           // ETF 매수 분석기 (수급+과열도)
  | 'infinite-buy'           // 무한매수법 (자동매매 비활성)
  // KIS Strategy Builder 전략
  | 'kis-golden-cross'       // 골든크로스 (MA5 > MA20 상향돌파)
  | 'kis-momentum'           // 모멘텀 (60일 수익률 ≥ 30%)
  | 'kis-week52-high'        // 52주 신고가
  | 'kis-consecutive'        // 연속 상승 (5일 연속)
  | 'kis-disparity'          // 이격도 (< 90% 과매도)
  | 'kis-breakout-fail'      // 돌파 실패 (매도용)
  | 'kis-strong-close'       // 강한 종가 (상위 80%)
  | 'kis-volatility'         // 변동성 확장
  | 'kis-mean-reversion'     // 평균회귀
  | 'kis-trend-filter';      // 추세 필터

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

  // 예약주문 (익절/손절)
  auto_order_id: string | null;

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
  category: 'daily' | 'weekly' | 'monthly' | 'pattern' | 'system';  // 전략 카테고리
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
    requiredHistory: 252,  // 일봉 기준 ~12개월
    category: 'monthly',
    autoTradeEnabled: true,
  },
  {
    id: 'forking',
    name: '월봉 포킹',
    description: '월봉 기준 이평선 수렴 후 방향성 돌파 시 매매',
    requiredHistory: 520,  // 일봉 기준 ~24개월
    category: 'monthly',
    autoTradeEnabled: true,
  },

  // ── 주봉 기반 전략 ──
  {
    id: 'weekly-sr',
    name: '주봉 SR채널',
    description: '주봉 지지/저항 플립 + 10MA 눌림목 매매',
    requiredHistory: 70,
    category: 'weekly',
    autoTradeEnabled: true,
  },
  {
    id: 'decline-box',
    name: '하락 박스',
    description: '하락 추세 박스권 하단 지지 + 반등 신호 매매',
    requiredHistory: 60,
    category: 'weekly',
    autoTradeEnabled: true,
  },
  {
    id: 'inbum-bijag',
    name: '인범 빗각+구름대',
    description: '로그스케일 빗각채널 하단 + 일목균형표 구름대 지지 동시 충족 시 매수',
    requiredHistory: 70,
    category: 'weekly',
    autoTradeEnabled: true,
  },

  {
    id: 'turtle-trading',
    name: '터틀 투자법',
    description: '20일(S1) / 55일(S2) 돈키안 채널 돌파 진입, ATR×2 손절 추세추종 시스템',
    requiredHistory: 60,
    category: 'daily',
    autoTradeEnabled: true,
  },
  {
    id: 'elliott-wave',
    name: '엘리어트 파동',
    description: 'ZigZag 3% 피벗 기반 5파 임펄스 패턴 탐지. 파동2/4 완료 후 파동3/5 진입 신호',
    requiredHistory: 60,
    category: 'daily',
    autoTradeEnabled: true,
  },

  // ── ETF 전용 전략 ──
  {
    id: 'etf-analyzer',
    name: 'ETF 매수 분석기',
    description: '한국 ETF의 수급(40일 상대 알파)과 과열도(5일 모멘텀)를 정량 분석. 수급 또는 과열도가 BUY일 때 진입',
    requiredHistory: 50,
    category: 'daily',
    autoTradeEnabled: true,
  },

  // ── 시스템 전략 (자동매매 비활성) ──
  {
    id: 'infinite-buy',
    name: '무한매수법',
    description: '분할매수 + 별지점 매도 시스템 (V2.2/V3.0/V4.0)',
    requiredHistory: 1,
    category: 'system',
    autoTradeEnabled: false,  // 별도 DCA 모듈 사용
  },

  // ── KIS Strategy Builder 전략 ──
  {
    id: 'kis-golden-cross',
    name: '골든크로스',
    description: 'MA5가 MA20을 상향 돌파할 때 매수',
    requiredHistory: 25,
    category: 'daily',
    autoTradeEnabled: true,
  },
  {
    id: 'kis-momentum',
    name: '모멘텀',
    description: '60일 수익률이 30% 이상인 강한 상승 모멘텀 종목 매수',
    requiredHistory: 65,
    category: 'daily',
    autoTradeEnabled: true,
  },
  {
    id: 'kis-week52-high',
    name: '52주 신고가',
    description: '현재가가 52주 최고가를 돌파할 때 매수',
    requiredHistory: 252,
    category: 'daily',
    autoTradeEnabled: true,
  },
  {
    id: 'kis-consecutive',
    name: '연속 상승',
    description: '5일 연속 상승 시 추세 추종 매수',
    requiredHistory: 10,
    category: 'daily',
    autoTradeEnabled: true,
  },
  {
    id: 'kis-disparity',
    name: '이격도',
    description: '이격도가 90% 미만(과매도)일 때 반등 매수',
    requiredHistory: 25,
    category: 'daily',
    autoTradeEnabled: true,
  },
  {
    id: 'kis-breakout-fail',
    name: '돌파 실패',
    description: '전고점 돌파 후 3일 내 3% 하락 시 매도 신호',
    requiredHistory: 25,
    category: 'daily',
    autoTradeEnabled: true,
  },
  {
    id: 'kis-strong-close',
    name: '강한 종가',
    description: '종가가 일중 범위의 상위 80%에 위치할 때 매수',
    requiredHistory: 5,
    category: 'daily',
    autoTradeEnabled: true,
  },
  {
    id: 'kis-volatility',
    name: '변동성 확장',
    description: '저변동성 구간에서 당일 3% 이상 상승 돌파 시 매수',
    requiredHistory: 15,
    category: 'daily',
    autoTradeEnabled: true,
  },
  {
    id: 'kis-mean-reversion',
    name: '평균회귀',
    description: '현재가가 MA5 × 97% 미만일 때 반등 매수',
    requiredHistory: 10,
    category: 'daily',
    autoTradeEnabled: true,
  },
  {
    id: 'kis-trend-filter',
    name: '추세 필터',
    description: '종가 > MA60 AND 전일대비 상승일 때 매수',
    requiredHistory: 65,
    category: 'daily',
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
  'weekly-sr': ['isAboveMA', 'isMaUptrend'],            // 주봉 10MA 위 + 상승 추세
  'decline-box': ['isBuySignal'],                       // 박스 상단 돌파 후 눌림 또는 삼각수렴 돌파
  'inbum-bijag': ['isConfluence', 'isAboveCloud'],      // 채널+구름 동시 또는 N자 리테스트
  'turtle-trading': ['s1Breakout', 's2Breakout', 'uptrend'],  // S1/S2 돌파 + 추세
  'elliott-wave':   ['isImpulseSignal', 'trendDirection'], // 파동2/4 완료 + 추세 방향
  'etf-analyzer':   ['supplyBuy', 'heatBuy'],               // 수급 또는 과열도 BUY (OR)
  'infinite-buy': [],  // 별도 로직 (무한매수법 모듈 사용)
  // KIS Strategy Builder 전략
  'kis-golden-cross': ['isGoldenCross', 'isFreshCross'],   // MA5 > MA20 상향돌파
  'kis-momentum': ['isMomentumStrong'],                     // 60일 수익률 ≥ 30%
  'kis-week52-high': ['isNewHigh'],                         // 52주 신고가 돌파
  'kis-consecutive': ['isConsecutiveUp'],                   // 5일 연속 상승
  'kis-disparity': ['isOversold'],                          // 이격도 < 90%
  'kis-breakout-fail': ['isBreakoutFail'],                  // 돌파 실패 (매도 신호)
  'kis-strong-close': ['isStrongClose'],                    // 종가 상위 80%
  'kis-volatility': ['isVolatilityBreakout'],               // 저변동 + 3% 돌파
  'kis-mean-reversion': ['isMeanReversion'],                // MA5 × 97% 미만
  'kis-trend-filter': ['isTrendUp', 'isPriceUp'],           // MA60 위 + 상승
};
