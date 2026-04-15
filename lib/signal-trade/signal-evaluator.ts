import { getDailyHistory } from '@/lib/api/yahoo';
import { calculateMAAlignment } from '@/lib/utils/ma-alignment-calculator';
import { calculateDualRSI } from '@/lib/utils/dual-rsi-calculator';
import { calculateRSIDivergence } from '@/lib/utils/rsi-divergence-calculator';
import { calculateInverseAlignment } from '@/lib/utils/inverse-alignment-calculator';
import { calculateFibonacciPosition, findNearestFibonacciLevel } from '@/lib/utils/fibonacci-calculator';
import { detectAllPatterns } from '@/lib/utils/chart-pattern-calculator';
import { calculateMonthlyMA, fetchMonthlyCandles } from '@/lib/utils/monthly-ma-calculator';
import { calculateForking, fetchMonthlyCandles as fetchForkingCandles } from '@/lib/utils/forking-calculator';
import type { SignalStrategyType, SignalResult } from './types';
import { SIGNAL_STRATEGIES } from './types';

/**
 * 특정 종목의 신호 전략을 평가합니다.
 * @param strategyType 전략 유형
 * @param symbol 종목 코드
 * @param market 시장 (US | KR)
 * @param minSyncRate 최소 싱크로율 (기본 60)
 * @returns 신호 평가 결과
 */
export async function evaluateSignal(
  strategyType: SignalStrategyType,
  symbol: string,
  market: 'US' | 'KR',
  minSyncRate: number = 60
): Promise<SignalResult> {
  // 필요한 히스토리 일수 확인
  const strategyInfo = SIGNAL_STRATEGIES.find(s => s.id === strategyType);
  const requiredHistory = strategyInfo?.requiredHistory ?? 125;

  // 주가 히스토리 조회
  const history = await getDailyHistory(symbol, market);

  if (!history || history.length < requiredHistory) {
    return {
      isActive: false,
      syncRate: 0,
      criteria: {},
    };
  }

  const currentPrice = history[0]?.price ?? 0;
  const currentVolume = history[0]?.volume ?? 0;

  // 전략별 계산기 실행
  let result: { syncRate: number; criteria: Record<string, boolean> };

  switch (strategyType) {
    case 'ma-alignment': {
      const calc = calculateMAAlignment(history, currentPrice, currentVolume);
      result = {
        syncRate: calc.syncRate,
        criteria: calc.criteria,
      };
      break;
    }
    case 'dual-rsi': {
      const calc = calculateDualRSI(history, currentPrice, currentVolume);
      result = {
        syncRate: calc.syncRate,
        criteria: calc.criteria,
      };
      break;
    }
    case 'rsi-divergence': {
      const calc = calculateRSIDivergence(history, currentPrice, currentVolume);
      result = {
        syncRate: calc.syncRate,
        criteria: calc.criteria,
      };
      break;
    }
    case 'inverse-alignment': {
      const calc = calculateInverseAlignment(history, currentPrice, currentVolume);
      result = {
        syncRate: calc.syncRate,
        criteria: calc.criteria,
      };
      break;
    }
    case 'fibonacci': {
      // 피보나치 되돌림 계산
      const prices = history.slice(0, Math.min(252, history.length)).map(h => h.price);
      const yearHigh = Math.max(...prices);
      const yearLow = Math.min(...prices);
      const position = calculateFibonacciPosition(currentPrice, yearLow, yearHigh);
      const { level, distance } = findNearestFibonacciLevel(position, 0.05);

      // 지지 레벨 근접 (0.382, 0.5, 0.618) 시 매수 신호
      const supportLevels = [0.382, 0.5, 0.618];
      const isNearSupportLevel = level !== null && supportLevels.includes(level) && distance <= 5;
      const isInBuyZone = position < 0.5;  // 하단 50% 구간

      let syncRate = 0;
      if (isNearSupportLevel) syncRate += 50;
      if (isInBuyZone) syncRate += 30;
      if (distance <= 3) syncRate += 20;

      result = {
        syncRate,
        criteria: {
          isNearSupportLevel,
          isInBuyZone,
          nearLevel: level !== null,
        },
      };
      break;
    }
    case 'chart-pattern': {
      // 차트 패턴 감지
      const patterns = detectAllPatterns(history);
      // 매수 신호가 있는 패턴 중 가장 높은 싱크로율
      const buyPatterns = patterns.filter(p => p.signal === 'buy');

      if (buyPatterns.length === 0) {
        return {
          isActive: false,
          syncRate: 0,
          criteria: { hasPattern: false, isBuySignal: false },
        };
      }

      const bestPattern = buyPatterns.reduce((best, curr) =>
        curr.syncRate > best.syncRate ? curr : best
      );

      result = {
        syncRate: bestPattern.syncRate,
        criteria: {
          hasPattern: true,
          isBuySignal: true,
          patternType: true,  // bestPattern.type stored elsewhere
        },
      };
      break;
    }
    case 'monthly-ma': {
      // 월봉 10이평 전략
      const monthlyCandles = await fetchMonthlyCandles(symbol, market);
      if (!monthlyCandles || monthlyCandles.length < 12) {
        return {
          isActive: false,
          syncRate: 0,
          criteria: { dataInsufficient: true },
        };
      }

      const maResult = calculateMonthlyMA(monthlyCandles);
      if (!maResult) {
        return {
          isActive: false,
          syncRate: 0,
          criteria: { calculationFailed: true },
        };
      }

      result = {
        syncRate: maResult.syncRate,
        criteria: {
          isHoldSignal: maResult.criteria.isHoldSignal,
          isNearMA: maResult.criteria.isNearMA,
          isDeathCandle: maResult.criteria.isDeathCandle,
          maSlopeUp: maResult.criteria.maSlope === 'UP',
        },
      };
      break;
    }
    case 'forking': {
      // 월봉 포킹 전략
      const forkingCandles = await fetchForkingCandles(symbol, market);
      if (!forkingCandles || forkingCandles.length < 24) {
        return {
          isActive: false,
          syncRate: 0,
          criteria: { dataInsufficient: true },
        };
      }

      const forkResult = calculateForking(forkingCandles);
      if (!forkResult) {
        return {
          isActive: false,
          syncRate: 0,
          criteria: { calculationFailed: true },
        };
      }

      result = {
        syncRate: forkResult.syncRate,
        criteria: {
          isFullFork: forkResult.criteria.isFullFork,
          isPartialFork: forkResult.criteria.isPartialFork,
          isForkExpanding: forkResult.criteria.isForkExpanding,
        },
      };
      break;
    }
    case 'infinite-buy': {
      // 무한매수법은 별도 모듈에서 처리 - 여기서는 비활성
      return {
        isActive: false,
        syncRate: 0,
        criteria: { separateModule: true },
      };
    }
    default:
      return {
        isActive: false,
        syncRate: 0,
        criteria: {},
      };
  }

  // 진입 조건 확인
  const isActive = checkEntryConditions(strategyType, result.criteria, result.syncRate, minSyncRate);

  return {
    isActive,
    syncRate: result.syncRate,
    criteria: result.criteria,
  };
}

