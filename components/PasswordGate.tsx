'use client';

import { useState, useEffect } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';

const STORAGE_KEY = 'ac_auth_v1';
const PASSWORD = '123456';

export function PasswordGate({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [input, setInput] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    setAuthenticated(sessionStorage.getItem(STORAGE_KEY) === 'true');
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input === PASSWORD) {
      sessionStorage.setItem(STORAGE_KEY, 'true');
      setAuthenticated(true);
    } else {
      setShake(true);
      setInput('');
      setTimeout(() => setShake(false), 600);
    }
  };

  // Waiting for sessionStorage check
  if (authenticated === null) {
    return <div className="min-h-screen bg-[#14151A]" />;
  }

  if (authenticated) return <>{children}</>;

  return (
    <div className="min-h-screen bg-[#14151A] flex items-center justify-center px-4">
      <div className="bg-[#1E1F26] rounded-2xl p-8 w-full max-w-sm shadow-2xl">
        {/* Icon + title */}
        <div className="flex flex-col items-center mb-7">
          <div className="w-14 h-14 rounded-full bg-[#F0B429]/15 flex items-center justify-center mb-4">
            <Lock className="h-6 w-6 text-[#F0B429]" />
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">AllocationChecker</h1>
          <p className="text-sm text-[#8B8FA8] mt-1.5">비밀번호를 입력하세요</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div
            className={`relative transition-transform ${shake ? 'animate-[shake_0.5s_ease-in-out]' : ''}`}
            style={shake ? { animation: 'shake 0.5s ease-in-out' } : {}}
          >
            <input
              type={showPw ? 'text' : 'password'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="비밀번호"
              autoFocus
              className={`w-full bg-[#14151A] text-white rounded-xl px-4 py-3 text-sm outline-none border transition-colors pr-10 placeholder-[#8B8FA8] ${
                shake
                  ? 'border-[#FF4D4D]'
                  : 'border-[#2A2B35] focus:border-[#F0B429]'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8B8FA8] hover:text-white transition-colors"
              tabIndex={-1}
            >
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {shake && (
            <p className="text-xs text-[#FF4D4D] text-center">비밀번호가 올바르지 않습니다</p>
          )}

          <button
            type="submit"
            className="w-full bg-[#F0B429] hover:bg-[#D4A017] text-[#14151A] font-bold py-3 rounded-xl text-sm transition-colors"
          >
            확인
          </button>
        </form>
      </div>

      {/* Shake keyframe */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );
}
