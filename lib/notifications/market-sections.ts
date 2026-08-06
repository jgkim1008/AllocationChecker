import type { SupabaseClient } from '@supabase/supabase-js';
import type { MarketType } from '@/lib/broker/types';
import { getMarketIndicators } from '@/lib/api/market-indicators';
import { getBriefingData } from '@/lib/macro/briefing';

/**
 * 터틀 전략 캐시 워밍 — buildTurtleSection() 호출 직전에 실행해서
 * strategy_cache가 24h 넘게 오래됐으면 갱신되도록 함.
 * 이 스캔을 자동으로 트리거하는 크론이 따로 없어서, 사람이 페이지를 열지 않으면
 * 캐시가 무기한 오래될 수 있었음 (실제로 65일 넘게 방치된 적 있음).
 * 실패해도 무시 — buildTurtleSection이 오래된 캐시로 폴백함.
 */
export async function warmTurtleCache(): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!baseUrl) return;
  try {
    await fetch(`${baseUrl}/api/strategies/turtle-trading/scan`, {
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    // 무시 — 오래된 캐시로 폴백
  }
}

/**
 * 터틀 전략 섹션 (strategy_cache에서 직접 조회, market 필터링)
 * DCA preclose / 아침 알림 등 텔레그램 통합 메시지에서 공용으로 사용
 */
export async function buildTurtleSection(
  serviceClient: SupabaseClient,
  market: MarketType
): Promise<string> {
  try {
    const { data: cached } = await serviceClient
      .from('strategy_cache')
      .select('data, created_at')
      .eq('cache_key', 'turtle_trading_scan')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!cached?.data || !Array.isArray(cached.data)) {
      return '\n\n🐢 <b>터틀 전략</b>\n   스캔 캐시 없음 — /api/strategies/turtle-trading/scan 호출 필요';
    }

    const ageH = Math.round((Date.now() - new Date(cached.created_at).getTime()) / 3600000);
    const filterMarket = market === 'domestic' ? 'KR' : 'US';
    const active = (cached.data as Array<{
      symbol: string;
      name: string;
      market: 'US' | 'KR';
      currentPrice: number;
      signal: string;
      syncRate: number;
      recentBreakout: { daysAgo: number; system: 'S1' | 'S2'; price: number } | null;
    }>).filter(s => s.market === filterMarket &&
      (s.signal === 'S2_BREAKOUT' || s.signal === 'S1_BREAKOUT' || s.signal === 'NEAR_BREAKOUT')
    ).slice(0, 8);

    if (active.length === 0) {
      return `\n\n🐢 <b>터틀 전략 (${filterMarket}, ${ageH}h 전 캐시)</b>\n   돌파 신호 없음`;
    }

    const lines = active.map(s => {
      const emoji = s.signal === 'S2_BREAKOUT' ? '🔥' : s.signal === 'S1_BREAKOUT' ? '⚡' : '👀';
      const label = s.signal === 'S2_BREAKOUT' ? '55일 돌파' : s.signal === 'S1_BREAKOUT' ? '20일 돌파' : '돌파 근접';
      const bo = s.recentBreakout ? ` (${s.recentBreakout.daysAgo}d 전)` : '';
      const price = filterMarket === 'KR'
        ? `${Math.round(s.currentPrice).toLocaleString('ko-KR')}원`
        : `$${s.currentPrice.toFixed(2)}`;
      return `   ${emoji} ${s.symbol} ${s.name} — ${label}${bo} · ${price} · 싱크${s.syncRate}%`;
    });

    return `\n\n🐢 <b>터틀 전략 (${filterMarket}, ${ageH}h 전 캐시)</b>\n${lines.join('\n')}`;
  } catch {
    return '\n\n🐢 <b>터틀 전략</b>\n   조회 실패';
  }
}

/**
 * 시장 지표 섹션 — getMarketIndicators()를 직접 호출 (HTTP 자체 호출 지양)
 * DCA preclose / 아침 알림 등 텔레그램 통합 메시지에서 공용으로 사용
 */
export async function buildMarketIndicatorsSection(): Promise<string> {
  try {
    const data = await getMarketIndicators();

    const levelEmoji = { safe: '🟢', caution: '🟡', risk: '🔴' }[data.marketComment.level];
    const alertEmoji = { danger: '🔴', warning: '🟡', positive: '🟢', neutral: '⚪' };

    const sorted = [...data.indicators].sort((a, b) => {
      const order = { danger: 0, warning: 1, neutral: 2, positive: 3 };
      return order[a.alertLevel] - order[b.alertLevel];
    });

    const lines = sorted.map(i => {
      const arrow = i.changePercent > 0 ? '▲' : i.changePercent < 0 ? '▼' : '·';
      const pct = i.changePercent !== 0 ? ` ${arrow}${Math.abs(i.changePercent).toFixed(2)}%` : '';
      return `   ${alertEmoji[i.alertLevel]} ${i.name}: ${i.value}${pct}`;
    });

    return `\n\n📊 <b>시장 지표</b> ${levelEmoji} ${data.marketComment.text}\n${lines.join('\n')}`;
  } catch {
    return '\n\n📊 <b>시장 지표</b>\n   조회 실패';
  }
}

/**
 * 브리핑 대시보드 텔레그램 요약 — 액션신호 + 유동성(TGA) + 신용위험 + 워치리스트 + 다가오는 이벤트
 * 지수 피보나치(VIX/10Y/DXY/WTI 등)는 buildMarketCloseSection/buildMarketIndicatorsSection에
 * 이미 포함되므로 여기서는 중복 없이 그 두 섹션에 없는 항목만 다룬다.
 */
export async function buildBriefingSummarySection(): Promise<string> {
  try {
    const data = await getBriefingData();
    const signalEmoji = { green: '🟢', yellow: '🟡', red: '🔴' }[data.actionSignal];

    let text = `\n\n📋 <b>브리핑 요약</b> ${signalEmoji}\n${data.actionText}\n`;

    if (data.liquidity) {
      const l = data.liquidity;
      const weekArrow = l.weekChangeB == null ? '' : l.weekChangeB > 0 ? '▲' : l.weekChangeB < 0 ? '▼' : '·';
      const weekTxt = l.weekChangeB == null ? '' : ` (1주 ${weekArrow}$${Math.abs(l.weekChangeB)}B)`;
      text += `\n💰 <b>유동성(TGA)</b>: $${l.balanceB}B${weekTxt}`;
    }

    if (data.credit) {
      const c = data.credit;
      text += `\n📉 <b>하이일드 스프레드</b>: ${c.spreadPct.toFixed(2)}%`;
    }

    const watchlistLines = data.watchlist
      .filter(w => w.price != null)
      .map(w => {
        const pct = w.changePercent ?? 0;
        const arrow = pct > 0 ? '▲' : pct < 0 ? '▼' : '·';
        const price = w.price! >= 1000 ? Math.round(w.price!).toLocaleString('en-US') : w.price!.toFixed(2);
        return `   ${w.label}: $${price} ${arrow}${Math.abs(pct).toFixed(1)}%`;
      });
    if (watchlistLines.length > 0) {
      text += `\n\n👀 <b>워치리스트</b>\n${watchlistLines.join('\n')}`;
    }

    if (data.events.length > 0) {
      const next = data.events[0];
      text += `\n\n📅 <b>다음 이벤트</b>: ${next.label} (D-${next.daysUntil})`;
    }

    return text;
  } catch {
    return '\n\n📋 <b>브리핑 요약</b>\n   조회 실패';
  }
}
