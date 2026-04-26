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
      const credsData = await fetch('/api/broker/credentials').then(r => r.json());
      const saved: ConnectedCredential[] = credsData.success
        ? (credsData.data ?? []).map((c: any) => ({
            credentialId: c.id,
            brokerType: c.brokerType ?? c.broker_type,
            accountAlias: c.accountAlias ?? c.account_alias,
          }))
        : [];
      setConnectedCredentials(saved);
      setSelectedCredentialId(prev => {
        if (prev && saved.some(m => m.credentialId === prev)) return prev;
        return saved.length >= 1 ? saved[0].credentialId : undefined;
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
          {connectedCredentials.length >= 1 && (
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
          {connectedCredentials.length >= 1 && (
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
          {connectedCredentials.length >= 1 && (
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

    </div>
    </PremiumGate>
  );
}
