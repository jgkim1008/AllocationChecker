'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, Calendar, TrendingUp, Info, RefreshCw } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, BarChart, Bar,
} from 'recharts';

// ── ETF 데이터 ────────────────────────────────────────────────────────────────

interface EtfItem {
  code: string;
  name: string;
  yieldRate: string;
  divTime: 'early' | 'mid';
  assetType: 'us' | 'kr';
  tax: 'taxable' | 'exempt';
  highlight?: boolean;
  note?: string;
}

const ETF_LIST: EtfItem[] = [
  // ── 월(초) 미국 ──
  { code: '483280', name: 'KODEX 미국AI테크TOP10타겟커버드콜',       yieldRate: '10%',    divTime: 'early', assetType: 'us', tax: 'taxable' },
  { code: '468390', name: 'RISE 미국AI빅테크멀티플리어고배당커버드콜', yieldRate: '15%',    divTime: 'early', assetType: 'us', tax: 'taxable' },
  // ── 월(초) 국내 ──
  { code: '161510', name: 'PLUS 고배당주',                           yieldRate: '~4%',    divTime: 'early', assetType: 'kr', tax: 'exempt' },
  { code: '400410', name: 'KODEX 공모주&리츠자산배분TOP10',           yieldRate: '~4%',    divTime: 'early', assetType: 'kr', tax: 'exempt' },
  { code: '278530', name: 'KODEX 3배당주',                           yieldRate: '~5%',    divTime: 'early', assetType: 'kr', tax: 'exempt' },
  { code: '448410', name: 'KODEX 200타겟위클리커버드콜TOP10',         yieldRate: '10~12%', divTime: 'early', assetType: 'kr', tax: 'exempt' },
  { code: '487200', name: 'PLUS 고배당우선배당커버드콜',              yieldRate: '~8%',    divTime: 'early', assetType: 'kr', tax: 'exempt' },
  { code: '050470', name: 'TIGER 리츠커버드콜우선콜',                yieldRate: '~6%',    divTime: 'early', assetType: 'kr', tax: 'exempt' },
  { code: '475720', name: 'RISE 200위클리커버드콜',                  yieldRate: '~15%',   divTime: 'early', assetType: 'kr', tax: 'exempt' },
  { code: '422190', name: 'KODEX 리츠부동산인프라',                  yieldRate: '~4%',    divTime: 'early', assetType: 'kr', tax: 'exempt' },
  { code: '329200', name: 'TIGER 리츠부동산인프라',                  yieldRate: '~4%',    divTime: 'early', assetType: 'kr', tax: 'exempt' },
  // ── 월(중순) 미국 ──
  { code: '474220', name: 'TIGER 미국테크TOP10타겟커버드콜',          yieldRate: '10%',    divTime: 'mid',   assetType: 'us', tax: 'taxable', note: '3년 +29.7%' },
  { code: '473540', name: 'TIGER 미국AI빅테크10타겟데일리커버드콜',   yieldRate: '15%',    divTime: 'mid',   assetType: 'us', tax: 'taxable', note: '3년 +35.6%' },
  { code: '468380', name: 'ACE 미국500데일리타겟커버드콜(합성)',       yieldRate: '15%',    divTime: 'mid',   assetType: 'us', tax: 'taxable' },
  { code: '489250', name: 'KODEX 미국배당다우존스',                  yieldRate: '3.5~4%', divTime: 'mid',   assetType: 'us', tax: 'taxable', note: '3년 +14.2%' },
  { code: '402970', name: 'ACE 미국배당다우존스',                    yieldRate: '3.5~4%', divTime: 'mid',   assetType: 'us', tax: 'taxable', note: '3년 +14.3%' },
  { code: '458750', name: 'TIGER 미국배당다우존스타겟커버드콜 1호',   yieldRate: '7.5%',   divTime: 'mid',   assetType: 'us', tax: 'taxable', note: '3년 +13.5%' },
  { code: '469760', name: 'TIGER 미국배당다우존스타겟데일리커버드콜', yieldRate: '12%',    divTime: 'mid',   assetType: 'us', tax: 'taxable', note: '3년 +14.0%' },
  // ── 월(중순) 국내 ──
  { code: '476800', name: 'KODEX 한국부동산리츠인프라',              yieldRate: '~9%',    divTime: 'mid',   assetType: 'kr', tax: 'exempt', note: '3년 +7.6%' },
  { code: '498400', name: 'KODEX 200타겟위클리커버드콜',             yieldRate: '15%+α',  divTime: 'mid',   assetType: 'kr', tax: 'exempt', highlight: true, note: '시총 3.2조' },
  { code: '469050', name: 'TIGER 200타겟위클리커버드콜',             yieldRate: '~7%',    divTime: 'mid',   assetType: 'kr', tax: 'exempt' },
  { code: '463160', name: 'RISE 프리미엄클린고배당커버드콜(라코)',    yieldRate: '15~20%', divTime: 'mid',   assetType: 'kr', tax: 'exempt', note: '6개월 +58%' },
  { code: '466940', name: 'TIGER 코리아하이배당다우존스',            yieldRate: '~5%',    divTime: 'mid',   assetType: 'kr', tax: 'exempt' },
  { code: '458730', name: 'KODEX 글로벌고배당TOP10',                yieldRate: '3~5%',   divTime: 'mid',   assetType: 'kr', tax: 'exempt' },
  { code: '464600', name: 'KODEX 주주환원고배당주',                  yieldRate: '~4%',    divTime: 'mid',   assetType: 'kr', tax: 'exempt' },
  { code: '468420', name: 'PLUS 자사주매입고배당주',                 yieldRate: '~4%',    divTime: 'mid',   assetType: 'kr', tax: 'exempt', note: '3년 +18.4%' },
];

