'use client';

import { LogOut, ShieldCheck, Wallet, CalendarDays, Search, Bot, BarChart3, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { useState } from 'react';

const NAV_LINKS = [
  { href: '/portfolio', label: '포트폴리오' },
  { href: '/dividends', label: '배당캘린더' },
  { href: '/strategies/stock-scan', label: '종목스캔' },
  { href: '/investors', label: '기관투자자' },
  { href: '/robo-advisor', label: '로보어드바이저' },
  { href: '/strategies', label: '전략' },
  { href: '/backtesting', label: '백테스팅' },
  { href: '/auto-trade', label: '자동매매' },
];

// 모바일 하단 네비게이션 (주요 5개)
const MOBILE_NAV_LINKS = [
  { href: '/portfolio', label: '자산', icon: Wallet },
  { href: '/dividends', label: '배당', icon: CalendarDays },
  { href: '/strategies/stock-scan', label: '종목', icon: Search },
  { href: '/robo-advisor', label: '로보', icon: Bot },
  { href: '/backtesting', label: '백테스트', icon: BarChart3 },
];

const ADMIN_USERNAME = 'rlawnsrjs100';

export function DashboardNav() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const username = user?.email?.replace('@allocationchecker.local', '') ?? '';
  const isAdmin = username === ADMIN_USERNAME;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <>
      {/* 상단 헤더 */}
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
            {/* 모바일 메뉴 버튼 */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="sm:hidden flex items-center justify-center h-9 w-9 text-gray-500 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
            <button
              onClick={handleLogout}
              title="로그아웃"
              className="hidden sm:flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>로그아웃</span>
            </button>
          </div>
        </div>

        {/* 모바일 드롭다운 메뉴 */}
        {mobileMenuOpen && (
          <div className="sm:hidden bg-white border-t border-gray-100 px-4 py-2 shadow-lg">
            <div className="flex flex-col gap-1">
              {NAV_LINKS.map((link) => {
                const isActive = link.href === '/strategies'
                  ? pathname === '/strategies' || (pathname.startsWith('/strategies/') && !pathname.startsWith('/strategies/stock-scan'))
                  : pathname.startsWith(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-green-50 text-green-700'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
              {isAdmin && (
                <Link
                  href="/admin"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    pathname === '/admin'
                      ? 'bg-amber-50 text-amber-700'
                      : 'text-amber-600 hover:text-amber-700 hover:bg-amber-50'
                  }`}
                >
                  <ShieldCheck className="h-4 w-4" />
                  관리자
                </Link>
              )}
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                로그아웃
              </button>
            </div>
          </div>
        )}
      </header>

      {/* 모바일 하단 네비게이션 */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 px-2 pb-safe">
        <div className="flex items-center justify-around h-14">
          {MOBILE_NAV_LINKS.map((link) => {
            const Icon = link.icon;
            const isActive = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors ${
                  isActive
                    ? 'text-green-600'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{link.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
