'use client';

import { useState, useEffect } from 'react';
import { StrategyCalc } from '@/components/infinite-buy/StrategyCalc';
import { BuyTracker } from '@/components/infinite-buy/BuyTracker';
import { BacktestSim } from '@/components/infinite-buy/BacktestSim';
import { StrategyGuide } from '@/components/infinite-buy/StrategyGuide';

const PRESET_SYMBOLS = ['TQQQ', 'UPRO', 'SOXL', 'FNGU', 'TECL', '122630'];

// 각 종목 한줄 설명
const SYMBOL_DESC: Record<string, string> = {
  TQQQ: '나스닥100 3배',
  UPRO: 'S&P500 3배',
  SOXL: '반도체 3배',
  FNGU: 'FANG+ 3배',
  TECL: '기술주 3배',
  '122630': 'KOSPI200 2배',
};

const KR_SYMBOLS = new Set(['122630']);

// 전략 버전
type StrategyVersion = 'v2.2' | 'v3.0' | 'v4.0';

// V2.2 종목별 기본 목표 수익률 (SOXL 12%, 나머지 10%)
const V22_TARGET_RATES: Record<string, number> = {
  SOXL: 0.12,
};

// V3.0 종목별 목표 수익률
const V3_TARGET_RATES: Record<string, number> = {
  TQQQ: 0.15,
  SOXL: 0.20,
};

function getDefaultTargetRate(version: StrategyVersion, sym: string): number {
  if (version === 'v3.0' || version === 'v4.0') return V3_TARGET_RATES[sym] ?? 0.15;
  return V22_TARGET_RATES[sym] ?? 0.10;
}

type Tab = 'calc' | 'tracker' | 'backtest';

const TAB_LABELS: Record<Tab, string> = {
  calc: '전략 계산기',
  tracker: '실시간 트래커',
  backtest: '백테스팅',
};

const TAB_DESC: Record<Tab, string> = {
  calc: '파라미터별 매수 시나리오 계산',
  tracker: '실제 매수 기록 및 손익 추적',
  backtest: '과거 데이터로 전략 성과 검증',
};

