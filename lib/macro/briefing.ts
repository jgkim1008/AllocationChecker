import { getMarketIndicators, type MarketIndicator } from '@/lib/api/market-indicators';
import { getTgaBalance, type TgaBalance } from '@/lib/api/treasury';
import { getHighYieldSpread, type CreditSpread } from '@/lib/api/fred';
import { getWatchlistQuotes, type WatchlistItem } from '@/lib/macro/watchlist';
import { getUpcomingEvents, type MacroEvent } from '@/lib/macro/events';

export type ActionSignal = 'green' | 'yellow' | 'red';

export interface BriefingData {
  actionSignal: ActionSignal;
  actionText: string;
  usMacro: MarketIndicator[];      // 10년물, WTI, DXY, USD/KRW
  sentiment: MarketIndicator | null; // VIX
  liquidity: TgaBalance | null;      // TGA
  credit: CreditSpread | null;       // 하이일드 스프레드 (FRED 키 없으면 null)
  watchlist: WatchlistItem[];
  events: (MacroEvent & { daysUntil: number })[];
  updatedAt: string;
}

const US_MACRO_NAMES = ['미 10년물 국채금리', 'WTI 원유', 'DXY 달러 인덱스', 'USD/KRW'];
const SENTIMENT_NAME = 'VIX 공포지수';

function computeActionSignal(
  indicators: MarketIndicator[],
  tga: TgaBalance | null,
  credit: CreditSpread | null,
): { signal: ActionSignal; text: string } {
  const danger = indicators.filter(i => i.alertLevel === 'danger').length;
  const warning = indicators.filter(i => i.alertLevel === 'warning').length;

  const reasons: string[] = [];
  let signal: ActionSignal = danger >= 1 ? 'red' : warning >= 2 ? 'yellow' : 'green';
  if (danger >= 1) reasons.push(`위험 지표 ${danger}개`);
  else if (warning >= 2) reasons.push(`경고 지표 ${warning}개`);

  // 하이일드 스프레드 급확대 = 신용경색 조기경보 (사용자 기준: 5%+ 급확대)
  if (credit) {
    if (credit.spreadPct >= 5 || (credit.weekAgoSpreadPct != null && credit.spreadPct - credit.weekAgoSpreadPct >= 0.5)) {
      signal = 'red';
      reasons.push(`하이일드 스프레드 ${credit.spreadPct.toFixed(2)}%`);
    }
  }

  // TGA 1주 급증 = 유동성 흡수 부담
  if (tga && tga.weekChangeB != null && tga.weekChangeB >= 100) {
    if (signal === 'green') signal = 'yellow';
    reasons.push(`TGA 1주 +$${tga.weekChangeB}B 급증(유동성 흡수)`);
  }

  const text = reasons.length > 0
    ? reasons.join(' · ')
    : '주요 위험 지표 안정 — 특이사항 없음';

  return { signal, text };
}

export async function getBriefingData(): Promise<BriefingData> {
  const [marketResult, tga, credit, watchlist] = await Promise.all([
    getMarketIndicators(),
    getTgaBalance(),
    getHighYieldSpread(),
    getWatchlistQuotes(),
  ]);

  const usMacro = marketResult.indicators.filter(i => US_MACRO_NAMES.includes(i.name));
  const sentiment = marketResult.indicators.find(i => i.name === SENTIMENT_NAME) ?? null;

  const { signal, text } = computeActionSignal(marketResult.indicators, tga, credit);

  return {
    actionSignal: signal,
    actionText: text,
    usMacro,
    sentiment,
    liquidity: tga,
    credit,
    watchlist,
    events: getUpcomingEvents(3),
    updatedAt: new Date().toISOString(),
  };
}
