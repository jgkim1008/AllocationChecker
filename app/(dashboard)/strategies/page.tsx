'use client';

import Link from 'next/link';
import { TrendingUp, Infinity, BarChart3, ChevronRight, Activity, Zap } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const STRATEGIES = [
  {
    id: 'analyst-alpha',
    title: 'Analyst Alpha (AI)',
    description: '기본적 가치 평가, 애널리스트 추정치, 몬테카를로 시뮬레이션을 결합한 AI 기반 퀀트 분석 엔진입니다.',
    icon: BarChart3,
    href: '/strategies/analyst-alpha',
    color: 'bg-indigo-50 text-indigo-600',
    tag: 'AI',
    tagColor: 'bg-indigo-100 text-indigo-700',
  },
  {
    id: 'fibonacci',
    title: '피보나치 되돌림',
    description: '주가의 급등락 이후 조정이 일어날 때, 주요 피보나치 레벨(0.382, 0.618 등)에서의 반등 지점을 포착하는 기술적 분석 전략입니다.',
    icon: Activity,
    href: '/strategies/fibonacci',
    color: 'bg-purple-50 text-purple-600',
    tag: '활성',
    tagColor: 'bg-purple-100 text-purple-700',
  },
  {
    id: 'inverse-alignment',
    title: '이평선 역배열 전략',
    description: '주요 우량주(미국 100위, 한국 30위) 전체를 대상으로, 448, 224, 112일선 역배열 상태에서 60일선을 돌파하며 강력한 추세 전환이 일어나는 종목을 포착합니다.',
    icon: TrendingUp,
    href: '/strategies/inverse-alignment',
    color: 'bg-orange-50 text-orange-600',
    tag: '신규',
    tagColor: 'bg-orange-100 text-orange-700',
  },
  {
    id: 'infinite-buy',
    title: '무한매수법',
    description: '라오어의 무한매수법 전략을 기반으로 한 분할 매수 및 수익 실현 자동 계산기입니다.',
    icon: Infinity,
    href: '/infinite-buy',
    color: 'bg-blue-50 text-blue-600',
    tag: '기본',
    tagColor: 'bg-blue-100 text-blue-700',
  },
  {
    id: 'backtesting',
    title: '전략 백테스팅',
    description: '나만의 매매 전략을 과거 데이터를 통해 검증하고 수익률을 확인합니다.',
    icon: Activity,
    href: '/backtesting',
    color: 'bg-green-50 text-green-600',
    tag: '검증',
    tagColor: 'bg-green-100 text-green-700',
  },
  {
    id: 'new-strategy',
    title: '새로운 전략',
    description: '준비 중인 새로운 전략들이 이곳에 추가될 예정입니다.',
    icon: Zap,
    href: '#',
    color: 'bg-gray-50 text-gray-400',
    tag: '준비중',
    tagColor: 'bg-gray-200 text-gray-600',
  },
];

export default function StrategiesPage() {
  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-6xl mx-auto px-4 pt-10 pb-16">
        <header className="mb-10 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold uppercase tracking-wider mb-3">
            Investment Strategies
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900 mb-2 tracking-tight">투자 전략</h1>
          <p className="text-gray-500 max-w-2xl">
            데이터 기반의 검증된 투자 전략들을 통해 더 스마트한 투자 결정을 내리세요. 
            주요 지표와 실시간 데이터를 바탕으로 최적의 진입 및 청산 타이밍을 제시합니다.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {STRATEGIES.map((strategy) => {
            const Icon = strategy.icon;
            const isSoon = strategy.id === 'new-strategy';
            
            return (
              <Link 
                key={strategy.id} 
                href={strategy.href}
                className={isSoon ? 'cursor-not-allowed' : ''}
              >
                <Card className={`h-full border-gray-200 transition-all duration-300 ${isSoon ? 'opacity-60 grayscale' : 'hover:shadow-lg hover:-translate-y-1 cursor-pointer group active:scale-[0.98]'}`}>
                  <CardHeader className="flex flex-row items-center gap-4 pb-4">
                    <div className={`p-3 rounded-2xl ${strategy.color} transition-transform group-hover:scale-110 duration-300`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${strategy.tagColor}`}>
                          {strategy.tag}
                        </span>
                      </div>
                      <CardTitle className="text-lg group-hover:text-indigo-600 transition-colors">
                        {strategy.title}
                      </CardTitle>
                    </div>
                    {!isSoon && <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-indigo-400 group-hover:translate-x-1 transition-all" />}
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-gray-600 leading-relaxed text-sm">
                      {strategy.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
