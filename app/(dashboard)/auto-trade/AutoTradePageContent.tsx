'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BrokerConnect, AutoTradePanel, OrderHistory, BalancePanel, PositionSync } from '@/components/auto-trade';
import { SignalTradePanel } from '@/components/signal-trade';

const DCAPanel = dynamic(() => import('@/components/auto-trade/DCAPanel'), { ssr: false });
import { PremiumGate } from '@/components/PremiumGate';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bot, Link, History, TrendingUp, Wallet, GitCompare, Zap, TrendingDown } from 'lucide-react';

interface ConnectedCredential {
  credentialId: string;
  brokerType: string;
  accountAlias?: string;
}

export default function AutoTradePageContent() {
  const [connectedCredentials, setConnectedCredentials] = useState<ConnectedCredential[]>([]);
  const [selectedCredentialId, setSelectedCredentialId] = useState<string | undefined>(undefined);

  const fetchConnectedAccounts = useCallback(async () => {
    try {
      const [authData, credsData] = await Promise.all([
        fetch('/api/broker/auth').then(r => r.json()),
        fetch('/api/broker/credentials').then(r => r.json()),
      ]);
      const connected: { credentialId: string; brokerType: string }[] = authData.data?.connectedCredentials ?? [];
      const saved: { id: string; brokerType: string; accountAlias: string }[] = credsData.success ? (credsData.data ?? []) : [];
      const merged: ConnectedCredential[] = connected.map(c => {
        const match = saved.find(s => s.id === c.credentialId);
        return { credentialId: c.credentialId, brokerType: c.brokerType, accountAlias: match?.accountAlias };
      });
      setConnectedCredentials(merged);
      setSelectedCredentialId(prev => {
        if (prev && merged.some(m => m.credentialId === prev)) return prev;
        return merged.length >= 1 ? merged[0].credentialId : undefined;
      });
    } catch {}
  }, []);

  useEffect(() => {
    fetchConnectedAccounts();
  }, [fetchConnectedAccounts]);

  return (
    <PremiumGate featureName="자동매매">
    <div className="container mx-auto max-w-6xl py-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Bot className="h-6 w-6" />
          자동매매
        </h1>
        <p className="text-gray-600">
          증권사 API를 연동하여 자동매매 전략을 실행합니다
        </p>
      </div>

      <Tabs defaultValue="trade" className="space-y-4" onValueChange={(tab) => {
          if (tab === 'balance' || tab === 'sync' || tab === 'history') fetchConnectedAccounts();
        }}>
        <TabsList className="grid w-full grid-cols-7 lg:w-[910px]">
          <TabsTrigger value="trade" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            무한매수법
          </TabsTrigger>
          <TabsTrigger value="dca" className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4" />
            DCA
          </TabsTrigger>
          <TabsTrigger value="signal" className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            신호전략
          </TabsTrigger>
          <TabsTrigger value="balance" className="flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            잔고
          </TabsTrigger>
          <TabsTrigger value="sync" className="flex items-center gap-2">
            <GitCompare className="h-4 w-4" />
            싱크
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

        <TabsContent value="dca">
          <DCAPanel />
        </TabsContent>

        <TabsContent value="signal">
          <SignalTradePanel />
        </TabsContent>

        <TabsContent value="balance">
          {connectedCredentials.length > 1 && (
            <div className="mb-3 flex items-center gap-2">
              <span className="text-sm text-gray-600">계좌 선택</span>
              <Select value={selectedCredentialId ?? ''} onValueChange={setSelectedCredentialId}>
                <SelectTrigger className="w-52">
                  <SelectValue placeholder="계좌를 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {connectedCredentials.map(c => (
                    <SelectItem key={c.credentialId} value={c.credentialId}>
                      [{c.brokerType.toUpperCase()}] {c.accountAlias ?? 'default'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <BalancePanel credentialId={selectedCredentialId} />
        </TabsContent>

        <TabsContent value="sync">
          {connectedCredentials.length > 1 && (
            <div className="mb-3 flex items-center gap-2">
              <span className="text-sm text-gray-600">계좌 선택</span>
              <Select value={selectedCredentialId ?? ''} onValueChange={setSelectedCredentialId}>
                <SelectTrigger className="w-52">
                  <SelectValue placeholder="계좌를 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {connectedCredentials.map(c => (
                    <SelectItem key={c.credentialId} value={c.credentialId}>
                      [{c.brokerType.toUpperCase()}] {c.accountAlias ?? 'default'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <PositionSync credentialId={selectedCredentialId} />
        </TabsContent>

        <TabsContent value="history">
          {connectedCredentials.length > 1 && (
            <div className="mb-3 flex items-center gap-2">
              <span className="text-sm text-gray-600">계좌 선택</span>
              <Select value={selectedCredentialId ?? ''} onValueChange={setSelectedCredentialId}>
                <SelectTrigger className="w-52">
                  <SelectValue placeholder="계좌를 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {connectedCredentials.map(c => (
                    <SelectItem key={c.credentialId} value={c.credentialId}>
                      [{c.brokerType.toUpperCase()}] {c.accountAlias ?? 'default'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <OrderHistory credentialId={selectedCredentialId} />
        </TabsContent>

        <TabsContent value="connect">
          <BrokerConnect />
        </TabsContent>
      </Tabs>

      <div className="mt-8 rounded-lg border bg-muted/50 p-4">
        <h3 className="mb-2 font-semibold">사용 안내</h3>
        <ul className="space-y-1 text-sm text-gray-600">
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
