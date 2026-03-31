import {
  calculateFibonacciPosition,
  findNearestFibonacciLevel,
} from '@/lib/utils/fibonacci-calculator';
import { createServiceClient } from '@/lib/supabase/server';
import { sendKakaoListTemplate } from './kakao';

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

function buildListItems(statuses: SymbolStatus[], order: string[]): { title: string; description: string }[] {
  const map = new Map(statuses.map(s => [s.symbol, s]));

  return order
    .map(sym => map.get(sym))
    .filter((s): s is SymbolStatus => !!s)
    .map(s => {
      const pos   = (s.fibonacciValue * 100).toFixed(1);
      const lvl   = (s.nearestLevel   * 100).toFixed(1);
      const dist  = s.distanceFromLevel.toFixed(1);
      const emoji = alertEmoji(s.distanceFromLevel);
      const price = fmtPrice(s.currentPrice, s.market);
      const name  = DISPLAY_NAME[s.symbol] ?? s.symbol;
      return {
        title:       `${emoji} ${name}`,
        description: `현재 ${pos}% → Fib ${lvl}%  (거리 ${dist}%)  ${price}`,
      };
    });
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

/**
 * 마감 알림 발송 (US 또는 KR 마감)
 * 카테고리별로 3개 메시지로 나눠서 전송 (1000자 제한 대응)
 */
export async function sendMarketCloseAlert(market: 'US' | 'KR'): Promise<void> {
  const marketLabel = market === 'US' ? '미국장 마감' : '한국장 마감';
  const today = new Date().toLocaleDateString('ko-KR', {
    month: '2-digit', day: '2-digit', timeZone: 'Asia/Seoul',
  }).replace('. ', '/').replace('.', '');

  const statuses = await fetchTargetStatuses();
  if (statuses.length === 0) {
    console.log(`[FibonacciAlert] ${marketLabel} - 데이터 없음`);
    return;
  }

  // 마감 시장에 따라 전송 순서 결정
  const categoryOrder = market === 'US'
    ? ['US', 'SOXL', 'KR'] as const
    : ['KR', 'SOXL', 'US'] as const;

  // 카테고리별로 메시지 전송
  for (const category of categoryOrder) {
    const symbols = CATEGORY_GROUPS[category];
    const items = buildListItems(statuses, symbols);

    if (items.length === 0) continue;

    const nearCount = statuses
      .filter(s => symbols.includes(s.symbol) && s.distanceFromLevel < 5)
      .length;
    const alertSuffix = nearCount > 0 ? ` ⚠️${nearCount}개 근접` : '';

    const headerTitle = `📊 ${CATEGORY_LABELS[category]} [${today}]${alertSuffix}`;

    await sendKakaoListTemplate(headerTitle, items);

    // API rate limit 방지를 위한 짧은 딜레이
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`[FibonacciAlert] ${marketLabel} 알림 발송 완료 (3개 메시지)`);
}

