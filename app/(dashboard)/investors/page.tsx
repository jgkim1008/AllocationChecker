'use client';

import { useState } from 'react';
import { Building2, RefreshCw } from 'lucide-react';
import { HoldingsTable } from '@/components/investors/HoldingsTable';
import type { Holding } from '@/lib/api/sec-edgar';

interface Institution {
  name: string;
  nameKr: string;
  cik: string;
  description: string;
}

const INSTITUTIONS: Institution[] = [
  {
    name: 'Berkshire Hathaway',
    nameKr: '워렌 버핏',
    cik: '0001067983',
    description: '세계 최대 가치투자 지주회사',
  },
  {
    name: 'Duquesne Family Office',
    nameKr: '스탠리 드래킨밀러',
    cik: '0001536411',
    description: '전설적 매크로 헤지펀드 매니저',
  },
  {
    name: 'National Pension Service',
    nameKr: '국민연금',
    cik: '0001608046',
    description: '대한민국 국민연금공단',
  },
];

interface HoldingsData {
  institution: string;
  filingDate: string;
  totalValue: number;
  holdings: Holding[];
}

function formatTotalValue(dollars: number): string {
  if (dollars >= 1e12) return `$${(dollars / 1e12).toFixed(1)}T`;
  if (dollars >= 1e9) return `$${(dollars / 1e9).toFixed(1)}B`;
  if (dollars >= 1e6) return `$${(dollars / 1e6).toFixed(1)}M`;
  return `$${dollars.toLocaleString()}`;
}

function getQuarterLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed
  const quarter = Math.floor(month / 3) + 1;
  return `${year} Q${quarter}`;
}

export default function InvestorsPage() {
  const [selectedCik, setSelectedCik] = useState<string | null>(null);
  const [data, setData] = useState<HoldingsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelect = async (cik: string) => {
    if (selectedCik === cik && data) return; // 이미 로드된 경우 재선택 무시
    setSelectedCik(cik);
    setData(null);
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/investors/${cik}/holdings`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Failed to fetch holdings');
      }
      const json: HoldingsData = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    if (selectedCik) {
      setData(null);
      handleSelect(selectedCik);
    }
  };

  const selectedInstitution = INSTITUTIONS.find((i) => i.cik === selectedCik);

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 pt-6 pb-16">

        {/* 헤더 */}
        <div className="mb-6">
          <p className="text-xs font-medium text-gray-500 mb-1">SEC EDGAR 13F</p>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">기관투자자 포트폴리오</h1>
        </div>

        {/* 기관 카드 리스트 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
          {INSTITUTIONS.map((inst) => {
            const isSelected = selectedCik === inst.cik;
            return (
              <button
                key={inst.cik}
                onClick={() => handleSelect(inst.cik)}
                className={`text-left p-4 rounded-2xl border transition-all ${
                  isSelected
                    ? 'border-green-500 bg-green-50 shadow-sm'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-xl ${isSelected ? 'bg-green-100' : 'bg-gray-100'}`}>
                    <Building2 className={`h-5 w-5 ${isSelected ? 'text-green-600' : 'text-gray-500'}`} />
                  </div>
                  <div className="min-w-0">
                    <p className={`font-bold text-sm ${isSelected ? 'text-green-700' : 'text-gray-900'}`}>
                      {inst.nameKr}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{inst.name}</p>
                    <p className="text-xs text-gray-400 mt-1">{inst.description}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* 결과 영역 */}
        {(loading || data || error) && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">

            {/* 파일링 정보 헤더 */}
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
              <div>
                {loading ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>SEC EDGAR에서 데이터를 가져오는 중...</span>
                  </div>
                ) : data ? (
                  <>
                    <p className="font-bold text-gray-900 text-sm">
                      {data.institution || selectedInstitution?.name}
                      <span className="ml-2 text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                        {getQuarterLabel(data.filingDate)} · {data.filingDate}
                      </span>
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      총 포트폴리오: <span className="font-semibold text-gray-900">{formatTotalValue(data.totalValue)}</span>
                      <span className="mx-1.5 text-gray-300">·</span>
                      상위 50개 종목 표시
                    </p>
                  </>
                ) : error ? (
                  <p className="text-sm text-red-600">{error}</p>
                ) : null}
              </div>
              {data && (
                <button
                  onClick={handleRefresh}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  새로고침
                </button>
              )}
            </div>

            {/* 보유 종목 테이블 */}
            <HoldingsTable
              holdings={data?.holdings ?? []}
              totalValue={data?.totalValue ?? 0}
              loading={loading}
            />

          </div>
        )}

        {/* 미선택 상태 안내 */}
        {!selectedCik && (
          <div className="mt-8 text-center py-16 text-gray-400">
            <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">위에서 기관을 선택하면 최신 13F 보유 종목을 확인할 수 있습니다.</p>
            <p className="text-xs mt-1 opacity-70">데이터 출처: SEC EDGAR (분기별 공시)</p>
          </div>
        )}

      </div>
    </div>
  );
}
