'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Shield, AlertCircle, Clock } from 'lucide-react';

interface TOTPVerifyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (expiresAt: string) => void;
  title?: string;
  description?: string;
}

export function TOTPVerifyDialog({
  open,
  onOpenChange,
  onSuccess,
  title = 'API Key 접근 인증',
  description = '저장된 API Key에 접근하려면 2FA 인증이 필요합니다.',
}: TOTPVerifyDialogProps) {
  const [token, setToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setToken('');
      setError(null);
      // 다이얼로그 열릴 때 입력 필드에 포커스
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleVerify = async () => {
    if (token.length !== 6) {
      setError('6자리 코드를 입력해주세요.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/broker/totp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const data = await response.json();

      if (data.success) {
        onOpenChange(false);
        onSuccess?.(data.data.expiresAt);
      } else {
        setError(data.error || '인증에 실패했습니다.');
        setToken('');
        inputRef.current?.focus();
      }
    } catch {
      setError('서버 연결에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && token.length === 6 && !isLoading) {
      handleVerify();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="verify-token">인증 코드</Label>
            <Input
              ref={inputRef}
              id="verify-token"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="000000"
              value={token}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, '');
                setToken(value);
                setError(null);
              }}
              onKeyDown={handleKeyDown}
              className="text-center text-2xl tracking-widest font-mono"
              autoComplete="one-time-code"
            />
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>Google Authenticator 앱에서 코드를 확인하세요.</span>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            취소
          </Button>
          <Button
            onClick={handleVerify}
            disabled={isLoading || token.length !== 6}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                인증 중...
              </>
            ) : (
              '인증하기'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
