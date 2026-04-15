'use client';

import { useState, useEffect, useCallback } from 'react';
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
import {
  Loader2,
  CheckCircle,
  XCircle,
  Link,
  Unlink,
  Save,
  Download,
  Shield,
  Clock,
} from 'lucide-react';
import { TOTPSetupDialog } from './TOTPSetupDialog';
import { TOTPVerifyDialog } from './TOTPVerifyDialog';

type BrokerType = 'kis' | 'kiwoom';

interface BrokerConnectProps {
  onConnect?: (brokerType: BrokerType) => void;
  onDisconnect?: (brokerType: BrokerType) => void;
}

interface SavedBroker {
  brokerType: BrokerType;
  savedAt: string;
}

interface SessionState {
  hasValidSession: boolean;
  expiresAt?: string;
  remainingMinutes?: number;
}

export function BrokerConnect({ onConnect, onDisconnect }: BrokerConnectProps) {
  const [brokerType, setBrokerType] = useState<BrokerType>('kis');
  const [appKey, setAppKey] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [connectedBrokers, setConnectedBrokers] = useState<BrokerType[]>([]);
  const [savedBrokers, setSavedBrokers] = useState<SavedBroker[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // 2FA 관련 상태
  const [isTotpEnabled, setIsTotpEnabled] = useState(false);
  const [showTotpSetup, setShowTotpSetup] = useState(false);
  const [showTotpVerify, setShowTotpVerify] = useState(false);
  const [totpVerifyAction, setTotpVerifyAction] = useState<'save' | 'load' | null>(null);
  const [sessionState, setSessionState] = useState<SessionState>({ hasValidSession: false });

  // 연결 상태 및 2FA 상태 확인
  const checkStatus = useCallback(async () => {
    setIsCheckingStatus(true);
    try {
      const [authRes, totpStatusRes, sessionRes] = await Promise.all([
        fetch('/api/broker/auth'),
        fetch('/api/broker/totp/setup'),
        fetch('/api/broker/totp/verify'),
      ]);

      const [authData, totpStatusData, sessionData] = await Promise.all([
        authRes.json(),
        totpStatusRes.json(),
        sessionRes.json(),
      ]);

      const totpEnabled = totpStatusData.success ? totpStatusData.data.isEnabled : false;
      const hasSession = sessionData.success ? sessionData.data.hasValidSession : false;

      if (totpStatusData.success) {
        setIsTotpEnabled(totpEnabled);
      }

      if (sessionData.success) {
        setSessionState(sessionData.data);
      }

      if (authData.success) {
        const brokers: BrokerType[] = authData.data.connectedBrokers || [];
        // 2FA 활성화 + 세션 없음 → 연결된 브로커 강제 해제
        if (totpEnabled && !hasSession && brokers.length > 0) {
          await Promise.all(
            brokers.map(type =>
              fetch(`/api/broker/auth?brokerType=${type}`, { method: 'DELETE' })
            )
          );
          setConnectedBrokers([]);
        } else {
          setConnectedBrokers(brokers);
        }
      }

      // 세션이 유효하면 저장된 브로커 목록도 조회
      if (sessionData.success && sessionData.data.hasValidSession) {
        const savedRes = await fetch('/api/broker/credentials');
        const savedData = await savedRes.json();
        if (savedData.success) {
          setSavedBrokers(savedData.data.savedBrokers || []);
        }
      }
    } catch (err) {
      console.error('상태 확인 실패:', err);
    } finally {
      setIsCheckingStatus(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const handleConnect = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const credentials = { appKey, appSecret, accountNumber };

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
    } catch {
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
    } catch {
      setError('서버 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // API Key 저장 (2FA 필요)
  const handleSave = async () => {
    if (!appKey || !appSecret || !accountNumber) {
      setError('모든 필드를 입력해주세요.');
      return;
    }

    // 2FA 미설정 시 설정 다이얼로그 표시
    if (!isTotpEnabled) {
      setShowTotpSetup(true);
      return;
    }

    // 세션이 없으면 인증 필요
    if (!sessionState.hasValidSession) {
      setTotpVerifyAction('save');
      setShowTotpVerify(true);
      return;
    }

    // 실제 저장 수행
    await performSave();
  };

  const performSave = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const credentials = { appKey, appSecret, accountNumber };

      const response = await fetch('/api/broker/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brokerType, credentials }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('API Key가 안전하게 저장되었습니다.');
        setSavedBrokers(prev => {
          const filtered = prev.filter(b => b.brokerType !== brokerType);
          return [...filtered, { brokerType, savedAt: new Date().toISOString() }];
        });
      } else if (data.requiresTotpSetup) {
        setShowTotpSetup(true);
      } else if (data.requiresTotpVerify) {
        setTotpVerifyAction('save');
        setShowTotpVerify(true);
      } else {
        setError(data.error || '저장에 실패했습니다.');
      }
    } catch {
      setError('서버 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // API Key 불러오기 (2FA 필요)
  const handleLoad = async (type: BrokerType) => {
    if (!isTotpEnabled) {
      setError('2FA 설정이 필요합니다.');
      setShowTotpSetup(true);
      return;
    }

    if (!sessionState.hasValidSession) {
      setBrokerType(type);
      setTotpVerifyAction('load');
      setShowTotpVerify(true);
      return;
    }

    await performLoad(type);
  };

  const performLoad = async (type: BrokerType) => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/broker/credentials?brokerType=${type}`);
      const data = await response.json();

      if (data.success) {
        const creds = data.data.credentials;
        setBrokerType(type);
        setAppKey(creds.appKey);
        setAppSecret(creds.appSecret);
        setAccountNumber(creds.accountNumber);
        setSuccess('API Key를 불러왔습니다. 연결하기를 눌러 브로커에 연결하세요.');
      } else if (data.requiresTotpVerify) {
        setBrokerType(type);
        setTotpVerifyAction('load');
        setShowTotpVerify(true);
      } else {
        setError(data.error || '불러오기에 실패했습니다.');
      }
    } catch {
      setError('서버 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // TOTP 설정 완료 후
  const handleTotpSetupSuccess = () => {
    setIsTotpEnabled(true);
    setSessionState({ hasValidSession: false });
    setSuccess('2FA 설정이 완료되었습니다. 이제 API Key를 저장할 수 있습니다.');
    checkStatus();
  };

  // TOTP 인증 성공 후
  const handleTotpVerifySuccess = async (expiresAt: string) => {
    setSessionState({
      hasValidSession: true,
      expiresAt,
      remainingMinutes: 120,
    });

    if (totpVerifyAction === 'save') {
      await performSave();
    } else if (totpVerifyAction === 'load') {
      await performLoad(brokerType);
    }

    setTotpVerifyAction(null);

    // 저장된 브로커 목록 갱신
    const savedRes = await fetch('/api/broker/credentials');
    const savedData = await savedRes.json();
    if (savedData.success) {
      setSavedBrokers(savedData.data.savedBrokers || []);
    }
  };

  const isConnected = (type: BrokerType) => connectedBrokers.includes(type);
  const isSaved = (type: BrokerType) => savedBrokers.some(b => b.brokerType === type);

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
      <Card className="border-emerald-500/30 bg-white">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
          <span className="ml-2 text-emerald-600">연결 상태 확인 중...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* 2FA 상태 표시 */}
      <Card className="border-emerald-500/30 bg-white">
        <CardContent className="py-3 bg-emerald-50/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className={`h-4 w-4 ${
                !isTotpEnabled ? 'text-muted-foreground'
                : sessionState.hasValidSession ? 'text-green-500'
                : 'text-yellow-500'
              }`} />
              <div>
                <span className="text-sm font-medium">2단계 인증 (2FA)</span>
                <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                  !isTotpEnabled
                    ? 'bg-gray-100 text-gray-500'
                    : sessionState.hasValidSession
                      ? 'bg-green-100 text-green-700'
                      : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {!isTotpEnabled
                    ? '미설정'
                    : sessionState.hasValidSession
                      ? `인증됨 · ${sessionState.remainingMinutes}분 남음`
                      : '인증 필요'}
                </span>
              </div>
            </div>
            {!isTotpEnabled && (
              <Button variant="outline" size="sm" onClick={() => setShowTotpSetup(true)}>
                설정하기
              </Button>
            )}
            {isTotpEnabled && !sessionState.hasValidSession && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setTotpVerifyAction('load'); setShowTotpVerify(true); }}
              >
                <Shield className="mr-1 h-4 w-4" />
                인증하기
              </Button>
            )}
            {isTotpEnabled && sessionState.hasValidSession && (
              <Button variant="ghost" size="sm" onClick={() => setShowTotpSetup(true)} className="text-xs text-muted-foreground">
                2FA 재설정
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 저장된 API Key 목록 */}
      {savedBrokers.length > 0 && sessionState.hasValidSession && (
        <Card className="border-emerald-500/30 bg-white">
          <CardHeader className="border-b border-emerald-200 bg-emerald-50">
            <CardTitle className="flex items-center gap-2 text-base text-emerald-700">
              <Save className="h-4 w-4" />
              저장된 API Key
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {savedBrokers.map(saved => (
                <div
                  key={saved.brokerType}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <p className="font-medium">{brokerInfo[saved.brokerType].name}</p>
                    <p className="text-xs text-muted-foreground">
                      저장일: {new Date(saved.savedAt).toLocaleDateString('ko-KR')}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleLoad(saved.brokerType)}
                    disabled={isLoading}
                  >
                    <Download className="mr-1 h-4 w-4" />
                    불러오기
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}


      {/* 연결된 브로커 목록 */}
      {connectedBrokers.length > 0 && (
        <Card className="border-emerald-500/30 bg-white">
          <CardHeader className="border-b border-emerald-200 bg-emerald-50">
            <CardTitle className="flex items-center gap-2 text-emerald-700">
              <CheckCircle className="h-5 w-5 text-emerald-500" />
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
      <Card className="border-emerald-500/30 bg-white">
        <CardHeader className="border-b border-emerald-200 bg-emerald-50">
          <CardTitle className="flex items-center gap-2 text-emerald-700">
            <Link className="h-5 w-5" />
            증권사 연결
          </CardTitle>
          <CardDescription className="text-gray-600">
            API 키를 입력하여 증권사에 연결합니다. 저장하면 서버 재시작 후에도 유지됩니다.
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
                  한국투자증권 (KIS) {isConnected('kis') && '✓'} {isSaved('kis') && '💾'}
                </SelectItem>
                <SelectItem value="kiwoom">
                  키움증권 {isConnected('kiwoom') && '✓'} {isSaved('kiwoom') && '💾'}
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
        <CardFooter className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleSave}
            disabled={isLoading || !appKey || !appSecret || !accountNumber}
            className="flex-1"
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            저장하기
          </Button>
          <Button
            onClick={handleConnect}
            disabled={isLoading || !appKey || !appSecret || !accountNumber}
            className="flex-1"
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

      {/* TOTP 설정 다이얼로그 */}
      <TOTPSetupDialog
        open={showTotpSetup}
        onOpenChange={setShowTotpSetup}
        onSuccess={handleTotpSetupSuccess}
      />

      {/* TOTP 인증 다이얼로그 */}
      <TOTPVerifyDialog
        open={showTotpVerify}
        onOpenChange={setShowTotpVerify}
        onSuccess={handleTotpVerifySuccess}
        title={totpVerifyAction === 'save' ? 'API Key 저장 인증' : 'API Key 불러오기 인증'}
        description={
          totpVerifyAction === 'save'
            ? 'API Key를 저장하려면 2FA 인증이 필요합니다.'
            : '저장된 API Key를 불러오려면 2FA 인증이 필요합니다.'
        }
      />
    </div>
  );
}
