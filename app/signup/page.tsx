'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Lock, User, UserPlus } from 'lucide-react';
import Link from 'next/link';

export default function SignupPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다');
      return;
    }

    setLoading(true);

    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.trim(), password }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? '회원가입 중 오류가 발생했습니다');
    } else {
      router.replace('/login');
    }
  };

  return (
    <div className="min-h-screen bg-[#14151A] flex items-center justify-center px-4">
      <div className="bg-[#1E1F26] rounded-2xl p-8 w-full max-w-sm shadow-2xl">
        {/* Icon + title */}
        <div className="flex flex-col items-center mb-7">
          <div className="w-14 h-14 rounded-full bg-[#F0B429]/15 flex items-center justify-center mb-4">
            <UserPlus className="h-6 w-6 text-[#F0B429]" />
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">AllocationChecker</h1>
          <p className="text-sm text-[#8B8FA8] mt-1.5">회원가입</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Username */}
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8B8FA8]" />
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="아이디 (3자 이상)"
              autoFocus
              autoComplete="username"
              className="w-full bg-[#14151A] text-white rounded-xl px-4 py-3 text-sm outline-none border border-[#2A2B35] focus:border-[#F0B429] transition-colors pl-10 placeholder-[#8B8FA8]"
            />
          </div>

          {/* Password */}
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8B8FA8]" />
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호 (4자 이상)"
              autoComplete="new-password"
              className="w-full bg-[#14151A] text-white rounded-xl px-4 py-3 text-sm outline-none border border-[#2A2B35] focus:border-[#F0B429] transition-colors pl-10 pr-10 placeholder-[#8B8FA8]"
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

          {/* Confirm Password */}
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8B8FA8]" />
            <input
              type={showPw ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="비밀번호 확인"
              autoComplete="new-password"
              className={`w-full bg-[#14151A] text-white rounded-xl px-4 py-3 text-sm outline-none border transition-colors pl-10 placeholder-[#8B8FA8] ${
                confirmPassword && confirmPassword !== password
                  ? 'border-[#FF4D4D]'
                  : 'border-[#2A2B35] focus:border-[#F0B429]'
              }`}
            />
          </div>

          {error && <p className="text-xs text-[#FF4D4D] text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading || !username || !password || !confirmPassword}
            className="w-full bg-[#F0B429] hover:bg-[#D4A017] disabled:opacity-50 text-[#14151A] font-bold py-3 rounded-xl text-sm transition-colors mt-1"
          >
            {loading ? '가입 중...' : '회원가입'}
          </button>
        </form>

        <p className="text-center text-sm text-[#8B8FA8] mt-5">
          이미 계정이 있으신가요?{' '}
          <Link href="/login" className="text-[#F0B429] hover:underline">
            로그인
          </Link>
        </p>
      </div>
    </div>
  );
}
