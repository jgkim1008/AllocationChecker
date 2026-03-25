'use client';

import { useState, useEffect } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, CheckCircle, XCircle, Link, Unlink } from 'lucide-react';

type BrokerType = 'kis' | 'kiwoom';

interface BrokerConnectProps {
  onConnect?: (brokerType: BrokerType) => void;
  onDisconnect?: (brokerType: BrokerType) => void;
}

export function BrokerConnect({ onConnect, onDisconnect }: BrokerConnectProps) {
  const [brokerType, setBrokerType] = useState<BrokerType>('kis');
  const [appKey, setAppKey] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [connectedBrokers, setConnectedBrokers] = useState<BrokerType[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // 연결 상태 확인
  useEffect(() => {
    checkConnectionStatus();
  }, []);

  const checkConnectionStatus = async () => {
    setIsCheckingStatus(true);
    try {
      const response = await fetch('/api/broker/auth');
      const data = await response.json();

      if (data.success) {
        setConnectedBrokers(data.data.connectedBrokers || []);
      }
    } catch (err) {
      console.error('연결 상태 확인 실패:', err);
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const handleConnect = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const credentials = { appKey, appSecret, accountNumber, isVirtual: false };

      const response = await fetch('/api/broker/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brokerType, credentials }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('브로커에 연결되었습니다.');
        setConnectedBrokers(prev => prev.includes(brokerType) ? prev : [...prev, brokerType]);
        onConnect?.(brokerType);

        // 폼 초기화
        setAppKey('');
        setAppSecret('');
        setAccountNumber('');
      } else {
        setError(data.error || '연결에 실패했습니다.');
      }
    } catch (err) {
      setError('서버 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async (type: BrokerType) => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/broker/auth?brokerType=${type}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('연결이 해제되었습니다.');
        setConnectedBrokers(prev => prev.filter(b => b !== type));
        onDisconnect?.(type);
      } else {
        setError(data.error || '연결 해제에 실패했습니다.');
      }
    } catch (err) {
      setError('서버 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const isConnected = (type: BrokerType) => connectedBrokers.includes(type);

  const brokerInfo = {
    kis: {
      name: '한국투자증권',
      description: 'REST API 지원, 국내/해외 주식 거래 가능',
      docsUrl: 'https://apiportal.koreainvestment.com',
    },
    kiwoom: {
      name: '키움증권',
      description: 'REST API 지원, 국내/해외 주식 거래 가능',
      docsUrl: 'https://openapi.kiwoom.com',
    },
  };

  if (isCheckingStatus) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">연결 상태 확인 중...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* 연결된 브로커 목록 */}
      {connectedBrokers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              연결된 증권사
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {connectedBrokers.map(type => (
                <div
                  key={type}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <p className="font-medium">{brokerInfo[type].name}</p>
                    <p className="text-sm text-muted-foreground">
                      {brokerInfo[type].description}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDisconnect(type)}
                    disabled={isLoading}
                  >
                    <Unlink className="mr-1 h-4 w-4" />
                    연결 해제
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 새 브로커 연결 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link className="h-5 w-5" />
            증권사 연결
          </CardTitle>
          <CardDescription>
            API 키를 입력하여 증권사에 연결합니다. 모의투자 모드로 먼저 테스트해보세요.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>증권사 선택</Label>
            <Select
              value={brokerType}
              onValueChange={(v) => setBrokerType(v as BrokerType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kis">
                  한국투자증권 (KIS) {isConnected('kis') && '✓'}
                </SelectItem>
                <SelectItem value="kiwoom">
                  키움증권 {isConnected('kiwoom') && '✓'}
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              <a
                href={brokerInfo[brokerType].docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                API 발급 안내 →
              </a>
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="appKey">App Key</Label>
            <Input
              id="appKey"
              type="password"
              value={appKey}
              onChange={(e) => setAppKey(e.target.value)}
              placeholder="API 포털에서 발급받은 App Key"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="appSecret">App Secret</Label>
            <Input
              id="appSecret"
              type="password"
              value={appSecret}
              onChange={(e) => setAppSecret(e.target.value)}
              placeholder="API 포털에서 발급받은 App Secret"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="accountNumber">계좌번호</Label>
            <Input
              id="accountNumber"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="XXXXXXXX-XX 형식"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-destructive">
              <XCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 rounded-lg bg-green-500/10 p-3 text-green-600">
              <CheckCircle className="h-4 w-4" />
              {success}
            </div>
          )}
        </CardContent>
        <CardFooter>
          <Button
            onClick={handleConnect}
            disabled={isLoading || !appKey || !appSecret || !accountNumber}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                연결 중...
              </>
            ) : (
              <>
                <Link className="mr-2 h-4 w-4" />
                연결하기
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