/**
 * 전략별 진입 조건을 확인합니다.
 */
function checkEntryConditions(
  strategyType: SignalStrategyType,
  criteria: Record<string, boolean>,
  syncRate: number,
  minSyncRate: number
): boolean {
  // 최소 싱크로율 체크
  if (syncRate < minSyncRate) {
    return false;
  }

  // 전략별 핵심 조건 체크
  switch (strategyType) {
    case 'ma-alignment':
      // 정배열 필수
      return criteria.isGoldenAlignment === true;

    case 'dual-rsi':
      // 과매도 + (신규 크로스 또는 크로스 유지)
      return criteria.isMtfOversold === true &&
             (criteria.isFreshCross === true || criteria.isFastAboveSlow === true);

    case 'rsi-divergence':
      // 다이버전스 + 과매도
      return criteria.isDivergence === true && criteria.isOversold === true;

    case 'inverse-alignment':
      // 역배열 + 60일선 돌파
      return criteria.isMaInverse === true && criteria.isMa60Breakout === true;

    case 'fibonacci':
      // 지지 레벨 근접 + 하단 구간
      return criteria.isNearSupportLevel === true && criteria.isInBuyZone === true;

    case 'chart-pattern':
      // 패턴 존재 + 매수 신호
      return criteria.hasPattern === true && criteria.isBuySignal === true;

    case 'monthly-ma':
      // HOLD 신호 + 눌림목 접근 (0~3%)
      return criteria.isHoldSignal === true && criteria.isNearMA === true;

    case 'forking':
      // 완전 정배열 또는 (부분 정배열 + 확대 중)
      return criteria.isFullFork === true ||
             (criteria.isPartialFork === true && criteria.isForkExpanding === true);

    case 'infinite-buy':
      // 무한매수법은 별도 모듈 사용
      return false;

    default:
      return false;
  }
}

/**
 * 현재가 조회 (간소화 버전)
 */
export async function getCurrentPrice(
  symbol: string,
  market: 'US' | 'KR'
): Promise<number | null> {
  const history = await getDailyHistory(symbol, market);
  if (!history || history.length === 0) return null;
  return history[0].price;
}
