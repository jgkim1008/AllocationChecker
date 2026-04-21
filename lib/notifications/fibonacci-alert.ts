import {
  calculateFibonacciPosition,
  findNearestFibonacciLevel,
} from '@/lib/utils/fibonacci-calculator';
import { createServiceClient } from '@/lib/supabase/server';
import { broadcastToSubscribers } from './telegram';

const ALERT_SYMBOLS = ['^GSPC', '^IXIC', '^KS11', '^KQ11', 'SOXL'];

const DISPLAY_NAME: Record<string, string> = {
  '^GSPC': 'S&P500',
  '^IXIC': 'NASDAQ',
  '^KS11': 'KOSPI',
  '^KQ11': 'KOSDAQ',
  'SOXL':  'SOXL',
};

interface SymbolStatus {
  symbol: string;
  currentPrice: number;
  market: string;
  fibonacciValue: number;     // 0~1 위치
  nearestLevel: number;       // 가장 가까운 피보나치 레벨 (0~1)
  distanceFromLevel: number;  // 가장 가까운 레벨까지 거리 (%)
}

function alertEmoji(distance: number): string {
  if (distance < 3)  return '🔴';
  if (distance < 5)  return '🟠';
  if (distance < 10) return '🟡';
  return '⚪';
}

function fmtPrice(price: number, market: string): string {
  if (market === 'KR') return price.toLocaleString('ko-KR');
  if (price >= 1000)   return '$' + Math.round(price).toLocaleString('en-US');
  return '$' + price.toFixed(2);
}

async function fetchTargetStatuses(): Promise<SymbolStatus[]> {
  const supabase = await createServiceClient();
  const { data: stocks } = await supabase
    .from('stocks')
    .select('symbol, name, market, current_price, year_high, year_low')
    .in('symbol', ALERT_SYMBOLS);

  if (!stocks) return [];

  const results: SymbolStatus[] = [];

  for (const s of stocks) {
    if (!s.current_price || !s.year_high || !s.year_low) continue;

    const position = calculateFibonacciPosition(
      Number(s.current_price), Number(s.year_low), Number(s.year_high)
    );
    const { level, distance } = findNearestFibonacciLevel(position, 1.0); // tolerance 100% = 항상 가장 가까운 레벨 반환

    results.push({
      symbol:             s.symbol,
      currentPrice:       Number(s.current_price),
      market:             s.market,
      fibonacciValue:     position,
      nearestLevel:       level ?? 0,
      distanceFromLevel:  distance,
    });
  }

  // ALERT_SYMBOLS 정의 순서대로 정렬
  return results.sort(
    (a, b) => ALERT_SYMBOLS.indexOf(a.symbol) - ALERT_SYMBOLS.indexOf(b.symbol)
  );
}

// 카테고리별 심볼 그룹
const CATEGORY_GROUPS = {
  US: ['^GSPC', '^IXIC'],     // 미국 나스닥/S&P
  SOXL: ['SOXL'],             // SOXL
  KR: ['^KS11', '^KQ11'],     // 한국 코스피/코스닥
};

const CATEGORY_LABELS = {
  US: '🇺🇸 미국 지수',
  SOXL: '🔥 SOXL',
  KR: '🇰🇷 한국 지수',
};

interface MonthlyMAChanged {
  symbol: string;
  name: string;
  market: string;
  signal: 'HOLD' | 'SELL';
  maDeviation: number;
  deathCandle: boolean;
}

async function fetchMonthlyMAChanges(): Promise<MonthlyMAChanged[]> {
  try {
    const supabase = await createServiceClient();
    const { data: cached } = await supabase
      .from('monthly_ma_cache')
      .select('data')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!cached?.data) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (cached.data as any[]).filter((s: any) => s.signalChanged) as MonthlyMAChanged[];
  } catch {
    return [];
  }
}

/**
 * Telegram용 메시지 포맷 빌드
 */
