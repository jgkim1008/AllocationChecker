import Link from 'next/link';
import { CalendarDays, BarChart3 } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';

const navItems = [
  { href: '/calendar', label: '배당 캘린더', icon: CalendarDays },
  { href: '/portfolio', label: '포트폴리오', icon: BarChart3 },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-56 border-r border-border bg-muted/30 flex flex-col shrink-0">
        <div className="p-4 border-b border-border">
          <Link href="/calendar" className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-green-600" />
            <span className="font-bold text-sm">AllocationChecker</span>
          </Link>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t border-border space-y-1">
          <ThemeToggle />
          <p className="text-xs text-muted-foreground px-2">데이터: FMP · Yahoo Finance</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-background">{children}</main>
    </div>
  );
}
