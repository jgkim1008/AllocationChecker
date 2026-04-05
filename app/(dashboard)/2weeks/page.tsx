'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Calendar, TrendingUp, Info, RefreshCw, Sparkles, Calculator, Loader2, Clock, Play, BarChart3 } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, BarChart, Bar, LineChart, Line, ComposedChart,
} from 'recharts';
import { runTwoWeeksBacktest, type TwoWeeksBacktestResult } from '@/lib/2weeks/backtest';

// ── 메인 전략 조합 (배당의만장 2WEEKS) ──────────────────────────────────────────
interface StrategyPair {
  id: number;
  country: 'kr' | 'us';
  early: { code: string; name: string; yieldRate: number };
  mid: { code: string; name: string; yieldRate: number };
}

const MAIN_STRATEGIES: StrategyPair[] = [
  // 한국 ETF
  { id: 1, country: 'kr', early: { code: '475720', name: 'RISE 200 위클리커버드콜', yieldRate: 16 }, mid: { code: '498400', name: 'KODEX 200타겟 위클리커버드콜', yieldRate: 13 } },
  { id: 2, country: 'kr', early: { code: '161510', name: 'PLUS 고배당주', yieldRate: 4 }, mid: { code: '466940', name: 'TIGER 코리아배당다우존스', yieldRate: 4 } },
  // 미국 ETF
  { id: 3, country: 'us', early: { code: '483290', name: 'KODEX 미국성장 커버드콜액티브', yieldRate: 11 }, mid: { code: '483280', name: 'KODEX 미국배당 커버드콜액티브', yieldRate: 15 } },
  { id: 4, country: 'us', early: { code: '473540', name: 'TIGER 미국나스닥100 타겟데일리커버드콜', yieldRate: 15 }, mid: { code: '474220', name: 'TIGER 미국테크TOP10 타겟커버드콜', yieldRate: 10 } },
  { id: 5, country: 'us', early: { code: '458730', name: 'TIGER 미국배당다우존스', yieldRate: 3 }, mid: { code: '489250', name: 'KODEX 미국배당다우존스', yieldRate: 3 } },
  { id: 6, country: 'us', early: { code: '495090', name: 'KIWOOM 미국고배당&AI테크', yieldRate: 2 }, mid: { code: '494330', name: 'RISE 미국고배당 다우존스TOP10', yieldRate: 2 } },
];

// AI 추천 타입
interface AiRecommendation {
  id: number;
  country: 'kr' | 'us';
  early: { code: string; name: string; yield: string };
  mid: { code: string; name: string; yield: string };
  reason: string;
  risk: string;
}

// 개별 ETF 대안 타입
interface EtfAlternative {
  code: string;
  name: string;
  yield: string;
  reason: string;
}

