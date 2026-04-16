'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-9 w-full" />;

  const isDark = resolvedTheme === 'dark';

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="w-full flex items-center justify-between px-3 py-2 rounded-md text-xs text-gray-600 hover:bg-accent hover:text-accent-foreground transition-colors"
    >
      <span className="flex items-center gap-2">
        {isDark ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
        {isDark ? '다크 모드' : '라이트 모드'}
      </span>
      {/* 토글 스위치 */}
      <div className={`relative w-8 h-4 rounded-full transition-colors ${isDark ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
        <div className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${isDark ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </div>
    </button>
  );
}
