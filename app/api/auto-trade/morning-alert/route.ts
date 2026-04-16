/**
 * 무한매수법 자동매매 아침 알림 (Vercel Cron)
 *
 * GET: Cron에서 호출 - 오늘 매수 예정 내역을 텔레그램으로 발송
 * - 한국시간 오전 9시 (UTC 0시)에 실행
 * - 활성화된 자동매매 설정을 조회하여 오늘 매수할 종목 계산
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getBrokerClient } from '@/lib/broker/session';
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

  const { data: buyRecords } = await serviceClient
    .from('infinite_buy_records')
    .select('*')
    .eq('symbol', symbol.toUpperCase())
    .or(`user_id.eq.${userId},user_id.is.null`);

  if (!buyRecords || buyRecords.length === 0) return null;

  const { data: sellRecords } = await serviceClient
    .from('infinite_buy_sell_records')
    .select('*')
    .eq('symbol', symbol.toUpperCase())
    .or(`user_id.eq.${userId},user_id.is.null`);

  const buyShares = buyRecords.reduce((sum, r) => sum + (r.shares || 0), 0);
  const buyInvested = buyRecords.reduce((sum, r) => sum + (r.amount || 0), 0);
  const capital = buyRecords[0]?.capital || 0;

  const soldShares = (sellRecords || []).reduce((sum, r) => sum + (r.shares || 0), 0);
  const remainingShares = buyShares - soldShares;

  if (remainingShares <= 0) return null;

  return {
    shares: remainingShares,
    invested: buyInvested,
    avgCost: buyShares > 0 ? buyInvested / buyShares : 0,
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

    const buySchedule: {
      symbol: string;
      market: MarketType;
      currentT: number;
      buyPrice: number;
      buyQuantity: number;
      buyAmount: number;
      reason: string;
    }[] = [];

    // 각 설정에 대해 매수 예정 계산
    for (const setting of settings) {
      const { user_id, symbol, broker_type, strategy_version, total_capital } = setting;

      try {
        // 1. 브로커 연결 확인
        const clientResult = await getBrokerClient(user_id, broker_type, { skipBlockCheck: true });
        if (!clientResult.success || !clientResult.client) {
          continue;
        }

        // 2. 트래커 포지션 조회
        const position = await getTrackerPosition(user_id, symbol);

        // 3. 현재가 조회
        const quoteResult = await clientResult.client.getQuote(symbol);
        if (!quoteResult.success || !quoteResult.data) {
          continue;
        }

        const currentPrice = quoteResult.data.currentPrice;
        const market: MarketType = /^\d{6}$/.test(symbol) ? 'domestic' : 'overseas';
        const version = (strategy_version || 'v3.0').toLowerCase() as StrategyVersion;
        const divisions = version === 'v3.0' ? 20 : 40;

        const currentShares = position?.shares || 0;
        const currentInvested = position?.invested || 0;
        const capital = position?.capital || total_capital;
        const unitBuy = capital / divisions;
        const currentT = currentInvested > 0 ? Math.ceil((currentInvested / unitBuy) * 100) / 100 : 0;

        // 4. 주문 계산
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

        // 실행 가능한 매수 주문만 필터
        const executableBuys = liveOrders.buyOrders.filter(o => !o.isReference && o.quantity > 0);

        if (executableBuys.length > 0) {
          const buyOrder = executableBuys[0]; // 첫 번째 매수 주문 (보통 1개만 있음)
          buySchedule.push({
            symbol,
            market,
            currentT,
            buyPrice: buyOrder.price,
            buyQuantity: buyOrder.quantity,
            buyAmount: buyOrder.price * buyOrder.quantity,
            reason: buyOrder.reason || '',
          });
        }
      } catch (error) {
        console.error(`아침 알림 계산 오류: ${symbol}`, error);
      }
    }

    // 텔레그램 구독자에게 알림 전송
    const { data: subscribers } = await serviceClient
      .from('telegram_subscribers')
      .select('chat_id');

    if (subscribers && subscribers.length > 0) {
      const today = new Date().toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'short',
      });

      let alertText = `📅 <b>${today} 자동매매 예정</b>\n`;
      alertText += `━━━━━━━━━━━━━━━\n\n`;

      if (buySchedule.length === 0) {
        alertText += `오늘 매수 예정 내역이 없습니다.\n`;
      } else {
        for (const item of buySchedule) {
          const marketEmoji = item.market === 'domestic' ? '🇰🇷' : '🇺🇸';
          const formattedPrice = item.market === 'domestic'
            ? `₩${item.buyPrice.toLocaleString()}`
            : `$${item.buyPrice.toFixed(2)}`;
          const formattedAmount = item.market === 'domestic'
            ? `₩${Math.round(item.buyAmount).toLocaleString()}`
            : `$${item.buyAmount.toFixed(2)}`;

          alertText += `${marketEmoji} <b>${item.symbol}</b>\n`;
          alertText += `   • 현재 T: ${item.currentT.toFixed(1)}\n`;
          alertText += `   • 매수가: ${formattedPrice}\n`;
          alertText += `   • 수량: ${item.buyQuantity}주\n`;
          alertText += `   • 금액: ${formattedAmount}\n`;
          if (item.reason) {
            alertText += `   • 사유: ${item.reason}\n`;
          }
          alertText += `\n`;
        }

        const totalDomestic = buySchedule
          .filter(i => i.market === 'domestic')
          .reduce((sum, i) => sum + i.buyAmount, 0);
        const totalOverseas = buySchedule
          .filter(i => i.market === 'overseas')
          .reduce((sum, i) => sum + i.buyAmount, 0);

        alertText += `━━━━━━━━━━━━━━━\n`;
        if (totalDomestic > 0) {
          alertText += `🇰🇷 국내: ₩${Math.round(totalDomestic).toLocaleString()}\n`;
        }
        if (totalOverseas > 0) {
          alertText += `🇺🇸 해외: $${totalOverseas.toFixed(2)}\n`;
        }
      }

      alertText += `\n💡 장 시작 후 LOC 주문이 자동 실행됩니다.`;

      for (const sub of subscribers) {
        await sendTelegramMessage(sub.chat_id, alertText);
      }
    }

    return NextResponse.json({
      success: true,
      message: `${buySchedule.length}개 매수 예정 알림 전송`,
      data: {
        processed: settings.length,
        buySchedule,
      },
    });
  } catch (error) {
    console.error('아침 알림 Cron 오류:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