// ── 탭 타입 ───────────────────────────────────────────────────────────────────
type Tab = 'guide' | 'etf' | 'sim';

// ── 숫자 포맷 ─────────────────────────────────────────────────────────────────
function fmt만(n: number) {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}억원`;
  return `${Math.round(n).toLocaleString()}만원`;
}

// ── 커스텀 툴팁 ───────────────────────────────────────────────────────────────
function SimTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-700 mb-1">{label}개월차</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {fmt만(p.value)}
        </p>
      ))}
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
export default function TwoWeeksPage() {
  const [tab, setTab] = useState<Tab>('guide');

  // 시뮬레이터 입력값
  const [principal, setPrincipal] = useState(5000);       // 만원
  const [earlyRatio, setEarlyRatio] = useState(50);       // 월초 비율 %
  const [earlyYield, setEarlyYield] = useState(10);       // 월초 연분배율 %
  const [midYield, setMidYield] = useState(12);           // 월중순 연분배율 %
  const [reinvest, setReinvest] = useState(100);          // 재투자율 %
  const [simMonths, setSimMonths] = useState(36);

  // 시뮬레이션 계산
  const simData = useMemo(() => {
    let earlyAmt = principal * (earlyRatio / 100);
    let midAmt   = principal * ((100 - earlyRatio) / 100);
    let cumDiv   = 0;
    const rows = [];

    for (let m = 1; m <= simMonths; m++) {
      const earlyDiv = earlyAmt * (earlyYield / 1200);
      const midDiv   = midAmt   * (midYield   / 1200);
      const totalDiv = earlyDiv + midDiv;

      // 재투자: 월초 분배금 → 월중순, 월중순 분배금 → 월초
      earlyAmt += midDiv   * (reinvest / 100);
      midAmt   += earlyDiv * (reinvest / 100);

      cumDiv += totalDiv;
      const totalAsset = earlyAmt + midAmt;

      rows.push({
        month: m,
        월초분배금: +earlyDiv.toFixed(1),
        월중순분배금: +midDiv.toFixed(1),
        월분배금합계: +totalDiv.toFixed(1),
        누적분배금: +cumDiv.toFixed(1),
        총자산: +totalAsset.toFixed(1),
      });
    }
    return rows;
  }, [principal, earlyRatio, earlyYield, midYield, reinvest, simMonths]);

  const last = simData[simData.length - 1];

  // ETF 필터
  const earlyUs = ETF_LIST.filter(e => e.divTime === 'early' && e.assetType === 'us');
  const earlyKr = ETF_LIST.filter(e => e.divTime === 'early' && e.assetType === 'kr');
  const midUs   = ETF_LIST.filter(e => e.divTime === 'mid'   && e.assetType === 'us');
  const midKr   = ETF_LIST.filter(e => e.divTime === 'mid'   && e.assetType === 'kr');

  const TABS: { id: Tab; label: string }[] = [
    { id: 'guide', label: '전략 소개' },
    { id: 'etf',   label: 'ETF 목록' },
    { id: 'sim',   label: '복리 시뮬레이터' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 pt-8 pb-24">

        {/* 뒤로 */}
        <Link href="/strategies" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          투자 전략 목록
        </Link>

        {/* 헤더 */}
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold uppercase tracking-wider mb-3">
            배당의만장 · 2WEEKS 전략
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-1">배당의만장 2WEEKS 전략</h1>
          <p className="text-gray-500 text-sm">월(초) 배당 + 월(중순) 배당 — 한 달에 두 번 받는 배당으로 복리 성장</p>
        </div>

        {/* 탭 */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-8 w-fit">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                tab === t.id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── 전략 소개 ── */}
        {tab === 'guide' && (
          <div className="space-y-6">

            {/* 핵심 원리 카드 */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-emerald-600" />
                월 2회 배당 수령 사이클
              </h2>

              {/* 타임라인 */}
              <div className="relative">
                <div className="absolute top-5 left-0 right-0 h-0.5 bg-gray-200" />
                <div className="grid grid-cols-5 gap-2 relative">
                  {[
                    { day: '월말', label: '월(초) ETF\n분배기준일', color: 'bg-blue-500', text: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
                    { day: '3~7일', label: '월초 분배금\n계좌 입금', color: 'bg-blue-400', text: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
                    { day: '13일', label: '분배금으로\n월(중순) ETF 추가매수', color: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
                    { day: '15일', label: '월(중순) ETF\n분배기준일', color: 'bg-emerald-400', text: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
                    { day: '17~20일', label: '월중순 분배금\n계좌 입금 → 복리 재투자', color: 'bg-emerald-600', text: 'text-emerald-800', bg: 'bg-emerald-50 border-emerald-200' },
                  ].map((step, i) => (
                    <div key={i} className="flex flex-col items-center">
                      <div className={`w-10 h-10 rounded-full ${step.color} text-white flex items-center justify-center text-xs font-bold z-10 mb-2`}>
                        {i + 1}
                      </div>
                      <div className={`rounded-lg border ${step.bg} px-2 py-2 text-center w-full`}>
                        <p className={`text-xs font-bold ${step.text}`}>{step.day}</p>
                        <p className="text-xs text-gray-600 mt-0.5 leading-tight whitespace-pre-line">{step.label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-sm text-gray-600 mt-4 bg-gray-50 rounded-lg p-3">
                💡 <strong>핵심:</strong> 월초에 받은 분배금을 월중순 ETF 기준일(15일) <strong>2영업일 전(약 13일)까지</strong> 재투자하면 같은 달 월중순 분배금도 수령 가능 — 한 달에 두 번 배당 수령 + 복리 효과
              </p>
            </div>

            {/* 과세 분류 */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Info className="w-5 h-5 text-amber-500" />
                과세 구분 & 계좌 전략
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 px-3 text-gray-500 font-semibold">구분</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-semibold">매매차익</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-semibold">분배금</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-semibold">추천 계좌</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-50">
                      <td className="py-2.5 px-3 font-medium">
                        <span className="inline-flex items-center gap-1">🇰🇷 국내 상장 국내 ETF</span>
                      </td>
                      <td className="py-2.5 px-3"><span className="text-green-700 font-semibold bg-green-50 px-2 py-0.5 rounded">거의 비과세</span></td>
                      <td className="py-2.5 px-3"><span className="text-green-700 font-semibold bg-green-50 px-2 py-0.5 rounded">옵션프리미엄 비과세</span></td>
                      <td className="py-2.5 px-3 text-gray-600">일반 계좌 OK</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 font-medium">
                        <span className="inline-flex items-center gap-1">🇺🇸 국내 상장 미국 ETF</span>
                      </td>
                      <td className="py-2.5 px-3"><span className="text-red-600 font-semibold bg-red-50 px-2 py-0.5 rounded">배당소득세 과세</span></td>
                      <td className="py-2.5 px-3"><span className="text-red-600 font-semibold bg-red-50 px-2 py-0.5 rounded">배당소득세 과세</span></td>
                      <td className="py-2.5 px-3 font-semibold text-blue-700">ISA / 연금저축 권장</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* 전략 요점 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { icon: '📅', title: '월 2회 현금흐름', desc: '월(초) + 월(중순) ETF 조합으로 한 달에 두 번 배당 수령' },
                { icon: '🔄', title: '자동 복리 재투자', desc: '월초 분배금 → 월중순 ETF 재투자, 매월 원금이 불어남' },
                { icon: '🛡️', title: '절세 계좌 활용', desc: 'ISA·연금저축에 미국 ETF, 일반 계좌에 국내 ETF로 세금 최소화' },
              ].map((item) => (
                <div key={item.title} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="text-2xl mb-2">{item.icon}</div>
                  <h3 className="font-bold text-gray-900 text-sm mb-1">{item.title}</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ETF 목록 ── */}
        {tab === 'etf' && (
          <div className="space-y-6">
            {/* 범례 */}
            <div className="flex flex-wrap gap-3 text-xs">
              <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 px-2.5 py-1.5 rounded-full font-medium">🇺🇸 미국 ETF — ISA/연금 권장</span>
              <span className="inline-flex items-center gap-1.5 bg-green-50 text-green-700 px-2.5 py-1.5 rounded-full font-medium">🇰🇷 국내 ETF — 일반계좌 OK</span>
              <span className="inline-flex items-center gap-1.5 bg-yellow-50 text-yellow-700 px-2.5 py-1.5 rounded-full font-medium">★ 주목 종목</span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 월(초) */}
              <div className="bg-white rounded-2xl border border-blue-200 overflow-hidden">
                <div className="bg-blue-600 text-white px-5 py-3">
                  <h2 className="font-bold text-base">월(초) 배당지급 ETF</h2>
                  <p className="text-blue-100 text-xs mt-0.5">분배기준일: 월말 → 입금: 3~7일</p>
                </div>

                {/* 미국 */}
                <div className="px-4 pt-4 pb-2">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">🇺🇸 미국 ETF</p>
                  <EtfTable items={earlyUs} />
                </div>

                {/* 국내 */}
                <div className="px-4 pt-2 pb-4">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">🇰🇷 국내 ETF</p>
                  <EtfTable items={earlyKr} />
                </div>
              </div>

              {/* 월(중순) */}
              <div className="bg-white rounded-2xl border border-emerald-200 overflow-hidden">
                <div className="bg-emerald-600 text-white px-5 py-3">
                  <h2 className="font-bold text-base">월(중순) 배당지급 ETF</h2>
                  <p className="text-emerald-100 text-xs mt-0.5">분배기준일: 15일 → 입금: 17~20일</p>
                </div>

                {/* 미국 */}
                <div className="px-4 pt-4 pb-2">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">🇺🇸 미국 ETF</p>
                  <EtfTable items={midUs} />
                </div>

                {/* 국내 */}
                <div className="px-4 pt-2 pb-4">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">🇰🇷 국내 ETF</p>
                  <EtfTable items={midKr} />
                </div>
              </div>
            </div>

            <p className="text-xs text-gray-400 text-center">
              * 분배율은 과거 실적 기준이며 미래를 보장하지 않습니다. 투자 전 반드시 공식 운용보고서를 확인하세요.
            </p>
          </div>
        )}

        {/* ── 복리 시뮬레이터 ── */}
        {tab === 'sim' && (
          <div className="space-y-6">

            {/* 입력 패널 */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="text-base font-bold text-gray-900 mb-5 flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-emerald-600" />
                시뮬레이션 설정
              </h2>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
                <SimInput label="총 투자금액" unit="만원" value={principal} min={100} max={100000} step={100}
                  onChange={setPrincipal} />
                <SimInput label="월(초) 그룹 비율" unit="%" value={earlyRatio} min={10} max={90} step={5}
                  onChange={setEarlyRatio} hint={`월(중순): ${100 - earlyRatio}%`} />
                <SimInput label="월(초) 연 분배율" unit="%" value={earlyYield} min={1} max={30} step={0.5}
                  onChange={setEarlyYield} />
                <SimInput label="월(중순) 연 분배율" unit="%" value={midYield} min={1} max={30} step={0.5}
                  onChange={setMidYield} />
                <SimInput label="재투자율" unit="%" value={reinvest} min={0} max={100} step={10}
                  onChange={setReinvest} hint="0%=전액현금, 100%=전액재투자" />
                <SimInput label="시뮬레이션 기간" unit="개월" value={simMonths} min={12} max={120} step={12}
                  onChange={setSimMonths} />
              </div>
            </div>

            {/* 요약 카드 */}
            {last && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: '최종 총자산', value: fmt만(last.총자산), color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
                  { label: '누적 분배금', value: fmt만(last.누적분배금), color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
                  { label: '월 분배금 (마지막달)', value: fmt만(last.월분배금합계), color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200' },
                  { label: '총 수익률', value: `+${(((last.총자산 + last.누적분배금 * (1 - reinvest / 100)) / principal - 1) * 100).toFixed(1)}%`, color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
                ].map(c => (
                  <div key={c.label} className={`rounded-xl border p-4 ${c.bg}`}>
                    <p className="text-xs text-gray-500 mb-1">{c.label}</p>
                    <p className={`text-xl font-extrabold ${c.color}`}>{c.value}</p>
                  </div>
                ))}
              </div>
            )}

            {/* 자산 성장 차트 */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <h3 className="text-sm font-bold text-gray-700 mb-4">자산 성장 추이</h3>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={simData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gAsset" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#059669" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gDiv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tickFormatter={v => `${v}M`} tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => fmt만(v)} tick={{ fontSize: 11 }} width={70} />
                  <Tooltip content={<SimTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="총자산" stroke="#059669" strokeWidth={2} fill="url(#gAsset)" name="총자산" />
                  <Area type="monotone" dataKey="누적분배금" stroke="#3b82f6" strokeWidth={2} fill="url(#gDiv)" name="누적분배금" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* 월별 분배금 막대차트 */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <h3 className="text-sm font-bold text-gray-700 mb-4">월별 분배금 (월초 + 월중순)</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={simData.filter((_, i) => i % Math.max(1, Math.floor(simMonths / 24)) === 0)}
                  margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tickFormatter={v => `${v}M`} tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => fmt만(v)} tick={{ fontSize: 11 }} width={70} />
                  <Tooltip content={<SimTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="월초분배금" stackId="a" fill="#3b82f6" name="월초 분배금" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="월중순분배금" stackId="a" fill="#059669" name="월중순 분배금" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <p className="text-xs text-gray-400 text-center">
              * 세금, 거래비용 미반영. 분배율은 과거 실적 기준이며 실제 수익과 다를 수 있습니다.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── ETF 테이블 서브컴포넌트 ───────────────────────────────────────────────────
function EtfTable({ items }: { items: EtfItem[] }) {
  return (
    <div className="space-y-1.5">
      {items.map(e => (
        <div
          key={e.code}
          className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs gap-2 ${
            e.highlight
              ? 'bg-yellow-50 border border-yellow-300'
              : 'bg-gray-50 hover:bg-gray-100 transition-colors'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {e.highlight && <span className="text-yellow-500 shrink-0">★</span>}
            <span className="text-gray-400 font-mono shrink-0">{e.code}</span>
            <span className="text-gray-800 font-medium truncate">{e.name}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {e.note && <span className="text-gray-400 hidden sm:block">{e.note}</span>}
            <span className={`font-bold px-2 py-0.5 rounded ${
              e.highlight ? 'text-yellow-700 bg-yellow-100' : 'text-emerald-700 bg-emerald-50'
            }`}>
              {e.yieldRate}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── 슬라이더 입력 서브컴포넌트 ───────────────────────────────────────────────
function SimInput({
  label, unit, value, min, max, step, onChange, hint,
}: {
  label: string; unit: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; hint?: string;
}) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <label className="text-xs font-semibold text-gray-600">{label}</label>
        <span className="text-sm font-bold text-gray-900">{value.toLocaleString()}{unit}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer accent-emerald-600"
      />
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}
