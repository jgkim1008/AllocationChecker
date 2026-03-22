'use client';

import { LogOut, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';

const NAV_LINKS = [
  { href: '/portfolio', label: '포트폴리오' },
  { href: '/dividends', label: '배당캘린더' },
  { href: '/strategies/stock-scan', label: '종목스캔' },
  { href: '/investors', label: '기관투자자' },
  { href: '/strategies', label: '전략' },
  { href: '/backtesting', label: '백테스팅' },
];

const ADMIN_USERNAME = 'rlawnsrjs100';

export function DashboardNav() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const username = user?.email?.replace('@allocationchecker.local', '') ?? '';
  const isAdmin = username === ADMIN_USERNAME;

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-bold text-gray-900 text-sm">AllocationChecker</span>
          <nav className="hidden sm:flex items-center gap-1">
            {NAV_LINKS.map((link) => {
              const isActive = link.href === '/strategies'
                ? pathname === '/strategies' || (pathname.startsWith('/strategies/') && !pathname.startsWith('/strategies/stock-scan'))
                : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-green-50 text-green-700'
                      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            {isAdmin && (
              <Link
                href="/admin"
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  pathname === '/admin'
                    ? 'bg-amber-50 text-amber-700'
                    : 'text-amber-600 hover:text-amber-700 hover:bg-amber-50'
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                관리자
              </Link>
            )}
          </nav>
        </div>
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
