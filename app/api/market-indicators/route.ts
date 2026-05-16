import { NextResponse } from 'next/server';

type AlertLevel = 'danger' | 'warning' | 'neutral' | 'positive';
type TrendDir   = 'up' | 'down' | 'flat';

interface IndicatorConfig {
  symbol:      string;
  name:        string;
  note:        string;
  formatValue: (v: number) => string;
  // v=현재가, changePct=일간변화율, closes=1년 종가 배열 (52주 위치 계산용)
  alertFn:     (v: number, changePct: number, closes: number[]) => AlertLevel;
}

// 52주 위치 (0=신저가, 1=신고가)
function posIn52w(price: number, closes: number[]): number {
  if (closes.length < 5) return 0.5;
  const max = Math.max(...closes);
  const min = Math.min(...closes);
  const range = max - min;
  return range > 0 ? (price - min) / range : 0.5;
}

const CONFIGS: IndicatorConfig[] = [
  // ── 공포/변동성 ───────────────────────────────────────────────────────
  {
    symbol: '^VIX',
    name: 'VIX 공포지수',
    note: '시장 공포 온도계. >30 공포, >40 극도 공포 → 주가 급락 경보',
    formatValue: (v) => v.toFixed(2),
    alertFn: (v) =>
      v > 40 ? 'danger' : v > 30 ? 'warning' : v < 15 ? 'positive' : 'neutral',
  },
  // ── 금리 ─────────────────────────────────────────────────────────────
  {
    symbol: '^TNX',
    name: '미 10년물 국채금리',
    note: '금리 상승 → 주식 밸류에이션 압박, 성장주 부담',
    formatValue: (v) => `${v.toFixed(2)}%`,
    alertFn: (v) =>
      v > 4.5 ? 'danger' : v > 4.0 ? 'warning' : v < 3.5 ? 'positive' : 'neutral',
  },
  {
    symbol: '^IRX',
    name: '미 3개월물 금리',
    note: '단기금리. 10년물보다 높으면 수익률 곡선 역전 → 경기침체 선행 신호',
    formatValue: (v) => `${v.toFixed(2)}%`,
    alertFn: (v) =>
      v > 5.5 ? 'danger' : v > 4.5 ? 'warning' : v < 2.0 ? 'positive' : 'neutral',
  },
  // ── 달러/환율 ─────────────────────────────────────────────────────────
  {
    symbol: 'DX-Y.NYB',
    name: 'DXY 달러 인덱스',
    note: '달러 강세 → 신흥국 통화·원자재 동반 약세, 수출주 부담',
    formatValue: (v) => v.toFixed(2),
    alertFn: (v) =>
      v > 104 ? 'danger' : v > 100 ? 'warning' : v < 95 ? 'positive' : 'neutral',
  },
  {
    symbol: 'USDKRW=X',
    name: 'USD/KRW',
    note: '환율 상승 → 수입물가↑, 해외자산 환차익 유리',
    formatValue: (v) => `${Math.round(v).toLocaleString('ko-KR')}원`,
    alertFn: (v) =>
      v > 1480 ? 'danger' : v > 1400 ? 'warning' : v < 1300 ? 'positive' : 'neutral',
  },
  {
    symbol: 'USDJPY=X',
    name: 'USD/JPY (달러/엔)',
    note: '엔 급등(수치↓) → 엔 캐리 청산 → 글로벌 주가 급락 위험',
    formatValue: (v) => v.toFixed(2),
    // 엔 강세(낮은값) = 위험, 엔 약세(높은값) = 과열 경고
    alertFn: (v) =>
      v < 130 ? 'danger' : v < 140 ? 'warning' : v > 158 ? 'warning' : 'neutral',
  },
  // ── 원자재 ────────────────────────────────────────────────────────────
  {
    symbol: 'CL=F',
    name: 'WTI 원유',
    note: '에너지 비용 상승 → 인플레이션 압력 재점화, 소비 위축',
    formatValue: (v) => `$${v.toFixed(1)}`,
    alertFn: (v) =>
      v > 100 ? 'danger' : v > 85 ? 'warning' : v < 60 ? 'warning' : 'neutral',
  },
  {
    symbol: 'GC=F',
    name: '금 (Gold)',
    note: '안전자산 수요 급증 → 리스크오프 환경, 주식 회피 심리',
    formatValue: (v) => `$${Math.round(v).toLocaleString('en-US')}`,
    // 금 급등 = 공포/인플레이션 경고 / 낮은 금 = 위험선호(긍정)
    alertFn: (_v, _c, closes) => {
      const pos = posIn52w(_v, closes);
      return pos >= 0.90 ? 'warning' : pos <= 0.15 ? 'positive' : 'neutral';
    },
  },
  {
    symbol: 'HG=F',
    name: '구리 (Copper)',
    note: '경기 선행 지표 — 구리 하락 → 3~6개월 후 경기 둔화 경고',
    formatValue: (v) => `$${v.toFixed(3)}/lb`,
    alertFn: (v) =>
      v < 3.0 ? 'danger' : v < 3.5 ? 'warning' : v > 4.5 ? 'positive' : 'neutral',
  },
  // ── 주요 지수 ─────────────────────────────────────────────────────────
  {
    symbol: '^SOX',
    name: '필라델피아 반도체 (SOX)',
    note: '반도체 경기 선행. KOSPI·삼성전자 강한 상관관계',
    formatValue: (v) => Math.round(v).toLocaleString('en-US'),
    alertFn: (_v, _c, closes) => {
      const pos = posIn52w(_v, closes);
      return pos <= 0.10 ? 'danger' : pos <= 0.25 ? 'warning' : pos >= 0.85 ? 'positive' : 'neutral';
    },
  },
  {
    symbol: '^RUT',
    name: '러셀 2000 (소형주)',
    note: '미국 소형주 경기 민감도 — 경기침체 진입 시 대형주보다 먼저 하락',
    formatValue: (v) => Math.round(v).toLocaleString('en-US'),
    alertFn: (_v, _c, closes) => {
      const pos = posIn52w(_v, closes);
      return pos <= 0.10 ? 'danger' : pos <= 0.25 ? 'warning' : pos >= 0.85 ? 'positive' : 'neutral';
    },
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
  indicators: { name: string; alertLevel: AlertLevel }[],
): { level: 'safe' | 'caution' | 'risk'; text: string } {
  const danger  = indicators.filter(i => i.alertLevel === 'danger').length;
  const warning = indicators.filter(i => i.alertLevel === 'warning').length;
  const total   = indicators.length;

  // 위험 지표 이름 목록
  const dangerNames  = indicators.filter(i => i.alertLevel === 'danger').map(i => i.name).join(', ');
  const warningNames = indicators.filter(i => i.alertLevel === 'warning').map(i => i.name).join(', ');

  if (danger >= 3)
    return { level: 'risk',    text: `복수 지표 동시 위험 (${dangerNames}) — 리스크 관리 최우선, 신규 진입 자제.` };
  if (danger >= 2)
    return { level: 'risk',    text: `위험 지표 2개 이상 (${dangerNames}) — 포지션 축소 및 손절 재점검.` };
  if (danger >= 1)
    return { level: 'caution', text: `위험 지표 감지 (${dangerNames}) — 단기 변동성 확대 가능, 비중 조절 권장.` };
  if (warning >= 5)
    return { level: 'caution', text: `복합 경고 (${warning}/${total}개) — 매크로 불확실성 높음, 관망 또는 헤지 검토.` };
  if (warning >= 3)
    return { level: 'caution', text: `경고 지표 다수 (${warningNames}) — 시장 변동성 주의, 포지션 점검 필요.` };
  if (warning >= 1)
    return { level: 'caution', text: `일부 지표 주의 구간 (${warningNames}) — 선별적 접근 권장.` };
  if (indicators.every(i => i.alertLevel === 'positive' || i.alertLevel === 'neutral'))
    return { level: 'safe',    text: '전반적으로 안정적인 매크로 환경. 전략적 진입 기회 탐색 가능.' };
  return { level: 'caution', text: '일부 지표 주의 구간 — 선별적 접근 권장.' };
}

async function fetchSymbol(cfg: IndicatorConfig) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cfg.symbol)}?range=1y&interval=1d`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    next: { revalidate: 900 },
  });
  if (!res.ok) throw new Error(`Yahoo ${cfg.symbol}: ${res.status}`);

  const data = await res.json();
  const result     = data?.chart?.result?.[0];
  const meta       = result?.meta;
  const timestamps: number[]          = result?.timestamp ?? [];
  const rawCloses:  (number | null)[] = result?.indicators?.quote?.[0]?.close ?? [];

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
    alertLevel:    cfg.alertFn(price, changePercent, closes),
    history,
  };
}

export async function GET() {
  try {
    const results = await Promise.allSettled(CONFIGS.map(fetchSymbol));

    const indicators = results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
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

    const marketComment = getMarketComment(indicators.map(i => ({ name: i.name, alertLevel: i.alertLevel })));

    return NextResponse.json(
      { indicators, marketComment, updatedAt: new Date().toISOString() },
      { headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' } },
    );
  } catch (err) {
    console.error('[market-indicators]', err);
    return NextResponse.json({ error: '조회 실패' }, { status: 500 });
  }
}
