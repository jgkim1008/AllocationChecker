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

const ACCOUNT_TYPES: AccountType[] = ['ISA', '연금저축', '퇴직연금', '일반', '기타'];

interface Props {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
  onAdd: (name: string, type: AccountType) => Promise<unknown>;
  onDelete: (id: string) => Promise<void>;
}

export function AccountManageDialog({ open, onClose, accounts, onAdd, onDelete }: Props) {
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<AccountType>('일반');
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      setNewType('일반');
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
                  <div>
                    <span className="font-medium text-sm">{account.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {account.type}
                    </span>
                  </div>
                  <button
                    className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                    onClick={() => handleDelete(account.id)}
                    disabled={deletingId === account.id}
                    aria-label="계좌 삭제"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
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
