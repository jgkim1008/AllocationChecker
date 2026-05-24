/**
 * 포지션 싱크 검증 cron
 *
 * - 매일 KST 09:00 호출 (외부 crontab)
 * - 활성화된 모든 auto_trade_settings의 보유 포지션과 DB 매수/매도 기록을 비교
 * - 불일치 발견 시 사용자별 텔레그램 알림 (자동 수정은 하지 않음 — verify only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getBrokerClientByCredentialId, getBrokerClient } from '@/lib/broker/session';
import type { BrokerType } from '@/lib/broker/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SHARE_TOLERANCE = 0.5;
const PRICE_TOLERANCE = 0.01;

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

interface SyncResult {
  user_id: string;
  symbol: string;
  cycle: number;
  inSync: boolean;
  brokerShares: number;
  brokerAvg: number;
  dbShares: number;
  dbAvg: number;
  sharesDiff: number;
  avgDiffPct: number;
  error?: string;
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

    const supabase = await createServiceClient();

    // 1. 활성화된 자동매매 설정 전체 조회
    const { data: settings, error: settingsErr } = await supabase
      .from('auto_trade_settings')
      .select('user_id, symbol, broker_type, broker_credential_id, is_enabled')
      .eq('is_enabled', true);

    if (settingsErr) {
      console.error('[sync-check cron] settings 조회 오류:', settingsErr);
      return NextResponse.json({ error: 'settings 조회 실패' }, { status: 500 });
    }

    if (!settings || settings.length === 0) {
      return NextResponse.json({ success: true, message: '활성화된 설정 없음', data: { checked: 0, mismatches: 0 } });
    }

    // 2. 사용자별 broker 포지션 1회만 가져오기 (캐싱)
    const positionCache = new Map<string, Map<string, { shares: number; avgCost: number }>>();

    async function getBrokerPositionsFor(userId: string, credentialId: string | null, brokerType: string) {
      const cacheKey = credentialId ?? `${userId}-${brokerType}`;
      if (positionCache.has(cacheKey)) return positionCache.get(cacheKey)!;

      const clientResult = credentialId
        ? await getBrokerClientByCredentialId(credentialId)
        : await getBrokerClient(userId, brokerType as BrokerType);

      if (!clientResult.success || !clientResult.client) {
        positionCache.set(cacheKey, new Map());
        return new Map<string, { shares: number; avgCost: number }>();
      }

      const positionsResult = await clientResult.client.getPositions();
      const map = new Map<string, { shares: number; avgCost: number }>();
      for (const p of positionsResult.data ?? []) {
        map.set(p.symbol.toUpperCase(), { shares: p.quantity, avgCost: p.avgPrice });
      }
      positionCache.set(cacheKey, map);
      return map;
    }

    const results: SyncResult[] = [];

    for (const s of settings) {
      const symbolUpper = s.symbol.toUpperCase();

      // 가장 최근(가장 큰) cycle_number 조회
      const { data: cycleRow } = await supabase
        .from('infinite_buy_records')
        .select('cycle_number')
        .eq('symbol', symbolUpper)
        .order('cycle_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      const cycle = cycleRow?.cycle_number ?? 1;

      // DB 기록 조회
      const [{ data: buys }, { data: sells }] = await Promise.all([
        supabase.from('infinite_buy_records').select('shares, amount').eq('symbol', symbolUpper).eq('cycle_number', cycle),
        supabase.from('infinite_sell_records').select('shares').eq('symbol', symbolUpper).eq('cycle_number', cycle),
      ]);

      const totalBuyShares = (buys ?? []).reduce((sum, r) => sum + (r.shares || 0), 0);
      const totalBuyAmount = (buys ?? []).reduce((sum, r) => sum + (r.amount || 0), 0);
      const totalSellShares = (sells ?? []).reduce((sum, r) => sum + (r.shares || 0), 0);
      const dbShares = Math.max(0, totalBuyShares - totalSellShares);
      const dbAvg = totalBuyShares > 0 ? totalBuyAmount / totalBuyShares : 0;

      // 브로커 포지션
      try {
        const brokerMap = await getBrokerPositionsFor(s.user_id, s.broker_credential_id, s.broker_type);
        const bp = brokerMap.get(symbolUpper);
        const brokerShares = bp?.shares ?? 0;
        const brokerAvg = bp?.avgCost ?? 0;

        const sharesDiff = brokerShares - dbShares;
        const avgDiffPct = dbAvg > 0 ? ((brokerAvg - dbAvg) / dbAvg) : 0;
        const sharesMatch = Math.abs(sharesDiff) <= SHARE_TOLERANCE;
        const avgMatch = dbAvg === 0 || Math.abs(avgDiffPct) <= PRICE_TOLERANCE;
        const inSync = sharesMatch && avgMatch;

        results.push({
          user_id: s.user_id, symbol: s.symbol, cycle, inSync,
          brokerShares, brokerAvg, dbShares, dbAvg, sharesDiff, avgDiffPct: avgDiffPct * 100,
        });
      } catch (err) {
        results.push({
          user_id: s.user_id, symbol: s.symbol, cycle, inSync: false,
          brokerShares: 0, brokerAvg: 0, dbShares, dbAvg, sharesDiff: 0, avgDiffPct: 0,
          error: err instanceof Error ? err.message : '브로커 조회 실패',
        });
      }
    }

    // 3. 불일치 사용자별 그룹 → 텔레그램 알림
    const mismatches = results.filter(r => !r.inSync || r.error);
    if (TELEGRAM_BOT_TOKEN && mismatches.length > 0) {
      const byUser = new Map<string, SyncResult[]>();
      for (const r of mismatches) {
        const list = byUser.get(r.user_id) ?? [];
        list.push(r);
        byUser.set(r.user_id, list);
      }

      for (const [userId, userMismatches] of byUser) {
        const { data: subscribers } = await supabase
          .from('telegram_subscribers')
          .select('chat_id')
          .eq('is_active', true)
          .eq('user_id', userId);
        if (!subscribers || subscribers.length === 0) continue;

        const lines = userMismatches.map(m => {
          if (m.error) {
            return `⚠ <b>${m.symbol}</b> [${m.cycle}회차] — 조회 실패: ${m.error}`;
          }
          const sharesGap = m.sharesDiff.toFixed(2);
          const avgGap = m.avgDiffPct.toFixed(2);
          return `❌ <b>${m.symbol}</b> [${m.cycle}회차]\n   증권사 ${m.brokerShares.toFixed(2)}주 / DB ${m.dbShares.toFixed(2)}주 (Δ${sharesGap})\n   평단 증권사 ${m.brokerAvg.toFixed(2)} / DB ${m.dbAvg.toFixed(2)} (Δ${avgGap}%)`;
        });

        const msg = `🔍 <b>아침 포지션 싱크 검증</b>\n${userMismatches.length}건 불일치 발견 — 자동매매 > 포지션 싱크에서 확인하세요.\n\n${lines.join('\n\n')}`;
        for (const sub of subscribers) {
          await sendTelegramMessage(sub.chat_id, msg);
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        checked: results.length,
        inSync: results.filter(r => r.inSync && !r.error).length,
        mismatches: mismatches.length,
        results,
      },
    });
  } catch (error) {
    console.error('[sync-check cron] 오류:', error);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
