'use client';

import { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';

interface PremiumGateProps {
  children: ReactNode;
  featureName?: string;
}

/**
 * 프리미엄 사용자만 볼 수 있는 컨텐츠를 감싸는 컴포넌트.
 * 비프리미엄 사용자에게는 블러 처리 + 잠금 오버레이를 표시한다.
 */
export function PremiumGate({ children, featureName }: PremiumGateProps) {
  const { isPremium, loading } = useAuth();

  // 인증 로딩 중에는 그대로 렌더링 (잠금 상태 깜빡임 방지)
  if (loading || isPremium) return <>{children}</>;

  return (
    <div className="relative">
      {/* 블러 처리된 콘텐츠 */}
      <div className="blur-sm pointer-events-none select-none" aria-hidden>
        {children}
      </div>

      {/* 잠금 오버레이 */}
      <div className="absolute inset-0 z-10 flex items-start justify-center pt-16">
        <div className="bg-white/90 backdrop-blur-md rounded-3xl px-10 py-9 text-center shadow-2xl border border-gray-100 max-w-xs mx-4 sticky top-20">
          <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Lock className="h-6 w-6 text-indigo-600" />
          </div>
          <h3 className="text-base font-black text-gray-900 mb-2">프리미엄 전용 기능</h3>
          <p className="text-sm text-gray-500 leading-relaxed">
            {featureName ? `${featureName}은(는) ` : '이 기능은 '}
            프리미엄 구독자만<br />이용할 수 있습니다.
          </p>
          <p className="text-xs text-gray-400 mt-4">
            구독 문의: 관리자에게 연락하세요
          </p>
        </div>
      </div>
    </div>
  );
}
