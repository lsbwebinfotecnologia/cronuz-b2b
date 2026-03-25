'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, ShoppingCart, User, Menu, X, BookOpen, ShoppingBag, Receipt, LogOut, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ThemeToggle } from '@/components/ThemeToggle';
import { getUser, removeToken } from '@/lib/auth';
import { useCart } from '@/components/store/CartContext';

export function StoreHeader() {
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilter, setSearchFilter] = useState('default');
  const [user, setUser] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);

  React.useEffect(() => {
    const currentUser = getUser();
    setUser(currentUser);
    
    if (currentUser?.company_id) {
       fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/storefront/navigation?company_id=${currentUser.company_id}`)
         .then(r => r.json())
         .then(data => {
            if (data.categories) setCategories(data.categories);
            if (data.brands) setBrands(data.brands);
         })
         .catch(console.error);
    }
  }, []);

  const storeName = user?.company_name || 'Cronuz';
  const isCustomer = user?.type === 'CUSTOMER';
  
  const { totalItems, openCart } = useCart();
  const cartItemsCount = totalItems;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      alert("Por favor, preencha o campo antes de buscar.");
      return;
    }
    router.push(`/store/search?q=${encodeURIComponent(searchQuery)}&filter=${encodeURIComponent(searchFilter)}`);
    setIsMobileMenuOpen(false);
  };

  const handleLogout = () => {
    removeToken();
    router.push('/login');
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

          {/* Nav Links (Desktop) */}
          <div className="hidden md:flex items-center gap-6 ml-6 font-medium text-sm">
             {(categories.length > 0 || brands.length > 0) && (
                <div className="relative group cursor-pointer z-50">
                   <div className="flex items-center gap-1 text-slate-700 dark:text-slate-300 hover:text-[var(--color-primary-base)] transition-colors py-2">
                      <Menu className="w-4 h-4"/>
                      <span>Departamentos</span>
                      <ChevronDown className="w-3 h-3 group-hover:rotate-180 transition-transform"/>
                   </div>
                   
                   <div className="absolute top-full left-0 mt-2 w-max min-w-[200px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all flex origin-top-left scale-95 group-hover:scale-100">
                      
                      {categories.length > 0 && (
                         <div className="p-4 border-r border-slate-100 dark:border-slate-800/50">
                            <h5 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-3 px-3">Categorias</h5>
                            <div className="flex flex-col gap-1 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                               {categories.map((cat, idx) => (
                                  <Link key={idx} href={`/store/search?q=${encodeURIComponent(cat.name)}&filter=default`} className="px-3 py-1.5 text-sm text-slate-700 hover:text-[var(--color-primary-base)] hover:bg-[var(--color-primary-light)]/10 rounded-lg transition-colors whitespace-nowrap">
                                     {cat.name}
                                  </Link>
                               ))}
                            </div>
                         </div>
                      )}
                      
                      {brands.length > 0 && (
                         <div className="p-4">
                            <h5 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-3 px-3">Marcas / Editoras</h5>
                            <div className="flex flex-col gap-1 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                               {brands.map((brand, idx) => (
                                  <Link key={idx} href={`/store/search?q=${encodeURIComponent(brand.name)}&filter=NOM_EDITORA`} className="px-3 py-1.5 text-sm text-slate-700 hover:text-[var(--color-primary-base)] hover:bg-[var(--color-primary-light)]/10 rounded-lg transition-colors whitespace-nowrap">
                                     {brand.name}
                                  </Link>
                               ))}
                            </div>
                         </div>
                      )}
                      
                   </div>
                </div>
             )}
          </div>

          {/* Desktop Search Bar */}
          <div className="hidden md:flex flex-1 max-w-2xl mx-8">
            <form onSubmit={handleSearch} className="w-full relative group flex shadow-sm rounded-2xl border border-slate-200 dark:border-slate-800 transition-colors focus-within:border-[var(--color-primary-base)] focus-within:ring-4 focus-within:ring-[var(--color-primary-base)]/10">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-slate-400 group-focus-within:text-[var(--color-primary-base)] transition-colors" />
              </div>
              <input
                type="text"
                required
                placeholder="Busque por título, autor, editora ou ISBN..."
                className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border-transparent text-slate-900 text-sm rounded-l-2xl focus:bg-white focus:ring-0 focus:outline-none transition-all dark:bg-slate-900 dark:text-white dark:placeholder-slate-500"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <div className="relative border-l border-slate-200 dark:border-slate-800 flex items-center bg-slate-100 dark:bg-slate-800">
                <select
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="pl-3 pr-8 py-2.5 bg-transparent border-none text-slate-600 dark:text-slate-300 text-sm focus:ring-0 cursor-pointer outline-none appearance-none font-medium z-10"
                >
                  <option value="default">Título/ISBN</option>
                  <option value="NOM_AUTOR">Autor</option>
                  <option value="NOM_EDITORA">Editora</option>
                </select>
                <div className="absolute right-2.5 pointer-events-none z-0">
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                </div>
              </div>
              <button type="submit" className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white px-5 rounded-r-2xl text-sm font-semibold transition-colors shrink-0">
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
              </>
            )}
            
            <Link href="/store/account" className="hidden sm:flex items-center gap-2 p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
              <User className="h-5 w-5" />
              <div className="flex flex-col items-start leading-none">
                <span className="text-xs text-slate-500 dark:text-slate-400">Olá, {user?.name?.split(' ')[0] || 'Visitante'}</span>
                <span className="text-sm font-bold">Minha Conta</span>
              </div>
            </Link>

            <button onClick={openCart} className="relative p-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 transition-colors dark:bg-slate-900 dark:hover:bg-slate-800 dark:text-slate-300 group">
              <ShoppingCart className="h-5 w-5 group-hover:scale-110 transition-transform" />
              {cartItemsCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full text-[10px] font-bold shadow-sm shadow-rose-500/30">
                  {cartItemsCount}
                </span>
              )}
            </button>

            {/* Logout Button Desktop */}
            <button 
              onClick={handleLogout}
              className="hidden sm:flex items-center gap-2 p-2 hover:bg-rose-50 rounded-xl transition-colors text-slate-700 hover:text-rose-600 dark:text-slate-300 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 group"
              title="Sair"
            >
              <LogOut className="h-5 w-5 group-hover:-translate-x-0.5 transition-transform" />
            </button>
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
                <form onSubmit={handleSearch} className="relative flex flex-col gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <input
                      type="text"
                      required
                      placeholder="Buscar..."
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl focus:bg-white focus:border-[var(--color-primary-base)] focus:ring-2 focus:ring-[var(--color-primary-base)]/20 dark:bg-slate-900 dark:border-slate-800 dark:text-white"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <select
                        value={searchFilter}
                        onChange={(e) => setSearchFilter(e.target.value)}
                        className="w-full pl-3 pr-8 py-2.5 bg-slate-50 border border-slate-200 text-slate-600 dark:text-slate-300 dark:bg-slate-900 dark:border-slate-800 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)]/20 appearance-none"
                      >
                        <option value="default">Título/ISBN</option>
                        <option value="NOM_AUTOR">Autor</option>
                        <option value="NOM_EDITORA">Editora</option>
                      </select>
                      <div className="absolute top-1/2 right-3 -translate-y-1/2 pointer-events-none">
                        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                      </div>
                    </div>
                    <button type="submit" className="bg-[var(--color-primary-base)] text-white px-5 rounded-xl text-sm font-bold shadow-sm">
                      Ir
                    </button>
                  </div>
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
                    </>
                  )}

                  <Link href="/store/account" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 text-slate-700 font-medium dark:text-slate-300 dark:hover:bg-slate-900">
                    <User className="w-5 h-5 text-slate-400" /> Minha Conta
                  </Link>

                  <button onClick={handleLogout} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-rose-50 text-slate-700 hover:text-rose-600 font-medium dark:text-slate-300 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 transition-colors mt-4">
                    <LogOut className="w-5 h-5" /> Sair
                  </button>

                  {(categories.length > 0 || brands.length > 0) && (
                     <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800">
                        <span className="font-bold text-slate-500 text-xs uppercase px-3 block mb-2">Departamentos</span>
                        {categories.map((cat, idx) => (
                           <Link key={`cat-${idx}`} href={`/store/search?q=${encodeURIComponent(cat.name)}&filter=default`} onClick={() => setIsMobileMenuOpen(false)} className="block p-3 text-sm text-slate-700 hover:text-[var(--color-primary-base)] dark:text-slate-300 transition-colors rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900 border-l-2 border-transparent hover:border-[var(--color-primary-base)]">
                              {cat.name}
                           </Link>
                        ))}
                        {brands.map((brand, idx) => (
                           <Link key={`brand-${idx}`} href={`/store/search?q=${encodeURIComponent(brand.name)}&filter=NOM_EDITORA`} onClick={() => setIsMobileMenuOpen(false)} className="block p-3 text-sm text-slate-700 hover:text-[var(--color-primary-base)] dark:text-slate-300 transition-colors rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900 border-l-2 border-transparent hover:border-[var(--color-primary-base)]">
                              {brand.name}
                           </Link>
                        ))}
                     </div>
                  )}
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
