'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, ShoppingCart, User, Menu, X, BookOpen, ShoppingBag, Receipt } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ThemeToggle } from '@/components/ThemeToggle';
import { getUser } from '@/lib/auth';

export function StoreHeader() {
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [user, setUser] = useState<any>(null);

  React.useEffect(() => {
    setUser(getUser());
  }, []);

  const storeName = user?.company_name || 'Cronuz';
  const isCustomer = user?.type === 'CUSTOMER';
  const cartItemsCount = 0; // TODO: Connect to Cart Context

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/store/search?q=${encodeURIComponent(searchQuery)}`);
      setIsMobileMenuOpen(false);
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm dark:bg-slate-950/90 dark:border-slate-800 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16 md:h-20">
          
          {/* Logo & Mobile Menu Toggle */}
          <div className="flex items-center gap-4">
            <button 
              className="md:hidden p-2 -ml-2 text-slate-600 hover:text-[var(--color-primary-base)] transition-colors dark:text-slate-300"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu className="h-6 w-6" />
            </button>
            <Link href="/store" className="flex items-center gap-2 group">
              <div className="bg-[var(--color-primary-base)] text-white p-2 rounded-xl shadow-lg shadow-[var(--color-primary-base)]/20 group-hover:scale-105 transition-transform">
                <BookOpen className="h-5 w-5 md:h-6 md:w-6" />
              </div>
              <span className="text-xl md:text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-400 tracking-tight">
                {storeName}
              </span>
            </Link>
          </div>

          {/* Desktop Search Bar */}
          <div className="hidden md:flex flex-1 max-w-2xl mx-8">
            <form onSubmit={handleSearch} className="w-full relative group">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-slate-400 group-focus-within:text-[var(--color-primary-base)] transition-colors" />
              </div>
              <input
                type="text"
                placeholder="Busque por título, autor, editora ou ISBN..."
                className="w-full pl-11 pr-4 py-2.5 bg-slate-100 border-transparent text-slate-900 text-sm rounded-2xl focus:bg-white focus:border-[var(--color-primary-base)] focus:ring-4 focus:ring-[var(--color-primary-base)]/10 transition-all dark:bg-slate-900 dark:text-white dark:placeholder-slate-500"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button type="submit" className="absolute inset-y-1.5 right-1.5 bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white px-4 rounded-xl text-sm font-semibold transition-colors">
                Buscar
              </button>
            </form>
          </div>

          {/* Actions: Theme, Account, Cart */}
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="hidden sm:block"><ThemeToggle /></div>

            {isCustomer && (
              <>
                <Link href="/store/orders" className="hidden lg:flex items-center gap-2 p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                  <ShoppingBag className="h-5 w-5" />
                  <span className="text-sm font-bold">Pedidos</span>
                </Link>
                <Link href="/store/financials" className="hidden lg:flex items-center gap-2 p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                  <Receipt className="h-5 w-5" />
                  <span className="text-sm font-bold">Débitos</span>
                </Link>
              </>
            )}
            
            <Link href="/store/account" className="hidden sm:flex items-center gap-2 p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
              <User className="h-5 w-5" />
              <div className="flex flex-col items-start leading-none">
                <span className="text-xs text-slate-500 dark:text-slate-400">Olá, {user?.name?.split(' ')[0] || 'Visitante'}</span>
                <span className="text-sm font-bold">Minha Conta</span>
              </div>
            </Link>

            <Link href="/store/cart" className="relative p-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 transition-colors dark:bg-slate-900 dark:hover:bg-slate-800 dark:text-slate-300 group">
              <ShoppingCart className="h-5 w-5 group-hover:scale-110 transition-transform" />
              {cartItemsCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full text-[10px] font-bold shadow-sm shadow-rose-500/30">
                  {cartItemsCount}
                </span>
              )}
            </Link>
          </div>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 md:hidden"
              onClick={() => setIsMobileMenuOpen(false)}
            />
            <motion.div 
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 left-0 w-[280px] bg-white shadow-2xl z-50 flex flex-col dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 md:hidden"
            >
              <div className="p-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
                <span className="font-bold text-lg dark:text-white">Menu</span>
                <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg dark:hover:bg-slate-900"><X className="w-5 h-5"/></button>
              </div>
              
              <div className="p-4 space-y-6 flex-1 overflow-y-auto">
                <form onSubmit={handleSearch} className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar..."
                    className="w-full pl-10 pr-4 py-3 bg-slate-100 border-transparent text-slate-900 text-sm rounded-xl focus:bg-white focus:border-[var(--color-primary-base)] focus:ring-2 focus:ring-[var(--color-primary-base)]/20 dark:bg-slate-900 dark:text-white"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </form>

                <nav className="space-y-1">
                  <Link href="/store" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 text-slate-700 font-medium dark:text-slate-300 dark:hover:bg-slate-900">
                    <BookOpen className="w-5 h-5 text-[var(--color-primary-base)]" /> Catálogo
                  </Link>

                  {isCustomer && (
                    <>
                      <Link href="/store/orders" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 text-slate-700 font-medium dark:text-slate-300 dark:hover:bg-slate-900">
                        <ShoppingBag className="w-5 h-5 text-slate-400" /> Pedidos
                      </Link>
                      <Link href="/store/financials" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 text-slate-700 font-medium dark:text-slate-300 dark:hover:bg-slate-900">
                        <Receipt className="w-5 h-5 text-slate-400" /> Débitos
                      </Link>
                    </>
                  )}

                  <Link href="/store/account" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 text-slate-700 font-medium dark:text-slate-300 dark:hover:bg-slate-900">
                    <User className="w-5 h-5 text-slate-400" /> Minha Conta
                  </Link>
                </nav>
              </div>

              <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center">
                <span className="text-sm font-medium text-slate-500">Tema</span>
                <ThemeToggle />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  );
}
