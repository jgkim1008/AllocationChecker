import { getDailyHistory } from '@/lib/api/yahoo';
import { calculateMAAlignment } from '@/lib/utils/ma-alignment-calculator';
import { calculateDualRSI } from '@/lib/utils/dual-rsi-calculator';
import { calculateRSIDivergence } from '@/lib/utils/rsi-divergence-calculator';
import { calculateInverseAlignment } from '@/lib/utils/inverse-alignment-calculator';
import { calculateFibonacciPosition, findNearestFibonacciLevel } from '@/lib/utils/fibonacci-calculator';
import { detectAllPatterns } from '@/lib/utils/chart-pattern-calculator';
import { calculateMonthlyMA, fetchMonthlyCandles } from '@/lib/utils/monthly-ma-calculator';
import { calculateForking, fetchMonthlyCandles as fetchForkingCandles } from '@/lib/utils/forking-calculator';
import { fetchWeeklyCandles as fetchInbumWeekly, analyzeInbumBijag } from '@/lib/utils/inbum-bijag-calculator';
import { analyzeElliottWave } from '@/lib/utils/elliott-wave-calculator';
import { calculateWeeklySR } from '@/lib/utils/weekly-sr-calculator';
import { analyzeDeclineBox, fetchDeclineBoxWeekly } from '@/lib/utils/decline-box-calculator';
import { analyzeTurtleTrading } from '@/lib/utils/turtle-trading-calculator';
// KIS Strategy Builder calculators
import { calculateGoldenCross } from '@/lib/utils/kis-golden-cross-calculator';
import { calculateMomentum } from '@/lib/utils/kis-momentum-calculator';
import { calculateWeek52High } from '@/lib/utils/kis-week52-high-calculator';
import { calculateConsecutive } from '@/lib/utils/kis-consecutive-calculator';
import { calculateDisparity } from '@/lib/utils/kis-disparity-calculator';
import { calculateBreakoutFail } from '@/lib/utils/kis-breakout-fail-calculator';
import { calculateStrongClose } from '@/lib/utils/kis-strong-close-calculator';
import { calculateVolatility } from '@/lib/utils/kis-volatility-calculator';
import { calculateMeanReversion } from '@/lib/utils/kis-mean-reversion-calculator';
import { calculateTrendFilter } from '@/lib/utils/kis-trend-filter-calculator';
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
    case 'inbum-bijag': {
      // 인범 빗각채널 + 일목균형표 구름대 전략 (주봉 기반)
      const weeklyCandles = await fetchInbumWeekly(symbol, market);
      if (!weeklyCandles || weeklyCandles.length < 30) {
        return {
          isActive: false,
          syncRate: 0,
          criteria: { dataInsufficient: true },
        };
      }

      const inbumResult = analyzeInbumBijag(weeklyCandles);
      const sig = inbumResult.signal;

      // 시그널별 싱크로율 매핑 (새 신호 체계)
      const syncMap: Record<string, number> = {
        BREAKOUT_BUY:   100,
        CHANNEL_BOTTOM:  85,
        BIJAG_TOUCH:     70,
        MID_CHANNEL:     40,
        CHANNEL_TOP:     20,
        EXTENSION:       15,
        BREAKDOWN:        5,
      };

      result = {
        syncRate: syncMap[sig] ?? 0,
        criteria: {
          isBreakoutBuy:   sig === 'BREAKOUT_BUY',
          isChannelBottom: sig === 'CHANNEL_BOTTOM',
          isBijagTouch:    sig === 'BIJAG_TOUCH',
          isAboveCloud:    inbumResult.aboveCloud,
        },
      };
      break;
    }
    case 'weekly-sr': {
      // 주봉 SR 채널 + 10MA 전략 (일봉 5거래일 간격으로 주봉 근사)
      const sr = calculateWeeklySR(history, currentPrice);
      if (!sr) {
        return { isActive: false, syncRate: 0, criteria: { dataInsufficient: true } };
      }
      result = {
        syncRate: sr.syncRate,
        criteria: {
          isAboveMA: sr.criteria.isAboveMA,
          isMaUptrend: sr.criteria.isMaUptrend,
          isPullback: sr.criteria.isPullback,
          isNotTooFar: sr.criteria.isNotTooFar,
        },
      };
      break;
    }
    case 'decline-box': {
      // 하락 박스 (주봉 데이터 필요)
      const weeklyCandles = await fetchDeclineBoxWeekly(symbol, market);
      if (!weeklyCandles || weeklyCandles.length < 20) {
        return { isActive: false, syncRate: 0, criteria: { dataInsufficient: true } };
      }
      const box = analyzeDeclineBox({ symbol, name: '', market }, weeklyCandles);
      if (!box) {
        return { isActive: false, syncRate: 0, criteria: { noBoxPattern: true } };
      }
      const syncMap: Record<string, number> = {
        BREAKOUT_PULLBACK: 100,
        TRIANGLE_BREAKOUT: 85,
        NEAR_BREAKOUT: 50,
        IN_BOX: 20,
      };
      result = {
        syncRate: syncMap[box.signal] ?? 0,
        criteria: {
          isBreakoutPullback: box.signal === 'BREAKOUT_PULLBACK',
          isTriangleBreakout: box.signal === 'TRIANGLE_BREAKOUT',
          isBuySignal: box.signal === 'BREAKOUT_PULLBACK' || box.signal === 'TRIANGLE_BREAKOUT',
        },
      };
      break;
    }
    case 'turtle-trading': {
      // 터틀 투자법: getDailyHistory 최신순 → 오래된순으로 뒤집기
      const turtleCandles = [...history].reverse().map(h => ({
        date:   h.date,
        open:   h.open,
        high:   h.high,
        low:    h.low,
        close:  h.price,
        volume: h.volume,
      }));
      const turtle = analyzeTurtleTrading(turtleCandles);
      if (!turtle) {
        return { isActive: false, syncRate: 0, criteria: { dataInsufficient: true } };
      }
      result = {
        syncRate: turtle.syncRate,
        criteria: {
          s1Breakout:     turtle.criteria.s1Breakout,
          s2Breakout:     turtle.criteria.s2Breakout,
          nearDC20:       turtle.criteria.nearDC20,
          uptrend:        turtle.criteria.uptrend,
          volumeAboveAvg: turtle.criteria.volumeAboveAvg,
        },
      };
      break;
    }
    case 'elliott-wave': {
      // getDailyHistory는 최신순 반환 → 오래된순으로 뒤집어서 EWCandle로 변환
      const ewCandles = [...history].reverse().map(h => ({
        date:   h.date,
        open:   h.open,
        high:   h.high,
        low:    h.low,
        close:  h.price,
        volume: h.volume,
      }));
      const ewResult = analyzeElliottWave(ewCandles);
      if (!ewResult || ewResult.signal === 'UNCLEAR') {
        return { isActive: false, syncRate: 0, criteria: { patternUnclear: true } };
      }
      const isImpulseSignal = ewResult.signal === 'WAVE2_END' || ewResult.signal === 'WAVE4_END';
      result = {
        syncRate: ewResult.syncRate,
        criteria: {
          isImpulseSignal,
          wave2Retracement: ewResult.criteria.wave2Retracement,
          wave3Extension:   ewResult.criteria.wave3Extension,
          wave4NoOverlap:   ewResult.criteria.wave4NoOverlap,
          wave4Retracement: ewResult.criteria.wave4Retracement,
          volumePattern:    ewResult.criteria.volumePattern,
          trendDirection:   ewResult.criteria.trendDirection,
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
    // ── KIS Strategy Builder 전략 ──
    case 'kis-golden-cross': {
      const calc = calculateGoldenCross(history, currentPrice, currentVolume);
      result = {
        syncRate: calc.syncRate,
        criteria: calc.criteria,
      };
      break;
    }
    case 'kis-momentum': {
      const calc = calculateMomentum(history, currentPrice, currentVolume);
      result = {
        syncRate: calc.syncRate,
        criteria: calc.criteria,
      };
      break;
    }
    case 'kis-week52-high': {
      const calc = calculateWeek52High(history, currentPrice, currentVolume);
      result = {
        syncRate: calc.syncRate,
        criteria: calc.criteria,
      };
      break;
    }
    case 'kis-consecutive': {
      const calc = calculateConsecutive(history);
      result = {
        syncRate: calc.syncRate,
        criteria: calc.criteria,
      };
      break;
    }
    case 'kis-disparity': {
      const calc = calculateDisparity(history, currentPrice);
      result = {
        syncRate: calc.syncRate,
        criteria: calc.criteria,
      };
      break;
    }
    case 'kis-breakout-fail': {
      const calc = calculateBreakoutFail(history, currentPrice, currentVolume);
      result = {
        syncRate: calc.syncRate,
        criteria: calc.criteria,
      };
      break;
    }
    case 'kis-strong-close': {
      const calc = calculateStrongClose(history, currentPrice, currentVolume);
      result = {
        syncRate: calc.syncRate,
        criteria: calc.criteria,
      };
      break;
    }
    case 'kis-volatility': {
      const calc = calculateVolatility(history, currentPrice, currentVolume);
      result = {
        syncRate: calc.syncRate,
        criteria: calc.criteria,
      };
      break;
    }
    case 'kis-mean-reversion': {
      const calc = calculateMeanReversion(history, currentPrice);
      result = {
        syncRate: calc.syncRate,
        criteria: calc.criteria,
      };
      break;
    }
    case 'kis-trend-filter': {
      const calc = calculateTrendFilter(history, currentPrice, currentVolume);
      result = {
        syncRate: calc.syncRate,
        criteria: calc.criteria,
      };
      break;
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

    case 'inbum-bijag':
      // 돌파 매수, 채널 하단, 빗각 터치 중 하나 + 구름 아래 아닐 것
      return (criteria.isBreakoutBuy === true ||
              criteria.isChannelBottom === true ||
              criteria.isBijagTouch === true) &&
             criteria.isAboveCloud !== false;

    case 'weekly-sr':
      // 주봉 10MA 위 + MA 우상향 (눌림목/이격 가드는 syncRate에 가중치로 반영됨)
      return criteria.isAboveMA === true && criteria.isMaUptrend === true;

    case 'decline-box':
      // 박스 상단 돌파 후 눌림목 또는 박스 내 삼각수렴 돌파
      return criteria.isBuySignal === true;

    case 'turtle-trading':
      // S1 또는 S2 돌파 + 55일선 상향 추세
      return (criteria.s1Breakout === true || criteria.s2Breakout === true) &&
             criteria.uptrend === true;

    case 'elliott-wave':
      // 파동2 또는 파동4 완료 신호 + 추세 방향 확인
      return criteria.isImpulseSignal === true && criteria.trendDirection !== false;

    case 'infinite-buy':
      // 무한매수법은 별도 모듈 사용
      return false;

    // ── KIS Strategy Builder 전략 ──
    case 'kis-golden-cross':
      // 골든크로스 상태 + 최근 크로스 발생
      return criteria.isGoldenCross === true && criteria.isFreshCross === true;

    case 'kis-momentum':
      // 60일 수익률 >= 30%
      return criteria.isMomentumStrong === true;

    case 'kis-week52-high':
      // 52주 신고가 돌파
      return criteria.isNewHigh === true;

    case 'kis-consecutive':
      // 5일 연속 상승
      return criteria.isConsecutiveUp === true;

    case 'kis-disparity':
      // 이격도 < 90% (과매도)
      return criteria.isOversold === true;

    case 'kis-breakout-fail':
      // 돌파 실패 (매도 신호이므로 isActive=true일 때 청산)
      return criteria.isBreakoutFail === true;

    case 'kis-strong-close':
      // 종가 상위 80%
      return criteria.isStrongClose === true;

    case 'kis-volatility':
      // 저변동 + 3% 돌파
      return criteria.isVolatilityBreakout === true;

    case 'kis-mean-reversion':
      // MA5 × 97% 미만 (평균회귀 매수)
      return criteria.isMeanReversion === true;

    case 'kis-trend-filter':
      // 종가 > MA60 AND 전일대비 상승
      return criteria.isTrendUp === true && criteria.isPriceUp === true;

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
