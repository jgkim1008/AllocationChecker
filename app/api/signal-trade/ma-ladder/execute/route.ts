/**
 * MA 계단식 자동매수 실행 API (Cron 전용)
 *
 * POST /api/signal-trade/ma-ladder/execute
 * - 활성화된 모든 MA 계단식 설정에 대해 실행
 * - 전날 미체결 주문 취소 → 최신 MA 가격으로 지정가 주문 갱신
 *
 * 매일 미국장 개장 전(한국시간 22:20) 실행 권장
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getDailyHistory, getHourlyOHLCHistory } from '@/lib/api/yahoo';
import {
  calculateMALadderPrices,
  calculateIchimoku,
  aggregateToWeekly,
  aggregateTo4Hour,
  isIchimokuKey,
  getIchimokuDef,
} from '@/lib/signal-trade/ma-ladder';
import { getBrokerClientByCredentialId, getBrokerClient } from '@/lib/broker/session';
import type { KISClient } from '@/lib/broker/kis';

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

export async function POST(request: NextRequest) {
  // Cron 인증
  const authHeader = request.headers.get('authorization');
  if (process.env.NODE_ENV === 'production' && CRON_SECRET) {
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const serviceClient = await createServiceClient();

  // 활성화된 설정 전체 조회 (레벨 포함)
  const { data: settings, error: settingsError } = await serviceClient
    .from('ma_ladder_settings')
    .select('*, ma_ladder_levels(*)')
    .eq('is_enabled', true);

  if (settingsError) {
    console.error('MA Ladder settings query error:', settingsError);
    return NextResponse.json({ error: '설정 조회 실패' }, { status: 500 });
  }

  if (!settings || settings.length === 0) {
    return NextResponse.json({ success: true, message: '활성 설정 없음', processed: 0 });
  }

  const today = new Date().toISOString().split('T')[0];
  const results: {
    userId: string;
    symbol: string;
    success: boolean;
    message: string;
    placed?: number;
    cancelled?: number;
  }[] = [];

  for (const setting of settings) {
    const { user_id, symbol, market, broker_type, ma_ladder_levels: levels } = setting;

    try {
      // 활성화된 레벨만 필터
      const activeLevels = (levels ?? []).filter((l: { is_enabled: boolean; quantity: number }) => l.is_enabled && l.quantity > 0);
      if (activeLevels.length === 0) {
        results.push({ userId: user_id, symbol, success: true, message: '활성 레벨 없음' });
        continue;
      }

      // 브로커 클라이언트 연결 — credential_id 우선, fallback: broker_type
      const savedCredentialId = setting.broker_credential_id as string | null | undefined;
      const clientResult = savedCredentialId
        ? await getBrokerClientByCredentialId(savedCredentialId)
        : await getBrokerClient(user_id, broker_type, { skipBlockCheck: true });

      if (!clientResult.success || !clientResult.client) {
        results.push({ userId: user_id, symbol, success: false, message: `브로커 연결 실패: ${clientResult.error}` });
        continue;
      }

      const client = clientResult.client;

      // 전날 미체결 주문 조회 → 취소
      const { data: prevOrders } = await serviceClient
        .from('ma_ladder_orders')
        .select('*')
        .eq('setting_id', setting.id)
        .eq('user_id', user_id)
        .in('status', ['submitted', 'pending'])
        .neq('order_date', today);

      // 체결 내역 미리 조회 — 거래소 자동취소된 주문과 체결된 주문 구분
      let filledOrderIds = new Set<string>();
      try {
        const filledResult = await client.getFilledOrders();
        if (filledResult.success && filledResult.data) {
          filledOrderIds = new Set(filledResult.data.map(o => o.orderId));
        }
      } catch {}

      let cancelledCount = 0;
      for (const prev of prevOrders ?? []) {
        // broker_order_id 없으면 브로커 주문 미등록 — DB만 정리
        if (!prev.broker_order_id) {
          await serviceClient
            .from('ma_ladder_orders')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('id', prev.id);
          continue;
        }

        // 체결된 주문이면 filled로 업데이트하고 취소 시도 안 함
        if (filledOrderIds.has(prev.broker_order_id)) {
          await serviceClient
            .from('ma_ladder_orders')
            .update({ status: 'filled', updated_at: new Date().toISOString() })
            .eq('id', prev.id);
          continue;
        }

        // 취소 시도 — 거래소가 이미 자동취소했어도 에러 무시
        try {
          await client.cancelOrder(prev.broker_order_id, {
            symbol: prev.symbol,
            quantity: prev.quantity,
            market: market as 'domestic' | 'overseas',
          });
          cancelledCount++;
        } catch {
          // 거래소 장마감 시 미체결 주문 자동취소 → KIS "이미 취소" 에러 정상
        }
        // 성공/실패 무관하게 전날 주문은 cancelled로 정리
        await serviceClient
          .from('ma_ladder_orders')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('id', prev.id);
      }

      // 일봉 OHLC 히스토리 조회 — KIS 우선, 폴백 Yahoo
      const marketType: 'US' | 'KR' = market === 'domestic' ? 'KR' : 'US';
      let dailyOHLC: { date: string; price: number; high: number; low: number }[] = [];

      if (broker_type === 'kis' && client.type === 'kis') {
        try {
          const kisHistory = await (client as unknown as KISClient).getDailyPriceHistory(
            symbol, market as 'domestic' | 'overseas', 600,
          );
          if (kisHistory.length >= 3) dailyOHLC = kisHistory;
        } catch (e) {
          console.warn(`KIS price history failed for ${symbol}:`, e);
        }
      }
      if (dailyOHLC.length === 0) {
        const yahoo = await getDailyHistory(symbol, marketType, { useRawClose: true });
        dailyOHLC = yahoo.map(h => ({ date: h.date, price: h.price, high: h.high, low: h.low }));
      }

      if (dailyOHLC.length < 3) {
        results.push({ userId: user_id, symbol, success: false, message: '가격 데이터 부족', cancelled: cancelledCount });
        continue;
      }

      const currentPrice = dailyOHLC[0]?.price ?? 0;

      // MA 가격 계산
      const maPrices = calculateMALadderPrices(dailyOHLC);

      // Ichimoku 가격 캐시 (timeframe별 lazy 계산)
      const ichimokuCache: Record<string, { span1: number | null; span2: number | null }> = {};
      const getIchimoku = async (timeframe: string) => {
        if (ichimokuCache[timeframe]) return ichimokuCache[timeframe];
        if (timeframe === 'D') {
          ichimokuCache['D'] = calculateIchimoku(dailyOHLC);
        } else if (timeframe === 'W') {
          const weekly = aggregateToWeekly(
            dailyOHLC.map(h => ({ date: h.date, high: h.high, low: h.low, close: h.price }))
          );
          ichimokuCache['W'] = calculateIchimoku(weekly);
        } else {
          // 60m / 240m — Yahoo 1h
          const hourly = await getHourlyOHLCHistory(symbol, marketType);
          ichimokuCache['60m'] = calculateIchimoku(hourly);
          const h4 = aggregateTo4Hour(hourly);
          ichimokuCache['240m'] = calculateIchimoku(h4);
        }
        return ichimokuCache[timeframe] ?? { span1: null, span2: null };
      };

      // 오늘 날짜로 신규 주문 실행
      let placedCount = 0;
      for (const level of activeLevels) {
        let orderPrice: number | null = null;

        if (isIchimokuKey(level.ma_period)) {
          const def = getIchimokuDef(level.ma_period);
          const ich = await getIchimoku(def.timeframe);
          orderPrice = def.span === 1 ? ich.span1 : ich.span2;
        } else {
          const maEntry = maPrices.find(m => m.period === level.ma_period);
          orderPrice = maEntry?.price ?? null;
        }

        if (orderPrice === null) continue;

        // 현재가 이상이면 지정가 매수 불필요
        if (orderPrice >= currentPrice * 1.01) continue;

        const orderResult = await client.createOrder({
          symbol,
          side: 'buy',
          orderType: 'limit',
          quantity: level.quantity,
          price: orderPrice,
          market: market as 'domestic' | 'overseas',
        });

        await serviceClient.from('ma_ladder_orders').insert({
          setting_id: setting.id,
          user_id,
          symbol,
          ma_period: level.ma_period,
          ma_price: orderPrice,
          quantity: level.quantity,
          broker_order_id: orderResult.success ? orderResult.data?.orderId ?? null : null,
          status: orderResult.success ? 'submitted' : 'failed',
          order_date: today,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        if (orderResult.success) placedCount++;
      }

      results.push({
        userId: user_id,
        symbol,
        success: true,
        message: `취소 ${cancelledCount}건 / 신규주문 ${placedCount}건`,
        placed: placedCount,
        cancelled: cancelledCount,
      });

    } catch (err) {
      console.error(`MA Ladder execute error: ${symbol}`, err);
      results.push({
        userId: user_id,
        symbol,
        success: false,
        message: err instanceof Error ? err.message : '실행 오류',
      });
    }
  }

  // 텔레그램 알림 (사용자별)
  const byUser = new Map<string, typeof results>();
  for (const r of results) {
    const list = byUser.get(r.userId) ?? [];
    list.push(r);
    byUser.set(r.userId, list);
  }

  for (const [userId, userResults] of byUser) {
    const { data: subscribers } = await serviceClient
      .from('telegram_subscribers')
      .select('chat_id')
      .eq('is_active', true)
      .eq('user_id', userId);

    if (!subscribers?.length) continue;

    let text = `📊 <b>MA 계단식 자동매수 갱신</b>\n━━━━━━━━━━━━\n`;
    for (const r of userResults) {
      text += `${r.success ? '✅' : '❌'} <b>${r.symbol}</b>: ${r.message}\n`;
    }

    for (const sub of subscribers) {
      await sendTelegramMessage(sub.chat_id, text);
    }
  }

  return NextResponse.json({
    success: true,
    processed: results.length,
    results,
  });
}
