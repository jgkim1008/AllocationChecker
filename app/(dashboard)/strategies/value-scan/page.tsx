'use client';

import { useState, useEffect, useCallback } from 'react';
import { BookOpen, RefreshCw, Filter, TrendingUp, Award, Clock } from 'lucide-react';
import { ValueScanTable, type ValueScanResultRow } from '@/components/strategies/ValueScanTable';
import { PremiumGate } from '@/components/PremiumGate';

type GradeFilter = 'ALL' | 'A' | 'B' | 'C' | 'D';
type MarketFilter = 'ALL' | 'US' | 'KR';
type SortField = 'total_score' | 'market_cap' | 'dividend_yield';

const GRADE_TABS: { key: GradeFilter; label: string; color: string }[] = [
  { key: 'ALL', label: '전체', color: 'text-gray-700' },
  { key: 'A', label: 'A 적극매수', color: 'text-amber-700' },
  { key: 'B', label: 'B 매수고려', color: 'text-yellow-700' },
  { key: 'C', label: 'C 홀딩', color: 'text-gray-600' },
  { key: 'D', label: 'D 비추천', color: 'text-red-500' },
];

export default function ValueScanPage() {
  const [stocks, setStocks] = useState<ValueScanResultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [scannedAt, setScannedAt] = useState<string | null>(null);
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>('ALL');
  const [marketFilter, setMarketFilter] = useState<MarketFilter>('ALL');
  const [sortField, setSortField] = useState<SortField>('total_score');

  const fetchResults = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ sort: sortField });
      if (gradeFilter !== 'ALL') params.set('grade', gradeFilter);
      if (marketFilter !== 'ALL') params.set('market', marketFilter);

      const res = await fetch(`/api/strategies/value-scan/results?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setStocks(json.results ?? []);
      setScannedAt(json.scannedAt ?? null);
    } catch (e) {
      console.error(e);
      setStocks([]);
    } finally {
      setLoading(false);
    }
  }, [gradeFilter, marketFilter, sortField]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  const formatScannedAt = (iso: string | null) => {
    if (!iso) return '스캔 데이터 없음';
    const d = new Date(iso);
    return d.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 다음 스캔 일시 계산 (매주 일요일 0시)
  const getNextScanDate = () => {
    const now = new Date();
    const daysUntilSunday = (7 - now.getDay()) % 7 || 7;
    const next = new Date(now);
    next.setDate(now.getDate() + daysUntilSunday);
    next.setHours(0, 0, 0, 0);
    return next.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
  };

  const gradeCounts = stocks.reduce(
    (acc, s) => {
      acc[s.grade as 'A' | 'B' | 'C' | 'D'] = (acc[s.grade as 'A' | 'B' | 'C' | 'D'] ?? 0) + 1;
      return acc;
    },
    {} as Record<'A' | 'B' | 'C' | 'D', number>
  );

  return (
    <div className="min-h-screen bg-stone-50/50">
      <div className="max-w-7xl mx-auto px-4 pt-8 pb-16">
        {/* 헤더 */}
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 bg-amber-100 rounded-xl">
              <BookOpen className="h-6 w-6 text-amber-700" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold uppercase tracking-wider">
                <Award className="h-3 w-3" />
                가속화 장기투자 법칙
              </div>
            </div>
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900 mb-2">오일전문가 가치투자 전략</h1>
          <p className="text-gray-500 max-w-2xl text-sm">
            S&P 500 + KOSPI 200 전종목을 100점 만점 점수표로 채점합니다.
            저PER·고배당·자사주소각·세계적 브랜드를 보유한 구조적 우량주를 선별합니다.
          </p>

          {/* 스캔 정보 */}
          <div className="flex flex-wrap items-center gap-4 mt-4">
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <Clock className="h-3.5 w-3.5" />
              {scannedAt
                ? `최근 스캔: ${formatScannedAt(scannedAt)}`
                : `스캔 데이터 없음 — 다음 스캔: ${getNextScanDate()}`}
            </div>
            {scannedAt && (
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <RefreshCw className="h-3.5 w-3.5" />
                다음 스캔: {getNextScanDate()}
              </div>
            )}
          </div>
        </header>

        {/* 요약 카드 */}
        {!loading && stocks.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {(['A', 'B', 'C', 'D'] as const).map((g) => {
              const cfg = {
                A: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', label: '적극 매수' },
                B: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200', label: '매수 고려' },
                C: { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', label: '홀딩' },
                D: { bg: 'bg-red-50', text: 'text-red-400', border: 'border-red-100', label: '비추천' },
              }[g];
              return (
                <button
                  key={g}
                  onClick={() => setGradeFilter(g)}
                  className={`rounded-2xl border p-4 text-left transition-all hover:shadow-md ${cfg.bg} ${cfg.border} ${gradeFilter === g ? 'ring-2 ring-amber-400' : ''}`}
                >
                  <p className={`text-3xl font-black ${cfg.text}`}>{gradeCounts[g] ?? 0}</p>
                  <p className={`text-xs font-bold ${cfg.text} opacity-70`}>
                    {g}등급 · {cfg.label}
                  </p>
                </button>
              );
            })}
          </div>
        )}

        {/* 필터 바 */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          {/* 등급 탭 */}
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-2xl p-1">
            {GRADE_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setGradeFilter(tab.key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  gradeFilter === tab.key
                    ? 'bg-amber-600 text-white shadow-sm'
                    : `${tab.color} hover:bg-amber-50`
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {/* 시장 필터 */}
            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1">
              {(['ALL', 'US', 'KR'] as MarketFilter[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMarketFilter(m)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    marketFilter === m
                      ? 'bg-stone-700 text-white shadow-sm'
                      : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {m === 'ALL' ? '전체' : m}
                </button>
              ))}
            </div>

            {/* 정렬 */}
            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1">
              {([
                { key: 'total_score', label: '총점순' },
                { key: 'market_cap', label: '시총순' },
                { key: 'dividend_yield', label: '배당순' },
              ] as { key: SortField; label: string }[]).map((s) => (
                <button
                  key={s.key}
                  onClick={() => setSortField(s.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    sortField === s.key
                      ? 'bg-stone-700 text-white shadow-sm'
                      : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <button
              onClick={fetchResults}
              className="p-2 rounded-xl bg-white border border-gray-200 text-gray-400 hover:text-amber-600 hover:border-amber-200 transition-all"
              title="새로고침"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 테이블 */}
        <PremiumGate featureName="오일전문가 가치투자 전략">
          <ValueScanTable stocks={stocks} loading={loading} />
        </PremiumGate>

        {/* 스캔 안내 (데이터 없을 때) */}
        {!loading && stocks.length === 0 && (
          <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-sm text-amber-700">
            <p className="font-bold mb-1">첫 스캔이 아직 실행되지 않았습니다.</p>
            <p className="text-amber-600">
              매주 일요일 자정에 자동으로 S&P 500 + KOSPI 200 전종목을 스캔합니다.
              다음 스캔: <strong>{getNextScanDate()}</strong>
            </p>
          </div>
        )}

        {/* 점수표 설명 */}
        <div className="mt-10 bg-white border border-gray-200 rounded-[32px] p-8">
          <div className="flex items-center gap-2 mb-6">
            <TrendingUp className="h-5 w-5 text-amber-600" />
            <h2 className="text-lg font-black text-gray-800">100점 채점 기준</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6 text-sm">
            <div>
              <h3 className="font-bold text-amber-700 mb-3 pb-1 border-b border-amber-100">
                이익 창출력 / 저평가 (30pt)
              </h3>
              <ul className="space-y-1.5 text-gray-600">
                <li>• PER <span className="font-semibold">(20pt)</span> — 5↓20 / 8↓15 / 10↓10 / 이상5</li>
                <li>• PBR <span className="font-semibold">(5pt)</span> — 0.3↓5 / 0.6↓4 / 1.0↓3</li>
                <li>• 이익 지속성 <span className="font-semibold">(5pt)</span> — 매출총이익률 20% 초과 AND 이익성장 양수</li>
                <li>• 단독 상장 <span className="font-semibold">(5pt)</span> — 지수 구성 기본 5pt</li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold text-amber-700 mb-3 pb-1 border-b border-amber-100">
                주주환원 의지 (40pt)
              </h3>
              <ul className="space-y-1.5 text-gray-600">
                <li>• 배당수익률 <span className="font-semibold">(10pt)</span> — 7%↑10 / 5%↑7 / 3%↑5</li>
                <li>• 분기 배당 <span className="font-semibold">(5pt)</span> — quarterly/monthly</li>
                <li>• 배당 연속 인상 <span className="font-semibold">(5pt)</span> — 10년↑5 / 5년↑4 / 3년↑3</li>
                <li>• 자사주 매입 여부 <span className="font-semibold">(7pt)</span> — 주식수 감소 시</li>
                <li>• 소각 비율 <span className="font-semibold">(8pt)</span> — 2%↑8 / 1.5%↑5 / 0.5%↑3</li>
                <li>• 자사주 보유 <span className="font-semibold">(5pt)</span> — 1%↓5 / 2%↓4 / 5%↓2</li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold text-amber-700 mb-3 pb-1 border-b border-amber-100">
                미래 성장 / 경쟁력 (25pt + 5pt)
              </h3>
              <ul className="space-y-1.5 text-gray-600">
                <li>• 성장 잠재력 <span className="font-semibold">(10pt)</span> — 매출성장률 20%↑10 / 10%↑7</li>
                <li>• 기업 경영 ROE <span className="font-semibold">(10pt)</span> — 20%↑10 / 10%↑5</li>
                <li>• 세계적 브랜드 <span className="font-semibold">(5pt)</span> — 미국 $50B+ / 한국 10조+</li>
              </ul>
              <div className="mt-4 p-3 bg-amber-50 rounded-xl">
                <p className="text-xs text-amber-700 font-bold">투자 등급</p>
                <p className="text-xs text-amber-600 mt-1">A(적극매수): 80점 초과<br />B(매수고려): 70~80점<br />C(홀딩): 50~70점<br />D(비추천): 50점 미만</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