function buildTelegramMessage(
  statuses: SymbolStatus[],
  market: 'US' | 'KR',
  maChanges: MonthlyMAChanged[]
): string {
  const marketLabel = market === 'US' ? '🇺🇸 미국장 마감' : '🇰🇷 한국장 마감';
  const today = new Date().toLocaleDateString('ko-KR', {
    month: '2-digit', day: '2-digit', timeZone: 'Asia/Seoul',
  }).replace('. ', '/').replace('.', '');

  let text = `📊 <b>${marketLabel}</b> [${today}]\n`;
  text += `━━━━━━━━━━━━━━━\n`;

  // 마감 시장에 따라 표시 순서 결정
  const categoryOrder = market === 'US'
    ? ['US', 'SOXL', 'KR'] as const
    : ['KR', 'SOXL', 'US'] as const;

  for (const category of categoryOrder) {
    const symbols = CATEGORY_GROUPS[category];
    const categoryStatuses = statuses.filter(s => symbols.includes(s.symbol));

    if (categoryStatuses.length === 0) continue;

    text += `\n<b>${CATEGORY_LABELS[category]}</b>\n`;

    for (const s of categoryStatuses) {
      const emoji = alertEmoji(s.distanceFromLevel);
      const name = DISPLAY_NAME[s.symbol] ?? s.symbol;
      const pos = (s.fibonacciValue * 100).toFixed(1);
      const lvl = (s.nearestLevel * 100).toFixed(1);
      const dist = s.distanceFromLevel.toFixed(1);
      const price = fmtPrice(s.currentPrice, s.market);

      text += `${emoji} <b>${name}</b>: ${pos}% → Fib ${lvl}% (${dist}%) ${price}\n`;
    }
  }

  // 월봉 10이평 신호 전환 섹션
  if (maChanges.length > 0) {
    text += `\n━━━━━━━━━━━━━━━\n`;
    text += `📈 <b>월봉 10이평 신호 전환</b>\n`;

    const sellChanges = maChanges.filter(s => s.signal === 'SELL');
    const buyChanges  = maChanges.filter(s => s.signal === 'HOLD');

    if (sellChanges.length > 0) {
      text += `🔴 매도 전환\n`;
      for (const s of sellChanges) {
        const death = s.deathCandle ? ' ☠️' : '';
        text += `  • <b>${s.symbol}</b> ${s.name}${death} (${s.maDeviation.toFixed(1)}%)\n`;
      }
    }
    if (buyChanges.length > 0) {
      text += `🟢 매수 전환\n`;
      for (const s of buyChanges) {
        const dev = s.maDeviation >= 0 ? `+${s.maDeviation.toFixed(1)}` : s.maDeviation.toFixed(1);
        text += `  • <b>${s.symbol}</b> ${s.name} (${dev}%)\n`;
      }
    }
  }

  return text;
}

/**
 * 마감 알림 발송 (US 또는 KR 마감)
 * Telegram으로만 발송
 */
export async function sendMarketCloseAlert(market: 'US' | 'KR'): Promise<void> {
  const marketLabel = market === 'US' ? '미국장 마감' : '한국장 마감';

  const statuses = await fetchTargetStatuses();
  if (statuses.length === 0) {
    console.log(`[FibonacciAlert] ${marketLabel} - 데이터 없음`);
    return;
  }

  // Telegram 구독자에게 알림 전송
  try {
    const maChanges = await fetchMonthlyMAChanges();
    const telegramMessage = buildTelegramMessage(statuses, market, maChanges);
    const delivered = await broadcastToSubscribers(telegramMessage);
    console.log(`[FibonacciAlert] ${marketLabel} Telegram 알림 발송 완료 (${delivered}명, MA전환 ${maChanges.length}개)`);
  } catch (error) {
    console.error('[FibonacciAlert] Telegram 알림 발송 실패:', error);
  }
}

