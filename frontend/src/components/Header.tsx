'use client';

import { Bell, Search, UserCircle } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

export function Header() {
  return (
    <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/80 dark:border-slate-800 dark:bg-slate-950/80 px-6 backdrop-blur-xl transition-colors">
      <div className="flex flex-1 items-center gap-4">
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-900 rounded-full border border-slate-200 dark:border-slate-800">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Ambiente Administrativo</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <ThemeToggle />
        
        <button className="relative rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-950" />
        </button>
        
        <div className="h-8 w-px bg-slate-200 dark:bg-slate-800 mx-2" />

        <button className="flex items-center gap-2 rounded-full p-1 pr-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
          <UserCircle className="h-8 w-8 text-slate-400" />
          <div className="flex flex-col items-start leading-none">
            <span className="text-sm font-medium text-slate-800 dark:text-slate-200">Admin</span>
            <span className="text-xs text-slate-500">Cronuz S.A.</span>
          </div>
        </button>
      </div>
    </header>
  );
}
