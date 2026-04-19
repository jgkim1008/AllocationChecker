'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
  Shield,
  Pencil,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { TOTPSetupDialog } from './TOTPSetupDialog';
import { TOTPVerifyDialog } from './TOTPVerifyDialog';

type BrokerType = 'kis' | 'kiwoom';

interface AccountEntry {
  id: string;
  brokerType: BrokerType;
  accountAlias: string;
  savedAt: string;
  isConnected: boolean;
}

interface SessionState {
  hasValidSession: boolean;
  expiresAt?: string;
  remainingMinutes?: number;
}

interface BrokerConnectProps {
  onConnect?: (credentialId: string, brokerType: BrokerType) => void;
  onDisconnect?: (credentialId: string, brokerType: BrokerType) => void;
}

const BROKER_INFO = {
  kis: { name: '한국투자증권', docsUrl: 'https://apiportal.koreainvestment.com' },
  kiwoom: { name: '키움증권', docsUrl: 'https://openapi.kiwoom.com' },
};

export function BrokerConnect({ onConnect, onDisconnect }: BrokerConnectProps) {
  const [accounts, setAccounts] = useState<AccountEntry[]>([]);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null); // credentialId or 'save' or 'connect'
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // 새 계좌 저장/수정 폼
  const [brokerType, setBrokerType] = useState<BrokerType>('kis');
  const [accountAlias, setAccountAlias] = useState('');
  const [appKey, setAppKey] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [editingAlias, setEditingAlias] = useState<string | null>(null); // 수정 중인 계좌 별칭
  const formRef = useRef<HTMLDivElement>(null);

  // 2FA 관련 상태
  const [isTotpEnabled, setIsTotpEnabled] = useState(false);
  const [showTotpSetup, setShowTotpSetup] = useState(false);
  const [showTotpVerify, setShowTotpVerify] = useState(false);
  const [totpVerifyAction, setTotpVerifyAction] = useState<'save' | null>(null);
  const [sessionState, setSessionState] = useState<SessionState>({ hasValidSession: false });

  const checkStatus = useCallback(async () => {
    setIsCheckingStatus(true);
    try {
      const [authRes, totpStatusRes, sessionRes, credRes] = await Promise.all([
        fetch('/api/broker/auth'),
        fetch('/api/broker/totp/setup'),
        fetch('/api/broker/totp/verify'),
        fetch('/api/broker/credentials'),
      ]);

      const [authData, totpStatusData, sessionData, credData] = await Promise.all([
        authRes.json(),
        totpStatusRes.json(),
        sessionRes.json(),
        credRes.json(),
      ]);

      const totpEnabled = totpStatusData.success ? totpStatusData.data.isEnabled : false;
      const hasSession = sessionData.success ? sessionData.data.hasValidSession : false;

      if (totpStatusData.success) setIsTotpEnabled(totpEnabled);
      if (sessionData.success) setSessionState(sessionData.data);

      // 연결된 credentialId 목록 (GET /api/broker/auth → { data: { connectedCredentials } })
      const connectedIds = new Set<string>(
        ((authData.data?.connectedCredentials ?? authData.connectedCredentials) || []).map((c: { credentialId: string }) => c.credentialId)
      );

      // 저장된 계좌 목록과 연결 상태 병합
      const savedBrokers: { id: string; brokerType: string; accountAlias: string; savedAt: string }[] =
        credData.success ? credData.data || [] : [];

      const merged: AccountEntry[] = savedBrokers.map(b => ({
        id: b.id,
        brokerType: b.brokerType as BrokerType,
        accountAlias: b.accountAlias,
        savedAt: b.savedAt,
        isConnected: connectedIds.has(b.id),
      }));

      // 2FA 활성화 + 세션 없으면 연결된 계좌 강제 해제
      if (totpEnabled && !hasSession) {
        for (const acc of merged.filter(a => a.isConnected)) {
          await fetch(`/api/broker/auth?credentialId=${acc.id}`, { method: 'DELETE' });
        }
        setAccounts(merged.map(a => ({ ...a, isConnected: false })));
      } else {
        setAccounts(merged);
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

  // 특정 계좌 연결
  const handleConnectById = async (account: AccountEntry) => {
    setActionLoading(account.id);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch('/api/broker/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentialId: account.id }),
      });
      const data = await response.json();
      if (data.success) {
        setSuccess(`${BROKER_INFO[account.brokerType].name}${account.accountAlias !== 'default' ? ` (${account.accountAlias})` : ''} 연결 완료`);
        setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, isConnected: true } : a));
        onConnect?.(account.id, account.brokerType);
      } else {
        setError(data.error || '연결에 실패했습니다.');
      }
    } catch {
      setError('서버 오류가 발생했습니다.');
    } finally {
      setActionLoading(null);
    }
  };

  // 특정 계좌 연결 해제
  const handleDisconnectById = async (account: AccountEntry) => {
    setActionLoading(account.id);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/broker/auth?credentialId=${account.id}`, { method: 'DELETE' });
      const data = await response.json();
      if (data.success) {
        setSuccess('연결이 해제되었습니다.');
        setAccounts(prev => prev.map(a => a.id === account.id ? { ...a, isConnected: false } : a));
        onDisconnect?.(account.id, account.brokerType);
      } else {
        setError(data.error || '연결 해제에 실패했습니다.');
      }
    } catch {
      setError('서버 오류가 발생했습니다.');
    } finally {
      setActionLoading(null);
    }
  };

  // 계좌 삭제 (DB에서 영구 삭제)
  const handleDeleteCredential = async (account: AccountEntry) => {
    if (!confirm(`"${account.accountAlias !== 'default' ? account.accountAlias : BROKER_INFO[account.brokerType].name}" 계좌 정보를 삭제하시겠습니까?`)) return;
    setActionLoading(account.id);
    setError(null);
    try {
      if (account.isConnected) {
        await fetch(`/api/broker/auth?credentialId=${account.id}`, { method: 'DELETE' });
      }
      const response = await fetch(`/api/broker/credentials?credentialId=${account.id}`, { method: 'DELETE' });
      const data = await response.json();
      if (data.success) {
        setSuccess('계좌 정보가 삭제되었습니다.');
        setAccounts(prev => prev.filter(a => a.id !== account.id));
      } else if (data.requiresTotpVerify) {
        setTotpVerifyAction('save');
        setShowTotpVerify(true);
      } else {
        setError(data.error || '삭제에 실패했습니다.');
      }
    } catch {
      setError('서버 오류가 발생했습니다.');
    } finally {
      setActionLoading(null);
    }
  };

  // 수정 버튼 클릭 → 폼에 brokerType/alias 채우고 스크롤
  const handleEditAccount = (account: AccountEntry) => {
    setBrokerType(account.brokerType);
    setAccountAlias(account.accountAlias === 'default' ? '' : account.accountAlias);
    setAppKey('');
    setAppSecret('');
    setAccountNumber('');
    setEditingAlias(account.accountAlias);
    setError(null);
    setSuccess(null);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  // 새 계좌 저장
  const handleSave = async () => {
    if (!appKey || !appSecret || !accountNumber) {
      setError('모든 필드를 입력해주세요.');
      return;
    }
    if (!isTotpEnabled) {
      setShowTotpSetup(true);
      return;
    }
    if (!sessionState.hasValidSession) {
      setTotpVerifyAction('save');
      setShowTotpVerify(true);
      return;
    }
    await performSave();
  };

  const performSave = async () => {
    setActionLoading('save');
    setError(null);
    setSuccess(null);
    try {
      const alias = accountAlias.trim() || 'default';
      const response = await fetch('/api/broker/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brokerType, credentials: { appKey, appSecret, accountNumber }, accountAlias: alias }),
      });
      const data = await response.json();
      if (data.success) {
        setSuccess(editingAlias ? '계좌 정보가 수정되었습니다.' : 'API Key가 안전하게 저장되었습니다.');
        setAppKey(''); setAppSecret(''); setAccountNumber(''); setAccountAlias('');
        setEditingAlias(null);
        await checkStatus();
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
      setActionLoading(null);
    }
  };

  const handleTotpSetupSuccess = () => {
    setIsTotpEnabled(true);
    setSessionState({ hasValidSession: false });
    setSuccess('2FA 설정이 완료되었습니다.');
    checkStatus();
  };

  const handleTotpVerifySuccess = async (expiresAt: string) => {
    setSessionState({ hasValidSession: true, expiresAt, remainingMinutes: 120 });
    if (totpVerifyAction === 'save') await performSave();
    setTotpVerifyAction(null);
    await checkStatus();
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
      {/* 2FA 상태 */}
      <Card className="border-emerald-500/30 bg-white">
        <CardContent className="py-3 bg-emerald-50/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className={`h-4 w-4 ${
                !isTotpEnabled ? 'text-gray-400'
                : sessionState.hasValidSession ? 'text-green-500'
                : 'text-yellow-500'
              }`} />
              <div>
                <span className="text-sm font-medium text-gray-900">2단계 인증 (2FA)</span>
                <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                  !isTotpEnabled ? 'bg-gray-100 text-gray-500'
                  : sessionState.hasValidSession ? 'bg-green-100 text-green-700'
                  : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {!isTotpEnabled ? '미설정'
                  : sessionState.hasValidSession ? `인증됨 · ${sessionState.remainingMinutes}분 남음`
                  : '인증 필요'}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              {!isTotpEnabled && (
                <Button variant="outline" size="sm" onClick={() => setShowTotpSetup(true)}>설정하기</Button>
              )}
              {isTotpEnabled && !sessionState.hasValidSession && (
                <Button size="sm" onClick={() => { setTotpVerifyAction(null); setShowTotpVerify(true); }}
                  className="bg-emerald-600 text-white hover:bg-emerald-700">
                  <Shield className="mr-1 h-4 w-4" />인증하기
                </Button>
              )}
              {isTotpEnabled && sessionState.hasValidSession && (
                <Button variant="ghost" size="sm" onClick={() => setShowTotpSetup(true)} className="text-xs text-gray-600">
                  2FA 재설정
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 에러/성공 메시지 */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-destructive text-sm">
          <XCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto">✕</button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-lg bg-green-500/10 p-3 text-green-600 text-sm">
          <CheckCircle className="h-4 w-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* 저장된 계좌 목록 */}
      {accounts.length > 0 && (
        <Card className="border-emerald-500/30 bg-white">
          <CardHeader className="border-b border-emerald-200 bg-emerald-50 py-3">
            <CardTitle className="flex items-center gap-2 text-sm text-emerald-700">
              <Save className="h-4 w-4" />
              저장된 계좌 ({accounts.length}개)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {accounts.map(account => (
                <div key={account.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    {account.isConnected ? (
                      <Wifi className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : (
                      <WifiOff className="h-4 w-4 text-gray-300 shrink-0" />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">
                          {BROKER_INFO[account.brokerType].name}
                        </span>
                        {account.accountAlias !== 'default' && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                            {account.accountAlias}
                          </span>
                        )}
                        {account.isConnected && (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                            연결됨
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400">
                        저장일: {new Date(account.savedAt).toLocaleDateString('ko-KR')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {account.isConnected ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDisconnectById(account)}
                        disabled={actionLoading === account.id}
                        className="h-7 text-xs"
                      >
                        {actionLoading === account.id ? <Loader2 className="h-3 w-3 animate-spin" /> : (
                          <><Unlink className="mr-1 h-3 w-3" />해제</>
                        )}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleConnectById(account)}
                        disabled={actionLoading === account.id}
                        className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        {actionLoading === account.id ? <Loader2 className="h-3 w-3 animate-spin" /> : (
                          <><Link className="mr-1 h-3 w-3" />연결하기</>
                        )}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditAccount(account)}
                      disabled={!!actionLoading}
                      className="h-7 text-xs text-blue-500 hover:text-blue-700"
                    >
                      <Pencil className="mr-1 h-3 w-3" />수정
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteCredential(account)}
                      disabled={actionLoading === account.id}
                      className="h-7 text-xs text-red-400 hover:text-red-600"
                    >
                      삭제
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 새 계좌 저장 / 수정 폼 */}
      <Card className="border-emerald-500/30 bg-white" ref={formRef}>
        <CardHeader className="border-b border-emerald-200 bg-emerald-50">
          <CardTitle className="flex items-center gap-2 text-sm text-emerald-700">
            <Save className="h-4 w-4" />
            {editingAlias ? `계좌 수정 — ${editingAlias === 'default' ? BROKER_INFO[brokerType].name : editingAlias}` : '새 계좌 저장'}
          </CardTitle>
          <CardDescription className="text-gray-600 text-xs">
            {editingAlias
              ? 'App Key · App Secret · 계좌번호를 다시 입력하면 기존 정보를 덮어씁니다.'
              : 'API Key를 암호화하여 저장합니다. 저장 후 "연결하기"를 눌러 연결하세요.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">증권사</Label>
              <Select value={brokerType} onValueChange={(v) => setBrokerType(v as BrokerType)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kis">한국투자증권</SelectItem>
                  <SelectItem value="kiwoom">키움증권</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">계좌 별칭 <span className="text-gray-400">(선택)</span></Label>
              <Input
                className="h-8 text-sm"
                value={accountAlias}
                onChange={(e) => setAccountAlias(e.target.value)}
                placeholder="예: ISA계좌"
                disabled={!!editingAlias}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">App Key</Label>
            <Input className="h-8 text-sm" type="password" value={appKey}
              onChange={(e) => setAppKey(e.target.value)} placeholder="API 포털에서 발급받은 App Key" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">App Secret</Label>
            <Input className="h-8 text-sm" type="password" value={appSecret}
              onChange={(e) => setAppSecret(e.target.value)} placeholder="App Secret" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">계좌번호</Label>
            <Input className="h-8 text-sm" value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)} placeholder="XXXXXXXX-XX" />
          </div>
          <p className="text-xs text-gray-500">
            <a href={BROKER_INFO[brokerType].docsUrl} target="_blank" rel="noopener noreferrer"
              className="text-blue-500 hover:underline">
              {BROKER_INFO[brokerType].name} API 발급 안내 →
            </a>
          </p>
        </CardContent>
        <CardFooter className="flex gap-2">
          {editingAlias && (
            <Button
              variant="outline"
              onClick={() => { setEditingAlias(null); setAppKey(''); setAppSecret(''); setAccountNumber(''); setAccountAlias(''); }}
              className="flex-1"
            >
              취소
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={actionLoading === 'save' || !appKey || !appSecret || !accountNumber}
            className={`${editingAlias ? 'flex-1' : 'w-full'} bg-emerald-600 hover:bg-emerald-700 text-white`}
          >
            {actionLoading === 'save' ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />저장 중...</>
            ) : editingAlias ? (
              <><Save className="mr-2 h-4 w-4" />수정 저장</>
            ) : (
              <><Save className="mr-2 h-4 w-4" />저장하기</>
            )}
          </Button>
        </CardFooter>
      </Card>

      {/* TOTP 다이얼로그 */}
      <TOTPSetupDialog open={showTotpSetup} onOpenChange={setShowTotpSetup} onSuccess={handleTotpSetupSuccess} />
      <TOTPVerifyDialog
        open={showTotpVerify}
        onOpenChange={setShowTotpVerify}
        onSuccess={handleTotpVerifySuccess}
        title="2FA 인증"
        description="계속하려면 2FA 인증이 필요합니다."
      />
    </div>
  );
}
