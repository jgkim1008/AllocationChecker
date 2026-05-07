/**
 * MA 계단식 자동매수 전략 타입 및 계산 유틸
 *
 * - 이동평균선(3, 5, 10, 20, 60, 120, 240) 지정가 주문
 * - 일목균형표 선행스팬1/2 (60분봉·240분봉·일봉·주봉) 지정가 주문
 */

// ─── MA ────────────────────────────────────────────────────────────────────

export const MA_PERIODS = [3, 5, 10, 20, 60, 120, 240] as const;
export type MAPeriod = (typeof MA_PERIODS)[number];

export interface MAPrice {
  period: MAPeriod;
  price: number | null;
}

export function calculateMALadderPrices(history: { price: number }[]): MAPrice[] {
  return MA_PERIODS.map((period) => {
    if (history.length < period) return { period, price: null };
    const avg = history.slice(0, period).reduce((s, h) => s + h.price, 0) / period;
    return { period, price: Math.round(avg * 100) / 100 };
  });
}

// ─── Ichimoku ───────────────────────────────────────────────────────────────

/**
 * 일목균형표 레벨 키 (9001~9008, DB INTEGER에 저장)
 * 현재 구름 = 26봉 전에 계산된 SpanA/B (차트에서 26봉 앞으로 시프트된 것이 지금 가격과 겹치는 구름)
 */
export const ICHIMOKU_LEVEL_DEFS = [
  { key: 9001 as const, label: '60분봉', sublabel: '스팬1', timeframe: '60m' as const, span: 1 as const },
  { key: 9002 as const, label: '60분봉', sublabel: '스팬2', timeframe: '60m' as const, span: 2 as const },
  { key: 9003 as const, label: '240분봉', sublabel: '스팬1', timeframe: '240m' as const, span: 1 as const },
  { key: 9004 as const, label: '240분봉', sublabel: '스팬2', timeframe: '240m' as const, span: 2 as const },
  { key: 9005 as const, label: '일봉', sublabel: '스팬1', timeframe: 'D' as const, span: 1 as const },
  { key: 9006 as const, label: '일봉', sublabel: '스팬2', timeframe: 'D' as const, span: 2 as const },
  { key: 9007 as const, label: '주봉', sublabel: '스팬1', timeframe: 'W' as const, span: 1 as const },
  { key: 9008 as const, label: '주봉', sublabel: '스팬2', timeframe: 'W' as const, span: 2 as const },
] as const;

export type IchimokuKey = 9001 | 9002 | 9003 | 9004 | 9005 | 9006 | 9007 | 9008;
export type IchimokuTimeframe = '60m' | '240m' | 'D' | 'W';
export type AnyLevelKey = MAPeriod | IchimokuKey;

export function isIchimokuKey(key: number): key is IchimokuKey {
  return key >= 9001 && key <= 9008;
}

export function getIchimokuDef(key: IchimokuKey) {
  return ICHIMOKU_LEVEL_DEFS.find(d => d.key === key)!;
}

export interface IchimokuPrice {
  key: IchimokuKey;
  price: number | null;
}

/**
 * 일목균형표 선행스팬1/2 계산 (최신순 OHLC 배열)
 * - 최소 78봉 필요 (26 시프트 + 52 선행스팬2 기간)
 */
