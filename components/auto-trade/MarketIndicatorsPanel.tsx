'use client';

import { TrendingUp, TrendingDown, Minus, AlertTriangle, Flame, Activity } from 'lucide-react';

// ── 최신 데이터 업데이트 시 이 블록만 수정 ──────────────────────────────
const UPDATED_AT = '2026-05-16';

type AlertLevel = 'danger' | 'warning' | 'neutral' | 'positive';
type TrendDir = 'up' | 'down' | 'flat';

interface IndicatorRow {
  name: string;
  value: string;
  trend: string;
  trendDir: TrendDir;
  alert: AlertLevel;
  note: string;
}

const MACRO_INDICATORS: IndicatorRow[] = [
  {
    name: '미 10년물 국채금리',
    value: '4.46%',
    trend: '연중 신고가',
    trendDir: 'up',
    alert: 'danger',
    note: '금리 상승 → 주식 밸류에이션 압박, 성장주 부담',
  },
  {
    name: 'WTI 원유',
    value: '$101~107',
    trend: '박스권, 변동성 ↑',
    trendDir: 'flat',
    alert: 'warning',
    note: '에너지 비용 상승 → 인플레이션 압력 재점화 위험',
  },
  {
    name: 'DXY 달러 인덱스',
    value: '99.05',
    trend: '2주 신고가',
    trendDir: 'up',
    alert: 'warning',
    note: '달러 강세 → 신흥국 통화·원자재 동반 약세',
  },
  {
    name: 'USD/KRW',
    value: '1,471원',
    trend: '원화 약세 지속',
    trendDir: 'up',
    alert: 'warning',
    note: '환율 상승 → 수입물가↑, 해외자산 환차익 유리',
  },
];

// ── 리스크 해석 (종합 판단) ─────────────────────────────────────────────
const MARKET_COMMENT = {
  level: 'caution',   // 'safe' | 'caution' | 'risk'
  text: '금리 고점·달러 강세·원화 약세 삼중 부담. 단기 변동성 확대 구간 — 비중 조절 권장.',
};
// ── END ────────────────────────────────────────────────────────────────

const ALERT_STYLES: Record<AlertLevel, { badge: string; row: string; icon: string }> = {
  danger:   { badge: 'bg-red-100 text-red-700',    row: 'bg-red-50/60',    icon: 'text-red-500' },
  warning:  { badge: 'bg-amber-100 text-amber-700', row: 'bg-amber-50/40',  icon: 'text-amber-500' },
  neutral:  { badge: 'bg-gray-100 text-gray-600',   row: '',                icon: 'text-gray-400' },
  positive: { badge: 'bg-emerald-100 text-emerald-700', row: 'bg-emerald-50/40', icon: 'text-emerald-500' },
};

const COMMENT_STYLES: Record<string, string> = {
  safe:    'border-emerald-200 bg-emerald-50 text-emerald-800',
  caution: 'border-amber-200 bg-amber-50 text-amber-800',
  risk:    'border-red-200 bg-red-50 text-red-800',
};

function TrendIcon({ dir, className }: { dir: TrendDir; className?: string }) {
  if (dir === 'up')   return <TrendingUp  className={`h-3.5 w-3.5 ${className}`} />;
  if (dir === 'down') return <TrendingDown className={`h-3.5 w-3.5 ${className}`} />;
  return <Minus className={`h-3.5 w-3.5 ${className}`} />;
}

export function MarketIndicatorsPanel() {
  const dangerCount = MACRO_INDICATORS.filter(r => r.alert === 'danger').length;

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-gray-500" />
          <h2 className="text-base font-bold text-gray-800">시장 지표 현재 상황</h2>
          {dangerCount > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-600">
              <Flame className="h-3 w-3" />
              위험 {dangerCount}
            </span>
          )}
        </div>
        <span className="text-[11px] text-gray-400">업데이트: {UPDATED_AT}</span>
      </div>

      {/* 종합 판단 배너 */}
      <div className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm font-medium ${COMMENT_STYLES[MARKET_COMMENT.level]}`}>
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{MARKET_COMMENT.text}</span>
      </div>

      {/* 지표 테이블 */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-2.5 text-left text-[11px] font-black uppercase tracking-wider text-gray-400">지표</th>
              <th className="px-4 py-2.5 text-right text-[11px] font-black uppercase tracking-wider text-gray-400">현재값</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-black uppercase tracking-wider text-gray-400">추세</th>
              <th className="hidden px-4 py-2.5 text-left text-[11px] font-black uppercase tracking-wider text-gray-400 sm:table-cell">해석</th>
            </tr>
          </thead>
          <tbody>
            {MACRO_INDICATORS.map((row, i) => {
              const styles = ALERT_STYLES[row.alert];
              return (
                <tr
                  key={i}
                  className={`border-b border-gray-50 last:border-0 transition-colors ${styles.row}`}
                >
                  <td className="px-4 py-3">
                    <span className="text-sm font-bold text-gray-800">{row.name}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-black tabular-nums text-gray-900">{row.value}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${styles.badge}`}>
                      <TrendIcon dir={row.trendDir} className={styles.icon} />
                      {row.trend}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    <span className="text-xs text-gray-500">{row.note}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 모바일: 해석 카드 */}
      <div className="space-y-2 sm:hidden">
        {MACRO_INDICATORS.map((row, i) => (
          <div key={i} className="rounded-xl border border-gray-100 bg-white px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-700">{row.name}</span>
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${ALERT_STYLES[row.alert].badge}`}>
                {row.trend}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-gray-400">{row.note}</p>
          </div>
        ))}
      </div>

      {/* 범례 */}
      <div className="flex flex-wrap gap-3 text-[11px] text-gray-500">
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-400" />위험 — 즉각 대응 필요</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" />경고 — 모니터링 강화</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-gray-300" />중립</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />긍정</span>
      </div>
    </div>
  );
}
