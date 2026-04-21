/**
 * DCA 전략 장마감 전 cron - LOC 폴백
 *
 * 오늘 제출된 지정가 주문 중 미체결 수만큼 LOC 주문 제출
 * - 미국 해외 서머타임:  KST 04:30 (UTC 19:30 전날) - schedule: "30 19 * * 0-4"
 * - 미국 해외 비서머타임: KST 05:30 (UTC 20:30 전날) - schedule: "30 20 * * 0-4"
 *   → 두 일정 모두 등록 후, 이미 LOC 제출 완료된 경우 스킵
 * - 국내: KST 15:20 (UTC 06:20) - schedule: "20 6 * * 1-5"
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getBrokerClientByCredentialId, getBrokerClient } from '@/lib/broker/session';
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

    // 활성화된 DCA 설정 조회
    const { data: settings } = await serviceClient
      .from('dca_settings')
      .select('*, broker_credentials(id, broker_type, account_alias)')
      .eq('is_enabled', true)
      .eq('market', market);

    if (!settings || settings.length === 0) {
      return NextResponse.json({ success: true, message: '활성화된 DCA 설정 없음' });
    }

    // 오늘 날짜 범위 (UTC 기준)
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    // 서머타임 대응: 미국장 마감 이전 시간대에 cron이 두 번 돌 수 있으므로
    // 이미 LOC 주문이 오늘 제출된 종목은 스킵
    // 국내장의 경우 오늘 KST 기준이므로 UTC 전날 15:00 이후도 포함
    const rangeStart = market === 'domestic'
      ? new Date(todayStart.getTime() - 9 * 60 * 60 * 1000) // KST 자정 = UTC -9h
      : todayStart;

    const results: { user_id: string; symbol: string; success: boolean; message: string }[] = [];

    for (const setting of settings) {
      const { user_id, symbol, broker_type, broker_credential_id, daily_quantity, order_mode } = setting;

      try {
        // LOC 전용 모드: 지정가 체크 없이 바로 LOC 주문
        if (order_mode === 'loc_only') {
          const clientResult = broker_credential_id
            ? await getBrokerClientByCredentialId(broker_credential_id)
            : await getBrokerClient(user_id, broker_type, { skipBlockCheck: true });
          if (!clientResult.success || !clientResult.client) {
            results.push({ user_id, symbol, success: false, message: `브로커 연결 실패 (LOC 전용)` });
            continue;
          }

          // 오늘 이미 LOC 주문이 있으면 스킵
          const { data: todayLoc } = await serviceClient
            .from('pending_orders')
            .select('id')
            .eq('user_id', user_id)
            .eq('symbol', symbol.toUpperCase())
            .eq('strategy_version', 'dca')
            .eq('order_type', 'loc')
            .gte('order_time', rangeStart.toISOString());

          if (todayLoc && todayLoc.length > 0) {
            results.push({ user_id, symbol, success: false, message: 'LOC 전용 — 오늘 이미 제출됨 (스킵)' });
            continue;
          }

          // 국내 LOC(장후시간외)는 가격 0, 해외 LOC는 현재가 필요
          let locPrice = 0;
          if (market === 'overseas') {
            const quoteResult = await clientResult.client.getQuote(symbol);
            locPrice = quoteResult.success ? quoteResult.data!.currentPrice : 0;
          }
          const qty = Number(daily_quantity);

          const orderResult = await clientResult.client.createOrder({
            symbol, side: 'buy', orderType: 'loc', quantity: qty, price: locPrice, market,
          });

          if (orderResult.success && orderResult.data?.orderId) {
            await serviceClient.from('pending_orders').insert({
              user_id, broker_type,
              broker_credential_id: broker_credential_id || null,
              broker_order_id: orderResult.data.orderId,
              symbol: symbol.toUpperCase(), market, side: 'buy',
              order_type: 'loc', order_quantity: qty, order_price: locPrice,
              status: 'submitted', strategy_version: 'dca',
              reason: 'DCA LOC 전용', order_time: new Date().toISOString(),
            });
            results.push({ user_id, symbol, success: true, message: `LOC 전용 ${qty}주 제출` });
          } else {
            results.push({ user_id, symbol, success: false, message: 'LOC 주문 실패' });
          }
          continue;
        }

        // 이하 기존 threshold 모드 처리
        // 오늘 DCA 주문 조회
        const { data: todayOrders } = await serviceClient
          .from('pending_orders')
          .select('id, broker_order_id, status, order_type, reason, order_quantity')
          .eq('user_id', user_id)
          .eq('symbol', symbol.toUpperCase())
          .eq('strategy_version', 'dca')
          .gte('order_time', rangeStart.toISOString());

        if (!todayOrders || todayOrders.length === 0) {
          results.push({ user_id, symbol, success: false, message: '오늘 DCA 지정가 주문 없음 (morning cron 미실행?)' });
          continue;
        }

        // 이미 LOC 폴백 주문이 제출된 경우 스킵 (중복 방지)
        const locAlreadySubmitted = todayOrders.some(
          o => o.order_type === 'loc' && ['submitted', 'partial', 'filled'].includes(o.status)
        );
        if (locAlreadySubmitted) {
          results.push({ user_id, symbol, success: false, message: 'LOC 폴백 이미 제출됨 (스킵)' });
          continue;
        }

        // 브로커 연결 (credential_id 우선, fallback: broker_type)
        const clientResult = broker_credential_id
          ? await getBrokerClientByCredentialId(broker_credential_id)
          : await getBrokerClient(user_id, broker_type, { skipBlockCheck: true });
        if (!clientResult.success || !clientResult.client) {
          results.push({ user_id, symbol, success: false, message: `브로커 연결 실패: ${clientResult.error}` });
          continue;
        }

        // 지정가 주문별 실시간 체결 상태 확인 (DB status는 check-fills 전이라 부정확)
        const limitOrders = todayOrders.filter(o => o.order_type === 'limit');
        let filledCount = 0;

        for (const order of limitOrders) {
          try {
            const orderResult = await clientResult.client.getOrder((order as any).broker_order_id);
            const brokerStatus = orderResult.success ? orderResult.data?.status : null;

            if (brokerStatus === 'filled') {
              filledCount++;
              // DB도 동기화
              await serviceClient.from('pending_orders').update({
                status: 'filled',
                filled_quantity: orderResult.data?.filledQuantity,
                filled_price: orderResult.data?.filledPrice,
                filled_amount: orderResult.data?.filledAmount,
                filled_time: orderResult.data?.filledTime?.toISOString() || new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }).eq('id', order.id);
            } else if (brokerStatus === 'partial') {
              // 일부 체결도 체결로 카운트
              filledCount++;
            }
          } catch {
            // 조회 실패 시 DB status로 폴백
            if (order.status === 'filled' || order.status === 'partial') filledCount++;
          }
        }

        const totalLimit = limitOrders.length;
        const unfilledCount = totalLimit - filledCount;

        if (unfilledCount <= 0) {
          results.push({ user_id, symbol, success: true, message: `지정가 ${totalLimit}건 모두 체결 - LOC 불필요` });
          continue;
        }

        // 국내 LOC(장후시간외)는 가격 0으로 전송 (종가 체결)
        // 해외 LOC는 현재가 필요
        let locPrice = 0;
        if (market === 'overseas') {
          const quoteResult = await clientResult.client.getQuote(symbol);
          locPrice = quoteResult.success ? quoteResult.data!.currentPrice : 0;
        }

        // 미체결 지정가 주문 목록 (체결 안 된 것만)
        const unfilledLimitOrders = limitOrders.filter((_, idx) => {
          // filledCount만큼은 체결됐으므로, 뒤에서부터 unfilled로 처리
          return idx >= filledCount;
        });

        const submittedLoc: { orderId: string; qty: number }[] = [];
        const locErrors: string[] = [];
        for (const unfilledOrder of unfilledLimitOrders) {
          const locQty = Number((unfilledOrder as any).order_quantity) || Math.floor(Number(daily_quantity) / 2);
          const orderResult = await clientResult.client.createOrder({
            symbol,
            side: 'buy',
            orderType: 'loc',
            quantity: locQty,
            price: locPrice,
            market,
          });

          if (orderResult.success && orderResult.data?.orderId) {
            submittedLoc.push({ orderId: orderResult.data.orderId, qty: locQty });
          } else {
            const errMsg = orderResult.error?.message || JSON.stringify(orderResult.error) || '알 수 없는 오류';
            locErrors.push(errMsg);
            console.error(`DCA LOC 주문 실패 (${symbol}):`, orderResult.error);
          }
        }

        if (submittedLoc.length > 0) {
          await serviceClient.from('pending_orders').insert(
            submittedLoc.map(({ orderId, qty }) => ({
              user_id,
              broker_type,
              broker_credential_id: broker_credential_id || null,
              broker_order_id: orderId,
              symbol: symbol.toUpperCase(),
              market,
              side: 'buy',
              order_type: 'loc',
              order_quantity: qty,
              order_price: locPrice,
              status: 'submitted',
              strategy_version: 'dca',
              reason: 'DCA LOC fallback',
              order_time: new Date().toISOString(),
            }))
          );
        }

        const errorSuffix = locErrors.length > 0 ? ` | 실패: ${locErrors.join(', ')}` : '';
        results.push({
          user_id,
          symbol,
          success: submittedLoc.length > 0,
          message: `LOC 폴백 ${submittedLoc.length}건 제출 (미체결 지정가 ${unfilledCount}건)${errorSuffix}`,
        });
      } catch (err) {
        results.push({ user_id, symbol, success: false, message: `오류: ${err}` });
      }
    }

    // 텔레그램 알림 (사용자별로 발송)
    if (TELEGRAM_BOT_TOKEN && results.some(r => r.success)) {
      // 사용자별로 결과 그룹화
      const byUser = new Map<string, typeof results>();
      for (const r of results) {
        const list = byUser.get(r.user_id) ?? [];
        list.push(r);
        byUser.set(r.user_id, list);
      }

      for (const [userId, userResults] of byUser) {
        if (!userResults.some(r => r.success)) continue;

        const { data: subscribers } = await serviceClient
          .from('telegram_subscribers')
          .select('chat_id')
          .eq('is_active', true)
          .eq('user_id', userId);

        if (!subscribers || subscribers.length === 0) continue;

        const summary = userResults.map(r => `${r.success ? '✅' : '⏭️'} ${r.symbol}: ${r.message}`).join('\n');
        const msg = `🔔 <b>DCA LOC 폴백</b>\n${summary}`;

        for (const sub of subscribers) {
          await sendTelegramMessage(sub.chat_id, msg);
        }
      }
    }

    return NextResponse.json({ success: true, data: { results } });
  } catch (err) {
    console.error('DCA preclose cron 오류:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
