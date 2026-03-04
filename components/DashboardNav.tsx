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
    <div className="fixed top-3 right-4 z-50 flex items-center gap-2">
      {username && (
        <span className="text-xs text-[#8B8FA8] hidden sm:block">{username}</span>
      )}
      <button
        onClick={handleLogout}
        title="로그아웃"
        className="flex items-center gap-1.5 text-xs text-[#8B8FA8] hover:text-white bg-[#1E1F26] hover:bg-[#2A2B35] border border-[#2A2B35] rounded-lg px-3 py-1.5 transition-colors"
      >
        <LogOut className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">로그아웃</span>
      </button>
    </div>
  );
}
