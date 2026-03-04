'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Lock, User } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: `${username.trim().toLowerCase()}@allocationchecker.local`,
      password,
    });

    setLoading(false);

    if (authError) {
      setError('아이디 또는 비밀번호가 올바르지 않습니다');
      setShake(true);
      setTimeout(() => setShake(false), 600);
    } else {
      router.replace('/portfolio');
    }
  };

  return (
    <div className="min-h-screen bg-[#14151A] flex items-center justify-center px-4">
      <div className="bg-[#1E1F26] rounded-2xl p-8 w-full max-w-sm shadow-2xl">
        {/* Icon + title */}
        <div className="flex flex-col items-center mb-7">
          <div className="w-14 h-14 rounded-full bg-[#F0B429]/15 flex items-center justify-center mb-4">
            <Lock className="h-6 w-6 text-[#F0B429]" />
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">AllocationChecker</h1>
          <p className="text-sm text-[#8B8FA8] mt-1.5">로그인</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Username */}
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8B8FA8]" />
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="아이디"
              autoFocus
              autoComplete="username"
              className="w-full bg-[#14151A] text-white rounded-xl px-4 py-3 text-sm outline-none border border-[#2A2B35] focus:border-[#F0B429] transition-colors pl-10 placeholder-[#8B8FA8]"
            />
          </div>

          {/* Password */}
          <div
            className={shake ? 'animate-[shake_0.5s_ease-in-out]' : ''}
            style={shake ? { animation: 'shake 0.5s ease-in-out' } : {}}
          >
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8B8FA8]" />
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호"
                autoComplete="current-password"
                className={`w-full bg-[#14151A] text-white rounded-xl px-4 py-3 text-sm outline-none border transition-colors pl-10 pr-10 placeholder-[#8B8FA8] ${
                  shake ? 'border-[#FF4D4D]' : 'border-[#2A2B35] focus:border-[#F0B429]'
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
          </div>

          {error && <p className="text-xs text-[#FF4D4D] text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full bg-[#F0B429] hover:bg-[#D4A017] disabled:opacity-50 text-[#14151A] font-bold py-3 rounded-xl text-sm transition-colors mt-1"
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <p className="text-center text-sm text-[#8B8FA8] mt-5">
          계정이 없으신가요?{' '}
          <Link href="/signup" className="text-[#F0B429] hover:underline">
            회원가입
          </Link>
        </p>
      </div>

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
