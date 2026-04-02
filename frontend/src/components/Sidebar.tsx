'use client';

import { 
  Users, 
  Settings, 
  Package, 
  FileText,
  ChevronRight,
  LogOut,
  Megaphone,
  ShoppingBag,
  ChevronDown,
  Layers,
  MonitorSmartphone,
  Inbox,
  Plug,
  RefreshCw
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { removeToken, getUser } from '@/lib/auth';
import { useEffect, useState } from 'react';

type NavItem = {
  name: string;
  href: string;
  icon: React.ElementType;
  subItems?: { name: string; href: string }[];
  badge?: number;
};

type UserData = {
  id?: number;
  type?: string;
  name?: string;
  email?: string;
  company_id?: number;
  company_name?: string;
};

const masterNavigation: NavItem[] = [
  { name: 'Empresas', href: '/companies', icon: Users },
  { name: 'Hub Sync Bookinfo', href: '/settings/bookinfo-sync', icon: RefreshCw },
  { name: 'Integradores', href: '/system-integrators', icon: Layers },
  { name: 'Leads', href: '/leads', icon: Inbox },
];

const sellerNavigation: NavItem[] = [
  { 
    name: 'Produtos', 
    href: '/products', 
    icon: Package,
    subItems: [
      { name: 'Catálogo', href: '/products' },
      { name: 'Marcas', href: '/products/brands' },
      { name: 'Categorias', href: '/products/categories' },
      { name: 'Características', href: '/products/characteristics' }
    ]
  },
  { name: 'Pedidos', href: '/orders', icon: ShoppingBag },
  { name: 'Clientes', href: '/customers', icon: Users },
  { 
    name: 'Marketing', 
    href: '/promotions', 
    icon: Megaphone,
    subItems: [
       { name: 'Promoções', href: '/promotions' },
       { name: 'Vitrines da Loja', href: '/marketing/showcases' },
       { name: 'Menu de Navegação', href: '/marketing/navigation' }
    ]
  },
  {
    name: 'Bookinfo',
    href: '/bookinfo/orders',
    icon: Layers,
    subItems: [
       { name: 'Bookinfo (Pedidos Venda)', href: '/bookinfo/orders' },
       { name: 'Bookinfo (Pedidos Compra)', href: '/bookinfo/purchases' }
    ]
  },
  { name: 'Vendedores/Rep', href: '/agents', icon: MonitorSmartphone },
  { name: 'Configurações', href: '/settings', icon: Settings },
];

const agentNavigation: NavItem[] = [
  { name: 'Ponto de Venda (PDV)', href: '/pdv', icon: MonitorSmartphone },
  { name: 'Clientes', href: '/customers', icon: Users },
  { name: 'Pedidos', href: '/orders', icon: ShoppingBag },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<UserData | null>(null);
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});
  const [usesHorus, setUsesHorus] = useState(false);
  const [usesBookinfo, setUsesBookinfo] = useState(false);
  const [moduleProducts, setModuleProducts] = useState(true);
  const [moduleCustomers, setModuleCustomers] = useState(true);
  const [moduleMarketing, setModuleMarketing] = useState(false);
  const [moduleSubscriptions, setModuleSubscriptions] = useState(false);
  const [modulePdv, setModulePdv] = useState(false);
  const [moduleAgents, setModuleAgents] = useState(false);
  const [unreadLeads, setUnreadLeads] = useState(0);

  useEffect(() => {
    const currentUser = getUser();
    setUser(currentUser);
    // Auto open matching 
    const isSeller = currentUser?.type === 'SELLER';
    if (isSeller) {
       const initialOpen: Record<string, boolean> = {};
       sellerNavigation.forEach(item => {
           if (item.subItems && item.subItems.some(sub => pathname.startsWith(sub.href === '/products' ? '/products/' : sub.href) || pathname === sub.href)) {
               initialOpen[item.name] = true;
           }
       });
       setOpenMenus(initialOpen);
       
       const fetchSettings = async () => {
         try {
           const tokenStr = localStorage.getItem('cronuz_b2b_token') || document.cookie.split('cronuz_b2b_token=')[1]?.split(';')[0];
           const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/dashboard/metrics`, {
              headers: { 'Authorization': `Bearer ${tokenStr}` }
           });
            if (res.ok) {
               const data = await res.json();
               setUsesHorus(data.uses_horus || false);
               setUsesBookinfo(data.uses_bookinfo || false);
               setModuleProducts(data.module_products ?? true);
               setModuleCustomers(data.module_customers ?? true);
               setModuleMarketing(data.module_marketing || false);
               setModuleSubscriptions(data.module_subscriptions || false);
               setModulePdv(data.module_pdv || false);
               setModuleAgents(data.module_agents || false);
            }
         } catch (e) {}
       };
       fetchSettings();
    } else if (currentUser?.type === 'MASTER') {
       const fetchLeadsSummary = async () => {
         try {
           const tokenStr = localStorage.getItem('cronuz_b2b_token') || document.cookie.split('cronuz_b2b_token=')[1]?.split(';')[0];
           const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/leads/summary`, {
              headers: { 'Authorization': `Bearer ${tokenStr}` }
           });
           if (res.ok) {
              const data = await res.json();
              setUnreadLeads(data.new || 0);
           }
         } catch(e) {}
       };
       fetchLeadsSummary();
       window.addEventListener('lead_status_updated', fetchLeadsSummary);
       return () => window.removeEventListener('lead_status_updated', fetchLeadsSummary);
    }
  }, [pathname]);

  const toggleMenu = (name: string) => {
    setOpenMenus(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const filteredSellerNavigation = [...sellerNavigation.filter(nav => {
    if (!moduleProducts && nav.name === 'Produtos') return false;
    if (!moduleCustomers && nav.name === 'Clientes') return false;
    if (!moduleMarketing && nav.name === 'Marketing') return false;
    if (!usesBookinfo && nav.name === 'Bookinfo') return false;
    if (!moduleAgents && nav.href === '/agents') return false;
    return true;
  })].map(nav => {
    if (nav.name === 'Marketing' && usesHorus) {
      return {
        ...nav,
        subItems: nav.subItems?.filter(sub => sub.name !== 'Promoções')
      };
    }
    return nav;
  });
  
  if (moduleSubscriptions) {
    // Insert Assinaturas before Configurações
    const settingsIndex = filteredSellerNavigation.findIndex(n => n.name === 'Configurações');
    const targetIndex = settingsIndex !== -1 ? settingsIndex : filteredSellerNavigation.length;
    filteredSellerNavigation.splice(targetIndex, 0, { 
       name: 'Assinaturas', 
       href: '/subscriptions', 
       icon: Layers,
       subItems: [
         { name: 'Planos e Landpages', href: '/subscriptions' },
         { name: 'Gestão de Assinaturas', href: '/subscribers' }
       ]
    });
  }

  const dynamicMasterNavigation = masterNavigation.map(item => {
    if (item.name === 'Leads Capturados') {
      return { ...item, badge: unreadLeads };
    }
    return item;
  });

  const dynamicNavigation = user?.type === 'MASTER' ? dynamicMasterNavigation : 
                            (user?.type === 'SELLER' ? filteredSellerNavigation : 
                             (user?.type === 'AGENT' ? agentNavigation : []));

  const handleLogout = async () => {
    try {
      const tokenStr = localStorage.getItem('cronuz_b2b_token') || document.cookie.split('cronuz_b2b_token=')[1]?.split(';')[0];
      if (tokenStr) {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/logout`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${tokenStr}` }
        });
      }
    } catch(e) {}
    
    removeToken();
    router.push('/login');
    router.refresh();
  };

  return (
    <div className="flex h-screen flex-col justify-between border-r border-slate-200 bg-white/50 dark:border-slate-800 dark:bg-slate-950/50 backdrop-blur-xl w-64 p-4 transition-colors overflow-y-auto no-scrollbar">
      <div>
        <div className="flex items-center gap-3 px-2 py-4 mb-6">
          <div className="relative h-10 w-28 flex-shrink-0">
            <img 
              src="/images/cronuz-logo.png" 
              alt="Cronuz Logo" 
              className="object-contain w-full h-full cronuz-logo"
            />
            <img 
              src="/images/logo-square-horus.png" 
              alt="Horus Logo" 
              className="object-contain w-full h-full hidden horus-logo"
            />
          </div>
        </div>

        <nav className="space-y-1">
          {dynamicNavigation.map((item) => {
            const isActive = pathname === item.href || (item.subItems && item.subItems.some(sub => pathname === sub.href)) || pathname.startsWith(item.href + '/');
            const isOpen = openMenus[item.name];

            return (
              <div key={item.name} className={cn("space-y-1", item.name === 'Integradores' ? 'theme-horus:hidden' : '')}>
                {item.subItems ? (
                   <button
                      onClick={() => toggleMenu(item.name)}
                      className={cn(
                        'w-full group flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                        (isActive || isOpen)
                          ? 'text-slate-900 dark:text-white' 
                          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-100'
                      )}
                   >
                      <div className="flex items-center gap-3">
                        <item.icon className={cn(
                          "h-5 w-5 transition-colors", 
                          (isActive || isOpen) ? "text-[var(--color-primary-base)]" : "text-slate-500 group-hover:text-slate-300"
                        )} />
                        {item.name}
                      </div>
                      <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
                   </button>
                ) : (
                   <Link
                      href={item.href}
                      className={cn(
                        'group flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                        isActive 
                          ? 'bg-slate-100 text-slate-900 dark:bg-slate-800/80 dark:text-white shadow-sm' 
                          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-100'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <item.icon className={cn(
                          "h-5 w-5 transition-colors", 
                          isActive ? "text-[var(--color-primary-base)]" : "text-slate-500 group-hover:text-slate-300"
                        )} />
                        {item.name}
                      </div>
                      <div className="flex items-center gap-2">
                        {item.badge ? (
                          <span className="bg-rose-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm animate-pulse">
                            {item.badge}
                          </span>
                        ) : null}
                        {isActive && (
                          <motion.div 
                            layoutId="activeTabIndicator"
                            className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary-base)]"
                          />
                        )}
                      </div>
                    </Link>
                )}

                <AnimatePresence>
                  {item.subItems && isOpen && (
                     <motion.div 
                       initial={{ opacity: 0, height: 0 }}
                       animate={{ opacity: 1, height: 'auto' }}
                       exit={{ opacity: 0, height: 0 }}
                       className="pl-11 pr-3 overflow-hidden space-y-0.5"
                     >
                        <div className="py-1">
                          {item.subItems.map(sub => {
                             const isSubActive = pathname === sub.href;
                             return (
                               <Link
                                 key={sub.name}
                                 href={sub.href}
                                 className={cn(
                                   'block rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                                   isSubActive
                                     ? 'bg-slate-100 text-[var(--color-primary-base)] dark:bg-slate-800 dark:text-[var(--color-primary-base)]'
                                     : 'text-slate-500 hover:text-[var(--color-primary-base)] hover:bg-slate-50 dark:text-slate-400 dark:hover:text-[var(--color-primary-base)] dark:hover:bg-slate-800/50'
                                 )}
                               >
                                 {sub.name}
                               </Link>
                             )
                          })}
                        </div>
                     </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </nav>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 relative overflow-hidden group hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:border-slate-700 transition-colors">
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-primary-base)]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            {user?.type === 'MASTER' ? 'Empresa Atual' : 'Sua Organização'}
          </p>
          <p className="theme-horus:hidden text-sm font-semibold text-slate-800 dark:text-slate-200 truncate" title={user?.company_name || 'Empresa Vendedora'}>
             {user?.company_name || (user?.type === 'MASTER' ? 'Sede Master Cronuz' : 'Empresa Vendedora')}
          </p>
          <p className="hidden theme-horus:block text-sm font-semibold text-slate-800 dark:text-slate-200 truncate" title={user?.company_name || 'Empresa Vendedora'}>
             {user?.company_name || (user?.type === 'MASTER' ? 'Sede Parceiro' : 'Empresa Vendedora')}
          </p>
          {user?.type === 'MASTER' && (
            <Link href="/companies" className="text-xs text-[var(--color-primary-base)] mt-2 flex items-center gap-1 hover:text-[var(--color-primary-base)] transition-colors">
              Trocar organização <ChevronRight className="h-3 w-3" />
            </Link>
          )}
        </div>
        
        <div className="rounded-xl border border-slate-200 bg-white p-3 flex items-center gap-3 dark:border-slate-800/50 dark:bg-slate-900/30">
          <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200 dark:bg-slate-800 dark:border-slate-700">
             <span className="text-xs font-bold text-slate-500 dark:text-slate-300">
               {user?.name?.charAt(0)?.toUpperCase() || 'U'}
             </span>
          </div>
          <div className="overflow-hidden">
            <p className="text-sm font-medium text-slate-900 truncate dark:text-white" title={user?.name}>{user?.name || 'Usuário'}</p>
            <p className="text-xs text-slate-500 truncate dark:text-slate-400" title={user?.email}>{user?.email}</p>
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
