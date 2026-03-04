'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';

export function DashboardNav() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const username = user?.email?.replace('@allocationchecker.local', '') ?? '';

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <span className="font-bold text-gray-900 text-sm">AllocationChecker</span>
        <div className="flex items-center gap-3">
          {username && (
            <span className="text-sm text-gray-500 hidden sm:block">{username}</span>
          )}
          <button
            onClick={handleLogout}
            title="로그아웃"
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">로그아웃</span>
          </button>
        </div>
      </div>
    </header>
  );
}
