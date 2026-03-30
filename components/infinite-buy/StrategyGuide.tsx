'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, BookOpen, TrendingUp, Calculator, AlertTriangle } from 'lucide-react';

type StrategyVersion = 'v2.2' | 'v3.0' | 'v4.0';

interface Section {
  id: string;
  icon: React.ReactNode;
  title: string;
  content: React.ReactNode;
}

interface StrategyGuideProps {
  version?: StrategyVersion;
}

export function StrategyGuide({ version = 'v2.2' }: StrategyGuideProps) {
  const [open, setOpen] = useState(true);
  const [openSection, setOpenSection] = useState<string | null>('what');

  const sections: Section[] = [
    {
      id: 'what',
      icon: <BookOpen className="h-4 w-4" />,
      title: '무한매수법이란?',
      content: (
        <div className="space-y-3 text-sm text-gray-700">
          <p>
            무한매수법은 한국의 주식 투자자 <strong>라오어</strong>(저서: 『미국 주식으로 불로소득 만들기』)가
            고안한 레버리지 ETF 투자 전략입니다.
          </p>
          <p>
            핵심 아이디어는 간단합니다. <strong>레버리지 ETF는 변동성이 크기 때문에,
            한 번에 몰빵하면 위험하지만 — 조금씩 나눠 사면 하락장에서 평균단가를 낮출 수 있습니다.</strong>
            그리고 목표 수익에 도달하면 팔고 처음부터 다시 시작합니다.
          </p>

          {version === 'v2.2' && (
            <>
              <div className="bg-green-50 border border-green-100 rounded-lg p-3 space-y-2">
                <p className="font-medium text-green-800">V2.2 안정형 — 핵심 규칙</p>
                <p className="text-green-700">40분할 · 별% (TQQQ 10-T/2, SOXL 12-T×0.6) · 분할 매도 (1/4 LOC + 3/4 지정가)</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                <p className="font-medium text-amber-700">📌 매수 규칙</p>
                <ul className="list-disc list-inside space-y-1 text-gray-600 mb-3">
                  <li><strong>전반전 (T &lt; 20)</strong>: 절반 별지점-$0.01 LOC + 절반 평단가 LOC</li>
                  <li><strong>후반전 (T ≥ 20)</strong>: 전액 별지점-$0.01 LOC</li>
                  <li>T = 누적매수액 ÷ 1회매수액 (소수점 올림)</li>
                </ul>
                <p className="font-medium text-blue-700">📌 매도 규칙</p>
                <ul className="list-disc list-inside space-y-1 text-gray-600">
                  <li><strong>1/4 수량</strong>: 별지점 LOC 매도</li>
                  <li><strong>3/4 수량</strong>: TQQQ +10% / SOXL +12% 지정가 매도</li>
                </ul>
              </div>
            </>
          )}
          {version === 'v3.0' && (
            <>
              <div className="bg-orange-50 border border-orange-100 rounded-lg p-3 space-y-2">
                <p className="font-medium text-orange-800">V3.0 공격형 — 핵심 규칙</p>
                <p className="text-orange-700">20분할 · 별% (TQQQ 15-1.5T, SOXL 20-2T) · 분할 매도 (25%+75%) · 반복리</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                <p className="font-medium text-amber-700">📌 매수 규칙</p>
                <ul className="list-disc list-inside space-y-1 text-gray-600 mb-3">
                  <li><strong>전반전 (T &lt; 10)</strong>: 절반 별지점-$0.01 LOC + 절반 평단가 LOC</li>
                  <li><strong>후반전 (T ≥ 10)</strong>: 전액 별지점-$0.01 LOC</li>
                </ul>
                <p className="font-medium text-blue-700">📌 매도 규칙</p>
                <ul className="list-disc list-inside space-y-1 text-gray-600 mb-3">
                  <li><strong>25% 수량</strong>: 별지점 LOC 매도</li>
                  <li><strong>75% 수량</strong>: TQQQ +15% / SOXL +20% 지정가 매도</li>
                </ul>
                <p className="font-medium text-green-700">📌 반복리</p>
                <ul className="list-disc list-inside space-y-1 text-gray-600">
                  <li>수익금 ÷ 40 → 다음 1회매수금에 즉시 반영</li>
                  <li>나머지 절반은 별도 보관 (잔금 부족 시 충당)</li>
                </ul>
                <p className="font-medium text-red-600 mt-3">⚠️ V3.0은 고위험 공격형 전략입니다</p>
              </div>
            </>
          )}
          {version === 'v4.0' && (
            <>
              <div className="bg-purple-50 border border-purple-100 rounded-lg p-3 space-y-2">
                <p className="font-medium text-purple-800">V4.0 — 핵심 규칙</p>
                <p className="text-purple-700">동적 1회매수금 · 이벤트 기반 T값 · 일반모드 + 리버스모드</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                <p className="font-medium text-amber-700">📌 일반모드 매수</p>
                <ul className="list-disc list-inside space-y-1 text-gray-600 mb-3">
                  <li>1회매수금 = 잔금 ÷ (분할수 - T) <strong>(매일 동적 계산)</strong></li>
                  <li><strong>전반전</strong>: 절반 별지점-$0.01 LOC + 절반 평단가 LOC</li>
                  <li><strong>후반전</strong>: 전액 별지점-$0.01 LOC</li>
                </ul>
                <p className="font-medium text-blue-700">📌 T값 이벤트 계산</p>
                <ul className="list-disc list-inside space-y-1 text-gray-600 mb-3">
                  <li>전체매수: T += 1 / 절반매수: T += 0.5</li>
                  <li>쿼터매도: T = T × 0.75</li>
                  <li>지정가매도 후 LOC매수: T = T×0.75 + 1(또는 +0.5)</li>
                </ul>
                <p className="font-medium text-red-700">📌 리버스모드 (소진 후)</p>
                <ul className="list-disc list-inside space-y-1 text-gray-600">
                  <li>별지점 = 직전 5거래일 종가 평균</li>
                  <li>첫날: MOC로 보유수량 ÷ 10 무조건 매도</li>
                  <li>이후: 별지점 이상 → LOC 매도 / 이하 → LOC 매수</li>
                  <li>종료: TQQQ 종가 &gt; 평단×0.85 / SOXL 종가 &gt; 평단×0.80</li>
                </ul>
              </div>
            </>
          )}
        </div>
      ),
    },
    {
      id: 'etfs',
      icon: <TrendingUp className="h-4 w-4" />,
      title: '종목 설명 — 왜 레버리지 ETF인가?',
      content: (
        <div className="space-y-3 text-sm text-gray-700">
          <p>
            <strong>레버리지 ETF</strong>는 기초 지수의 움직임을 2~3배로 추종하는 상품입니다.
            S&amp;P500이 하루 1% 오르면 3배 레버리지 ETF는 약 3% 오릅니다. 반대로 1% 내리면 3% 내립니다.
          </p>
          <p className="text-gray-500 text-xs">
            * 장기 보유 시 변동성 손실(volatility decay) 때문에 단순 계산보다 수익이 낮아질 수 있습니다.
            무한매수법은 이 특성을 이용해 단기 사이클로 운용합니다.
          </p>
          <div className="space-y-2">
            {[
              {
                symbol: 'TQQQ',
                name: 'ProShares UltraPro QQQ',
                desc: '나스닥100 지수 3배 추종. 애플·마이크로소프트·엔비디아 등 빅테크 중심. 무한매수법에서 가장 많이 사용되는 종목.',
                color: 'bg-blue-50 border-blue-100',
                badge: 'bg-blue-100 text-blue-700',
              },
              {
                symbol: 'UPRO',
                name: 'ProShares UltraPro S&P 500',
                desc: 'S&P500 지수 3배 추종. 나스닥100보다 다양한 섹터(금융·헬스케어·소비재 포함)로 구성되어 상대적으로 변동성이 낮습니다.',
                color: 'bg-purple-50 border-purple-100',
                badge: 'bg-purple-100 text-purple-700',
              },
              {
                symbol: 'SOXL',
                name: 'Direxion Daily Semiconductor Bull 3X',
                desc: '반도체 지수 3배 추종. 엔비디아·TSMC·ASML 등 AI·반도체 섹터 집중. 변동성이 매우 크고 하락폭도 큽니다.',
                color: 'bg-orange-50 border-orange-100',
                badge: 'bg-orange-100 text-orange-700',
              },
              {
                symbol: 'FNGU',
                name: 'MicroSectors FANG+ 3X Leveraged ETN',
                desc: 'FANG+(메타·애플·아마존·넷플릭스·구글·마이크로소프트·엔비디아 등 10개 빅테크) 3배 추종. ETN이라 운용사 신용 위험이 추가됩니다.',
                color: 'bg-red-50 border-red-100',
                badge: 'bg-red-100 text-red-700',
              },
              {
                symbol: 'TECL',
                name: 'Direxion Daily Technology Bull 3X',
                desc: '러셀1000 기술주 지수 3배 추종. TQQQ와 비슷하지만 기술주 비중이 더 높습니다.',
                color: 'bg-indigo-50 border-indigo-100',
                badge: 'bg-indigo-100 text-indigo-700',
              },
            ].map((etf) => (
              <div key={etf.symbol} className={`border rounded-lg p-3 ${etf.color}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${etf.badge}`}>
                    {etf.symbol}
                  </span>
                  <span className="text-xs text-gray-500">{etf.name}</span>
                </div>
                <p className="text-xs text-gray-600">{etf.desc}</p>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: 'howto',
      icon: <Calculator className="h-4 w-4" />,
      title: '탭별 사용법',
      content: (
        <div className="space-y-4 text-sm text-gray-700">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded">1단계</span>
              <span className="font-medium">종목 선택 + 파라미터 설정</span>
            </div>
            <p className="text-gray-600 pl-4">
              위에서 종목을 고르고, 총 투자금·분할 횟수·목표수익률을 설정합니다.
              <br />
              <span className="text-gray-400">처음이라면: TQQQ, $10,000, 40등분, 목표 1% 를 추천합니다.</span>
            </p>
          </div>

          <div className="border-l-2 border-gray-100 pl-4 space-y-3">
            <div>
              <p className="font-medium text-gray-800">전략 계산기 탭</p>
              <p className="text-gray-600 mt-0.5">
                현재가 기준으로 1회 매수 시 몇 주를 살 수 있는지, 가격이 10~50% 하락할 때
                평균단가는 어떻게 변하는지 시뮬레이션합니다. <br />
                <strong>전략을 시작하기 전에 시나리오를 미리 확인하는 용도</strong>입니다.
              </p>
            </div>
            <div>
              <p className="font-medium text-gray-800">실시간 트래커 탭</p>
              <p className="text-gray-600 mt-0.5">
                실제로 ETF를 매수할 때마다 날짜·가격·금액을 기록합니다.
                현재 평균단가, 평가손익, 목표 달성률을 실시간으로 확인할 수 있습니다. <br />
                <strong>기록은 브라우저에 저장되므로 앱을 닫아도 유지됩니다.</strong>
              </p>
            </div>
            <div>
              <p className="font-medium text-gray-800">백테스팅 탭</p>
              <p className="text-gray-600 mt-0.5">
                과거 실제 주가 데이터로 이 전략을 돌려봅니다.
                "만약 2020년부터 TQQQ에 무한매수법을 썼다면?" 같은 가설을 검증할 수 있습니다. <br />
                <strong>단순 보유 vs 무한매수 수익률을 차트로 비교합니다.</strong>
              </p>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-3">
            <p className="font-medium text-gray-800 mb-1.5">버전별 파라미터</p>
            {version === 'v2.2' ? (
              <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                <div>
                  <span className="font-medium text-green-700">V2.2 분할 횟수</span>
                  <ul className="mt-1 space-y-0.5">
                    <li>표준: <strong>40등분</strong> (권장)</li>
                    <li>전반전: T &lt; 20 (2가지 주문)</li>
                    <li>후반전: T ≥ 20 (1가지 주문)</li>
                  </ul>
                </div>
                <div>
                  <span className="font-medium text-green-700">V2.2 목표 수익률</span>
                  <ul className="mt-1 space-y-0.5">
                    <li>동적: <strong>(10 - T/2)%</strong></li>
                    <li>T=1: 9.5%, T=10: 5%, T=20: 0%</li>
                    <li>3/4 물량: <strong>+10% 고정</strong></li>
                  </ul>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                <div>
                  <span className="font-medium text-orange-700">V3.0 분할 및 별%</span>
                  <ul className="mt-1 space-y-0.5">
                    <li>표준: <strong>20등분</strong> (권장)</li>
                    <li>전반전: T &lt; 10 (2가지 주문)</li>
                    <li>후반전: T ≥ 10 (1가지 주문)</li>
                  </ul>
                </div>
                <div>
                  <span className="font-medium text-orange-700">V3.0 동적 별%</span>
                  <ul className="mt-1 space-y-0.5">
                    <li>TQQQ: <strong>(15 - 1.5×T)%</strong></li>
                    <li>SOXL: <strong>(20 - 2×T)%</strong></li>
                    <li>기본목표: TQQQ 15%, SOXL 20%</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      id: 'risk',
      icon: <AlertTriangle className="h-4 w-4 text-amber-500" />,
      title: '주의사항 (반드시 읽으세요)',
      content: (
        <div className="space-y-3 text-sm">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
            <p className="font-semibold text-amber-800">레버리지 ETF는 장기 하락장에 매우 취약합니다</p>
            <p className="text-amber-700">
              2022년처럼 1년 내내 하락하는 장세에서는 TQQQ가 -80% 이상 폭락할 수 있습니다.
              40등분을 다 쓰고도 회복이 없으면 손실을 그대로 안고 기다려야 합니다.
            </p>
          </div>
          <ul className="space-y-2 text-gray-700">
            <li className="flex gap-2">
              <span className="text-red-400 font-bold flex-shrink-0">✗</span>
              <span>생활비나 비상금으로 투자하지 마세요. <strong>잃어도 되는 돈</strong>으로만.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-red-400 font-bold flex-shrink-0">✗</span>
              <span>레버리지 ETF는 장기 보유 목적으로 설계된 상품이 아닙니다. 변동성 손실(volatility decay)로 장기 보유 시 수익이 크게 낮아질 수 있습니다.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-red-400 font-bold flex-shrink-0">✗</span>
              <span>FNGU는 ETF가 아닌 <strong>ETN</strong>입니다. 발행사(뱅크오브몬트리올)가 파산하면 원금 손실 위험이 있습니다.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-green-500 font-bold flex-shrink-0">✓</span>
              <span>백테스팅 결과는 과거 수익률이며 미래를 보장하지 않습니다.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-green-500 font-bold flex-shrink-0">✓</span>
              <span>처음에는 소액(예: $500~$1,000)으로 전략을 익히는 것을 권장합니다.</span>
            </li>
          </ul>
        </div>
      ),
    },
  ];

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-green-600" />
          <span className="text-sm font-medium text-gray-900">전략 가이드 — 무한매수법 완전 이해하기</span>
          <span className="text-xs text-gray-400 hidden sm:inline">초보자도 5분이면 파악 가능</span>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        )}
      </button>

      {open && (
        <div className="border-t border-gray-100 divide-y divide-gray-100">
          {sections.map((sec) => (
            <div key={sec.id}>
              <button
                onClick={() => setOpenSection(openSection === sec.id ? null : sec.id)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="flex items-center gap-2 text-gray-700">
                  {sec.icon}
                  <span className="text-sm font-medium">{sec.title}</span>
                </div>
                {openSection === sec.id ? (
                  <ChevronUp className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                )}
              </button>
              {openSection === sec.id && (
                <div className="px-4 pb-4">{sec.content}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