export function calculateIchimoku(
  candles: { high: number; low: number }[], // newest-first
): { span1: number | null; span2: number | null } {
  const MIN_CANDLES = 78;
  if (candles.length < MIN_CANDLES) return { span1: null, span2: null };

  const offset = 26;
  // reduce 사용 — spread(...)는 대형 배열에서 스택 오버플로우 위험
  const maxH = (arr: { high: number }[]) => arr.reduce((m, c) => c.high > m ? c.high : m, -Infinity);
  const minL = (arr: { low: number }[]) => arr.reduce((m, c) => c.low < m ? c.low : m, Infinity);

  // 전환선 at t-26 (9봉 고저 평균)
  const t9 = candles.slice(offset, offset + 9);
  const tenkan = (maxH(t9) + minL(t9)) / 2;

  // 기준선 at t-26 (26봉 고저 평균)
  const t26 = candles.slice(offset, offset + 26);
  const kijun = (maxH(t26) + minL(t26)) / 2;

  // 선행스팬1 = (전환선 + 기준선) / 2
  const span1 = Math.round((tenkan + kijun) / 2 * 10000) / 10000;

  // 선행스팬2 = 52봉 고저 평균
  const t52 = candles.slice(offset, offset + 52);
  const span2 = Math.round((maxH(t52) + minL(t52)) / 2 * 10000) / 10000;

  return { span1, span2 };
}

/**
 * 일봉 OHLC → 주봉 집계 (최신순 입력/출력)
 */
/** YYYYMMDD 또는 YYYY-MM-DD 모두 처리 */
function normalizeDate(raw: string): string {
  if (raw.length === 8) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  return raw;
}

export function aggregateToWeekly(
  daily: { date: string; high: number; low: number; close: number }[],
): { high: number; low: number; close: number }[] {
  const oldest = [...daily].reverse();
  const weekMap = new Map<string, { high: number; low: number; close: number }>();

  for (const d of oldest) {
    const date = new Date(normalizeDate(d.date) + 'T00:00:00Z');
    const day = date.getUTCDay() || 7;
    const mon = new Date(date);
    mon.setUTCDate(date.getUTCDate() - day + 1);
    const key = mon.toISOString().split('T')[0];

    if (!weekMap.has(key)) {
      weekMap.set(key, { high: d.high, low: d.low, close: d.close });
    } else {
      const w = weekMap.get(key)!;
      w.high = Math.max(w.high, d.high);
      w.low = Math.min(w.low, d.low);
      w.close = d.close; // 해당 주 마지막 거래일 종가
    }
  }

  return Array.from(weekMap.values()).reverse();
}

/**
 * 1시간봉 → 4시간봉 집계 (최신순 입력/출력)
 */
export function aggregateTo4Hour(
  hourly: { high: number; low: number; close: number }[],
): { high: number; low: number; close: number }[] {
  const oldest = [...hourly].reverse();
  const result: { high: number; low: number; close: number }[] = [];

  for (let i = 0; i + 3 < oldest.length; i += 4) {
    const group = oldest.slice(i, i + 4);
    result.push({
      high: Math.max(...group.map(c => c.high)),
      low: Math.min(...group.map(c => c.low)),
      close: group[3].close,
    });
  }

  return result.reverse();
}

// ─── DB 테이블 타입 ──────────────────────────────────────────────────────────

export interface MALadderSetting {
  id: string;
  user_id: string;
  symbol: string;
  market: 'domestic' | 'overseas';
  broker_type: 'kis' | 'kiwoom';
  broker_credential_id: string | null;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface MALadderLevel {
  id: string;
  setting_id: string;
  ma_period: number; // MAPeriod(3..240) 또는 IchimokuKey(9001..9008)
  quantity: number;
  is_enabled: boolean;
  created_at: string;
}

export interface MALadderOrder {
  id: string;
  setting_id: string;
  user_id: string;
  symbol: string;
  ma_period: number;
  ma_price: number;
  quantity: number;
  broker_order_id: string | null;
  status: 'pending' | 'submitted' | 'filled' | 'cancelled' | 'failed';
  order_date: string;
  created_at: string;
  updated_at: string;
}

export interface MALadderSettingWithLevels extends MALadderSetting {
  levels: MALadderLevel[];
}

// API 요청 타입
export interface CreateMALadderRequest {
  symbol: string;
  market: 'domestic' | 'overseas';
  broker_type: 'kis' | 'kiwoom';
  broker_credential_id?: string | null;
  levels: {
    ma_period: number;
    quantity: number;
    is_enabled: boolean;
  }[];
}