interface StrategyAlternatives {
  strategyId: number;
  earlyAlt: EtfAlternative;
  midAlt: EtfAlternative;
}

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
  { code: '483280', name: 'KODEX 미국AI테크TOP10타겟커버드콜',              yieldRate: '10%',    divTime: 'early', assetType: 'us', tax: 'taxable', highlight: true },
  { code: '441640', name: 'KODEX 미국배당커버드콜액티브',                   yieldRate: '~8%',    divTime: 'early', assetType: 'us', tax: 'taxable', highlight: true, note: '시총 1.4조' },
  { code: '446720', name: 'SOL 미국배당다우존스',                           yieldRate: '~4%',    divTime: 'early', assetType: 'us', tax: 'taxable', highlight: true, note: '시총 9,398억' },
  { code: '468390', name: 'RISE 미국AI빅테크멀티플리어고배당커버드콜',       yieldRate: '15%',    divTime: 'early', assetType: 'us', tax: 'taxable' },
  { code: '490590', name: 'RISE 미국AI밸류체인데일리고정커버드콜',           yieldRate: '~15%',   divTime: 'early', assetType: 'us', tax: 'taxable' },
  { code: '0144L0', name: 'KODEX 미국성장커버드콜액티브',                   yieldRate: '~12%',   divTime: 'early', assetType: 'us', tax: 'taxable' },
  { code: '491620', name: 'RISE 미국테크100데일리고정커버드콜',              yieldRate: '~15%',   divTime: 'early', assetType: 'us', tax: 'taxable' },
  { code: '452360', name: 'SOL 미국배당다우존스(H)',                        yieldRate: '~4%',    divTime: 'early', assetType: 'us', tax: 'taxable' },
  { code: '483290', name: 'KODEX 미국배당다우존스타겟커버드콜',              yieldRate: '~8%',    divTime: 'early', assetType: 'us', tax: 'taxable' },
  { code: '490600', name: 'RISE 미국배당100데일리고정커버드콜',              yieldRate: '~8%',    divTime: 'early', assetType: 'us', tax: 'taxable' },
  { code: '493420', name: 'SOL 미국배당다우존스2호',                        yieldRate: '~4%',    divTime: 'early', assetType: 'us', tax: 'taxable' },
  { code: '0138T0', name: 'RISE 미국S&P500데일리고정커버드콜',              yieldRate: '~15%',   divTime: 'early', assetType: 'us', tax: 'taxable' },
  { code: '0107F0', name: 'KIWOOM 미국고배당&AI테크',                       yieldRate: '~10%',   divTime: 'early', assetType: 'us', tax: 'taxable' },
  { code: '0153X0', name: 'PLUS 미국고배당주액티브',                        yieldRate: '~4%',    divTime: 'early', assetType: 'us', tax: 'taxable' },
  { code: '0036D0', name: 'TIME 미국배당다우존스액티브',                    yieldRate: '~4%',    divTime: 'early', assetType: 'us', tax: 'taxable' },
  { code: '213630', name: 'PLUS 미국다우존스고배당주(합성H)',                yieldRate: '~4%',    divTime: 'early', assetType: 'us', tax: 'taxable' },
  // ── 월(초) 국내 ──
  { code: '472150', name: 'TIGER 배당커버드콜액티브',                       yieldRate: '~4%',    divTime: 'early', assetType: 'kr', tax: 'exempt', highlight: true, note: '시총 8,674억' },
  { code: '161510', name: 'PLUS 고배당주',                                  yieldRate: '~4%',    divTime: 'early', assetType: 'kr', tax: 'exempt', highlight: true, note: '시총 2.4조' },
  { code: '0105E0', name: 'SOL 코리아고배당',                               yieldRate: '~4%',    divTime: 'early', assetType: 'kr', tax: 'exempt', note: '시총 5,842억' },
  { code: '489030', name: 'PLUS 고배당주위클리커버드콜',                    yieldRate: '~8%',    divTime: 'early', assetType: 'kr', tax: 'exempt' },
  { code: '400410', name: 'KODEX 공모주&리츠자산배분TOP10',                 yieldRate: '~4%',    divTime: 'early', assetType: 'kr', tax: 'exempt' },
  { code: '278530', name: 'KODEX 3배당주',                                  yieldRate: '~5%',    divTime: 'early', assetType: 'kr', tax: 'exempt' },
  { code: '448410', name: 'KODEX 200타겟위클리커버드콜TOP10',               yieldRate: '10~12%', divTime: 'early', assetType: 'kr', tax: 'exempt' },
  { code: '487200', name: 'PLUS 고배당우선배당커버드콜',                    yieldRate: '~8%',    divTime: 'early', assetType: 'kr', tax: 'exempt' },
  { code: '0086B0', name: 'TIGER 리츠부동산인프라TOP10액티브',              yieldRate: '~5%',    divTime: 'early', assetType: 'kr', tax: 'exempt' },
  { code: '050470', name: 'TIGER 리츠커버드콜우선콜',                       yieldRate: '~6%',    divTime: 'early', assetType: 'kr', tax: 'exempt' },
  { code: '475720', name: 'RISE 200위클리커버드콜',                         yieldRate: '~15%',   divTime: 'early', assetType: 'kr', tax: 'exempt', highlight: true, note: '시총 7,189억' },
  { code: '0018C0', name: 'PLUS 고배당주위클리고정커버드콜',                yieldRate: '~8%',    divTime: 'early', assetType: 'kr', tax: 'exempt' },
  { code: '422190', name: 'KODEX 리츠부동산인프라',                         yieldRate: '~4%',    divTime: 'early', assetType: 'kr', tax: 'exempt' },
  { code: '329200', name: 'TIGER 리츠부동산인프라',                         yieldRate: '~4%',    divTime: 'early', assetType: 'kr', tax: 'exempt' },
  { code: '0094M0', name: 'RISE 코리아밸류업위클리고정커버드콜',            yieldRate: '~8%',    divTime: 'early', assetType: 'kr', tax: 'exempt' },
  { code: '0097L0', name: 'KIWOOM 한국고배당&미국AI테크',                   yieldRate: '~10%',   divTime: 'early', assetType: 'kr', tax: 'exempt' },
  { code: '0153P0', name: 'ACE 리츠부동산인프라액티브',                     yieldRate: '~4%',    divTime: 'early', assetType: 'kr', tax: 'exempt' },
  // ── 월(중순) 미국 ──
  { code: '486290', name: 'TIGER 미국나스닥100타겟데일리커버드콜',           yieldRate: '~15%',   divTime: 'mid',   assetType: 'us', tax: 'taxable', highlight: true, note: '시총 1.2조' },
  { code: '474220', name: 'TIGER 미국테크TOP10타겟커버드콜',                yieldRate: '10%',    divTime: 'mid',   assetType: 'us', tax: 'taxable', highlight: true, note: '3년 +29.7%' },
  { code: '473540', name: 'TIGER 미국AI빅테크10타겟데일리커버드콜',         yieldRate: '15%',    divTime: 'mid',   assetType: 'us', tax: 'taxable', note: '3년 +35.6%' },
  { code: '493810', name: 'TIGER 미국AI빅테크10타겟데일리커버드콜 2호',     yieldRate: '~15%',   divTime: 'mid',   assetType: 'us', tax: 'taxable' },
  { code: '458760', name: 'TIGER 미국배당다우존스타겟커버드콜2호',           yieldRate: '~8%',    divTime: 'mid',   assetType: 'us', tax: 'taxable' },
  { code: '0008S0', name: 'TIGER 미국배당다우존스타겟데일리커버드콜',        yieldRate: '~12%',   divTime: 'mid',   assetType: 'us', tax: 'taxable' },
  { code: '494300', name: 'KODEX 미국나스닥100데일리커버드콜OTM',           yieldRate: '~12%',   divTime: 'mid',   assetType: 'us', tax: 'taxable' },
  { code: '0005A0', name: 'KODEX 미국S&P500데일리커버드콜OTM',             yieldRate: '~12%',   divTime: 'mid',   assetType: 'us', tax: 'taxable' },
  { code: '482730', name: 'TIGER 미국S&P500타겟데일리커버드콜',             yieldRate: '~15%',   divTime: 'mid',   assetType: 'us', tax: 'taxable' },
  { code: '468380', name: 'ACE 미국500데일리타겟커버드콜(합성)',             yieldRate: '15%',    divTime: 'mid',   assetType: 'us', tax: 'taxable' },
  { code: '480030', name: 'ACE 미국500데일리타겟커버드콜(합성) 2호',        yieldRate: '~15%',   divTime: 'mid',   assetType: 'us', tax: 'taxable' },
  { code: '480020', name: 'ACE 미국빅테크7+데일리타겟커버드콜(합성)',        yieldRate: '~12%',   divTime: 'mid',   assetType: 'us', tax: 'taxable' },
  { code: '480040', name: 'ACE 미국반도체데일리타겟커버드콜(합성)',          yieldRate: '~15%',   divTime: 'mid',   assetType: 'us', tax: 'taxable' },
  { code: '0049M0', name: 'ACE 미국배당퀄리티+커버드콜액티브',              yieldRate: '~6%',    divTime: 'mid',   assetType: 'us', tax: 'taxable' },
  { code: '489250', name: 'KODEX 미국배당다우존스',                         yieldRate: '3.5~4%', divTime: 'mid',   assetType: 'us', tax: 'taxable', highlight: true, note: '3년 +14.2%' },
  { code: '402970', name: 'ACE 미국배당다우존스',                           yieldRate: '3.5~4%', divTime: 'mid',   assetType: 'us', tax: 'taxable', note: '3년 +14.3%' },
  { code: '458750', name: 'TIGER 미국배당다우존스타겟커버드콜 1호',         yieldRate: '7.5%',   divTime: 'mid',   assetType: 'us', tax: 'taxable', note: '3년 +13.5%' },
  { code: '469760', name: 'TIGER 미국배당다우존스타겟데일리커버드콜',        yieldRate: '12%',    divTime: 'mid',   assetType: 'us', tax: 'taxable', note: '3년 +14.0%' },
  { code: '0115C0', name: 'RISE 미국고배당다우존스TOP10',                   yieldRate: '~8%',    divTime: 'mid',   assetType: 'us', tax: 'taxable' },
  { code: '494420', name: 'PLUS 미국배당증가성장주데일리커버드콜',           yieldRate: '~8%',    divTime: 'mid',   assetType: 'us', tax: 'taxable' },
  // ── 월(중순) 국내 ──
  { code: '498410', name: 'KODEX 금융고배당TOP10타겟위클리커버드콜',        yieldRate: '~10%',   divTime: 'mid',   assetType: 'kr', tax: 'exempt', highlight: true, note: '시총 6,584억' },
  { code: '476800', name: 'KODEX 한국부동산리츠인프라',                     yieldRate: '~9%',    divTime: 'mid',   assetType: 'kr', tax: 'exempt', note: '3년 +7.6%' },
  { code: '498400', name: 'KODEX 200타겟위클리커버드콜',                    yieldRate: '15%+α',  divTime: 'mid',   assetType: 'kr', tax: 'exempt', highlight: true, note: '시총 3.3조' },
  { code: '0052D0', name: 'TIGER 코리아배당다우존스',                       yieldRate: '~5%',    divTime: 'mid',   assetType: 'kr', tax: 'exempt', highlight: true, note: '시총 4,665억' },
  { code: '484880', name: 'SOL 금융지주플러스고배당',                       yieldRate: '~5%',    divTime: 'mid',   assetType: 'kr', tax: 'exempt' },
  { code: '469050', name: 'TIGER 200타겟위클리커버드콜',                    yieldRate: '~7%',    divTime: 'mid',   assetType: 'kr', tax: 'exempt' },
  { code: '0104N0', name: 'TIGER 200타겟위클리커버드콜 2호',                yieldRate: '~7%',    divTime: 'mid',   assetType: 'kr', tax: 'exempt' },
  { code: '0167B0', name: 'SOL 200타겟위클리커버드콜',                      yieldRate: '~7%',    divTime: 'mid',   assetType: 'kr', tax: 'exempt' },
  { code: '463160', name: 'RISE 프리미엄클린고배당커버드콜(라코)',           yieldRate: '15~20%', divTime: 'mid',   assetType: 'kr', tax: 'exempt', note: '6개월 +58%' },
  { code: '466940', name: 'TIGER 은행고배당플러스TOP10',                    yieldRate: '~5%',    divTime: 'mid',   assetType: 'kr', tax: 'exempt' },
  { code: '0089D0', name: 'KODEX 금융고배당TOP10',                         yieldRate: '~5%',    divTime: 'mid',   assetType: 'kr', tax: 'exempt' },
  { code: '0153K0', name: 'KODEX 주주환원고배당주',                         yieldRate: '~4%',    divTime: 'mid',   assetType: 'kr', tax: 'exempt' },
  { code: '0098N0', name: 'PLUS 자사주매입고배당주 2호',                    yieldRate: '~4%',    divTime: 'mid',   assetType: 'kr', tax: 'exempt' },
  { code: '0111J0', name: 'HANARO 증권고배당TOP3플러스',                    yieldRate: '~5%',    divTime: 'mid',   assetType: 'kr', tax: 'exempt' },
  { code: '498860', name: 'RISE 코리아금융고배당',                          yieldRate: '~5%',    divTime: 'mid',   assetType: 'kr', tax: 'exempt' },
  { code: '458730', name: 'KODEX 글로벌고배당TOP10',                       yieldRate: '3~5%',   divTime: 'mid',   assetType: 'kr', tax: 'exempt' },
  { code: '464600', name: 'KODEX 주주환원고배당주',                         yieldRate: '~4%',    divTime: 'mid',   assetType: 'kr', tax: 'exempt' },
  { code: '468420', name: 'PLUS 자사주매입고배당주',                        yieldRate: '~4%',    divTime: 'mid',   assetType: 'kr', tax: 'exempt', note: '3년 +18.4%' },
  { code: '0104P0', name: 'TIGER 코리아배당다우존스위클리커버드콜',          yieldRate: '~8%',    divTime: 'mid',   assetType: 'kr', tax: 'exempt' },
  { code: '290080', name: 'RISE 200고배당커버드콜ATM',                      yieldRate: '~10%',   divTime: 'mid',   assetType: 'kr', tax: 'exempt' },
];

