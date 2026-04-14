'use client';

import { useEffect, useState, createContext, useContext } from 'react';
import { Loader2 } from 'lucide-react';
import { getToken, getUser } from '@/lib/auth';

interface Company {
  id: string | number;
  name: string;
  document: string;
  domain: string;
  tenant_id?: string;
  module_b2b_native: boolean;
  module_horus_erp: boolean;
  module_products: boolean;
  module_customers: boolean;
  module_marketing: boolean;
  module_subscriptions: boolean;
  module_pdv: boolean;
  module_agents: boolean;
  active: boolean;
  neighborhood?: string;
  city?: string;
  state?: string;
  codigo_municipio_ibge?: string;
  logo?: string;
  login_background_url?: string;
  favicon_url?: string;
  seo_title?: string;
  seo_description?: string;
  operation_start_date?: string;
  trial_days?: number;
  is_contract_signed?: boolean;
  monthly_fee?: string;
  business_model?: string;
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

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const user = getUser();
  const companyId = user?.company_id;

  const fetchCompany = async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }
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
    if (companyId) {
       fetchCompany();
    } else {
       setLoading(false);
    }
  }, [companyId]);

  if (loading) {
     return (
       <div className="flex h-64 items-center justify-center">
         <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary-base)]" />
       </div>
     );
  }

  return (
    <CompanyContext.Provider value={{ company, loading, refreshCompany: fetchCompany }}>
       {children}
    </CompanyContext.Provider>
  );
}
