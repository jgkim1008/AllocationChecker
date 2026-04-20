/**
 * DCA 전략 아침 cron
 *
 * 전일 종가 기준 threshold1%, threshold2% 가격으로 지정가 주문 2개 제출
 * - 미국 해외: KST 10:30 (UTC 01:30) - schedule: "30 1 * * 1-5"
 * - 국내: KST 09:10 (UTC 00:10) - schedule: "10 0 * * 1-5"
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getBrokerClientByCredentialId } from '@/lib/broker/session';
import type { MarketType } from '@/lib/broker/types';

const CRON_SECRET = process.env.CRON_SECRET;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function sendTelegramMessage(chatId: number | string, text: string) {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
  } catch {}
}

// 지정가 가격 계산 (소수점 처리)
function calcLimitPrice(basePrice: number, pct: number, market: MarketType): number {
  const raw = basePrice * (1 + pct / 100);
  if (market === 'overseas') {
    return Math.floor(raw * 100) / 100; // $0.01 단위 내림
  }
  // 국내: 호가 단위 내림
  if (raw >= 500000) return Math.floor(raw / 1000) * 1000;
  if (raw >= 100000) return Math.floor(raw / 500) * 500;
  if (raw >= 50000) return Math.floor(raw / 100) * 100;
  if (raw >= 10000) return Math.floor(raw / 50) * 50;
  if (raw >= 1000) return Math.floor(raw / 10) * 10;
  return Math.floor(raw / 5) * 5;
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (process.env.NODE_ENV === 'production' && CRON_SECRET) {
      if (authHeader !== `Bearer ${CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const { searchParams } = new URL(request.url);
    const market = (searchParams.get('market') || 'overseas') as MarketType;

    const serviceClient = await createServiceClient();

    // 활성화된 DCA 설정 조회 (broker_credentials 조인)
    const { data: settings, error } = await serviceClient
      .from('dca_settings')
      .select('*, broker_credentials(id, broker_type, account_alias)')
      .eq('is_enabled', true)
      .eq('market', market);

    if (error) return NextResponse.json({ error: '설정 조회 실패' }, { status: 500 });
    if (!settings || settings.length === 0) {
      return NextResponse.json({ success: true, message: '활성화된 DCA 설정 없음', data: { processed: 0 } });
    }

    const results: { user_id: string; symbol: string; success: boolean; message: string }[] = [];

    for (const setting of settings) {
      const { user_id, symbol, broker_type, broker_credential_id, daily_quantity, threshold1_pct, threshold2_pct, order_mode } = setting;

      // LOC 전용 모드는 morning cron 스킵 (preclose cron에서 처리)
      if (order_mode === 'loc_only') {
        results.push({ user_id, symbol, success: true, message: 'LOC 전용 모드 — preclose cron에서 처리' });
        continue;
      }

      try {
        // 브로커 연결 (credential_id 우선, fallback: broker_type)
        const clientResult = broker_credential_id
          ? await getBrokerClientByCredentialId(broker_credential_id)
          : await (await import('@/lib/broker/session')).getBrokerClient(user_id, broker_type, { skipBlockCheck: true });
        if (!clientResult.success || !clientResult.client) {
          results.push({ user_id, symbol, success: false, message: `브로커 연결 실패: ${clientResult.error}` });
          continue;
        }

        // 시세 조회 (전일 종가 필요)
        const quoteResult = await clientResult.client.getQuote(symbol);
        if (!quoteResult.success || !quoteResult.data) {
          results.push({ user_id, symbol, success: false, message: `시세 조회 실패: ${quoteResult.error?.message}` });
          continue;
        }

        const previousClose = quoteResult.data.prevClose || quoteResult.data.currentPrice;

        // 오늘 이미 DCA 주문 있는지 확인 (중복 방지)
        const todayStart = new Date();
        todayStart.setUTCHours(0, 0, 0, 0);
        const { data: todayOrders } = await serviceClient
          .from('pending_orders')
          .select('id')
          .eq('user_id', user_id)
          .eq('symbol', symbol.toUpperCase())
          .eq('strategy_version', 'dca')
          .in('status', ['submitted', 'partial', 'filled'])
          .gte('order_time', todayStart.toISOString());

        if (todayOrders && todayOrders.length > 0) {
          results.push({ user_id, symbol, success: false, message: '오늘 이미 DCA 주문 존재 (중복 방지)' });
          continue;
        }

        // 지정가 계산
        const price1 = calcLimitPrice(previousClose, threshold1_pct, market);
        const price2 = calcLimitPrice(previousClose, threshold2_pct, market);
        const totalQty = Number(daily_quantity);
        // daily_quantity를 1차/2차에 균등 분배 (홀수면 1차에 1주 더)
        const qty1 = Math.ceil(totalQty / 2);
        const qty2 = Math.floor(totalQty / 2);

        const orders = [
          { price: price1, pct: threshold1_pct, qty: qty1 },
          { price: price2, pct: threshold2_pct, qty: qty2 },
        ];

        const submittedOrders: { broker_order_id: string; price: number; pct: number; qty: number }[] = [];
        const orderErrors: string[] = [];

        for (const o of orders) {
          if (o.qty <= 0) continue;
          const orderResult = await clientResult.client.createOrder({
            symbol,
            side: 'buy',
            orderType: 'limit',
            quantity: o.qty,
            price: o.price,
            market,
          });

          if (orderResult.success && orderResult.data?.orderId) {
            submittedOrders.push({ broker_order_id: orderResult.data.orderId, price: o.price, pct: o.pct, qty: o.qty });
          } else {
            const errMsg = orderResult.error?.message || JSON.stringify(orderResult.error) || '알 수 없는 오류';
            orderErrors.push(`${o.pct}%: ${errMsg}`);
            console.error(`DCA 지정가 주문 실패: ${symbol} ${o.pct}%`, orderResult.error);
          }
        }

        if (submittedOrders.length > 0) {
          await serviceClient.from('pending_orders').insert(
            submittedOrders.map(o => ({
              user_id,
              broker_type,
              broker_credential_id: broker_credential_id || null,
              broker_order_id: o.broker_order_id,
              symbol: symbol.toUpperCase(),
              market,
              side: 'buy',
              order_type: 'limit',
              order_quantity: o.qty,
              order_price: o.price,
              status: 'submitted',
              strategy_version: 'dca',
              reason: `DCA limit ${o.pct}%`,
              order_time: new Date().toISOString(),
            }))
          );
        }

        const errorSuffix = orderErrors.length > 0 ? ` | 실패: ${orderErrors.join(', ')}` : '';
        results.push({
          user_id,
          symbol,
          success: submittedOrders.length > 0,
          message: `지정가 주문 ${submittedOrders.length}건 제출 (기준가: ${previousClose})${errorSuffix}`,
        });
      } catch (err) {
        results.push({ user_id, symbol, success: false, message: `오류: ${err}` });
      }
    }

    // 텔레그램 알림 (사용자별로 발송)
    const successCount = results.filter(r => r.success).length;
    if (TELEGRAM_BOT_TOKEN) {
      // 사용자별로 결과 그룹화
      const byUser = new Map<string, typeof results>();
      for (const r of results) {
        const list = byUser.get(r.user_id) ?? [];
        list.push(r);
        byUser.set(r.user_id, list);
      }

      for (const [userId, userResults] of byUser) {
        const { data: subscribers } = await serviceClient
          .from('telegram_subscribers')
          .select('chat_id')
          .eq('is_active', true)
          .eq('user_id', userId);

        if (!subscribers || subscribers.length === 0) continue;

        const userSuccessCount = userResults.filter(r => r.success).length;
        const summary = userResults.map(r => `${r.success ? '✅' : '❌'} ${r.symbol}: ${r.message}`).join('\n');
        const msg = `🌅 <b>DCA 지정가 주문</b>\n${summary}\n\n총 ${userSuccessCount}/${userResults.length}건 제출`;

        for (const sub of subscribers) {
          await sendTelegramMessage(sub.chat_id, msg);
        }
      }
    }

    return NextResponse.json({ success: true, data: { processed: results.length, succeeded: successCount, results } });
  } catch (err) {
    console.error('DCA morning cron 오류:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
