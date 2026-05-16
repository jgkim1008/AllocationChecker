import { NextResponse } from 'next/server';

type AlertLevel = 'danger' | 'warning' | 'neutral' | 'positive';
type TrendDir   = 'up' | 'down' | 'flat';

interface IndicatorConfig {
  symbol:      string;
  name:        string;
  note:        string;
  formatValue: (v: number) => string;
  alertFn:     (v: number) => AlertLevel;
}

const CONFIGS: IndicatorConfig[] = [
  {
    symbol: '^TNX',
    name: '미 10년물 국채금리',
    note: '금리 상승 → 주식 밸류에이션 압박, 성장주 부담',
    formatValue: (v) => `${v.toFixed(2)}%`,
    alertFn: (v) => v > 4.5 ? 'danger' : v > 4.0 ? 'warning' : v < 3.5 ? 'positive' : 'neutral',
  },
  {
    symbol: 'CL=F',
    name: 'WTI 원유',
    note: '에너지 비용 상승 → 인플레이션 압력 재점화 위험',
    formatValue: (v) => `$${v.toFixed(1)}`,
    alertFn: (v) => v > 100 ? 'danger' : v > 85 ? 'warning' : v < 70 ? 'positive' : 'neutral',
  },
  {
    symbol: 'DX-Y.NYB',
    name: 'DXY 달러 인덱스',
    note: '달러 강세 → 신흥국 통화·원자재 동반 약세',
    formatValue: (v) => v.toFixed(2),
    alertFn: (v) => v > 104 ? 'danger' : v > 100 ? 'warning' : v < 95 ? 'positive' : 'neutral',
  },
  {
    symbol: 'USDKRW=X',
    name: 'USD/KRW',
    note: '환율 상승 → 수입물가↑, 해외자산 환차익 유리',
    formatValue: (v) => `${Math.round(v).toLocaleString('ko-KR')}원`,
    alertFn: (v) => v > 1480 ? 'danger' : v > 1400 ? 'warning' : v < 1300 ? 'positive' : 'neutral',
  },
];

function getTrend(
  price: number,
  closes: number[],
  changePercent: number,
): { text: string; dir: TrendDir } {
  if (closes.length >= 10) {
    const max52 = Math.max(...closes);
    const min52 = Math.min(...closes);
    const range = max52 - min52;
    const pos   = range > 0 ? (price - min52) / range : 0.5;

    if (pos >= 0.97) return { text: '52주 신고가 근접', dir: 'up' };
    if (pos <= 0.03) return { text: '52주 신저가 근접', dir: 'down' };
  }

  const abs = Math.abs(changePercent);
  if (abs < 0.2) return { text: '보합', dir: 'flat' };
  if (changePercent > 0)
    return { text: `+${changePercent.toFixed(2)}%`, dir: 'up' };
  return { text: `${changePercent.toFixed(2)}%`, dir: 'down' };
}

function getMarketComment(
  alerts: AlertLevel[],
): { level: 'safe' | 'caution' | 'risk'; text: string } {
  const danger  = alerts.filter(a => a === 'danger').length;
  const warning = alerts.filter(a => a === 'warning').length;

  if (danger >= 2)
    return { level: 'risk',    text: '복수 지표 위험 수준 — 리스크 관리 최우선, 신규 진입 자제.' };
  if (danger >= 1 || warning >= 3)
    return { level: 'caution', text: '금리·달러·환율 복합 부담 — 단기 변동성 확대 구간, 비중 조절 권장.' };
  if (warning >= 2)
    return { level: 'caution', text: '경계 지표 다수 — 시장 변동성 주의, 포지션 점검 필요.' };
  if (alerts.every(a => a === 'positive' || a === 'neutral'))
    return { level: 'safe',    text: '전반적으로 안정적인 매크로 환경. 전략적 진입 기회 탐색 가능.' };
  return { level: 'caution', text: '일부 지표 주의 구간 — 선별적 접근 권장.' };
}

async function fetchSymbol(cfg: IndicatorConfig) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cfg.symbol)}?range=1y&interval=1d`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    next: { revalidate: 900 },   // 15분 서버 캐시
  });
  if (!res.ok) throw new Error(`Yahoo ${cfg.symbol}: ${res.status}`);

  const data = await res.json();
  const result     = data?.chart?.result?.[0];
  const meta       = result?.meta;
  const timestamps: number[]          = result?.timestamp ?? [];
  const rawCloses:  (number | null)[] = result?.indicators?.quote?.[0]?.close ?? [];

  // 히스토리 — timestamp(Unix초) → YYYY-MM-DD, null 제거
  const history: { time: string; value: number }[] = [];
  timestamps.forEach((ts, i) => {
    const v = rawCloses[i];
    if (v == null) return;
    const d   = new Date(ts * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    history.push({
      time:  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
      value: v,
    });
  });

  const closes = history.map(h => h.value);
  const price: number     = meta?.regularMarketPrice ?? closes.at(-1) ?? 0;
  const prevClose: number = meta?.chartPreviousClose ?? meta?.previousClose ?? price;
  const changePercent     = prevClose !== 0
    ? ((price - prevClose) / prevClose) * 100
    : 0;

  const { text: trendText, dir: trendDir } = getTrend(price, closes, changePercent);

  return {
    symbol:        cfg.symbol,
    name:          cfg.name,
    note:          cfg.note,
    value:         cfg.formatValue(price),
    rawValue:      price,
    changePercent: Math.round(changePercent * 100) / 100,
    trendText,
    trendDir,
    alertLevel:    cfg.alertFn(price),
    history,
  };
}

export async function GET() {
  try {
    const results = await Promise.allSettled(CONFIGS.map(fetchSymbol));

    const indicators = results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      // fallback: 데이터 없음 상태
      return {
        symbol:        CONFIGS[i].symbol,
        name:          CONFIGS[i].name,
        note:          CONFIGS[i].note,
        value:         '-',
        rawValue:      0,
        changePercent: 0,
        trendText:     '조회 실패',
        trendDir:      'flat' as TrendDir,
        alertLevel:    'neutral' as AlertLevel,
        history:       [] as { time: string; value: number }[],
      };
    });

    const marketComment = getMarketComment(indicators.map(i => i.alertLevel));

    return NextResponse.json(
      { indicators, marketComment, updatedAt: new Date().toISOString() },
      { headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' } },
    );
  } catch (err) {
    console.error('[market-indicators]', err);
    return NextResponse.json({ error: '조회 실패' }, { status: 500 });
  }
}
