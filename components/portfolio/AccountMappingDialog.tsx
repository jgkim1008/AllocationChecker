'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Link2, Link2Off, Loader2 } from 'lucide-react';
import type { Account } from '@/types/portfolio';

interface BrokerCredential {
  id: string;
  brokerType: string;
  accountAlias: string;
}

interface AccountMapping {
  id: string;
  account_id: string;
  broker_credential_id: string;
  account: { id: string; name: string; type: string };
  broker: { id: string; broker_type: string; account_alias: string };
}

interface Props {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
  onMappingChange?: () => void;
}

const BROKER_LABELS: Record<string, string> = {
  kis: '한국투자증권',
  kiwoom: '키움증권',
};

export function AccountMappingDialog({ open, onClose, accounts, onMappingChange }: Props) {
  const [mappings, setMappings] = useState<AccountMapping[]>([]);
  const [credentials, setCredentials] = useState<BrokerCredential[]>([]);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 매핑 및 브로커 자격증명 목록 조회
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mappingsRes, credentialsRes] = await Promise.all([
        fetch('/api/portfolio/account-mapping'),
        fetch('/api/broker/credentials'),
      ]);

      if (mappingsRes.ok) {
        const data = await mappingsRes.json();
        setMappings(data);
      }

      if (credentialsRes.ok) {
        const data = await credentialsRes.json();
        if (data.success && Array.isArray(data.data)) {
          setCredentials(data.data);
        }
      }
    } catch (err) {
      setError('데이터를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open, fetchData]);

  // 계좌에 연결된 브로커 credential ID 찾기
  const getMappedCredentialId = (accountId: string): string | null => {
    const mapping = mappings.find((m) => m.account_id === accountId);
    return mapping?.broker_credential_id ?? null;
  };

  // 이미 다른 계좌에 연결된 credential인지 확인
  const isCredentialMapped = (credentialId: string, excludeAccountId: string): boolean => {
    return mappings.some(
      (m) => m.broker_credential_id === credentialId && m.account_id !== excludeAccountId
    );
  };

  // 매핑 변경 핸들러
  const handleMappingChange = async (accountId: string, credentialId: string | 'none') => {
    setUpdating(accountId);
    setError(null);

    try {
      if (credentialId === 'none') {
        // 매핑 해제
        const res = await fetch(`/api/portfolio/account-mapping?accountId=${accountId}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || '매핑 해제 실패');
        }
      } else {
        // 매핑 생성/변경
        const res = await fetch('/api/portfolio/account-mapping', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountId,
            brokerCredentialId: credentialId,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || '매핑 생성 실패');
        }
      }

      // 데이터 새로고침
      await fetchData();
      onMappingChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.');
    } finally {
      setUpdating(null);
    }
  };

  // 브로커 라벨 포맷
  const formatCredentialLabel = (cred: BrokerCredential): string => {
    const brokerName = BROKER_LABELS[cred.brokerType] || cred.brokerType;
    const alias = cred.accountAlias === 'default' ? '' : ` (${cred.accountAlias})`;
    return `${brokerName}${alias}`;
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            증권사 계좌 연결
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : credentials.length === 0 ? (
            <div className="text-center py-6 text-gray-500">
              <p className="text-sm">등록된 증권사 계좌가 없습니다.</p>
              <p className="text-xs mt-1">설정 → 증권사 연결에서 API 키를 등록하세요.</p>
            </div>
          ) : accounts.length === 0 ? (
            <div className="text-center py-6 text-gray-500">
              <p className="text-sm">포트폴리오 계좌가 없습니다.</p>
              <p className="text-xs mt-1">먼저 계좌를 추가하세요.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                각 포트폴리오 계좌에 동기화할 증권사 계좌를 연결하세요.
              </p>

              {accounts.map((account) => {
                const mappedCredentialId = getMappedCredentialId(account.id);
                const isUpdating = updating === account.id;

                return (
                  <div
                    key={account.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border bg-card"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate text-white">{account.name}</p>
                      <p className="text-xs text-gray-300">{account.type}</p>
                    </div>

                    <div className="flex items-center gap-2 ml-3">
                      {isUpdating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Select
                          value={mappedCredentialId || 'none'}
                          onValueChange={(v) => handleMappingChange(account.id, v)}
                        >
                          <SelectTrigger className="w-40 h-8 text-xs">
                            <SelectValue placeholder="연결 안함" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">
                              <span className="flex items-center gap-1.5">
                                <Link2Off className="h-3 w-3" />
                                연결 안함
                              </span>
                            </SelectItem>
                            {credentials.map((cred) => {
                              const isMapped = isCredentialMapped(cred.id, account.id);
                              return (
                                <SelectItem
                                  key={cred.id}
                                  value={cred.id}
                                  disabled={isMapped}
                                >
                                  <span className={isMapped ? 'text-gray-400' : ''}>
                                    {formatCredentialLabel(cred)}
                                    {isMapped && ' (사용중)'}
                                  </span>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}

          <div className="text-xs text-gray-500 space-y-1 pt-2 border-t">
            <p>* 하나의 증권사 계좌는 하나의 포트폴리오 계좌에만 연결 가능합니다.</p>
            <p>* 연결 후 "증권사 동기화" 버튼으로 잔고를 가져올 수 있습니다.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
