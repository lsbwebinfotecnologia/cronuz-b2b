'use client';

import { 
  Users, 
  Settings, 
  Package, 
  FileText,
  ChevronRight,
  LogOut,
  Megaphone,
  ShoppingBag
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { removeToken, getUser } from '@/lib/auth';
import { useEffect, useState } from 'react';

const masterNavigation = [
  { name: 'Empresas', href: '/companies', icon: Users },
  { name: 'Faturamento Global', href: '/billing', icon: FileText },
  { name: 'Configurações do Sistema', href: '/settings', icon: Settings },
];

const sellerNavigation = [
  { name: 'Produtos (Catálogo)', href: '/inventory', icon: Package },
  { name: 'Clientes', href: '/customers', icon: Users },
  { name: 'Marketing', href: '/marketing', icon: Megaphone },
  { name: 'Configurações', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    setUser(getUser());
  }, []);

  const dynamicNavigation = user?.type === 'MASTER' ? masterNavigation : 
                            (user?.type === 'SELLER' ? sellerNavigation : []);

  const handleLogout = () => {
    removeToken();
    router.push('/login');
    router.refresh();
  };

  return (
    <div className="flex h-screen flex-col justify-between border-r border-slate-800 bg-slate-950/50 backdrop-blur-xl w-64 p-4">
      <div>
        <div className="flex items-center gap-3 px-2 py-4 mb-6">
          <div className="relative h-10 w-28 flex-shrink-0">
            <img 
              src="/images/cronuz-logo.png" 
              alt="Cronuz Logo" 
              className="object-contain w-full h-full"
            />
          </div>
          <span className="text-xl font-semibold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
            B2B
          </span>
        </div>

        <nav className="space-y-1">
          {dynamicNavigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'group flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                  isActive 
                    ? 'bg-slate-800/80 text-white shadow-sm' 
                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-100'
                )}
              >
                <div className="flex items-center gap-3">
                  <item.icon className={cn(
                    "h-5 w-5 transition-colors", 
                    isActive ? "text-[var(--color-primary-base)]" : "text-slate-500 group-hover:text-slate-300"
                  )} />
                  {item.name}
                </div>
                {isActive && (
                  <motion.div 
                    layoutId="activeTabIndicator"
                    className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary-base)]"
                  />
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 relative overflow-hidden group hover:border-slate-700 transition-colors">
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-primary-base)]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <p className="text-xs font-medium text-slate-400 mb-1">
            {user?.type === 'MASTER' ? 'Empresa Atual' : 'Sua Organização'}
          </p>
          <p className="text-sm font-semibold text-slate-200 truncate" title={user?.company_name || 'Empresa Vendedora'}>
             {user?.company_name || (user?.type === 'MASTER' ? 'Sede Master Cronuz' : 'Empresa Vendedora')}
          </p>
          {user?.type === 'MASTER' && (
            <Link href="/companies" className="text-xs text-[var(--color-primary-base)] mt-2 flex items-center gap-1 hover:text-[var(--color-primary-base)] transition-colors">
              Trocar organização <ChevronRight className="h-3 w-3" />
            </Link>
          )}
        </div>
        
        <div className="rounded-xl border border-slate-800/50 bg-slate-900/30 p-3 flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-slate-800 flex items-center justify-center shrink-0 border border-slate-700">
             <span className="text-xs font-bold text-slate-300">
               {user?.name?.charAt(0)?.toUpperCase() || 'U'}
             </span>
          </div>
          <div className="overflow-hidden">
            <p className="text-sm font-medium text-white truncate" title={user?.name}>{user?.name || 'Usuário'}</p>
            <p className="text-xs text-slate-500 truncate" title={user?.email}>{user?.email}</p>
          </div>
        </div>

        <button  
          onClick={handleLogout}
          className="flex w-full justify-center items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-500 hover:bg-rose-500 hover:text-white transition-all duration-200"
        >
          <LogOut className="h-4 w-4" />
          Sair do Sistema
        </button>
      </div>
    </div>
  );
}
