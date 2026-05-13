/**
 * 장마감 알림 (Vercel Cron)
 *
 * GET: Cron에서 호출 - 터틀 투자법 등 전략 시그널을 텔레그램으로 발송
 * - 한국 장마감 (한국시간 오후 3:35, UTC 6:35)에 실행
 */

import { NextRequest, NextResponse } from 'next/server';
import { analyzeTurtleTrading, type TurtleCandle } from '@/lib/utils/turtle-trading-calculator';
import { broadcastToSubscribers } from '@/lib/notifications/telegram';

const CRON_SECRET = process.env.CRON_SECRET;

// 터틀 스캔 종목 리스트 (주요 종목)
const TURTLE_SCAN_SYMBOLS = {
  US: [
    'SOXL', 'TQQQ', 'NVDA', 'TSLA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META',
    'AMD', 'AVGO', 'QLD', 'UPRO', 'SPY', 'QQQ', 'COIN', 'MSTR', 'PLTR',
  ],
  KR: [
    '005930', '000660', '373220', '005380', '035420', '051910', '006400',
    '003670', '035720', '068270', '028260', '012330', '066570', '055550',
  ],
};

// Yahoo Finance에서 일봉 데이터 가져오기
async function fetchCandles(symbol: string, market: 'US' | 'KR'): Promise<TurtleCandle[]> {
  try {
    const yahooSymbol = market === 'KR'
      ? (symbol.endsWith('.KS') || symbol.endsWith('.KQ') ? symbol : `${symbol}.KS`)
      : symbol;

    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=6mo`,
      { next: { revalidate: 3600 } }
    );

    if (!res.ok) return [];

    const data = await res.json();
    const result = data.chart?.result?.[0];
    if (!result?.timestamp || !result?.indicators?.quote?.[0]) return [];

    const { timestamp, indicators } = result;
    const quote = indicators.quote[0];

    const candles: TurtleCandle[] = [];
    for (let i = 0; i < timestamp.length; i++) {
      if (quote.open[i] && quote.high[i] && quote.low[i] && quote.close[i]) {
        candles.push({
          date: new Date(timestamp[i] * 1000).toISOString().split('T')[0],
          open: quote.open[i],
          high: quote.high[i],
          low: quote.low[i],
          close: quote.close[i],
          volume: quote.volume[i] || 0,
        });
      }
    }

    return candles.sort((a, b) => a.date.localeCompare(b.date));
  } catch (error) {
    console.error(`Candle fetch error (${symbol}):`, error);
    return [];
  }
}

// 종목명 조회
async function getStockName(symbol: string, market: 'US' | 'KR'): Promise<string> {
  try {
    const yahooSymbol = market === 'KR' ? `${symbol}.KS` : symbol;
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=1d`
    );
    if (!res.ok) return symbol;
    const data = await res.json();
    return data.chart?.result?.[0]?.meta?.shortName || symbol;
  } catch {
    return symbol;
  }
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

    // 터틀 시그널 스캔
    const signals: {
      symbol: string;
      name: string;
      market: 'US' | 'KR';
      signal: string;
      syncRate: number;
      dc55High: number | null;
      dc20High: number | null;
      currentPrice: number;
    }[] = [];

    // US 종목 스캔
    for (const symbol of TURTLE_SCAN_SYMBOLS.US) {
      const candles = await fetchCandles(symbol, 'US');
      if (candles.length < 60) continue;

      const result = analyzeTurtleTrading(candles);
      if (!result) continue;

      // S2, S1, NEAR_BREAKOUT만 알림
      if (['S2_BREAKOUT', 'S1_BREAKOUT', 'NEAR_BREAKOUT'].includes(result.signal)) {
        const name = await getStockName(symbol, 'US');
        signals.push({
          symbol,
          name,
          market: 'US',
          signal: result.signal,
          syncRate: result.syncRate,
          dc55High: result.dc55High,
          dc20High: result.dc20High,
          currentPrice: candles[candles.length - 1].close,
        });
      }
    }

    // KR 종목 스캔
    for (const symbol of TURTLE_SCAN_SYMBOLS.KR) {
      const candles = await fetchCandles(symbol, 'KR');
      if (candles.length < 60) continue;

      const result = analyzeTurtleTrading(candles);
      if (!result) continue;

      if (['S2_BREAKOUT', 'S1_BREAKOUT', 'NEAR_BREAKOUT'].includes(result.signal)) {
        const name = await getStockName(symbol, 'KR');
        signals.push({
          symbol,
          name,
          market: 'KR',
          signal: result.signal,
          syncRate: result.syncRate,
          dc55High: result.dc55High,
          dc20High: result.dc20High,
          currentPrice: candles[candles.length - 1].close,
        });
      }
    }

    // 시그널이 없으면 종료
    if (signals.length === 0) {
      return NextResponse.json({
        success: true,
        message: '터틀 시그널 없음',
        data: { signals: [] },
      });
    }

    // 시그널 정렬 (S2 > S1 > NEAR)
    const signalPriority: Record<string, number> = {
      S2_BREAKOUT: 3,
      S1_BREAKOUT: 2,
      NEAR_BREAKOUT: 1,
    };
    signals.sort((a, b) => (signalPriority[b.signal] || 0) - (signalPriority[a.signal] || 0));

    // 텔레그램 메시지 생성
    const today = new Date().toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short',
    });

    let alertText = `🐢 <b>${today} 터틀 투자법 시그널</b>\n`;
    alertText += `━━━━━━━━━━━━━━━\n\n`;

    // S2 돌파
    const s2Signals = signals.filter(s => s.signal === 'S2_BREAKOUT');
    if (s2Signals.length > 0) {
      alertText += `<b>🔵 S2 돌파 (55일 채널)</b>\n`;
      for (const s of s2Signals) {
        const marketEmoji = s.market === 'US' ? '🇺🇸' : '🇰🇷';
        const price = s.market === 'US'
          ? `$${s.currentPrice.toFixed(2)}`
          : `₩${Math.round(s.currentPrice).toLocaleString()}`;
        alertText += `${marketEmoji} <b>${s.symbol}</b> ${s.name}\n`;
        alertText += `   현재가: ${price} (싱크 ${s.syncRate}%)\n`;
      }
      alertText += `\n`;
    }

    // S1 돌파
    const s1Signals = signals.filter(s => s.signal === 'S1_BREAKOUT');
    if (s1Signals.length > 0) {
      alertText += `<b>🟢 S1 돌파 (20일 채널)</b>\n`;
      for (const s of s1Signals) {
        const marketEmoji = s.market === 'US' ? '🇺🇸' : '🇰🇷';
        const price = s.market === 'US'
          ? `$${s.currentPrice.toFixed(2)}`
          : `₩${Math.round(s.currentPrice).toLocaleString()}`;
        alertText += `${marketEmoji} <b>${s.symbol}</b> ${s.name}\n`;
        alertText += `   현재가: ${price} (싱크 ${s.syncRate}%)\n`;
      }
      alertText += `\n`;
    }

    // 돌파 임박
    const nearSignals = signals.filter(s => s.signal === 'NEAR_BREAKOUT');
    if (nearSignals.length > 0) {
      alertText += `<b>🟡 돌파 임박 (DC20 98%+)</b>\n`;
      for (const s of nearSignals) {
        const marketEmoji = s.market === 'US' ? '🇺🇸' : '🇰🇷';
        const price = s.market === 'US'
          ? `$${s.currentPrice.toFixed(2)}`
          : `₩${Math.round(s.currentPrice).toLocaleString()}`;
        const targetPrice = s.dc20High
          ? (s.market === 'US' ? `$${s.dc20High.toFixed(2)}` : `₩${Math.round(s.dc20High).toLocaleString()}`)
          : '-';
        alertText += `${marketEmoji} <b>${s.symbol}</b> ${s.name}\n`;
        alertText += `   현재가: ${price} → 목표: ${targetPrice}\n`;
      }
      alertText += `\n`;
    }

    alertText += `━━━━━━━━━━━━━━━\n`;
    alertText += `📊 총 ${signals.length}개 시그널 감지\n`;
    alertText += `💡 상세 분석: /strategies/turtle-trading`;

    // 모든 구독자에게 발송 (기존 telegram 모듈 사용)
    const sentCount = await broadcastToSubscribers(alertText);

    return NextResponse.json({
      success: true,
      message: `터틀 시그널 ${signals.length}개, ${sentCount}명에게 발송 완료`,
      data: { signals, sentCount },
    });
  } catch (error) {
    console.error('장마감 알림 Cron 오류:', error);
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
