import { Metadata } from 'next';
import { Bot, Construction } from 'lucide-react';
import AutoTradePageContent from './AutoTradePageContent';

export const metadata: Metadata = {
  title: '자동매매 - AllocationChecker',
  description: '증권사 API 연동 자동매매',
};

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export default function AutoTradePage() {
  if (IS_PRODUCTION) {
    return (
      <div className="container mx-auto max-w-6xl py-6">
        <div className="mb-6">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Bot className="h-6 w-6" />
            자동매매
          </h1>
        </div>
        <div className="flex flex-col items-center justify-center py-24 gap-4 bg-white border border-gray-200 rounded-2xl">
          <div className="p-4 bg-amber-50 rounded-full">
            <Construction className="h-8 w-8 text-amber-500" />
          </div>
          <h2 className="text-lg font-bold text-gray-800">서비스 준비 중</h2>
          <p className="text-sm text-gray-500 text-center max-w-sm">
            자동매매 기능은 보안 검토 후 제공될 예정입니다.
          </p>
        </div>
      </div>
    );
  }

  return <AutoTradePageContent />;
}
