'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Trash2, Plus } from 'lucide-react';
import type { Account, AccountType } from '@/types/portfolio';

const ACCOUNT_TYPES: AccountType[] = ['과세', '비과세'];

// 기존 타입을 과세/비과세로 매핑
const mapToTaxType = (type: string): AccountType => {
  if (type === '과세' || type === '비과세') return type as AccountType;
  // ISA, 연금저축, 퇴직연금 → 비과세 / 일반, 기타 → 과세
  if (['ISA', '연금저축', '퇴직연금'].includes(type)) return '비과세';
  return '과세';
};

interface Props {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
  onAdd: (name: string, type: AccountType) => Promise<unknown>;
  onUpdate: (id: string, name: string, type: AccountType) => Promise<unknown>;
  onDelete: (id: string) => Promise<void>;
}

export function AccountManageDialog({ open, onClose, accounts, onAdd, onUpdate, onDelete }: Props) {
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<AccountType>('과세');
  const [adding, setAdding] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleTypeChange = async (account: Account, newType: AccountType) => {
    const currentMappedType = mapToTaxType(account.type);
    if (currentMappedType === newType) return;
    setUpdatingId(account.id);
    setError(null);
    try {
      await onUpdate(account.id, account.name, newType);
    } catch (err) {
      setError(err instanceof Error ? err.message : '타입 변경 실패');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleAdd = async () => {
    if (!newName.trim()) {
      setError('계좌 이름을 입력해주세요.');
      return;
    }
    setAdding(true);
    setError(null);
    try {
      await onAdd(newName.trim(), newType);
      setNewName('');
      setNewType('과세');
    } catch (err) {
      setError(err instanceof Error ? err.message : '계좌 추가 실패');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('계좌를 삭제하면 해당 계좌의 종목들이 "미분류"로 이동됩니다. 삭제하시겠습니까?')) return;
    setDeletingId(id);
    try {
      await onDelete(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '계좌 삭제 실패');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>계좌 관리</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 계좌 목록 */}
          <div className="space-y-2">
            {accounts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">등록된 계좌가 없습니다.</p>
            ) : (
              accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border bg-card"
                >
                  <span className="font-medium text-sm flex-1">{account.name}</span>
                  <div className="flex items-center gap-2">
                    <Select
                      value={mapToTaxType(account.type)}
                      onValueChange={(v) => handleTypeChange(account, v as AccountType)}
                      disabled={updatingId === account.id}
                    >
                      <SelectTrigger className="w-20 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACCOUNT_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <button
                      className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                      onClick={() => handleDelete(account.id)}
                      disabled={deletingId === account.id}
                      aria-label="계좌 삭제"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* 구분선 */}
          <div className="border-t border-border" />

          {/* 계좌 추가 폼 */}
          <div className="space-y-3">
            <p className="text-sm font-medium">새 계좌 추가</p>
            <Input
              placeholder="계좌 이름 (예: 내 ISA 계좌)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            />
            <Select value={newType} onValueChange={(v) => setNewType(v as AccountType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button
              className="w-full"
              onClick={handleAdd}
              disabled={adding}
            >
              <Plus className="h-4 w-4 mr-2" />
              {adding ? '추가 중...' : '계좌 추가'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
