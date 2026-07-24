/**
 * 무한매수법 자동매매 스케줄러 (Vercel Cron)
 *
 * GET: Cron에서 호출 - 자동매매 설정된 종목의 LOC 주문 자동 실행
 * - 미국장 시작 시간 (한국시간 22:35 또는 23:35)에 실행
 * - 트래커 데이터 조회 → 주문 계산 → 주문 실행 → 텔레그램 알림
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getBrokerClient, getBrokerClientByCredentialId } from '@/lib/broker/session';
import { buildLiveOrders, type LiveStrategyConfig } from '@/lib/infinite-buy/broker/order-builder';
import type { StrategyVersion, MarketType } from '@/lib/infinite-buy/core/types';

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

// 트래커에서 포지션 조회
async function getTrackerPosition(userId: string, symbol: string) {
  const serviceClient = await createServiceClient();

  // 매수 기록 조회 (user_id 일치 또는 user_id=null 레거시 레코드 포함)
  const { data: buyRecords } = await serviceClient
    .from('infinite_buy_records')
    .select('*')
    .eq('symbol', symbol.toUpperCase())
    .or(`user_id.eq.${userId},user_id.is.null`);

  if (!buyRecords || buyRecords.length === 0) return null;

  // 매도 기록 조회 (user_id 일치 또는 user_id=null 레거시 레코드 포함)
  const { data: sellRecords } = await serviceClient
    .from('infinite_sell_records')
    .select('*')
    .eq('symbol', symbol.toUpperCase())
    .or(`user_id.eq.${userId},user_id.is.null`);

  const buyShares = buyRecords.reduce((sum, r) => sum + (r.shares || 0), 0);
  const buyInvested = buyRecords.reduce((sum, r) => sum + (r.amount || 0), 0);
  const capital = buyRecords[0]?.capital || 0;

  const soldShares = (sellRecords || []).reduce((sum, r) => sum + (r.shares || 0), 0);
  const remainingShares = buyShares - soldShares;

  if (remainingShares <= 0) return null;

  const avgCost = buyShares > 0 ? buyInvested / buyShares : 0;
  return {
    shares: remainingShares,
    invested: remainingShares * avgCost,
    avgCost,
    capital,
  };
}

export async function GET(request: NextRequest) {
  try {
    // Cron 인증
    const authHeader = request.headers.get('authorization');
    if (process.env.NODE_ENV === 'production' && CRON_SECRET) {
      if (authHeader !== `Bearer ${CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const serviceClient = await createServiceClient();

    // 활성화된 자동매매 설정 조회
    const { data: settings, error: settingsError } = await serviceClient
      .from('auto_trade_settings')
      .select('*')
      .eq('is_enabled', true);

    if (settingsError) {
      console.error('자동매매 설정 조회 오류:', settingsError);
      return NextResponse.json({ error: '설정 조회 실패' }, { status: 500 });
    }

    if (!settings || settings.length === 0) {
      return NextResponse.json({
        success: true,
        message: '활성화된 자동매매 설정이 없습니다.',
        data: { processed: 0 },
      });
    }

    const results: {
      userId: string;
      symbol: string;
      success: boolean;
      message: string;
      orders?: { buy: number; sell: number };
      errors?: string[];
    }[] = [];

    // 각 설정에 대해 주문 실행
    for (const setting of settings) {
      const { user_id, symbol, broker_type, broker_credential_id, strategy_version, total_capital } = setting;
      const tradeMode = (setting as { trade_mode?: string }).trade_mode ?? 'real';

      try {
        // 1. 브로커 연결 확인 (credential_id 우선, fallback: broker_type)
        const clientResult = broker_credential_id
          ? await getBrokerClientByCredentialId(broker_credential_id)
          : await getBrokerClient(user_id, broker_type, { skipBlockCheck: true });
        if (!clientResult.success || !clientResult.client) {
          results.push({
            userId: user_id,
            symbol,
            success: false,
            message: `브로커 연결 실패: ${clientResult.error}`,
          });
          continue;
        }

        // 2. 브로커 잔고·포지션 조회 (실제 모드 포지션 계산 + 주문 실행 시 재사용)
        const [balanceResult, positionsResult] = await Promise.all([
          clientResult.client.getBalance(),
          clientResult.client.getPositions(),
        ]);
        const availableCash = balanceResult.success ? (balanceResult.data?.totalDeposit ?? 0) : 0;
        const brokerPosition = (positionsResult.data ?? []).find(
          p => p.symbol.toUpperCase() === symbol.toUpperCase()
        );

        // 3. 트래커 포지션 조회 (가상 모드 또는 실제 모드 fallback)
        const trackerPosition = await getTrackerPosition(user_id, symbol);

        // 4. 현재가 조회
        const quoteResult = await clientResult.client.getQuote(symbol);
        if (!quoteResult.success || !quoteResult.data) {
          results.push({
            userId: user_id,
            symbol,
            success: false,
            message: `시세 조회 실패: ${quoteResult.error?.message}`,
          });
          continue;
        }

        const currentPrice = quoteResult.data.currentPrice;
        const market: MarketType = /^\d{6}$/.test(symbol) ? 'domestic' : 'overseas';
        const version = (strategy_version || 'v3.0').toLowerCase() as StrategyVersion;
        const divisions = version === 'v3.0' ? 20 : 40;

        // capital은 항상 settings 기준 (트래커 레코드의 capital은 과거 값일 수 있음)
        const capital = total_capital;
        const unitBuy = capital / divisions;

        // 실제 모드: 브로커 포지션 기준 / 가상 모드: 트래커 기준
        let currentShares: number;
        let currentInvested: number;
        if (tradeMode === 'real' && brokerPosition) {
          currentShares = brokerPosition.quantity;
          currentInvested = brokerPosition.quantity * brokerPosition.avgPrice;
        } else {
          currentShares = trackerPosition?.shares || 0;
          currentInvested = trackerPosition?.invested || 0;
        }

        const currentT = currentInvested > 0 ? Math.ceil((currentInvested / unitBuy) * 100) / 100 : 0;

        // 5. 주문 계산
        const config: LiveStrategyConfig = {
          version,
          ticker: symbol,
          principal: capital,
          divisions,
          market,
          currentShares,
          currentInvested,
          currentT,
          currentCash: capital - currentInvested,
        };

        const liveOrders = buildLiveOrders(config, currentPrice);

        // 참고용 주문 제외
        const executableBuys = liveOrders.buyOrders.filter(o => !o.isReference && o.quantity > 0);
        const executableSells = liveOrders.sellOrders.filter(o => !o.isReference && o.quantity > 0);

        if (executableBuys.length === 0 && executableSells.length === 0) {
          results.push({
            userId: user_id,
            symbol,
            success: true,
            message: '실행할 주문 없음 (수량 부족 또는 분할 소진)',
            orders: { buy: 0, sell: 0 },
          });
          continue;
        }

        // 6. 오늘 이미 주문했는지 확인
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const { data: todayOrders } = await serviceClient
          .from('pending_orders')
          .select('side, status')
          .eq('user_id', user_id)
          .eq('symbol', symbol.toUpperCase())
          .in('status', ['submitted', 'partial', 'filled'])
          .gte('order_time', todayStart.toISOString());

        const todayBuyExists = (todayOrders ?? []).some(o => o.side === 'buy');
        const todaySellExists = (todayOrders ?? []).some(o => o.side === 'sell');

        // 스마트 스킵: 오늘 매수 + 매도 모두 filled >= 예상 수면 LOC 주문 안 함
        if ((setting as { smart_skip_loc?: boolean }).smart_skip_loc) {
          const filledTodayBuys = (todayOrders ?? []).filter(o => o.side === 'buy' && o.status === 'filled').length;
          const filledTodaySells = (todayOrders ?? []).filter(o => o.side === 'sell' && o.status === 'filled').length;
          // 전반전: 2주문/일 (별지점+평단 절반씩), 후반전: 1주문/일
          const expectedDailyBuys = currentT < divisions / 2 ? 2 : 1;
          const expectedDailySells = executableSells.length; // 현재 포지션 기준 매도 주문 수
          const buysFulfilled = filledTodayBuys >= expectedDailyBuys;
          const sellsFulfilled = expectedDailySells === 0 || filledTodaySells >= expectedDailySells;
          if (buysFulfilled && sellsFulfilled) {
            results.push({
              userId: user_id,
              symbol,
              success: true,
              message: `Smart Skip: 매수 ${filledTodayBuys}/${expectedDailyBuys}건 · 매도 ${filledTodaySells}/${expectedDailySells}건 체결 — LOC 주문 생략`,
              orders: { buy: 0, sell: 0 },
            });
            continue;
          }
        }

        // 중복 주문 필터링
        const ordersToExecute = [
          ...(todayBuyExists ? [] : executableBuys),
          ...(todaySellExists ? [] : executableSells),
        ];

        if (ordersToExecute.length === 0) {
          results.push({
            userId: user_id,
            symbol,
            success: true,
            message: '오늘 이미 주문 제출됨 (중복 방지)',
            orders: { buy: 0, sell: 0 },
          });
          continue;
        }

        // 7. 주문 실행
        let successCount = 0;
        let failCount = 0;
        const orderResults: { orderId?: string; side: string; error?: string }[] = [];

        // 매도 가능 수량 추적 (복수 매도 주문 합계가 보유 수량 초과 방지)
        const sellableQtyMap = new Map<string, number>();
        for (const pos of positionsResult.data ?? []) {
          sellableQtyMap.set(pos.symbol.toUpperCase(), pos.quantity);
        }

        for (const order of ordersToExecute) {
          let actualQty = order.quantity;

          if (order.side === 'sell') {
            const remaining = sellableQtyMap.get(order.symbol.toUpperCase()) ?? 0;
            if (remaining <= 0) {
              orderResults.push({ side: order.side, error: '보유 잔고 없음 - 매도 스킵' });
              continue;
            }
            // 남은 수량만큼만 매도
            actualQty = Math.min(order.quantity, remaining);
            sellableQtyMap.set(order.symbol.toUpperCase(), remaining - actualQty);
          }

          if (order.side === 'buy') {
            const orderAmount = order.price * actualQty;
            if (availableCash > 0 && orderAmount > availableCash) {
              orderResults.push({ side: order.side, error: `잔고 부족 (필요: ${orderAmount.toFixed(0)}, 가능: ${availableCash.toFixed(0)}) - 매수 스킵` });
              continue;
            }
          }

          const orderResult = await clientResult.client.createOrder({
            symbol: order.symbol,
            side: order.side,
            orderType: order.orderType,
            quantity: actualQty,
            price: order.price,
            market: order.market,
          });

          if (orderResult.success) {
            successCount++;
            orderResults.push({ orderId: orderResult.data?.orderId, side: order.side });

            // pending_orders에 저장
            await serviceClient.from('pending_orders').insert({
              user_id,
              broker_type,
              broker_order_id: orderResult.data?.orderId,
              symbol: order.symbol,
              market,
              side: order.side,
              order_type: order.orderType,
              order_quantity: actualQty,
              order_price: order.price,
              status: 'submitted',
              strategy_version: version.toUpperCase(),
              capital,
              reason: order.reason,
              order_time: new Date().toISOString(),
            });
          } else {
            failCount++;
            orderResults.push({ side: order.side, error: orderResult.error?.message });
          }
        }

        results.push({
          userId: user_id,
          symbol,
          success: failCount === 0,
          message: `${successCount}건 성공, ${failCount}건 실패`,
          orders: {
            buy: orderResults.filter(r => r.side === 'buy' && !r.error).length,
            sell: orderResults.filter(r => r.side === 'sell' && !r.error).length,
          },
          errors: orderResults.filter(r => r.error).map(r => `${r.side}: ${r.error}`),
        });

      } catch (error) {
        console.error(`자동매매 실행 오류: ${symbol}`, error);
        results.push({
          userId: user_id,
          symbol,
          success: false,
          message: `실행 오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
        });
      }
    }

    // 7. 텔레그램 알림 (사용자별로 발송)
    if (results.length > 0) {
      // 오늘 DCA 해외 주문 조회 (22:30 cron이 제출한 것)
      const todayUtcStart = new Date();
      todayUtcStart.setUTCHours(0, 0, 0, 0);
      const { data: dcaOverseasOrders } = await serviceClient
        .from('pending_orders')
        .select('user_id, symbol, side, order_quantity, order_price, status, order_type')
        .eq('market', 'overseas')
        .eq('strategy_version', 'dca')
        .gte('order_time', todayUtcStart.toISOString());

      // 사용자별로 그룹화
      const resultsByUser = new Map<string, typeof results>();
      for (const r of results) {
        const list = resultsByUser.get(r.userId) ?? [];
        list.push(r);
        resultsByUser.set(r.userId, list);
      }

      for (const [userId, userResults] of resultsByUser) {
        const { data: subscribers } = await serviceClient
          .from('telegram_subscribers')
          .select('chat_id')
          .eq('is_active', true)
          .eq('user_id', userId);

        if (!subscribers || subscribers.length === 0) continue;

        let alertText = `🤖 <b>무한매수법 자동매매 실행</b>\n`;
        alertText += `━━━━━━━━━━━━━━━\n`;

        for (const r of userResults) {
          const emoji = r.success ? '✅' : '❌';
          alertText += `${emoji} <b>${r.symbol}</b>: ${r.message}\n`;
          if (r.orders) {
            alertText += `   매수 ${r.orders.buy}건 / 매도 ${r.orders.sell}건\n`;
          }
          if (r.errors && r.errors.length > 0) {
            alertText += `   ⚠️ ${r.errors.join(', ')}\n`;
          }
        }

        // DCA 해외 주문 현황 섹션
        const userDcaOrders = (dcaOverseasOrders ?? []).filter(o => o.user_id === userId);
        if (userDcaOrders.length > 0) {
          alertText += `\n📈 <b>DCA 해외 주문</b>\n`;
          for (const o of userDcaOrders) {
            const typeLabel = o.order_type === 'loc' ? 'LOC' : `$${Number(o.order_price).toFixed(2)}`;
            const statusEmoji = o.status === 'filled' ? '✅' : o.status === 'submitted' ? '⏳' : '❌';
            alertText += `${statusEmoji} <b>${o.symbol}</b> ${o.order_quantity}주 @ ${typeLabel}\n`;
          }
        }

        for (const sub of subscribers) {
          await sendTelegramMessage(sub.chat_id, alertText);
        }
      }
    }

    // 8. 신호 전략 자동매매 실행
    let signalTradeResults = null;
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const signalResponse = await fetch(`${baseUrl}/api/signal-trade/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${CRON_SECRET}`,
        },
      });

      if (signalResponse.ok) {
        const signalData = await signalResponse.json();
        signalTradeResults = signalData.data;
      }
    } catch (signalError) {
      console.error('신호 전략 실행 오류:', signalError);
    }

    // 9. MA 계단식 자동매수 실행
    let maLadderResults = null;
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const maLadderResponse = await fetch(`${baseUrl}/api/signal-trade/ma-ladder/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${CRON_SECRET}`,
        },
      });

      if (maLadderResponse.ok) {
        const maLadderData = await maLadderResponse.json();
        maLadderResults = maLadderData.results;
      }
    } catch (maLadderError) {
      console.error('MA 계단식 실행 오류:', maLadderError);
    }

    return NextResponse.json({
      success: true,
      message: `${results.length}개 설정 처리 완료`,
      data: {
        processed: results.length,
        results,
        signalTrade: signalTradeResults,
        maLadder: maLadderResults,
      },
    });
  } catch (error) {
    console.error('자동매매 Cron 오류:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
