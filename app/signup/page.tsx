'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Lock, User, UserPlus, Gift } from 'lucide-react';
import Link from 'next/link';

export default function SignupPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
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
      body: JSON.stringify({ username: username.trim(), password, referralCode }),
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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-sm border border-gray-200">
        {/* Icon + title */}
        <div className="flex flex-col items-center mb-7">
          <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mb-4">
            <UserPlus className="h-6 w-6 text-green-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">AllocationChecker</h1>
          <p className="text-sm text-gray-500 mt-1.5">회원가입</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Username */}
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="아이디 (3자 이상)"
              autoFocus
              autoComplete="username"
              className="w-full bg-white text-gray-900 rounded-xl px-4 py-3 text-sm outline-none border border-gray-200 focus:border-green-600 transition-colors pl-10 placeholder-gray-400"
            />
          </div>

          {/* Password */}
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호 (4자 이상)"
              autoComplete="new-password"
              className="w-full bg-white text-gray-900 rounded-xl px-4 py-3 text-sm outline-none border border-gray-200 focus:border-green-600 transition-colors pl-10 pr-10 placeholder-gray-400"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 transition-colors"
              tabIndex={-1}
            >
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {/* Confirm Password */}
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type={showPw ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="비밀번호 확인"
              autoComplete="new-password"
              className={`w-full bg-white text-gray-900 rounded-xl px-4 py-3 text-sm outline-none border transition-colors pl-10 placeholder-gray-400 ${
                confirmPassword && confirmPassword !== password
                  ? 'border-red-500'
                  : 'border-gray-200 focus:border-green-600'
              }`}
            />
          </div>

          {/* Referral Code */}
          <div className="relative">
            <Gift className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value)}
              placeholder="추천인 코드 (필수)"
              autoComplete="off"
              className="w-full bg-white text-gray-900 rounded-xl px-4 py-3 text-sm outline-none border border-gray-200 focus:border-green-600 transition-colors pl-10 placeholder-gray-400"
            />
          </div>

          {error && <p className="text-xs text-red-500 text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading || !username || !password || !confirmPassword || !referralCode}
            className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl text-sm transition-colors mt-1"
          >
            {loading ? '가입 중...' : '회원가입'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-5">
          이미 계정이 있으신가요?{' '}
          <Link href="/login" className="text-green-600 hover:underline">
            로그인
          </Link>
        </p>
      </div>
    </div>
  );
}
