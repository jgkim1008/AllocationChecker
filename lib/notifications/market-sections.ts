import type { SupabaseClient } from '@supabase/supabase-js';
import type { MarketType } from '@/lib/broker/types';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL;

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
 * 시장 지표 섹션 (/api/market-indicators 호출)
 * DCA preclose / 아침 알림 등 텔레그램 통합 메시지에서 공용으로 사용
 */
export async function buildMarketIndicatorsSection(): Promise<string> {
  if (!APP_URL) return '';
  try {
    const res = await fetch(`${APP_URL}/api/market-indicators`, { cache: 'no-store' });
    if (!res.ok) return '\n\n📊 <b>시장 지표</b>\n   조회 실패';

    const data = await res.json() as {
      indicators: Array<{ name: string; value: string; alertLevel: 'danger'|'warning'|'neutral'|'positive'; trendText: string; changePercent: number }>;
      marketComment: { level: 'safe'|'caution'|'risk'; text: string };
    };

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
