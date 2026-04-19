/**
 * DCA 주문 예고 cron
 *
 * 시장 개장 30분 전에 오늘 예정된 DCA 주문 내용을 Telegram으로 전송
 * 실제 주문은 하지 않음
 *
 * 미국 (summer EDT): KST 22:00 = UTC 13:00 → "0 13 * * 1-5"
 * 미국 (winter EST): KST 23:00 = UTC 14:00 → "0 14 * * 1-5"
 * 국내: KST 08:30 = UTC 23:30 (전날) → "30 23 * * 0-4"
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

function calcLimitPrice(basePrice: number, pct: number, market: MarketType): number {
  const raw = basePrice * (1 + pct / 100);
  if (market === 'overseas') return Math.floor(raw * 100) / 100;
  if (raw >= 500000) return Math.floor(raw / 1000) * 1000;
  if (raw >= 100000) return Math.floor(raw / 500) * 500;
  if (raw >= 50000) return Math.floor(raw / 100) * 100;
  if (raw >= 10000) return Math.floor(raw / 50) * 50;
  if (raw >= 1000) return Math.floor(raw / 10) * 10;
  return Math.floor(raw / 5) * 5;
}

function fmtPrice(price: number, market: MarketType) {
  return market === 'overseas' ? `$${price.toFixed(2)}` : `₩${price.toLocaleString('ko-KR')}`;
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
    const { data: settings, error } = await serviceClient
      .from('dca_settings')
      .select('*, broker_credentials(id, broker_type, account_alias)')
      .eq('is_enabled', true)
      .eq('market', market);

    if (error) return NextResponse.json({ error: '설정 조회 실패' }, { status: 500 });
    if (!settings || settings.length === 0) {
      return NextResponse.json({ success: true, message: '활성화된 DCA 설정 없음' });
    }

    type PreviewItem = {
      symbol: string;
      prevClose: number;
      price1: number;
      price2: number;
      qty1: number;
      qty2: number;
      threshold1_pct: number;
      threshold2_pct: number;
      alias: string;
      order_mode: string;
    };

    // 사용자별로 그룹화 (user_id → settings)
    const byUser = new Map<string, typeof settings>();
    for (const s of settings) {
      const list = byUser.get(s.user_id) ?? [];
      list.push(s);
      byUser.set(s.user_id, list);
    }

    for (const [userId, userSettings] of byUser) {
      const previews: PreviewItem[] = [];

      for (const setting of userSettings) {
        const { symbol, broker_type, broker_credential_id, daily_quantity, threshold1_pct, threshold2_pct, order_mode } = setting;

        try {
          const clientResult = broker_credential_id
            ? await getBrokerClientByCredentialId(broker_credential_id)
            : await getBrokerClient(userId, broker_type, { skipBlockCheck: true });

          if (!clientResult.success || !clientResult.client) continue;

          const quoteResult = await clientResult.client.getQuote(symbol);
          if (!quoteResult.success || !quoteResult.data) continue;

          const prevClose = quoteResult.data.prevClose || quoteResult.data.currentPrice;
          const price1 = calcLimitPrice(prevClose, threshold1_pct, market);
          const price2 = calcLimitPrice(prevClose, threshold2_pct, market);
          const alias = setting.broker_credentials?.account_alias ?? broker_type;

          const totalQty = Number(daily_quantity);
          previews.push({
            symbol,
            prevClose,
            price1,
            price2,
            qty1: Math.ceil(totalQty / 2),
            order_mode: order_mode ?? 'threshold',
            qty2: Math.floor(totalQty / 2),
            threshold1_pct,
            threshold2_pct,
            alias,
          });
        } catch {}
      }

      if (previews.length === 0) continue;

      // Telegram 구독자 조회
      const { data: subscribers } = await serviceClient
        .from('telegram_subscribers')
        .select('chat_id')
        .eq('is_active', true);

      if (!subscribers || subscribers.length === 0) continue;

      const marketLabel = market === 'overseas' ? '🇺🇸 미국주식' : '🇰🇷 국내주식';
      const openTime = market === 'overseas' ? '22:30~23:00 (KST)' : '09:00 (KST)';

      const lines = previews.map(p => {
        const curr = fmtPrice(p.prevClose, market);
        const p1 = fmtPrice(p.price1, market);
        const p2 = fmtPrice(p.price2, market);
        return (
          p.order_mode === 'loc_only'
            ? (`<b>${p.symbol}</b> <code>[${p.alias}]</code>\n` +
               `  전일종가: ${curr}\n` +
               `  LOC ${p.qty1 + p.qty2}주 (종가 매수)`)
            : (`<b>${p.symbol}</b> <code>[${p.alias}]</code>\n` +
               `  전일종가: ${curr}\n` +
               `  1차 (${p.threshold1_pct}%): ${p1} × ${p.qty1}주\n` +
               `  2차 (${p.threshold2_pct}%): ${p2} × ${p.qty2}주`)
        );
      }).join('\n\n');

      const hasLocOnly = previews.some(p => p.order_mode === 'loc_only');
      const msg =
        `📋 <b>DCA 주문 예고</b> — ${marketLabel}\n` +
        `개장까지 약 30분 남았습니다 (${openTime})\n` +
        `──────────────────\n` +
        lines +
        `\n──────────────────\n` +
        (hasLocOnly ? `⏰ 장마감 후 LOC 자동 주문 예정` : `⏰ 30분 후 자동 지정가 주문 예정`);

      for (const sub of subscribers) {
        await sendTelegramMessage(sub.chat_id, msg);
      }
    }

    return NextResponse.json({ success: true, message: `예고 전송 완료 (${market})` });
  } catch (err) {
    console.error('DCA preview cron 오류:', err);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
