import React from 'react';
import { StoreHeader } from '@/components/store/StoreHeader';

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#0a0f1c] dark:text-white flex flex-col font-sans transition-colors duration-200">
      <StoreHeader />
      <main className="flex-1 w-full flex flex-col">
        {children}
      </main>
      
      {/* Simple Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-8 dark:border-slate-800 dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-slate-500 dark:text-slate-400">
          <p>&copy; {new Date().getFullYear()} Cronuz. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
