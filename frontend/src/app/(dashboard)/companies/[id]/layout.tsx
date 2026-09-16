'use client';

import { useEffect, useState, createContext, useContext } from 'react';
import Link from 'next/link';
import { usePathname, useParams, useRouter } from 'next/navigation';
import { Building2, Users, FileText, FileSignature, Receipt, ArrowLeft, Plug, Loader2, ChevronDown, CheckCircle2, XCircle, RefreshCw, TrendingUp, Database, DatabaseZap, Boxes, Settings, BookOpen, PackageCheck, Bell, Truck } from 'lucide-react';
import { getToken } from '@/lib/auth';

interface Company {
  id: string | number;
  name: string;
  document: string;
  domain: string;
  tenant_id?: string;
  custom_domain?: string;
  logo: string | null;
  login_background_url?: string | null;
  favicon_url?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  operation_start_date?: string | null;
  trial_days?: number | null;
  is_contract_signed?: boolean | null;
  monthly_fee?: string | null;
  zip_code?: string | null;
  codigo_municipio_ibge?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  module_b2b_native: boolean;
  module_horus_erp: boolean;
  module_products: boolean;
  module_customers: boolean;
  module_orders: boolean;
  module_marketing: boolean;
  module_subscriptions: boolean;
  module_pdv: boolean;
  module_agents: boolean;
  module_financial: boolean;
  module_services: boolean;
  module_commercial: boolean;
  module_crm: boolean;
  module_consignment: boolean;
  module_proposals: boolean;
  module_logistica_horus: boolean;
  module_dropship: boolean;
  module_notifications: boolean;
  module_busca_preco: boolean;
  module_horus_sql?: boolean;
  modulo_autores_ativo?: boolean;
  has_inventory_module?: boolean;
  active: boolean;
}

interface CompanyContextType {
  company: Company | null;
  loading: boolean;
  refreshCompany: () => void;
}

export const CompanyContext = createContext<CompanyContextType>({ company: null, loading: true, refreshCompany: () => {} });

export function useCompany() {
  return useContext(CompanyContext);
}

export default function CompanyProfileLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const companyId = params.id as string;
  const pathname = usePathname();
  
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCompany = async () => {
    setLoading(true);
    try {
      const token = getToken();
      if (!token) return;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setCompany(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompany();
  }, [companyId]);

  const menuItems = [
    { name: 'Perfil', path: `/companies/${companyId}/profile`, icon: Building2 },
    { name: 'Acessos e Logins', path: `/companies/${companyId}/users`, icon: Users },
    { name: 'Módulos', path: `/companies/${companyId}/modules`, icon: Boxes },
    { name: 'Horus', path: `/companies/${companyId}/horus`, icon: Database },
    { name: 'Horus SQL', path: `/companies/${companyId}/horus-sql`, icon: DatabaseZap },
    { name: 'Bookinfo', path: `/companies/${companyId}/bookinfo`, icon: BookOpen },
    { name: 'Dropship', path: `/companies/${companyId}/dropship`, icon: PackageCheck },
    { name: 'Alertas', path: `/companies/${companyId}/alerts`, icon: Bell },
    { name: 'Notas', path: `/companies/${companyId}/notes`, icon: FileText },
    { name: 'Propostas', path: `/companies/${companyId}/proposals`, icon: FileSignature },
    { name: 'Contratos', path: `/companies/${companyId}/contracts`, icon: FileSignature, isContract: true },
    { name: 'Faturas', path: `/companies/${companyId}/invoices`, icon: Receipt },
    { name: 'Integrações', path: `/companies/${companyId}/integrations`, icon: Plug },
    { name: 'Distribuidores', path: `/companies/${companyId}/distributors`, icon: Truck },
    { name: 'Configurações', path: `/companies/${companyId}/settings`, icon: Settings },
  ];

  if (loading) {
     return (
       <div className="flex h-64 items-center justify-center">
         <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary-base)]" />
       </div>
     );
  }

  if (!company) {
     return (
       <div className="text-center py-12">
         <p className="text-slate-400">Empresa não encontrada.</p>
         <Link href="/companies" className="text-indigo-400 hover:underline mt-4 inline-block">Voltar para Lojas</Link>
       </div>
     );
  }

  return (
    <CompanyContext.Provider value={{ company, loading, refreshCompany: fetchCompany }}>
      <div className="flex flex-col md:flex-row gap-4 md:gap-6 max-w-7xl mx-auto min-h-0">
        {/* Sidebar da Empresa */}
        <div className="w-full md:w-72 md:shrink-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col overflow-hidden shadow-sm">
           <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
             <Link 
                href="/companies"
                className="mb-2 sm:mb-4 inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
             >
                <ArrowLeft className="w-3.5 h-3.5" /> Voltar para lista
             </Link>
             <div className="flex items-center justify-between w-full text-left">
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-bold text-slate-900 dark:text-white leading-tight truncate">
                    #{company.id} {company.name}
                  </span>
                  <div className="flex items-center gap-1.5 mt-1">
                     {company.active ? (
                       <span className="flex items-center gap-1 text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400">
                         <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Ativa
                       </span>
                     ) : (
                       <span className="flex items-center gap-1 text-[10px] uppercase font-bold text-rose-600 dark:text-rose-400">
                         <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Inativa
                       </span>
                     )}
                  </div>
                </div>
             </div>
           </div>
           
           <div className="overflow-x-auto md:overflow-y-auto py-2 px-2 md:px-0 no-scrollbar">
             <nav className="flex flex-row md:flex-col gap-1 md:gap-0">
               {menuItems.map((item) => {
                 const isActive = pathname.startsWith(item.path);
                 const Icon = item.icon;
                 return (
                   <Link
                     key={item.path}
                     href={item.path}
                     className={`flex items-center gap-2 md:gap-3 px-3.5 md:px-5 py-2 md:py-3 text-xs md:text-sm font-medium transition-colors whitespace-nowrap rounded-xl md:rounded-none md:border-l-2 ${
                       isActive 
                         ? 'bg-[var(--color-primary-base)] text-white md:bg-[var(--color-primary-base)]/5 md:text-[var(--color-primary-base)] md:border-[var(--color-primary-base)] shadow-sm md:shadow-none' 
                         : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-white border-transparent'
                     }`}
                   >
                     <Icon className={`w-3.5 h-3.5 md:w-4 md:h-4 ${isActive ? 'text-white md:text-[var(--color-primary-base)]' : 'text-slate-400 dark:text-slate-500'}`} />
                     {item.name}
                   </Link>
                 );
               })}
             </nav>
           </div>
        </div>

        {/* Child Content */}
        <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden flex flex-col min-w-0">
           {children}
        </div>
      </div>
    </CompanyContext.Provider>
  );

}
