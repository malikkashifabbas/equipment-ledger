'use client';

import {
  BarChart3,
  Boxes,
  CalendarClock,
  Moon,
  Search,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import Image from 'next/image';
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

export type View = 'assets' | 'reservations' | 'history';
const navigation = [
  { id: 'assets' as const, label: 'Dashboard', icon: Boxes },
  { id: 'reservations' as const, label: 'Reservations', icon: CalendarClock },
  { id: 'history' as const, label: 'Reports', icon: BarChart3 },
];

const gradientStyle = { background: 'var(--brand-gradient)' } as const;

export function AppShell({
  view,
  onView,
  search,
  onSearch,
  children,
}: {
  view: View;
  onView: (view: View) => void;
  search: string;
  onSearch: (value: string) => void;
  children: ReactNode;
}) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const timer = setTimeout(() => {
      const saved = localStorage.getItem('equipment-ledger-theme');
      const initial = saved === 'dark' ? 'dark' : 'light';
      document.documentElement.classList.toggle('dark', initial === 'dark');
      setTheme(initial);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    document.documentElement.classList.toggle('dark', next === 'dark');
    localStorage.setItem('equipment-ledger-theme', next);
    setTheme(next);
  };

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar shadow-[10px_0_35px_rgba(81,71,248,.035)] lg:flex">
        <Brand />
        <nav className="space-y-1.5 px-3 py-5" aria-label="Main navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onView(id)}
              style={view === id ? gradientStyle : undefined}
              className={`group flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm font-medium transition-all duration-200 ${view === id ? 'translate-x-0 text-white shadow-[0_7px_18px_rgba(81,71,248,.24)]' : 'text-sidebar-foreground hover:translate-x-0.5 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'}`}
              aria-current={view === id ? 'page' : undefined}
            >
              <Icon className="size-4.5 shrink-0" strokeWidth={1.9} />
              {label}
            </button>
          ))}
        </nav>
        <div className="mt-auto p-3.5 pb-4">
          <div className="overflow-hidden rounded-2xl border border-[var(--brand-border-soft)] bg-[var(--brand-surface)] shadow-[0_12px_30px_rgba(35,48,83,.07)]">
            <div className="relative flex h-32 items-center justify-center overflow-hidden bg-[linear-gradient(145deg,var(--brand-primary-extra-light),var(--brand-info-light))] px-4 pt-2 dark:bg-[linear-gradient(145deg,rgba(81,71,248,.18),rgba(31,139,255,.1))]">
              <span className="absolute left-4 top-4 size-16 rounded-full bg-white/55 blur-2xl dark:bg-[var(--brand-primary)]/10" />
              <Image
                src="/side-bar-image.png"
                alt="Safety helmet and maintenance tools"
                width={210}
                height={158}
                sizes="210px"
                className="relative h-[120px] w-full object-contain drop-shadow-[0_12px_12px_rgba(35,48,83,.18)]"
              />
            </div>
            <div className="p-4 pt-3">
              <p className="text-sm font-bold leading-tight text-[var(--brand-text-heading)]">
                Safe tools.<br />Productive teams.
              </p>
              <p className="mt-2 text-[11px] leading-relaxed text-[var(--brand-text-muted)]">
                Keep every asset inspected, available and ready for work.
              </p>
              <button
                onClick={() => onView('assets')}
                className="mt-3 inline-flex items-center rounded-lg bg-[var(--brand-primary-extra-light)] px-3 py-1.5 text-[11px] font-semibold text-[var(--brand-primary)] transition-colors hover:bg-[var(--brand-primary-light)] hover:text-[var(--brand-primary-dark)]"
              >
                View equipment <span aria-hidden="true" className="ml-1">→</span>
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 border-b border-[var(--brand-border-soft)] bg-[var(--brand-surface)]/95 backdrop-blur">
          <div className="flex h-[68px] items-center gap-4 px-4 sm:px-6 lg:px-8">
            <div className="lg:hidden">
              <Brand compact />
            </div>
            <div className="relative hidden max-w-md flex-1 md:block">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--brand-text-muted)]" />
              <input
                value={search}
                onChange={(event) => {
                  onSearch(event.target.value);
                  onView('assets');
                }}
                className="h-9 w-full rounded-lg border border-[var(--brand-input-border)] bg-[var(--brand-input)] pl-9 pr-3 text-sm text-[var(--brand-text)] outline-none placeholder:text-[var(--brand-placeholder)] focus:border-[var(--brand-primary)] focus:ring-3 focus:ring-[color:rgba(81,71,248,.15)]"
                placeholder="Search equipment, assets, or people…"
                aria-label="Search equipment"
              />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              >
                {theme === 'light' ? <Moon /> : <Sun />}
              </Button>
              <span style={gradientStyle} className="grid size-9 place-items-center rounded-full text-xs font-semibold text-white">
                KS
              </span>
            </div>
          </div>
          <nav
            className="flex gap-1 overflow-x-auto border-t border-[var(--brand-border-soft)] px-3 py-2 lg:hidden"
            aria-label="Mobile navigation"
          >
            {navigation.map(({ id, label, icon: Icon }) => (
              <Button
                key={id}
                variant={view === id ? 'default' : 'ghost'}
                onClick={() => onView(id)}
              >
                <Icon />
                {label}
              </Button>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={
        compact
          ? 'flex items-center gap-2'
          : 'flex h-[68px] items-center gap-3 border-b border-sidebar-border px-5'
      }
    >
      <span style={gradientStyle} className="grid size-9 shrink-0 place-items-center rounded-[11px] text-white shadow-[0_7px_18px_rgba(81,71,248,.25)]">
        <ShieldCheck className="size-5" />
      </span>
      {!compact && (
        <div>
          <div className="font-semibold tracking-tight text-[var(--brand-text-heading)]">
            Equipment Ledger
          </div>
          <div className="text-xs text-[var(--brand-text-muted)]">
            Smarter work together
          </div>
        </div>
      )}
    </div>
  );
}
