import type { FibonacciLevel } from '@/types/fibonacci';

export const FIBONACCI_LEVELS: FibonacciLevel[] = [0, 0.14, 0.236, 0.382, 0.5, 0.618, 0.764, 0.854, 1];

/**
 * 현재가가 52주 고저가 범위에서 어디에 위치하는지 0~1 사이 값으로 계산
 * 0 = 52주 저가, 1 = 52주 고가
 */
export function calculateFibonacciPosition(
  currentPrice: number,
  yearLow: number,
  yearHigh: number
): number {
  if (yearHigh === yearLow) return 0.5;
  const position = (currentPrice - yearLow) / (yearHigh - yearLow);
  return Math.max(0, Math.min(1, position));
}

/**
 * 특정 포지션에서 가장 가까운 피보나치 레벨을 찾음
 * tolerance 범위(기본 3%) 내에 있으면 해당 레벨 반환, 아니면 null
 */
export function findNearestFibonacciLevel(
  position: number,
  tolerance: number = 0.10
): { level: FibonacciLevel | null; distance: number } {
  let nearestLevel: FibonacciLevel | null = null;
  let minDistance = Infinity;

  for (const level of FIBONACCI_LEVELS) {
    const distance = Math.abs(position - level);
    if (distance < minDistance) {
      minDistance = distance;
      nearestLevel = level;
    }
  }

  // tolerance 내에 있으면 해당 레벨, 아니면 null
  if (minDistance <= tolerance) {
    return { level: nearestLevel, distance: minDistance * 100 };
  }

  return { level: null, distance: minDistance * 100 };
}

/**
 * 피보나치 레벨에 해당하는 가격 계산
 */
export function calculatePriceAtLevel(
  level: FibonacciLevel,
  yearLow: number,
  yearHigh: number
): number {
  return yearLow + (yearHigh - yearLow) * level;
}

/**
 * 피보나치 레벨 해석 반환
 */
export function getFibonacciInterpretation(level: FibonacciLevel): string {
  switch (level) {
    case 0:
      return '52주 저가 (바닥)';
    case 0.14:
      return '극초기 반등 구간';
    case 0.236:
      return '얕은 되돌림 (강한 추세)';
    case 0.382:
      return '약한 되돌림 (매수 고려)';
    case 0.5:
      return '50% 되돌림 (중요 지지/저항)';
    case 0.618:
      return '황금 비율 (강한 지지)';
    case 0.764:
      return '깊은 되돌림 (고점 근처)';
    case 0.854:
      return '고점 근처 (주의)';
    case 1:
      return '52주 고가 (천장)';
  }
}
