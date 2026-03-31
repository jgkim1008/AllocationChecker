import {
  calculateFibonacciPosition,
  findNearestFibonacciLevel,
} from '@/lib/utils/fibonacci-calculator';
import { createServiceClient } from '@/lib/supabase/server';
import { sendKakaoListTemplate } from './kakao';

const ALERT_SYMBOLS = ['^GSPC', '^IXIC', '^KS11', '^KQ11', '^N225', 'SOXL'];

const DISPLAY_NAME: Record<string, string> = {
  '^GSPC': 'S&P500',
  '^IXIC': 'NASDAQ',
  '^KS11': 'KOSPI',
  '^KQ11': 'KOSDAQ',
  '^N225': 'Nikkei',
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

function buildListItems(statuses: SymbolStatus[]): { title: string; description: string }[] {
  const items: { title: string; description: string }[] = [];

  // KOSPI + KOSDAQ를 한 아이템으로 합쳐서 5개 이내 맞춤
  const ks11 = statuses.find(s => s.symbol === '^KS11');
  const kq11 = statuses.find(s => s.symbol === '^KQ11');
  const others = statuses.filter(s => s.symbol !== '^KS11' && s.symbol !== '^KQ11');

  for (const s of others) {
    const pos   = (s.fibonacciValue * 100).toFixed(1);
    const lvl   = (s.nearestLevel   * 100).toFixed(1);
    const dist  = s.distanceFromLevel.toFixed(1);
    const emoji = alertEmoji(s.distanceFromLevel);
    const price = fmtPrice(s.currentPrice, s.market);
    const name  = DISPLAY_NAME[s.symbol] ?? s.symbol;
    items.push({
      title:       `${emoji} ${name}`,
      description: `현재 ${pos}% → Fib ${lvl}%  (거리 ${dist}%)  ${price}`,
    });
  }

  // KOSPI / KOSDAQ 합산 아이템
  if (ks11 && kq11) {
    const fmt = (s: SymbolStatus) => {
      const pos  = (s.fibonacciValue * 100).toFixed(1);
      const lvl  = (s.nearestLevel   * 100).toFixed(1);
      const dist = s.distanceFromLevel.toFixed(1);
      return `${alertEmoji(s.distanceFromLevel)} ${pos}%→${lvl}%(${dist}%)  ${fmtPrice(s.currentPrice, s.market)}`;
    };
    items.push({
      title:       `KOSPI / KOSDAQ`,
      description: `${fmt(ks11)}\n${fmt(kq11)}`,
    });
  } else {
    // 둘 중 하나만 있으면 개별 추가
    for (const s of [ks11, kq11].filter(Boolean) as SymbolStatus[]) {
      const pos  = (s.fibonacciValue * 100).toFixed(1);
      const lvl  = (s.nearestLevel   * 100).toFixed(1);
      const dist = s.distanceFromLevel.toFixed(1);
      items.push({
        title:       `${alertEmoji(s.distanceFromLevel)} ${DISPLAY_NAME[s.symbol] ?? s.symbol}`,
        description: `현재 ${pos}% → Fib ${lvl}%  (거리 ${dist}%)  ${fmtPrice(s.currentPrice, s.market)}`,
      });
    }
  }

  // ALERT_SYMBOLS 순서 기준 정렬 (others는 KOSPI/KOSDAQ 제외 순서대로 들어왔으므로 KOSPI/KOSDAQ 아이템은 마지막)
  return items;
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

/**
 * 마감 알림 발송 (US 또는 KR 마감)
 * 6개 심볼 전체 피보나치 현황을 카카오톡으로 전송
 */
export async function sendMarketCloseAlert(market: 'US' | 'KR'): Promise<void> {
  const label = market === 'US' ? '🇺🇸 미국장 마감' : '🇰🇷 한국장 마감';
  const today = new Date().toLocaleDateString('ko-KR', {
    month: '2-digit', day: '2-digit', timeZone: 'Asia/Seoul',
  }).replace('. ', '/').replace('.', '');

  const statuses = await fetchTargetStatuses();
  if (statuses.length === 0) {
    console.log(`[FibonacciAlert] ${label} - 데이터 없음`);
    return;
  }

  const nearCount = statuses.filter(s => s.distanceFromLevel < 5).length;
  const alertSuffix = nearCount > 0
    ? `  ⚠️ ${nearCount}개 레벨 근접`
    : '  ✅ 여유 있음';

  const headerTitle = `📊 피보나치 현황 [${label}] ${today}${alertSuffix}`;
  const items = buildListItems(statuses);

  await sendKakaoListTemplate(headerTitle, items);
}

