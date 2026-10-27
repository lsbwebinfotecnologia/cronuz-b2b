'use client';

import { createContext, useContext } from 'react';

export interface SettingsCompany {
  id: string | number;
  name: string;
  document: string;
  domain: string;
  tenant_id?: string;
  module_b2b_native: boolean;
  module_horus_erp: boolean;
  module_products: boolean;
  module_orders: boolean;
  module_customers: boolean;
  module_marketing: boolean;
  module_subscriptions: boolean;
  module_pdv: boolean;
  module_agents: boolean;
  module_financial: boolean;
  module_services: boolean;
  module_commercial: boolean;
  module_crm: boolean;
  module_consignment: boolean;
  module_logistica_horus: boolean;
  module_horus_sql?: boolean;
  modulo_autores_ativo?: boolean;
  module_editorial?: boolean;
  module_schools?: boolean;
  module_cafeteria?: boolean;
  module_encomendas?: boolean;
  module_order_intake?: boolean;
  active: boolean;
}

export interface SettingsCompanyContextType {
  company: SettingsCompany | null;
  loading: boolean;
  refreshCompany: () => void;
}

export const SettingsCompanyContext = createContext<SettingsCompanyContextType>({
  company: null,
  loading: true,
  refreshCompany: () => {},
});

export function useCompany() {
  return useContext(SettingsCompanyContext);
}