// ── 탭 타입 ───────────────────────────────────────────────────────────────────
type Tab = 'guide' | 'etf' | 'backtest';

// ── 숫자 포맷 ─────────────────────────────────────────────────────────────────
function fmt만(n: number) {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}억원`;
  return `${Math.round(n).toLocaleString()}만원`;
}

function fmt원(n: number) {
  if (n >= 100000000) return `${(n / 100000000).toFixed(2)}억원`;
  if (n >= 10000) return `${Math.round(n / 10000).toLocaleString()}만원`;
  return `${Math.round(n).toLocaleString()}원`;
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

  // 월배당 계산기
  const [calcAmount, setCalcAmount] = useState(1000); // 만원

  // AI 추천
  const [aiLoading, setAiLoading] = useState(false);
  const [aiRecommendations, setAiRecommendations] = useState<AiRecommendation[]>([]);
  const [aiSummary, setAiSummary] = useState('');
  const [aiError, setAiError] = useState('');
  const [aiCachedAt, setAiCachedAt] = useState<string | null>(null);

  // 개별 ETF 대안 (각 전략별로 관리)
  const [altLoadingId, setAltLoadingId] = useState<number | null>(null); // 로딩 중인 전략 ID
  const [strategyAlternatives, setStrategyAlternatives] = useState<StrategyAlternatives[]>([]);
  const [altError, setAltError] = useState('');
  const [expandedAlts, setExpandedAlts] = useState<Set<number>>(new Set()); // 펼쳐진 대안들
  const [altCachedAt, setAltCachedAt] = useState<string | null>(null);

  // 페이지 로드 시 캐시 확인 및 자동 로드
  useEffect(() => {
    // localStorage에서 캐시 확인
    const cachedAlt = localStorage.getItem('2weeks-alternatives');
    if (cachedAlt) {
      try {
        const parsed = JSON.parse(cachedAlt);
        const cachedTime = new Date(parsed.generatedAt).getTime();
        const now = Date.now();
        // 24시간 이내면 캐시 사용
        if (now - cachedTime < 24 * 60 * 60 * 1000) {
          setStrategyAlternatives(parsed.alternatives || []);
          setAltCachedAt(parsed.generatedAt);
        }
      } catch {
        // 파싱 실패 - 무시
      }
    }

    const cachedRec = localStorage.getItem('2weeks-recommend');
    if (cachedRec) {
      try {
        const parsed = JSON.parse(cachedRec);
        const cachedTime = new Date(parsed.generatedAt).getTime();
        const now = Date.now();
        if (now - cachedTime < 24 * 60 * 60 * 1000) {
          setAiRecommendations(parsed.recommendations || []);
          setAiSummary(parsed.summary || '');
          setAiCachedAt(parsed.generatedAt);
        }
      } catch {
        // 파싱 실패 - 무시
      }
    }
  }, []);

  const fetchAiRecommend = useCallback(async (forceRefresh = false) => {
    // 캐시가 있고 강제 새로고침이 아니면 스킵
    if (!forceRefresh && aiRecommendations.length > 0 && aiCachedAt) {
      return;
    }

    setAiLoading(true);
    setAiError('');
    try {
      const res = await fetch('/api/ai/2weeks-recommend');
      if (!res.ok) throw new Error('API 오류');
      const data = await res.json();
      setAiRecommendations(data.recommendations || []);
      setAiSummary(data.summary || '');
      setAiCachedAt(data.generatedAt);

      // localStorage에 캐시
      localStorage.setItem('2weeks-recommend', JSON.stringify(data));
    } catch {
      setAiError('AI 추천을 불러오는데 실패했습니다.');
    } finally {
      setAiLoading(false);
    }
  }, [aiRecommendations.length, aiCachedAt]);

  // 개별 전략 대안 토글
  const toggleAlternative = useCallback(async (strategyId: number) => {
    // 이미 펼쳐져 있으면 닫기
    if (expandedAlts.has(strategyId)) {
      setExpandedAlts(prev => {
        const next = new Set(prev);
        next.delete(strategyId);
        return next;
      });
      return;
    }

    // 이미 캐시된 대안이 있으면 바로 표시
    const existingAlt = strategyAlternatives.find(a => a.strategyId === strategyId);
    if (existingAlt) {
      setExpandedAlts(prev => new Set(prev).add(strategyId));
      return;
    }

    // 전체 캐시가 있으면 사용
    if (strategyAlternatives.length > 0) {
      setExpandedAlts(prev => new Set(prev).add(strategyId));
      return;
    }

    // API 호출 (전체 대안 가져오기)
    setAltLoadingId(strategyId);
    setAltError('');
    try {
      const res = await fetch('/api/ai/2weeks-recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      if (!res.ok) throw new Error('API 오류');
      const data = await res.json();
      setStrategyAlternatives(data.alternatives || []);
      setAltCachedAt(data.generatedAt);
      setExpandedAlts(prev => new Set(prev).add(strategyId));

      // localStorage에 캐시
      localStorage.setItem('2weeks-alternatives', JSON.stringify(data));
    } catch {
      setAltError('대안 ETF를 불러오는데 실패했습니다.');
    } finally {
      setAltLoadingId(null);
    }
  }, [strategyAlternatives, expandedAlts]);

  // 시간 포맷
  const formatCachedTime = (isoString: string | null) => {
    if (!isoString) return null;
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 1) return '방금 전';
    if (diffMins < 60) return `${diffMins}분 전`;
    if (diffHours < 24) return `${diffHours}시간 전`;
    return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  };

  // 월배당 계산
  const monthlyDividends = useMemo(() => {
    return MAIN_STRATEGIES.map((s) => {
      const perPair = calcAmount / MAIN_STRATEGIES.length; // 각 조합당 투자금
      const earlyDiv = (perPair / 2) * (s.early.yieldRate / 1200); // 월초 ETF 월배당
      const midDiv = (perPair / 2) * (s.mid.yieldRate / 1200); // 월중순 ETF 월배당
      return {
        ...s,
        investAmount: perPair,
        earlyMonthly: earlyDiv,
        midMonthly: midDiv,
        totalMonthly: earlyDiv + midDiv,
      };
    });
  }, [calcAmount]);

  const totalMonthlyDiv = monthlyDividends.reduce((sum, d) => sum + d.totalMonthly, 0);

  // 백테스팅 입력값
  const [btPrincipal, setBtPrincipal] = useState(5000);       // 초기 투자금 (만원)
  const [btMonthlyDeposit, setBtMonthlyDeposit] = useState(100); // 월 납입금 (만원)
  const [btEarlyRatio, setBtEarlyRatio] = useState(50);       // 월초 비율 %
  const [btEarlyYield, setBtEarlyYield] = useState(12);       // 월초 연분배율 %
  const [btMidYield, setBtMidYield] = useState(12);           // 월중순 연분배율 %
  const [btReinvest, setBtReinvest] = useState(100);          // 재투자율 %
  const [btMonths, setBtMonths] = useState(60);               // 기간 (개월)
  const [btEarlyGrowth, setBtEarlyGrowth] = useState(5);      // 월초 ETF 연간 성장률 %
  const [btMidGrowth, setBtMidGrowth] = useState(5);          // 월중순 ETF 연간 성장률 %
  const [btTaxRate, setBtTaxRate] = useState(0);              // 배당소득세율 %
  const [btResult, setBtResult] = useState<TwoWeeksBacktestResult | null>(null);

  // 백테스팅 실행
  const runBacktest = useCallback(() => {
    const result = runTwoWeeksBacktest({
      principal: btPrincipal * 10000, // 만원 → 원
      monthlyDeposit: btMonthlyDeposit * 10000, // 만원 → 원
      earlyRatio: btEarlyRatio,
      earlyYield: btEarlyYield,
      midYield: btMidYield,
      reinvestRate: btReinvest,
      months: btMonths,
      earlyGrowth: btEarlyGrowth,
      midGrowth: btMidGrowth,
      taxRate: btTaxRate,
    });
    setBtResult(result);
  }, [btPrincipal, btMonthlyDeposit, btEarlyRatio, btEarlyYield, btMidYield, btReinvest, btMonths, btEarlyGrowth, btMidGrowth, btTaxRate]);

  // 초기 백테스팅 실행
  useEffect(() => {
    runBacktest();
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // ETF 필터
  const earlyUs = ETF_LIST.filter(e => e.divTime === 'early' && e.assetType === 'us');
  const earlyKr = ETF_LIST.filter(e => e.divTime === 'early' && e.assetType === 'kr');
  const midUs   = ETF_LIST.filter(e => e.divTime === 'mid'   && e.assetType === 'us');
  const midKr   = ETF_LIST.filter(e => e.divTime === 'mid'   && e.assetType === 'kr');

  const TABS: { id: Tab; label: string }[] = [
    { id: 'guide', label: '전략 소개' },
    { id: 'etf',   label: 'ETF 목록' },
    { id: 'backtest', label: '백테스팅' },
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

            {/* 메인 전략 조합 */}
            <div className="bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 rounded-2xl p-6 text-white overflow-hidden">
              {/* 헤더 */}
              <div className="text-center mb-8">
                <h2 className="text-2xl sm:text-3xl font-black mb-2 tracking-tight">배당의만장 2WEEKS 전략</h2>
                <p className="text-lg font-bold">
                  <span className="text-gray-400">[</span>
                  <span className="text-white">한달에 2번 </span>
                  <span className="text-red-500 animate-pulse">따박따박</span>
                  <span className="text-yellow-400"> 배당월급</span>
                  <span className="text-gray-400">]</span>
                </p>
              </div>

              {/* 테이블 헤더 */}
              <div className="grid grid-cols-[48px_1fr_40px_1fr_36px] gap-2 mb-3 px-2">
                <div></div>
                <div className="text-center">
                  <span className="inline-block bg-blue-500 text-white text-xs font-bold px-3 py-1.5 rounded-full">
                    월초배당지급
                  </span>
                </div>
                <div></div>
                <div className="text-center">
                  <span className="inline-block bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-full">
                    월중순배당지급
                  </span>
                </div>
                <div className="text-center">
                  <span className="inline-block bg-purple-500 text-white text-[10px] font-bold px-1.5 py-1 rounded-full">
                    AI
                  </span>
                </div>
              </div>

              {/* 전략 목록 */}
              <div className="space-y-2">
                {MAIN_STRATEGIES.map((pair, idx) => {
                  const alt = strategyAlternatives.find(a => a.strategyId === pair.id);
                  const isKr = pair.country === 'kr';

                  return (
                    <div key={pair.id}>
                      {/* 한국/미국 구분선 */}
                      {idx === 0 && (
                        <div className="flex items-center gap-2 mb-2 px-2">
                          <span className="text-xs text-gray-500 font-medium">한국 ETF</span>
                          <div className="flex-1 h-px bg-gray-700"></div>
                        </div>
                      )}
                      {idx === 2 && (
                        <div className="flex items-center gap-2 mb-2 mt-4 px-2">
                          <span className="text-xs text-gray-500 font-medium">미국 ETF</span>
                          <div className="flex-1 h-px bg-gray-700"></div>
                        </div>
                      )}

                      {/* 메인 전략 행 */}
                      <div className="grid grid-cols-[48px_1fr_40px_1fr_36px] gap-2 items-center bg-gray-800/50 rounded-xl px-2 py-3 hover:bg-gray-800/80 transition-colors">
                        {/* 국기 */}
                        <div className="flex justify-center">
                          <span className="text-2xl">{isKr ? '🇰🇷' : '🇺🇸'}</span>
                        </div>

                        {/* 월초 ETF */}
                        <div className="bg-blue-500/20 border border-blue-500/30 rounded-lg px-3 py-2.5 text-center min-h-[68px] flex flex-col items-center justify-center">
                          <p className="text-white font-semibold text-sm leading-snug">{pair.early.name}</p>
                          <span className="inline-block mt-1 text-xs font-bold text-blue-300 bg-blue-500/30 px-2 py-0.5 rounded-full">
                            연 {pair.early.yieldRate}%
                          </span>
                        </div>

                        {/* 화살표 */}
                        <div className="flex justify-center">
                          <span className="text-yellow-400 text-2xl font-bold">⇄</span>
                        </div>

                        {/* 월중순 ETF */}
                        <div className="bg-emerald-500/20 border border-emerald-500/30 rounded-lg px-3 py-2.5 text-center min-h-[68px] flex flex-col items-center justify-center">
                          <p className="text-white font-semibold text-sm leading-snug">{pair.mid.name}</p>
                          <span className="inline-block mt-1 text-xs font-bold text-emerald-300 bg-emerald-500/30 px-2 py-0.5 rounded-full">
                            연 {pair.mid.yieldRate}%
                          </span>
                        </div>

                        {/* AI 대안 토글 버튼 */}
                        <div className="flex justify-center">
                          <button
                            onClick={() => toggleAlternative(pair.id)}
                            disabled={altLoadingId === pair.id}
                            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                              expandedAlts.has(pair.id)
                                ? 'bg-purple-500 text-white'
                                : 'bg-gray-700 text-gray-400 hover:bg-purple-600 hover:text-white'
                            }`}
                            title="AI 대안 보기"
                          >
                            {altLoadingId === pair.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Sparkles className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* AI 대안 ETF */}
                      {expandedAlts.has(pair.id) && alt && (
                        <div className="grid grid-cols-[48px_1fr_40px_1fr_36px] gap-2 items-center mt-1 px-2 animate-in fade-in slide-in-from-top-2 duration-300">
                          <div className="flex justify-center">
                            <Sparkles className="w-4 h-4 text-purple-400" />
                          </div>

                          <div className="bg-purple-500/20 border border-purple-500/40 rounded-lg px-3 py-2 text-center">
                            <p className="text-purple-300 text-[10px] font-medium mb-0.5">AI 추천 대안</p>
                            <p className="text-white font-medium text-xs leading-snug">{alt.earlyAlt.name}</p>
                            <p className="text-purple-300 text-[10px] mt-0.5">{alt.earlyAlt.yield}</p>
                          </div>

                          <div className="flex justify-center">
                            <span className="text-purple-400 text-lg">⇄</span>
                          </div>

                          <div className="bg-purple-500/20 border border-purple-500/40 rounded-lg px-3 py-2 text-center">
                            <p className="text-purple-300 text-[10px] font-medium mb-0.5">AI 추천 대안</p>
                            <p className="text-white font-medium text-xs leading-snug">{alt.midAlt.name}</p>
                            <p className="text-purple-300 text-[10px] mt-0.5">{alt.midAlt.yield}</p>
                          </div>

                          {/* 빈 셀 (버튼 열 맞춤) */}
                          <div></div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 하단 안내 */}
              <div className="mt-6 pt-4 border-t border-gray-700 text-center">
                {altError && (
                  <p className="text-red-400 text-xs mb-2">{altError}</p>
                )}
                {altCachedAt && expandedAlts.size > 0 && (
                  <p className="text-purple-400 text-xs mb-2 flex items-center justify-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatCachedTime(altCachedAt)} 분석됨
                  </p>
                )}
                <p className="text-gray-500 text-xs flex items-center justify-center gap-1.5">
                  <Sparkles className="w-3 h-3" />
                  각 종목 우측의 버튼을 눌러 AI 대안을 확인하세요
                </p>
                <p className="text-gray-600 text-[10px] mt-2">
                  * 예시이며, 시장상황에 따라 달라질 수 있습니다
                </p>
              </div>
            </div>

            {/* 월배당 계산기 */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Calculator className="w-5 h-5 text-blue-600" />
                월배당 계산기
              </h2>

              <div className="mb-5">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-gray-600">총 투자금액</label>
                  <span className="text-lg font-bold text-gray-900">{calcAmount.toLocaleString()}만원</span>
                </div>
                <input
                  type="range"
                  min={100}
                  max={50000}
                  step={100}
                  value={calcAmount}
                  onChange={(e) => setCalcAmount(Number(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-full appearance-none cursor-pointer accent-blue-600"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>100만원</span>
                  <span>5억원</span>
                </div>
              </div>

              {/* 요약 카드 */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                  <p className="text-xs text-blue-600 font-medium mb-1">예상 월배당 합계</p>
                  <p className="text-2xl font-extrabold text-blue-700">{fmt만(totalMonthlyDiv)}</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                  <p className="text-xs text-emerald-600 font-medium mb-1">예상 연배당 합계</p>
                  <p className="text-2xl font-extrabold text-emerald-700">{fmt만(totalMonthlyDiv * 12)}</p>
                </div>
              </div>

              {/* 조합별 상세 */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">조합별 예상 월배당</p>
                {monthlyDividends.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2.5">
                    <span className="text-lg shrink-0">{d.country === 'kr' ? '🇰🇷' : '🇺🇸'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-600 truncate">
                        {d.early.name} + {d.mid.name}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-gray-900">{fmt만(d.totalMonthly)}</p>
                      <p className="text-xs text-gray-400">투자금 {fmt만(d.investAmount)}</p>
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-xs text-gray-400 mt-4 text-center">
                * 예상 분배율 기준 계산이며, 실제 배당금은 다를 수 있습니다
              </p>
            </div>

            {/* AI 추천 */}
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl border border-purple-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-purple-600" />
                    AI 대체 전략 추천
                  </h2>
                  {aiCachedAt && aiRecommendations.length > 0 && (
                    <p className="text-xs text-purple-500 mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatCachedTime(aiCachedAt)} 분석됨
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {aiRecommendations.length > 0 && aiCachedAt && (
                    <button
                      onClick={() => fetchAiRecommend(true)}
                      disabled={aiLoading}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-purple-100 text-purple-700 text-xs font-medium rounded-lg hover:bg-purple-200 disabled:opacity-50 transition-colors"
                      title="새로 분석하기"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => fetchAiRecommend()}
                    disabled={aiLoading}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-semibold rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {aiLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        분석 중...
                      </>
                    ) : aiRecommendations.length > 0 ? (
                      <>
                        <Sparkles className="w-4 h-4" />
                        추천 보기
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        AI 추천 받기
                      </>
                    )}
                  </button>
                </div>
              </div>

              {aiError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 mb-4">
                  {aiError}
                </div>
              )}

              {aiRecommendations.length === 0 && !aiLoading && !aiError && (
                <div className="text-center py-8">
                  <Sparkles className="w-12 h-12 text-purple-300 mx-auto mb-3" />
                  <p className="text-gray-500 text-sm">
                    메인 전략 외에 다른 ETF 조합이 궁금하시면<br />
                    <strong>AI 추천 받기</strong> 버튼을 클릭하세요
                  </p>
                </div>
              )}

              {aiRecommendations.length > 0 && (
                <div className="space-y-4">
                  {aiRecommendations.map((rec) => (
                    <div key={rec.id} className="bg-white rounded-xl border border-purple-100 p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-lg">{rec.country === 'kr' ? '🇰🇷' : '🇺🇸'}</span>
                        <span className="text-xs font-bold text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full">
                          대체 전략 #{rec.id}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div className="bg-blue-50 rounded-lg p-3">
                          <p className="text-xs text-blue-600 font-semibold mb-1">월초 배당</p>
                          <p className="text-sm font-bold text-gray-900">{rec.early.name}</p>
                          <p className="text-xs text-gray-500">{rec.early.code} · {rec.early.yield}</p>
                        </div>
                        <div className="bg-emerald-50 rounded-lg p-3">
                          <p className="text-xs text-emerald-600 font-semibold mb-1">월중순 배당</p>
                          <p className="text-sm font-bold text-gray-900">{rec.mid.name}</p>
                          <p className="text-xs text-gray-500">{rec.mid.code} · {rec.mid.yield}</p>
                        </div>
                      </div>

                      <div className="text-sm space-y-1">
                        <p className="text-gray-700">
                          <span className="font-semibold text-green-600">✓ 추천 이유:</span> {rec.reason}
                        </p>
                        <p className="text-gray-600">
                          <span className="font-semibold text-amber-600">⚠ 주의점:</span> {rec.risk}
                        </p>
                      </div>
                    </div>
                  ))}

                  {aiSummary && (
                    <div className="bg-purple-100 rounded-lg p-4">
                      <p className="text-sm text-purple-900">
                        <span className="font-bold">💡 종합 의견:</span> {aiSummary}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

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

        {/* ── 백테스팅 ── */}
        {tab === 'backtest' && (
          <div className="space-y-6">

            {/* 입력 패널 */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-emerald-600" />
                  백테스팅 설정
                </h2>
                <button
                  onClick={runBacktest}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  <Play className="w-4 h-4" />
                  시뮬레이션 실행
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                <SimInput label="초기 투자금" unit="만원" value={btPrincipal} min={0} max={100000} step={100}
                  onChange={setBtPrincipal} />
                <SimInput label="월 납입금" unit="만원" value={btMonthlyDeposit} min={0} max={1000} step={10}
                  onChange={setBtMonthlyDeposit} hint="매월 추가 납입" />
                <SimInput label="월초 ETF 비율" unit="%" value={btEarlyRatio} min={10} max={90} step={5}
                  onChange={setBtEarlyRatio} hint={`월중순: ${100 - btEarlyRatio}%`} />
                <SimInput label="투자 기간" unit="개월" value={btMonths} min={12} max={240} step={12}
                  onChange={setBtMonths} />
                <SimInput label="월초 연 분배율" unit="%" value={btEarlyYield} min={1} max={30} step={1}
                  onChange={setBtEarlyYield} />
                <SimInput label="월중순 연 분배율" unit="%" value={btMidYield} min={1} max={30} step={1}
                  onChange={setBtMidYield} />
                <SimInput label="재투자율" unit="%" value={btReinvest} min={0} max={100} step={10}
                  onChange={setBtReinvest} hint="0%=전액현금" />
                <SimInput label="월초 ETF 연성장률" unit="%" value={btEarlyGrowth} min={-10} max={20} step={1}
                  onChange={setBtEarlyGrowth} hint="주가 상승률" />
                <SimInput label="월중순 ETF 연성장률" unit="%" value={btMidGrowth} min={-10} max={20} step={1}
                  onChange={setBtMidGrowth} hint="주가 상승률" />
              </div>

              {/* 세금 옵션 */}
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium text-gray-600">배당소득세:</span>
                  <div className="flex gap-2">
                    {[
                      { label: '비과세 (국내ETF)', value: 0 },
                      { label: '15.4% (미국ETF)', value: 15.4 },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setBtTaxRate(opt.value)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                          btTaxRate === opt.value
                            ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 결과 요약 카드 */}
            {btResult && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="rounded-xl border p-4 bg-emerald-50 border-emerald-200">
                    <p className="text-xs text-gray-500 mb-1">최종 평가금액</p>
                    <p className="text-xl font-extrabold text-emerald-700">{fmt원(btResult.finalValue)}</p>
                    <p className="text-xs text-emerald-600 mt-1">+{btResult.totalReturn}%</p>
                  </div>
                  <div className="rounded-xl border p-4 bg-blue-50 border-blue-200">
                    <p className="text-xs text-gray-500 mb-1">누적 배당금</p>
                    <p className="text-xl font-extrabold text-blue-700">{fmt원(btResult.totalDividend)}</p>
                  </div>
                  <div className="rounded-xl border p-4 bg-purple-50 border-purple-200">
                    <p className="text-xs text-gray-500 mb-1">마지막달 월배당</p>
                    <p className="text-xl font-extrabold text-purple-700">{fmt원(btResult.lastMonthDividend)}</p>
                    <p className="text-xs text-purple-600 mt-1">연 {btResult.dividendYieldOnCost}% (원금대비)</p>
                  </div>
                  <div className="rounded-xl border p-4 bg-orange-50 border-orange-200">
                    <p className="text-xs text-gray-500 mb-1">연평균 수익률 (CAGR)</p>
                    <p className="text-xl font-extrabold text-orange-700">+{btResult.cagr}%</p>
                    <p className="text-xs text-orange-600 mt-1">MDD: -{btResult.maxDrawdown}%</p>
                  </div>
                </div>

                {/* 지수 비교 카드 */}
                <div className="bg-gradient-to-r from-gray-50 to-slate-50 rounded-2xl border border-gray-200 p-5">
                  <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-gray-600" />
                    지수 비교 (동일 금액 투자 시)
                  </h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-white rounded-xl border border-emerald-200 p-4 text-center">
                      <p className="text-xs text-gray-500 mb-1">2WEEKS 전략</p>
                      <p className="text-lg font-extrabold text-emerald-700">{fmt원(btResult.finalValue)}</p>
                      <p className={`text-sm font-bold mt-1 ${btResult.totalReturn >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {btResult.totalReturn >= 0 ? '+' : ''}{btResult.totalReturn}%
                      </p>
                    </div>
                    <div className="bg-white rounded-xl border border-blue-200 p-4 text-center">
                      <p className="text-xs text-gray-500 mb-1">S&P 500</p>
                      <p className="text-lg font-extrabold text-blue-700">{fmt원(btResult.sp500FinalValue)}</p>
                      <p className={`text-sm font-bold mt-1 ${btResult.sp500Return >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                        {btResult.sp500Return >= 0 ? '+' : ''}{btResult.sp500Return}%
                      </p>
                    </div>
                    <div className="bg-white rounded-xl border border-purple-200 p-4 text-center">
                      <p className="text-xs text-gray-500 mb-1">나스닥 100</p>
                      <p className="text-lg font-extrabold text-purple-700">{fmt원(btResult.nasdaq100FinalValue)}</p>
                      <p className={`text-sm font-bold mt-1 ${btResult.nasdaq100Return >= 0 ? 'text-purple-600' : 'text-red-600'}`}>
                        {btResult.nasdaq100Return >= 0 ? '+' : ''}{btResult.nasdaq100Return}%
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-3 text-center">
                    * 지수 수익률: S&P 500 연 10.5%, 나스닥 100 연 14% (역사적 평균 기준)
                  </p>
                </div>

                {/* 자산 성장 차트 */}
                <div className="bg-white rounded-2xl border border-gray-200 p-5">
                  <h3 className="text-sm font-bold text-gray-700 mb-4">자산 성장 추이 (지수 비교)</h3>
                  <ResponsiveContainer width="100%" height={320}>
                    <ComposedChart data={btResult.snapshots} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gTotal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#059669" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis
                        dataKey="month"
                        tickFormatter={v => v % 12 === 0 ? `${v/12}년` : ''}
                        tick={{ fontSize: 11 }}
                      />
                      <YAxis tickFormatter={v => fmt원(v)} tick={{ fontSize: 10 }} width={80} />
                      <Tooltip
                        formatter={(value) => fmt원(value as number)}
                        labelFormatter={(label) => `${label}개월차`}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Area type="monotone" dataKey="totalValue" stroke="#059669" strokeWidth={2.5} fill="url(#gTotal)" name="2WEEKS 전략" />
                      <Line type="monotone" dataKey="cumDeposit" stroke="#f97316" strokeWidth={2} dot={false} name="누적 납입금" />
                      <Line type="monotone" dataKey="sp500Value" stroke="#3b82f6" strokeWidth={2} dot={false} strokeDasharray="5 5" name="S&P 500" />
                      <Line type="monotone" dataKey="nasdaq100Value" stroke="#8b5cf6" strokeWidth={2} dot={false} strokeDasharray="5 5" name="나스닥 100" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* 월별 배당금 차트 */}
                <div className="bg-white rounded-2xl border border-gray-200 p-5">
                  <h3 className="text-sm font-bold text-gray-700 mb-4">월별 배당금 추이</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart
                      data={btResult.snapshots.filter((_, i) => i % Math.max(1, Math.floor(btMonths / 30)) === 0)}
                      margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis
                        dataKey="month"
                        tickFormatter={v => v % 12 === 0 ? `${v/12}Y` : `${v}M`}
                        tick={{ fontSize: 11 }}
                      />
                      <YAxis tickFormatter={v => fmt원(v)} tick={{ fontSize: 10 }} width={70} />
                      <Tooltip
                        formatter={(value) => fmt원(value as number)}
                        labelFormatter={(label) => `${label}개월차`}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="earlyDividend" stackId="a" fill="#3b82f6" name="월초 배당" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="midDividend" stackId="a" fill="#059669" name="월중순 배당" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* 상세 통계 */}
                <div className="bg-white rounded-2xl border border-gray-200 p-5">
                  <h3 className="text-sm font-bold text-gray-700 mb-4">상세 통계</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500">초기 투자금</p>
                      <p className="font-bold text-gray-900">{fmt원(btPrincipal * 10000)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">월 납입금</p>
                      <p className="font-bold text-gray-900">{fmt원(btMonthlyDeposit * 10000)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">총 납입금</p>
                      <p className="font-bold text-blue-700">{fmt원(btResult.totalDeposit)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">투자 기간</p>
                      <p className="font-bold text-gray-900">{btMonths}개월 ({(btMonths/12).toFixed(1)}년)</p>
                    </div>
                    <div>
                      <p className="text-gray-500">평균 월배당</p>
                      <p className="font-bold text-gray-900">{fmt원(btResult.avgMonthlyDividend)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">순수익 (평가금 - 납입금)</p>
                      <p className="font-bold text-emerald-600">+{fmt원(btResult.finalValue - btResult.totalDeposit)}</p>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-gray-400 text-center">
                  * 시뮬레이션 결과이며, 실제 투자 성과와 다를 수 있습니다. 투자 전 충분한 검토가 필요합니다.
                </p>
              </>
            )}
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
