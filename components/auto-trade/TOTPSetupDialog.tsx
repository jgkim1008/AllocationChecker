'use client';

import { useState } from 'react';
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
import { Loader2, Shield, Copy, Check, AlertCircle } from 'lucide-react';

interface TOTPSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type SetupStep = 'intro' | 'qr' | 'verify' | 'done';

export function TOTPSetupDialog({ open, onOpenChange, onSuccess }: TOTPSetupDialogProps) {
  const [step, setStep] = useState<SetupStep>('intro');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [manualKey, setManualKey] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [copied, setCopied] = useState(false);

  const resetState = () => {
    setStep('intro');
    setIsLoading(false);
    setError(null);
    setQrCodeDataUrl(null);
    setManualKey(null);
    setToken('');
    setCopied(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetState();
    }
    onOpenChange(newOpen);
  };

  const startSetup = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/broker/totp/setup', {
        method: 'POST',
      });

      const data = await response.json();

      if (data.success) {
        setQrCodeDataUrl(data.data.qrCodeDataUrl);
        setManualKey(data.data.manualEntryKey);
        setStep('qr');
      } else {
        setError(data.error || '2FA 설정을 시작할 수 없습니다.');
      }
    } catch {
      setError('서버 연결에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const verifyToken = async () => {
    if (token.length !== 6) {
      setError('6자리 코드를 입력해주세요.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/broker/totp/setup', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const data = await response.json();

      if (data.success) {
        setStep('done');
      } else {
        setError(data.error || '코드가 올바르지 않습니다.');
      }
    } catch {
      setError('서버 연결에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const copyManualKey = async () => {
    if (manualKey) {
      await navigator.clipboard.writeText(manualKey.replace(/\s/g, ''));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleComplete = () => {
    handleOpenChange(false);
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            2단계 인증 (2FA) 설정
          </DialogTitle>
          <DialogDescription>
            {step === 'intro' && 'Google Authenticator 앱으로 API Key를 보호합니다.'}
            {step === 'qr' && 'Google Authenticator 앱에서 QR 코드를 스캔하세요.'}
            {step === 'verify' && '앱에 표시된 6자리 코드를 입력하세요.'}
            {step === 'done' && '2FA 설정이 완료되었습니다!'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Step: intro */}
          {step === 'intro' && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted p-4">
                <h4 className="font-medium mb-2">왜 2FA가 필요한가요?</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>- API Key는 실제 거래에 사용되는 민감한 정보입니다.</li>
                  <li>- 2FA를 설정하면 본인만 API Key에 접근할 수 있습니다.</li>
                  <li>- 인증 후 2시간 동안 세션이 유지됩니다.</li>
                </ul>
              </div>

              <div className="rounded-lg border p-4">
                <h4 className="font-medium mb-2">준비물</h4>
                <p className="text-sm text-muted-foreground">
                  스마트폰에 <strong>Google Authenticator</strong> 앱을 설치해주세요.
                </p>
                <div className="mt-2 flex gap-2">
                  <a
                    href="https://apps.apple.com/app/google-authenticator/id388497605"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-500 hover:underline"
                  >
                    iOS 다운로드
                  </a>
                  <a
                    href="https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-500 hover:underline"
                  >
                    Android 다운로드
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Step: QR code */}
          {step === 'qr' && qrCodeDataUrl && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="rounded-lg border p-4 bg-white">
                  <img
                    src={qrCodeDataUrl}
                    alt="TOTP QR Code"
                    className="w-48 h-48"
                  />
                </div>
              </div>

              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-2">
                  QR 코드를 스캔할 수 없나요? 수동으로 입력하세요:
                </p>
                <div className="flex items-center justify-center gap-2">
                  <code className="px-3 py-1 bg-muted rounded text-sm font-mono">
                    {manualKey}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={copyManualKey}
                    className="h-8 w-8 p-0"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Step: verify */}
          {step === 'verify' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="totp-token">인증 코드</Label>
                <Input
                  id="totp-token"
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
                  className="text-center text-2xl tracking-widest font-mono"
                  autoFocus
                />
              </div>

              <p className="text-sm text-muted-foreground text-center">
                Google Authenticator 앱에 표시된 6자리 코드를 입력하세요.
              </p>
            </div>
          )}

          {/* Step: done */}
          {step === 'done' && (
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <Check className="h-8 w-8 text-green-600" />
              </div>
              <div>
                <h4 className="font-medium">설정 완료!</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  이제 API Key를 저장하고 불러올 때 2FA 인증이 필요합니다.
                </p>
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          {step === 'intro' && (
            <Button onClick={startSetup} disabled={isLoading} className="w-full">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  설정 시작...
                </>
              ) : (
                '설정 시작'
              )}
            </Button>
          )}

          {step === 'qr' && (
            <Button onClick={() => setStep('verify')} className="w-full">
              다음: 코드 입력
            </Button>
          )}

          {step === 'verify' && (
            <div className="flex gap-2 w-full">
              <Button
                variant="outline"
                onClick={() => setStep('qr')}
                disabled={isLoading}
              >
                이전
              </Button>
              <Button
                onClick={verifyToken}
                disabled={isLoading || token.length !== 6}
                className="flex-1"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    확인 중...
                  </>
                ) : (
                  '확인'
                )}
              </Button>
            </div>
          )}

          {step === 'done' && (
            <Button onClick={handleComplete} className="w-full">
              완료
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
