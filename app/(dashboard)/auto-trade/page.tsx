import { Metadata } from 'next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BrokerConnect, AutoTradePanel, OrderHistory, BalancePanel } from '@/components/auto-trade';
import { PremiumGate } from '@/components/PremiumGate';
import { Bot, Link, History, TrendingUp, Construction, Wallet } from 'lucide-react';

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

  return (
    <PremiumGate featureName="자동매매">
    <div className="container mx-auto max-w-6xl py-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Bot className="h-6 w-6" />
          자동매매
        </h1>
        <p className="text-muted-foreground">
          증권사 API를 연동하여 무한매수법 전략을 자동 실행합니다
        </p>
      </div>

      <Tabs defaultValue="trade" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 lg:w-[520px]">
          <TabsTrigger value="trade" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            매매
          </TabsTrigger>
          <TabsTrigger value="balance" className="flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            잔고
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            주문내역
          </TabsTrigger>
          <TabsTrigger value="connect" className="flex items-center gap-2">
            <Link className="h-4 w-4" />
            연결
          </TabsTrigger>
        </TabsList>

        <TabsContent value="trade">
          <AutoTradePanel />
        </TabsContent>

        <TabsContent value="balance">
          <BalancePanel />
        </TabsContent>

        <TabsContent value="history">
          <OrderHistory />
        </TabsContent>

        <TabsContent value="connect">
          <BrokerConnect />
        </TabsContent>
      </Tabs>

      <div className="mt-8 rounded-lg border bg-muted/50 p-4">
        <h3 className="mb-2 font-semibold">사용 안내</h3>
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>
            1. <strong>연결</strong> 탭에서 증권사 API 키를 등록합니다. (모의투자 모드 권장)
          </li>
          <li>
            2. <strong>매매</strong> 탭에서 종목, 전략, 투자금을 설정합니다.
          </li>
          <li>
            3. &quot;오늘의 주문 계산&quot; 버튼으로 LOC 주문을 생성합니다.
          </li>
          <li>
            4. 주문 내역을 확인하고 체크박스로 실행할 주문을 선택합니다.
          </li>
          <li>
            5. &quot;확인된 주문 실행&quot; 버튼으로 주문을 제출합니다.
          </li>
        </ul>

        <div className="mt-4 rounded border border-yellow-500/50 bg-yellow-500/10 p-3">
          <p className="text-sm text-yellow-600 dark:text-yellow-400">
            <strong>주의:</strong> 실제 투자 전 반드시 모의투자로 테스트하세요.
            투자 손실에 대한 책임은 본인에게 있습니다.
          </p>
        </div>
      </div>
    </div>
    </PremiumGate>
  );
}