export default function InfiniteBuyPage() {
  const [symbol, setSymbol] = useState<string>('TQQQ');
  const [customSymbol, setCustomSymbol] = useState<string>('');
  const [isCustom, setIsCustom] = useState(false);

  // 전략 버전
  const [version, setVersion] = useState<StrategyVersion>('v3.0');

  const [capital, setCapital] = useState<number>(5000);
  const [capitalInput, setCapitalInput] = useState<string>('5000');
  const [n, setN] = useState<number>(20);
  const [nInput, setNInput] = useState<string>('20');
  const [targetRate, setTargetRate] = useState<number>(0.15);
  const [targetRateInput, setTargetRateInput] = useState<string>('15');
  // V2.2/V3.0에서는 variableBuy가 사용되지 않음 (버전별 규칙 적용)
  const variableBuy = false;

  const [tab, setTab] = useState<Tab>('calc');

  // 사이클 번호 (localStorage 저장, 종목별 관리)
  const [currentCycle, setCurrentCycle] = useState<number>(1);

  // 버전 변경 시 분할 횟수 자동 조정
  const handleVersionChange = (v: StrategyVersion) => {
    setVersion(v);
    const activeSymbol = isCustom ? customSymbol.trim().toUpperCase() : symbol;
    const rate = getDefaultTargetRate(v, activeSymbol);
    if (v === 'v3.0' || v === 'v4.0') {
      setN(20);
      setNInput('20');
    } else {
      setN(40);
      setNInput('40');
    }
    setTargetRate(rate);
    setTargetRateInput((rate * 100).toString());
  };

  // 실시간 현재가 (프리셋 버튼 표시용 + 최소 투자금 계산용)
  const [presetPrices, setPresetPrices] = useState<Record<string, number>>({});
  const [customPrice, setCustomPrice] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/stocks/prices?symbols=${PRESET_SYMBOLS.join(',')}`)
      .then((r) => r.json())
      .then((data) => {
        const map: Record<string, number> = {};
        for (const sym of PRESET_SYMBOLS) {
          const p = data?.prices?.[sym]?.price;
          if (p && p > 0) map[sym] = p;
        }
        setPresetPrices(map);
      })
      .catch(() => {});
  }, []);

  const activeSymbol = isCustom ? customSymbol.trim().toUpperCase() : symbol;
  const activeMarket = KR_SYMBOLS.has(activeSymbol) ? 'KR' : 'US';

  // 커스텀 종목 가격 별도 조회
  useEffect(() => {
    if (!isCustom || !activeSymbol) { setCustomPrice(null); return; }
    fetch(`/api/stocks/prices?symbols=${encodeURIComponent(activeSymbol)}`)
      .then((r) => r.json())
      .then((data) => {
        const p = data?.prices?.[activeSymbol]?.price;
        setCustomPrice(p && p > 0 ? p : null);
      })
      .catch(() => setCustomPrice(null));
  }, [isCustom, activeSymbol]);

  const activePrice = isCustom ? customPrice : (presetPrices[activeSymbol] ?? null);

  function applyMinCapital() {
    if (!activePrice || activePrice <= 0) return;
    const minCap = Math.ceil(activePrice * n);
    setCapital(minCap);
    setCapitalInput(minCap.toString());
  }

  // 종목 변경 시 해당 종목의 사이클 번호 불러오기
  useEffect(() => {
    if (!activeSymbol) return;
    const saved = parseInt(localStorage.getItem(`inf-buy-cycle-${activeSymbol}`) || '1', 10);
    setCurrentCycle(saved);
  }, [activeSymbol]);

  function handleCycleReset() {
    const next = currentCycle + 1;
    setCurrentCycle(next);
    if (activeSymbol) localStorage.setItem(`inf-buy-cycle-${activeSymbol}`, next.toString());
  }

  function handlePresetClick(sym: string) {
    setSymbol(sym);
    setIsCustom(false);
    const rate = getDefaultTargetRate(version, sym);
    setTargetRate(rate);
    setTargetRateInput((rate * 100).toString());
  }

  function handleCustomInput(val: string) {
    setCustomSymbol(val);
    setIsCustom(true);
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">무한 매수법</h1>
          <p className="text-sm text-gray-500 mt-1">
            라오어 무한 매수법 — 레버리지 ETF 분할 매수 전략 계산기
          </p>
        </div>
        {/* 버전 선택 */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          <button
            onClick={() => handleVersionChange('v2.2')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              version === 'v2.2'
                ? 'bg-white text-green-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            V2.2
            <span className="block text-[10px] font-normal opacity-70">40분할 · 안정형</span>
          </button>
          <button
            onClick={() => handleVersionChange('v3.0')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              version === 'v3.0'
                ? 'bg-white text-orange-600 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            V3.0
            <span className="block text-[10px] font-normal opacity-70">20분할 · 공격형</span>
          </button>
          <button
            onClick={() => handleVersionChange('v4.0')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              version === 'v4.0'
                ? 'bg-white text-purple-600 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            V4.0
            <span className="block text-[10px] font-normal opacity-70">동적분할 · 리버스</span>
          </button>
        </div>
      </div>

      {/* 전략 가이드 (접힘/펼침) */}
      <StrategyGuide version={version} />

      {/* ETF 선택 */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <div>
          <p className="text-sm font-medium text-gray-900">종목 선택</p>
          <p className="text-xs text-gray-400 mt-0.5">무한매수법에 주로 사용하는 3배 레버리지 ETF입니다</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESET_SYMBOLS.map((sym) => {
            const isActive = !isCustom && symbol === sym;
            const price = presetPrices[sym];
            return (
              <button
                key={sym}
                onClick={() => handlePresetClick(sym)}
                className={`flex flex-col items-start px-3 py-2 rounded-lg border transition-colors min-w-[80px] ${
                  isActive
                    ? 'bg-green-600 text-white border-green-600'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-green-400 hover:text-green-700'
                }`}
              >
                <span className="text-sm font-bold">{sym}</span>
                <span className={`text-xs mt-0.5 ${isActive ? 'text-green-100' : 'text-gray-400'}`}>
                  {SYMBOL_DESC[sym]}
                </span>
                {price ? (
                  <span className={`text-xs font-medium mt-0.5 ${isActive ? 'text-white' : 'text-gray-600'}`}>
                    {KR_SYMBOLS.has(sym) ? `₩${Math.round(price).toLocaleString('ko-KR')}` : `$${price.toFixed(2)}`}
                  </span>
                ) : (
                  <span className={`text-xs mt-0.5 ${isActive ? 'text-green-200' : 'text-gray-300'}`}>
                    로딩 중…
                  </span>
                )}
              </button>
            );
          })}

          {/* 직접 입력 */}
          <div className="flex flex-col justify-center">
            <input
              type="text"
              placeholder="직접 입력 (예: LABU)"
              value={isCustom ? customSymbol : ''}
              onChange={(e) => handleCustomInput(e.target.value)}
              onFocus={() => setIsCustom(true)}
              className={`text-sm border rounded-lg px-3 py-2 h-full min-h-[60px] w-36 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors placeholder:text-gray-300 ${
                isCustom ? 'border-green-500' : 'border-gray-200'
              }`}
            />
          </div>
        </div>

        {activeSymbol && (
          <p className="text-xs text-gray-400">
            선택된 종목:{' '}
            <span className="font-semibold text-gray-700">{activeSymbol}</span>
            {!isCustom && SYMBOL_DESC[activeSymbol] && (
              <span className="text-gray-400"> — {SYMBOL_DESC[activeSymbol]}</span>
            )}
          </p>
        )}
      </div>

      {/* 공통 파라미터 */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="mb-3">
          <p className="text-sm font-medium text-gray-900">전략 파라미터</p>
          <p className="text-xs text-gray-400 mt-0.5">
            아래 탭(전략 계산기·트래커·백테스팅)에 공통 적용됩니다
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* 총 투자금 */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              총 투자금 (C)
              <span className="font-normal text-gray-400 ml-1">— 이번 사이클에 쓸 전체 금액</span>
            </label>
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">{activeMarket === 'KR' ? '₩' : '$'}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={capitalInput}
                  onChange={(e) => setCapitalInput(e.target.value)}
                  onBlur={() => {
                    const v = parseFloat(capitalInput);
                    const clamped = isNaN(v) ? capital : Math.max(100, v);
                    setCapital(clamped);
                    setCapitalInput(clamped.toString());
                  }}
                  className="w-full text-sm border border-gray-200 rounded-lg pl-7 pr-3 py-2 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <button
                onClick={applyMinCapital}
                disabled={!activePrice}
                title={activePrice ? `최소 투자금 적용 (현재가 × N = ${activeMarket === 'KR' ? '₩' : '$'}${Math.ceil(activePrice * n).toLocaleString()})` : '현재가 로딩 중'}
                className="text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 border border-gray-200 px-2.5 py-2 rounded-lg transition-colors disabled:opacity-40 whitespace-nowrap"
              >
                최소
              </button>
            </div>
          </div>

          {/* 분할 횟수 */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              분할 횟수 (N)
              <span className="font-normal text-gray-400 ml-1">— 라오어 기본값 40</span>
            </label>
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                value={nInput}
                onChange={(e) => setNInput(e.target.value)}
                onBlur={() => {
                  const v = parseInt(nInput, 10);
                  const clamped = isNaN(v) ? n : Math.max(2, Math.min(200, v));
                  setN(clamped);
                  setNInput(clamped.toString());
                }}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">등분</span>
            </div>
          </div>

          {/* 목표 수익률 */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              목표 수익률
              <span className="font-normal text-gray-400 ml-1">— 이 수익이 나면 전량 매도</span>
            </label>
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                value={targetRateInput}
                onChange={(e) => setTargetRateInput(e.target.value)}
                onBlur={() => {
                  const v = parseFloat(targetRateInput);
                  if (!isNaN(v) && v > 0) {
                    setTargetRate(v / 100);
                    setTargetRateInput(v.toString());
                  } else {
                    setTargetRateInput((targetRate * 100).toString());
                  }
                }}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 pr-8 py-2 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">%</span>
            </div>
          </div>
        </div>

        {/* 계산 요약 + 매수 방식 토글 */}
        <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-gray-500">
          <span>
            1분할 매수금:{' '}
            <strong className="text-gray-700">
              {activeMarket === 'KR'
                ? `₩${Math.round(capital / n).toLocaleString('ko-KR')}`
                : `$${(capital / n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`}
            </strong>
          </span>
          <span>
            목표 수익금:{' '}
            <strong className="text-green-600">
              {activeMarket === 'KR'
                ? `₩${Math.round(capital * targetRate).toLocaleString('ko-KR')}`
                : `$${(capital * targetRate).toLocaleString('en-US', { maximumFractionDigits: 2 })}`}
            </strong>
          </span>
          <span>
            목표 도달 시 총 평가금:{' '}
            <strong className="text-gray-700">
              {activeMarket === 'KR'
                ? `₩${Math.round(capital * (1 + targetRate)).toLocaleString('ko-KR')}`
                : `$${(capital * (1 + targetRate)).toLocaleString('en-US', { maximumFractionDigits: 2 })}`}
            </strong>
          </span>

          {/* 버전별 매수 방식 안내 */}
          <div className={`ml-auto px-2.5 py-1 rounded-lg text-xs font-medium ${
            version === 'v3.0' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
          }`}>
            {version === 'v2.2' && '전반전 2주문 · 후반전 1주문 · TQQQ/SOXL별% 적용'}
            {version === 'v3.0' && '별지점-$0.01 LOC · 수익금/40 반복리'}
            {version === 'v4.0' && '동적 1회매수금 · 리버스모드 지원'}
          </div>
        </div>
      </div>

      {/* 탭 */}
      <div className="border-b border-gray-200">
        <nav className="flex">
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-left transition-colors border-b-2 ${
                tab === t
                  ? 'border-green-600 text-green-700'
                  : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              <span className="text-sm font-medium block">{TAB_LABELS[t]}</span>
              <span className="text-xs text-gray-400 hidden sm:block">{TAB_DESC[t]}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* 탭 내용 */}
      <div>
        {tab === 'calc' && (
          <StrategyCalc symbol={activeSymbol} capital={capital} n={n} targetRate={targetRate} variableBuy={variableBuy} market={activeMarket} version={version} />
        )}
        {tab === 'tracker' && (
          <BuyTracker symbol={activeSymbol} capital={capital} n={n} targetRate={targetRate} market={activeMarket} onCycleReset={handleCycleReset} />
        )}
        {tab === 'backtest' && (
          <BacktestSim symbol={activeSymbol} capital={capital} n={n} targetRate={targetRate} variableBuy={variableBuy} market={activeMarket} version={version} />
        )}
      </div>

      {/* 면책 */}
      <p className="text-xs text-gray-400 text-center pb-4">
        과거 수익률이 미래 수익을 보장하지 않습니다. 레버리지 ETF는 높은 위험을 수반합니다.
        투자는 본인의 판단과 책임 하에 진행하세요.
      </p>
    </div>
  );
}
