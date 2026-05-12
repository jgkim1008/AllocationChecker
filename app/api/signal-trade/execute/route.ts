/**
 * 신호 전략 자동매매 실행 API
 *
 * POST: 신호 전략 자동매매 실행 (cron에서 호출)
 * - 활성화된 설정 조회
 * - 오픈 포지션 청산 조건 체크
 * - 신규 진입 신호 체크
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getBrokerClient } from '@/lib/broker/session';
import { evaluateSignal, getCurrentPrice } from '@/lib/signal-trade/signal-evaluator';
import { evaluateExit, calculatePnL } from '@/lib/signal-trade/exit-evaluator';
import type { SignalTradeSettings, SignalTradePosition, SignalStrategyType } from '@/lib/signal-trade/types';
import type { BrokerType, MarketType } from '@/lib/broker/types';
import { KISClient } from '@/lib/broker/kis';

const CRON_SECRET = process.env.CRON_SECRET;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// 텔레그램 메시지 전송
async function sendTelegramMessage(chatId: number | string, text: string) {
  if (!TELEGRAM_BOT_TOKEN) return;

  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      }),
    });
  } catch (error) {
    console.error('Telegram send error:', error);
  }
}

// 시장 판별
function getMarket(symbol: string): MarketType {
  return symbol.endsWith('.KS') || symbol.endsWith('.KQ') || /^\d{6}$/.test(symbol) ? 'domestic' : 'overseas';
}

// MarketType을 'US' | 'KR'로 변환 (신호 평가용)
function toSignalMarket(market: MarketType): 'US' | 'KR' {
  return market === 'domestic' ? 'KR' : 'US';
}

// 전략명 한글 변환
function getStrategyName(type: SignalStrategyType): string {
  const names: Record<SignalStrategyType, string> = {
    'ma-alignment': '이평선 정배열',
    'inverse-alignment': '이평선 역배열',
    'dual-rsi': 'Dual RSI',
    'rsi-divergence': 'RSI 다이버전스',
    'fibonacci': '피보나치',
    'chart-pattern': '차트 패턴',
    'monthly-ma': '월봉 10이평',
    'forking': '월봉 포킹',
    'weekly-sr': '주봉 SR채널',
    'decline-box': '하락 박스',
    'inbum-bijag': '인범 빗각+구름대',
    'turtle-trading': '터틀 투자법',
    'infinite-buy': '무한매수법',
    // KIS Strategy Builder 전략
    'kis-golden-cross': '골든크로스',
    'kis-momentum': '모멘텀',
    'kis-week52-high': '52주 신고가',
    'kis-consecutive': '연속 상승',
    'kis-disparity': '이격도',
    'kis-breakout-fail': '돌파 실패',
    'kis-strong-close': '강한 종가',
    'kis-volatility': '변동성 확장',
    'kis-mean-reversion': '평균회귀',
    'kis-trend-filter': '추세 필터',
  };
  return names[type] || type;
}

export async function POST(request: NextRequest) {
  try {
    // Cron 인증
    const authHeader = request.headers.get('authorization');
    if (process.env.NODE_ENV === 'production' && CRON_SECRET) {
      if (authHeader !== `Bearer ${CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const serviceClient = await createServiceClient();

    // 1. 활성화된 신호 전략 설정 조회
    const { data: settings, error: settingsError } = await serviceClient
      .from('signal_trade_settings')
      .select('*')
      .eq('is_enabled', true);

    if (settingsError) {
      console.error('신호 전략 설정 조회 오류:', settingsError);
      return NextResponse.json({ error: '설정 조회 실패' }, { status: 500 });
    }

    if (!settings || settings.length === 0) {
      return NextResponse.json({
        success: true,
        message: '활성화된 신호 전략 설정이 없습니다.',
        data: { processed: 0, exits: 0, entries: 0 },
      });
    }

    const results: {
      settingId: string;
      userId: string;
      symbol: string;
      strategy: string;
      action: 'exit' | 'entry' | 'none';
      success: boolean;
      message: string;
    }[] = [];

    // 2. 각 설정에 대해 처리
    for (const setting of settings as SignalTradeSettings[]) {
      const { id: settingId, user_id, symbol, broker_type, strategy_type } = setting;
      const market = getMarket(symbol);

      try {
        // 브로커 연결
        const clientResult = await getBrokerClient(user_id, broker_type as BrokerType);
        if (!clientResult.success || !clientResult.client) {
          results.push({
            settingId,
            userId: user_id,
            symbol,
            strategy: getStrategyName(strategy_type),
            action: 'none',
            success: false,
            message: `브로커 연결 실패: ${clientResult.error}`,
          });
          continue;
        }

        // 현재가 조회
        const currentPrice = await getCurrentPrice(symbol, toSignalMarket(market));
        if (!currentPrice) {
          results.push({
            settingId,
            userId: user_id,
            symbol,
            strategy: getStrategyName(strategy_type),
            action: 'none',
            success: false,
            message: '현재가 조회 실패',
          });
          continue;
        }

        // 3. 오픈 포지션 청산 조건 체크
        const { data: openPositions } = await serviceClient
          .from('signal_trade_positions')
          .select('*')
          .eq('setting_id', settingId)
          .eq('status', 'open');

        for (const position of (openPositions || []) as SignalTradePosition[]) {
          const exitResult = await evaluateExit(position, currentPrice, setting, toSignalMarket(market));

          if (exitResult.shouldExit && exitResult.reason) {
            // 예약주문이 있으면 먼저 취소 (KIS 해외주식)
            if (position.auto_order_id && broker_type === 'kis' && market === 'overseas' && clientResult.client instanceof KISClient) {
              const kisClient = clientResult.client as KISClient;
              const cancelResult = await kisClient.cancelOverseasAutoOrder(position.auto_order_id, symbol);
              if (!cancelResult.success) {
                console.warn('예약주문 취소 실패:', cancelResult.error?.message);
              }
            }

            // 매도 주문 실행
            const orderResult = await clientResult.client.createOrder({
              symbol,
              side: 'sell',
              orderType: 'moc',  // 종가 주문
              quantity: position.shares,
              market,
            });

            if (orderResult.success) {
              // 포지션 업데이트
              const realizedPnL = (currentPrice - position.entry_price) * position.shares;
              await serviceClient
                .from('signal_trade_positions')
                .update({
                  status: 'closed',
                  exit_price: currentPrice,
                  exit_date: new Date().toISOString().split('T')[0],
                  exit_reason: exitResult.reason,
                  realized_pnl: realizedPnL,
                  realized_pnl_pct: exitResult.currentPnL,
                  auto_order_id: null,  // 예약주문 ID 초기화
                  updated_at: new Date().toISOString(),
                })
                .eq('id', position.id);

              results.push({
                settingId,
                userId: user_id,
                symbol,
                strategy: getStrategyName(strategy_type),
                action: 'exit',
                success: true,
                message: `청산 (${exitResult.reason}): ${exitResult.currentPnL.toFixed(2)}%`,
              });
            } else {
              results.push({
                settingId,
                userId: user_id,
                symbol,
                strategy: getStrategyName(strategy_type),
                action: 'exit',
                success: false,
                message: `청산 주문 실패: ${orderResult.error?.message}`,
              });
            }
          }
        }

        // 4. 신규 진입 체크 (오픈 포지션이 max_positions 미만일 때)
        const currentOpenCount = (openPositions || []).filter(p => (p as SignalTradePosition).status === 'open').length;

        if (currentOpenCount < setting.max_positions) {
          // 오늘 이미 진입했는지 확인
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);

          const { data: todayPositions } = await serviceClient
            .from('signal_trade_positions')
            .select('id')
            .eq('setting_id', settingId)
            .gte('entry_date', todayStart.toISOString().split('T')[0])
            .limit(1);

          if (todayPositions && todayPositions.length > 0) {
            // 오늘 이미 진입함, 스킵
            continue;
          }

          // 신호 평가
          const signal = await evaluateSignal(
            strategy_type,
            symbol,
            toSignalMarket(market),
            setting.min_sync_rate
          );

          if (signal.isActive) {
            // 매수 수량 계산
            const quantity = Math.floor(setting.investment_amount / currentPrice);

            if (quantity > 0) {
              // 매수 주문 실행
              const orderResult = await clientResult.client.createOrder({
                symbol,
                side: 'buy',
                orderType: 'moc',  // 종가 주문
                quantity,
                market,
              });

              if (orderResult.success) {
                let autoOrderId: string | null = null;

                // 해외주식이고 KIS인 경우, 익절/손절 예약주문 등록
                if (market === 'overseas' && broker_type === 'kis' && clientResult.client instanceof KISClient) {
                  const kisClient = clientResult.client as KISClient;

                  // 익절/손절 가격 계산
                  const takeProfitPrice = setting.take_profit_pct
                    ? currentPrice * (1 + setting.take_profit_pct / 100)
                    : undefined;
                  const stopLossPrice = setting.stop_loss_pct
                    ? currentPrice * (1 + setting.stop_loss_pct / 100)  // stop_loss_pct는 음수로 저장됨
                    : undefined;

                  // 익절 또는 손절 설정이 있을 때만 예약주문 등록
                  if (takeProfitPrice || stopLossPrice) {
                    // 유효기간: max_hold_days 또는 30일 (최대)
                    const holdDays = Math.min(setting.max_hold_days || 30, 30);
                    const expirationDate = new Date();
                    expirationDate.setDate(expirationDate.getDate() + holdDays);
                    const expDateStr = expirationDate.toISOString().split('T')[0].replace(/-/g, '');

                    const autoOrderResult = await kisClient.createOverseasAutoOrder({
                      symbol,
                      side: 'sell',  // 보유 후 매도 예약
                      quantity,
                      takeProfitPrice,
                      stopLossPrice,
                      expirationDate: expDateStr,
                    });

                    if (autoOrderResult.success && autoOrderResult.data) {
                      autoOrderId = autoOrderResult.data.reservationId;
                    } else {
                      console.warn('예약주문 등록 실패:', autoOrderResult.error?.message);
                    }
                  }
                }

                // 포지션 생성
                await serviceClient
                  .from('signal_trade_positions')
                  .insert({
                    setting_id: settingId,
                    user_id,
                    symbol,
                    broker_type,
                    entry_price: currentPrice,
                    shares: quantity,
                    entry_date: new Date().toISOString().split('T')[0],
                    entry_signal_type: strategy_type,
                    entry_sync_rate: signal.syncRate,
                    status: 'open',
                    auto_order_id: autoOrderId,
                  });

                const autoOrderMsg = autoOrderId ? ` [예약주문: ${autoOrderId}]` : '';
                results.push({
                  settingId,
                  userId: user_id,
                  symbol,
                  strategy: getStrategyName(strategy_type),
                  action: 'entry',
                  success: true,
                  message: `진입: ${quantity}주 @ $${currentPrice.toFixed(2)} (싱크${signal.syncRate}%)${autoOrderMsg}`,
                });
              } else {
                results.push({
                  settingId,
                  userId: user_id,
                  symbol,
                  strategy: getStrategyName(strategy_type),
                  action: 'entry',
                  success: false,
                  message: `매수 주문 실패: ${orderResult.error?.message}`,
                });
              }
            }
          }
        }

      } catch (error) {
        console.error(`신호 전략 실행 오류: ${symbol}`, error);
        results.push({
          settingId,
          userId: user_id,
          symbol,
          strategy: getStrategyName(strategy_type),
          action: 'none',
          success: false,
          message: `실행 오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
        });
      }
    }

    // 5. 텔레그램 알림
    const actionResults = results.filter(r => r.action !== 'none');
    if (actionResults.length > 0) {
      const { data: subscribers } = await serviceClient
        .from('telegram_subscribers')
        .select('chat_id');

      if (subscribers && subscribers.length > 0) {
        let alertText = `📊 <b>신호 전략 자동매매 실행</b>\n`;
        alertText += `━━━━━━━━━━━━━━━\n`;

        for (const r of actionResults) {
          const emoji = r.action === 'entry' ? '🟢' : '🔴';
          const status = r.success ? '✅' : '❌';
          alertText += `${emoji} <b>${r.symbol}</b> [${r.strategy}]\n`;
          alertText += `   ${status} ${r.message}\n`;
        }

        for (const sub of subscribers) {
          await sendTelegramMessage(sub.chat_id, alertText);
        }
      }
    }

    const exits = results.filter(r => r.action === 'exit' && r.success).length;
    const entries = results.filter(r => r.action === 'entry' && r.success).length;

    return NextResponse.json({
      success: true,
      message: `${settings.length}개 설정 처리 완료`,
      data: {
        processed: settings.length,
        exits,
        entries,
        results,
      },
    });
  } catch (error) {
    console.error('신호 전략 Cron 오류:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
