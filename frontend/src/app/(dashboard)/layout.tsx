'use client';

import { useState } from 'react';
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <Sidebar 
        isMobileOpen={isMobileSidebarOpen} 
        onCloseMobile={() => setIsMobileSidebarOpen(false)} 
      />
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <Header 
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)} 
        />
        <main className="flex-1 overflow-y-auto bg-slate-100/50 dark:bg-slate-950/50 p-3 sm:p-4 md:p-6 relative">
          {/* Subtle background glow */}
          <div className="pointer-events-none absolute -top-40 left-0 right-0 h-96 bg-[var(--color-primary-base)]/10 blur-[120px] rounded-full" />
          <div className="relative z-10 w-full max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

