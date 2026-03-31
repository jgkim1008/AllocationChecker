import type { FibonacciStock } from '@/types/fibonacci';
import { calculatePriceAtLevel, getFibonacciInterpretation } from '@/lib/utils/fibonacci-calculator';
import { sendKakaoNotification } from './kakao';

// 알림 대상 심볼
const ALERT_SYMBOLS = new Set(['^GSPC', '^IXIC', '^KS11', '^KQ11', '^N225', 'SOXL']);

// 피보나치 레벨 ±5% 이내 근접 시 알림
const ALERT_THRESHOLD = 5.0;

function formatPrice(price: number, market: string): string {
  if (market === 'KR') return price.toLocaleString('ko-KR') + '원';
  return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildAlertMessage(alerts: FibonacciStock[]): string {
  const today = new Date().toISOString().split('T')[0];
  const lines: string[] = [`📊 피보나치 레벨 근접 알림 [${today}]`];

  for (const s of alerts) {
    const levelPct  = Math.round((s.fibonacciLevel ?? 0) * 1000) / 10;
    const levelPrice = calculatePriceAtLevel(s.fibonacciLevel!, s.yearLow, s.yearHigh);
    const interp    = getFibonacciInterpretation(s.fibonacciLevel!);
    lines.push('');
    lines.push(`🔴 ${s.name} (${s.symbol})`);
    lines.push(`${levelPct}% 레벨 근접 (${interp})`);
    lines.push(`현재가: ${formatPrice(s.currentPrice, s.market)} | 레벨가: ${formatPrice(levelPrice, s.market)}`);
    lines.push(`거리: ${s.distanceFromLevel.toFixed(1)}%`);
  }

  return lines.join('\n');
}

/**
 * indices 스캔 결과에서 알림 대상 필터링 후 카카오톡 발송
 */
export async function checkAndSendFibonacciAlerts(indices: FibonacciStock[]): Promise<void> {
  const alerts = indices.filter(
    s =>
      ALERT_SYMBOLS.has(s.symbol) &&
      s.fibonacciLevel !== null &&
      s.distanceFromLevel < ALERT_THRESHOLD
  );

  if (alerts.length === 0) {
    console.log('[FibonacciAlert] 알림 대상 없음');
    return;
  }

  console.log(`[FibonacciAlert] 알림 대상 ${alerts.length}개:`, alerts.map(s => s.symbol));

  const message = buildAlertMessage(alerts);
  await sendKakaoNotification(message);
}
