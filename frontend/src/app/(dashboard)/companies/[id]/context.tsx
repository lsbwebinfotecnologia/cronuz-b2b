'use client';

import { createContext, useContext } from 'react';

export interface Company {
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
  module_editorial?: boolean;
  module_schools?: boolean;
  active: boolean;
}

export interface CompanyContextType {
  company: Company | null;
  loading: boolean;
  refreshCompany: () => void;
}

export const CompanyContext = createContext<CompanyContextType>({
  company: null,
  loading: true,
  refreshCompany: () => {}
});

export function useCompany() {
  return useContext(CompanyContext);
}
