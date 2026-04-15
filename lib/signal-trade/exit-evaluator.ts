import type { SignalTradePosition, SignalTradeSettings, ExitResult, ExitReason } from './types';
import { evaluateSignal } from './signal-evaluator';

/**
 * 포지션의 청산 조건을 평가합니다.
 * @param position 현재 포지션
 * @param currentPrice 현재가
 * @param settings 전략 설정
 * @param market 시장 (US | KR)
 * @returns 청산 평가 결과
 */
export async function evaluateExit(
  position: SignalTradePosition,
  currentPrice: number,
  settings: SignalTradeSettings,
  market: 'US' | 'KR'
): Promise<ExitResult> {
  // 현재 손익률 계산
  const currentPnL = ((currentPrice - position.entry_price) / position.entry_price) * 100;

  // 1. 목표 수익률 도달 체크
  if (settings.take_profit_pct !== null && currentPnL >= settings.take_profit_pct) {
    return {
      shouldExit: true,
      reason: 'take_profit',
      currentPnL,
    };
  }

  // 2. 손절선 도달 체크
  if (settings.stop_loss_pct !== null && currentPnL <= settings.stop_loss_pct) {
    return {
      shouldExit: true,
      reason: 'stop_loss',
      currentPnL,
    };
  }

  // 3. 최대 보유일 초과 체크
  if (settings.max_hold_days !== null) {
    const entryDate = new Date(position.entry_date);
    const today = new Date();
    const holdDays = Math.floor((today.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));

    if (holdDays >= settings.max_hold_days) {
      return {
        shouldExit: true,
        reason: 'max_hold',
        currentPnL,
      };
    }
  }

  // 4. 신호 소멸 체크 (옵션 활성화 시)
  if (settings.exit_on_signal_loss) {
    const signal = await evaluateSignal(
      settings.strategy_type,
      position.symbol,
      market,
      settings.min_sync_rate
    );

    if (!signal.isActive) {
      return {
        shouldExit: true,
        reason: 'signal_loss',
        currentPnL,
      };
    }
  }

  // 청산 조건 없음
  return {
    shouldExit: false,
    reason: null,
    currentPnL,
  };
}

/**
 * 포지션의 현재 손익률을 계산합니다.
 */
export function calculatePnL(entryPrice: number, currentPrice: number): number {
  if (entryPrice <= 0) return 0;
  return ((currentPrice - entryPrice) / entryPrice) * 100;
}

/**
 * 포지션의 보유 일수를 계산합니다.
 */
export function calculateHoldDays(entryDate: string): number {
  const entry = new Date(entryDate);
  const today = new Date();
  return Math.floor((today.getTime() - entry.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * 청산 사유를 한글로 변환합니다.
 */
export function getExitReasonLabel(reason: ExitReason): string {
  switch (reason) {
    case 'take_profit':
      return '목표수익 달성';
    case 'stop_loss':
      return '손절';
    case 'max_hold':
      return '보유기간 초과';
    case 'signal_loss':
      return '신호 소멸';
    case 'manual':
      return '수동 청산';
    default:
      return reason;
  }
}
