'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Loader2, Globe, Box, Users, Megaphone, MonitorSmartphone, Layers, ShieldAlert, ArrowRightLeft, DollarSign, Tags, ShoppingBag, Database, FileText, ClipboardList, Smartphone, ScanBarcode, BarChart3, ListOrdered, BookOpen, UserCircle, Bell } from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';
import { useCompany } from '../layout';

interface MobileModules {
  app_enabled: boolean;
  pdv: boolean;
  conferencia: boolean;
  vendas: boolean;
  pedidos: boolean;
  catalogo: boolean;
  clientes: boolean;
}

const DEFAULT_MOBILE_MODULES: MobileModules = {
  app_enabled: false,
  pdv: false, conferencia: false, vendas: false,
  pedidos: false, catalogo: false, clientes: false,
};

export default function CompanyModulesPage() {
  const params = useParams();
  const companyId = params.id as string;
  const { company, refreshCompany } = useCompany();
  
  const [togglingModule, setTogglingModule] = useState<string | null>(null);

  // ─── Mobile Modules State ──────────────────────────────────────────
  const [mobileModules, setMobileModules] = useState<MobileModules>(DEFAULT_MOBILE_MODULES);
  const [loadingMobile, setLoadingMobile] = useState(true);
  const [togglingMobile, setTogglingMobile] = useState<string | null>(null);

  useEffect(() => {
    async function fetchMobileModules() {
      const token = getToken();
      if (!token) {
        setLoadingMobile(false);
        return;
      }
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/seller/mobile/modules/${companyId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const data = await res.json();
          setMobileModules(data.modules ?? DEFAULT_MOBILE_MODULES);
        } else if (res.status !== 401 && res.status !== 403) {
          console.warn('[MobileModules] Erro ao carregar:', res.status);
        }
        // 401/403 — silencioso, usuário pode não ter permissão
      } catch {
        // Falha de rede silenciosa — não propaga ao overlay
      } finally {
        setLoadingMobile(false);
      }
    }
    fetchMobileModules();
  }, [companyId]);

  async function handleToggleMobileModule(key: keyof MobileModules) {
    setTogglingMobile(key);
    const newValue = !mobileModules[key];
    const updated = { ...mobileModules, [key]: newValue };
    const token = getToken();
    const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/seller/mobile/modules/${companyId}`;
    
    try {
      if (!token) {
        toast.error('Sem token — faça login novamente.');
        return;
      }
      
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ [key]: newValue }),
      });
      
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(`Erro ${res.status}: ${body?.detail || 'Falha ao salvar'}`);
        return;
      }
      
      setMobileModules(updated);
      toast.success(`Módulo ${key} ${newValue ? 'ativado ✓' : 'desativado'} no App!`);
    } catch (err: any) {
      toast.error(`Erro de rede: ${err?.message || err} — URL: ${url}`);
    } finally {
      setTogglingMobile(null);
    }
  }


  async function handleToggleModule(moduleName: string, currentValue: boolean) {
    if (!company) return;
    setTogglingModule(moduleName);
    
    const updates: Record<string, boolean> = {
      module_b2b_native: company.module_b2b_native,
      module_horus_erp: company.module_horus_erp,
      module_products: company.module_products,
      module_orders: company.module_orders,
      module_customers: company.module_customers,
      module_marketing: company.module_marketing,
      module_subscriptions: company.module_subscriptions,
      module_pdv: company.module_pdv,
      module_agents: company.module_agents,
      module_financial: company.module_financial,
      module_services: company.module_services,
      module_commercial: company.module_commercial,
      module_crm: company.module_crm,
      module_consignment: company.module_consignment,
      module_proposals: company.module_proposals,
      module_logistica_horus: company.module_logistica_horus,
      module_dropship: company.module_dropship,
      module_notifications: company.module_notifications,
      module_busca_preco: company.module_busca_preco,
      [moduleName]: !currentValue
    };

    // Mutually exclusive logic for Core B2B
    if (moduleName === 'module_horus_erp' && !currentValue === true) {
      updates.module_b2b_native = false;
      updates.module_products = false;
      toast.info('Módulo Produtos desativado para evitar conflito com o ERP.');
    } else if (moduleName === 'module_b2b_native' && !currentValue === true) {
      updates.module_horus_erp = false;
      updates.module_products = true;
    }

    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/modules`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(updates)
      });
      if (!res.ok) throw new Error('Falha ao atualizar módulo');
      toast.success('Configurações atualizadas!');
      refreshCompany();
    } catch (error) {
      toast.error('Erro ao mudar status do módulo.');
    } finally {
      setTogglingModule(null);
    }
  }

  if (!company) {
    return (
       <div className="flex h-64 items-center justify-center">
         <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary-base)]" />
       </div>
    );
  }

  const Switch = ({ active, onClick, disabled, colorClass = "bg-[var(--color-primary-base)]" }: { active: boolean, onClick: () => void, disabled?: boolean, colorClass?: string }) => (
    <button 
      onClick={onClick}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${active ? colorClass : 'bg-slate-200 dark:bg-slate-700'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${active ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full overflow-y-auto pb-12">
      <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md sticky top-0 z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
         <div>
           <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
             Módulos da Empresa
           </h2>
           <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
             Habilite as integrações e aplicativos disponíveis para os Sellers desta organização.
           </p>
         </div>
      </div>

      <div className="p-6 space-y-8 max-w-4xl">
        
        {/* Core B2B Mode Section */}
        <section className="space-y-4">
           <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
             <ArrowRightLeft className="h-4 w-4 text-indigo-500" /> Sistema Core (Operação B2B)
           </h3>
           <div className="rounded-2xl border border-indigo-100 bg-white overflow-hidden shadow-sm dark:border-indigo-500/20 dark:bg-slate-900/40">
              
              <div className="px-6 py-4 bg-indigo-50/50 dark:bg-indigo-500/5">
                 <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">Modelos de negócio mutuamente exclusivos. Escolha como o catálogo e pedidos serão processados.</p>
              </div>

              <div className="theme-horus:hidden p-6 flex items-start sm:items-center justify-between border-t border-indigo-100/50 dark:border-slate-800 gap-4 flex-col sm:flex-row">
                <div className="space-y-1 pr-6">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">B2B Nativo (Cronuz)</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">A operação será 100% nativa. Catálogo próprio e pedidos locais. Habilita o módulo de Produtos automaticamente.</p>
                </div>
                <div className="shrink-0 flex items-center gap-3">
                  <span className="text-xs font-semibold text-slate-400">{company.module_b2b_native ? 'Ativado' : 'Desativado'}</span>
                  <Switch 
                    active={company.module_b2b_native} 
                    onClick={() => handleToggleModule('module_b2b_native', company.module_b2b_native)} 
                    disabled={togglingModule !== null}
                    colorClass="bg-indigo-500"
                  />
                </div>
              </div>
              
              <div className="p-6 flex items-start sm:items-center justify-between border-t border-indigo-100/50 dark:border-slate-800 gap-4 flex-col sm:flex-row">
                <div className="space-y-1 pr-6">
                  <p className="text-sm font-bold text-orange-500">B2B Horus ERP</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Todo o catálogo será lido de forma dinâmica e em tempo real do backend do Horus. <strong className="text-rose-500 font-semibold">Oculta o catálogo local nativo.</strong></p>
                </div>
                <div className="shrink-0 flex items-center gap-3">
                  <span className="text-xs font-semibold text-slate-400">{company.module_horus_erp ? 'Ativado' : 'Desativado'}</span>
                  <Switch 
                    active={company.module_horus_erp} 
                    onClick={() => handleToggleModule('module_horus_erp', company.module_horus_erp)} 
                    disabled={togglingModule !== null}
                    colorClass="bg-orange-500"
                  />
                </div>
              </div>

           </div>
        </section>

        {/* Management Add-ons */}
        <section className="space-y-4">
           <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2 mt-8">
             <Layers className="h-4 w-4 text-emerald-500" /> Módulos de Gestão (Sellers)
           </h3>
           <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm dark:border-slate-800/60 dark:bg-slate-900/40">
              
              {/* Products */}
              <div className="p-5 flex items-center justify-between hover:bg-slate-50 transition-colors dark:hover:bg-white/5">
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-xl border ${company.module_products ? 'bg-[var(--color-primary-base)]/10 border-[var(--color-primary-base)]/20 text-[var(--color-primary-base)]' : 'bg-slate-100 border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700'}`}>
                    <Box className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Catálogo de Produtos</p>
                    <p className="text-xs text-slate-500">Gestão nativa de produtos, marcas e categorias.</p>
                  </div>
                </div>
                <div className="shrink-0 flex gap-4 items-center pl-4">
                  {company.module_horus_erp && <span className="text-xs font-semibold text-rose-500 bg-rose-50 px-2 py-1 rounded-md hidden sm:block dark:bg-rose-500/10">Bloqueado pelo ERP</span>}
                  <Switch 
                    active={company.module_products} 
                    onClick={() => handleToggleModule('module_products', company.module_products)} 
                    disabled={togglingModule !== null || company.module_horus_erp}
                  />
                </div>
              </div>
              {/* Orders */}
              <div className="p-5 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 transition-colors dark:hover:bg-white/5">
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-xl border ${company.module_orders ? 'bg-orange-500/10 border-orange-500/20 text-orange-500' : 'bg-slate-100 border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700'}`}>
                    <ShoppingBag className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Pedidos B2B</p>
                    <p className="text-xs text-slate-500">Fluxo de captação de pedidos (Carrinho / Orçamentos).</p>
                  </div>
                </div>
                <div className="shrink-0 pl-4">
                  <Switch 
                    active={company.module_orders} 
                    onClick={() => handleToggleModule('module_orders', company.module_orders)} 
                    disabled={togglingModule !== null}
                    colorClass="bg-orange-500"
                  />
                </div>
              </div>

              {/* Customers */}
              <div className="p-5 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 transition-colors dark:hover:bg-white/5">
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-xl border ${company.module_customers ? 'bg-sky-500/10 border-sky-500/20 text-sky-500' : 'bg-slate-100 border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700'}`}>
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Gestão de Clientes</p>
                    <p className="text-xs text-slate-500">Cadastro e listagem da carteira de B2B.</p>
                  </div>
                </div>
                <div className="shrink-0 pl-4">
                  <Switch 
                    active={company.module_customers} 
                    onClick={() => handleToggleModule('module_customers', company.module_customers)} 
                    disabled={togglingModule !== null}
                    colorClass="bg-sky-500"
                  />
                </div>
              </div>

              {/* Marketing */}
              <div className="p-5 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 transition-colors dark:hover:bg-white/5">
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-xl border ${company.module_marketing ? 'bg-fuchsia-500/10 border-fuchsia-500/20 text-fuchsia-500' : 'bg-slate-100 border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700'}`}>
                    <Megaphone className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Marketing & Vitrines</p>
                    <p className="text-xs text-slate-500">Criação de vitrines digitais de loja e campanhas.</p>
                  </div>
                </div>
                <div className="shrink-0 pl-4">
                  <Switch 
                    active={company.module_marketing} 
                    onClick={() => handleToggleModule('module_marketing', company.module_marketing)} 
                    disabled={togglingModule !== null}
                    colorClass="bg-fuchsia-500"
                  />
                </div>
              </div>

              {/* Agents */}
              <div className="p-5 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 transition-colors dark:hover:bg-white/5">
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-xl border ${company.module_agents ? 'bg-teal-500/10 border-teal-500/20 text-teal-500' : 'bg-slate-100 border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700'}`}>
                    <ShieldAlert className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Vendedores & Representantes</p>
                    <p className="text-xs text-slate-500">Gestão da equipe de vendas externa (Agents).</p>
                  </div>
                </div>
                <div className="shrink-0 pl-4">
                  <Switch 
                    active={company.module_agents} 
                    onClick={() => handleToggleModule('module_agents', company.module_agents)} 
                    disabled={togglingModule !== null}
                    colorClass="bg-teal-500"
                  />
                </div>
              </div>

              {/* PDV */}
              <div className="p-5 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 transition-colors dark:hover:bg-white/5">
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-xl border ${company.module_pdv ? 'bg-slate-900 border-slate-700 text-slate-100 dark:bg-white dark:border-slate-300 dark:text-slate-900' : 'bg-slate-100 border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700'}`}>
                    <MonitorSmartphone className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Ponto de Venda (PDV)</p>
                    <p className="text-xs text-slate-500">Máquina registradora simples para balcão.</p>
                  </div>
                </div>
                <div className="shrink-0 pl-4">
                  <Switch 
                    active={company.module_pdv} 
                    onClick={() => handleToggleModule('module_pdv', company.module_pdv)} 
                    disabled={togglingModule !== null}
                    colorClass="bg-slate-900 dark:bg-white"
                  />
                </div>
              </div>

              {/* Subscriptions */}
              <div className="p-5 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 transition-colors dark:hover:bg-white/5">
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-xl border ${company.module_subscriptions ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' : 'bg-slate-100 border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700'}`}>
                    <Layers className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Assinaturas (Recorrência)</p>
                    <p className="text-xs text-slate-500">Clubes de assinaturas, planos pre-pagos com EFI.</p>
                  </div>
                </div>
                <div className="shrink-0 pl-4">
                  <Switch 
                    active={company.module_subscriptions} 
                    onClick={() => handleToggleModule('module_subscriptions', company.module_subscriptions)} 
                    disabled={togglingModule !== null}
                    colorClass="bg-rose-500"
                  />
                </div>
              </div>

              {/* Financeiro */}
              <div className="p-5 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 transition-colors dark:hover:bg-white/5">
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-xl border ${company.module_financial ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' : 'bg-slate-100 border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700'}`}>
                    <DollarSign className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Gestão Financeira</p>
                    <p className="text-xs text-slate-500">Contas a pagar/receber, conciliação e DRE.</p>
                  </div>
                </div>
                <div className="shrink-0 pl-4">
                  <Switch 
                    active={company.module_financial} 
                    onClick={() => handleToggleModule('module_financial', company.module_financial)} 
                    disabled={togglingModule !== null}
                    colorClass="bg-amber-500"
                  />
                </div>
              </div>

              {/* Serviços */}
              <div className="p-5 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 transition-colors dark:hover:bg-white/5">
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-xl border ${company.module_services ? 'bg-blue-500/10 border-blue-500/20 text-blue-500' : 'bg-slate-100 border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700'}`}>
                    <Globe className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Gestão de Serviços (OS)</p>
                    <p className="text-xs text-slate-500">Ordens de serviço, OS e faturamento de contratos.</p>
                  </div>
                </div>
                <div className="shrink-0 pl-4">
                  <Switch 
                    active={company.module_services} 
                    onClick={() => handleToggleModule('module_services', company.module_services)} 
                    disabled={togglingModule !== null}
                    colorClass="bg-blue-500"
                  />
                </div>
              </div>

              {/* Políticas Comerciais */}
              <div className="p-5 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 transition-colors dark:hover:bg-white/5">
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-xl border ${company.module_commercial ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-500' : 'bg-slate-100 border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700'}`}>
                    <Tags className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Políticas de Preço</p>
                    <p className="text-xs text-slate-500">Regras comerciais, tabelas de preço e descontos segmentados.</p>
                  </div>
                </div>
                <div className="shrink-0 pl-4">
                  <Switch 
                    active={company.module_commercial} 
                    onClick={() => handleToggleModule('module_commercial', company.module_commercial)} 
                    disabled={togglingModule !== null}
                    colorClass="bg-indigo-500"
                  />
                </div>
              </div>

              {/* CRM 360 */}
              <div className="p-5 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 transition-colors dark:hover:bg-white/5">
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-xl border ${company.module_crm ? 'bg-purple-500/10 border-purple-500/20 text-purple-500' : 'bg-slate-100 border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700'}`}>
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">CRM 360º</p>
                    <p className="text-xs text-slate-500">Gestão de relacionamento, tarefas, pipeline e follow-ups.</p>
                  </div>
                </div>
                <div className="shrink-0 pl-4">
                  <Switch 
                    active={company.module_crm} 
                    onClick={() => handleToggleModule('module_crm', company.module_crm)} 
                    disabled={togglingModule !== null}
                    colorClass="bg-purple-500"
                  />
                </div>
              </div>

              {/* Consignação Horus */}
              <div className="p-5 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 transition-colors dark:hover:bg-white/5">
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-xl border ${company.module_consignment ? 'bg-orange-500/10 border-orange-500/20 text-orange-500' : 'bg-slate-100 border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700'}`}>
                    <Database className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Consignação Horus</p>
                    <p className="text-xs text-slate-500">Acertos e Devoluções de consignação totalmente integrados com a API Horus.</p>
                  </div>
                </div>
                <div className="shrink-0 pl-4">
                  <Switch 
                    active={company.module_consignment} 
                    onClick={() => handleToggleModule('module_consignment', company.module_consignment)} 
                    disabled={togglingModule !== null}
                    colorClass="bg-orange-500"
                  />
                </div>
              </div>

              {/* Gestão de Propostas / Orçamentos */}
              <div className="p-5 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 transition-colors dark:hover:bg-white/5">
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-xl border ${company.module_proposals ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-slate-100 border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700'}`}>
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Gestão de Propostas</p>
                    <p className="text-xs text-slate-500">Gere propostas e orçamentos comerciais, com fluxo de conversão automática em Pedido e OS.</p>
                  </div>
                </div>
                <div className="shrink-0 pl-4">
                  <Switch 
                    active={company.module_proposals} 
                    onClick={() => handleToggleModule('module_proposals', company.module_proposals)} 
                    disabled={togglingModule !== null}
                    colorClass="bg-emerald-500"
                  />
                </div>
              </div>

              {/* Logística Horus */}
              <div className="p-5 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 transition-colors dark:hover:bg-white/5">
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-xl border ${company.module_logistica_horus ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-500' : 'bg-slate-100 border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700'}`}>
                    <ClipboardList className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Logística Horus</p>
                    <p className="text-xs text-slate-500">Rotina de conferência de pedidos por volumes/caixas, impressão de etiquetas e sincronização com o ERP.</p>
                  </div>
                </div>
                <div className="shrink-0 pl-4">
                  <Switch 
                    active={company.module_logistica_horus} 
                    onClick={() => handleToggleModule('module_logistica_horus', company.module_logistica_horus)} 
                    disabled={togglingModule !== null}
                    colorClass="bg-indigo-500"
                  />
                </div>
              </div>

              {/* Dropshipping (Erdos) */}
              <div className="p-5 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 transition-colors dark:hover:bg-white/5">
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-xl border ${company.module_dropship ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' : 'bg-slate-100 border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700'}`}>
                    <Database className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Dropshipping (Erdos)</p>
                    <p className="text-xs text-slate-500">Integração de pedidos, tabela de preços e sincronização de estoque com o fornecedor Erdos via Dropship.</p>
                  </div>
                </div>
                <div className="shrink-0 pl-4">
                  <Switch
                    active={company.module_dropship}
                    onClick={() => handleToggleModule('module_dropship', company.module_dropship)}
                    disabled={togglingModule !== null}
                    colorClass="bg-amber-500"
                  />
                </div>
              </div>

              {/* Notificações */}
              <div className="p-5 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 transition-colors dark:hover:bg-white/5">
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-xl border ${company.module_notifications ? 'bg-teal-500/10 border-teal-500/20 text-teal-500' : 'bg-slate-100 border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700'}`}>
                    <Bell className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Notificações</p>
                    <p className="text-xs text-slate-500">Permite que o seller crie alertas programáveis exibidos no storefront para os clientes (avisos de preços, retirada de pedidos, etc.).</p>
                  </div>
                </div>
                <div className="shrink-0 pl-4">
                  <Switch
                    active={company.module_notifications}
                    onClick={() => handleToggleModule('module_notifications', company.module_notifications)}
                    disabled={togglingModule !== null}
                    colorClass="bg-teal-500"
                  />
                </div>
              </div>

              {/* Busca Preço */}
              <div className="p-5 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 transition-colors dark:hover:bg-white/5">
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-xl border ${company.module_busca_preco ? 'bg-[#00b4b4]/10 border-[#00b4b4]/20 text-[#00b4b4]' : 'bg-slate-100 border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700'}`}>
                    <ScanBarcode className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Busca Preço</p>
                    <p className="text-xs text-slate-500">Consulta de produto e visualização de estoque por filial em tempo real via API Horus.</p>
                  </div>
                </div>
                <div className="shrink-0 pl-4">
                  <Switch
                    active={company.module_busca_preco}
                    onClick={() => handleToggleModule('module_busca_preco', company.module_busca_preco)}
                    disabled={togglingModule !== null}
                    colorClass="bg-[#00b4b4]"
                  />
                </div>
              </div>

           </div>
        </section>

        {/* ─── App Mobile Section ─────────────────────────────────────── */}
        <section className="space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2 mt-8">
            <Smartphone className="h-4 w-4 text-violet-500" /> App Mobile (Android &amp; iOS)
          </h3>
          <div className="rounded-2xl border border-violet-200 bg-white overflow-hidden shadow-sm dark:border-violet-500/20 dark:bg-slate-900/40">

            {/* ── Toggle mestre ── */}
            <div className={`px-6 py-5 flex items-center justify-between border-b transition-colors ${mobileModules.app_enabled ? 'bg-violet-50 dark:bg-violet-500/10 border-violet-200 dark:border-violet-500/20' : 'bg-slate-50 dark:bg-slate-800/40 border-slate-100 dark:border-slate-800'}`}>
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl border transition-colors ${mobileModules.app_enabled ? 'bg-violet-500/15 border-violet-500/30 text-violet-600' : 'bg-slate-200 border-slate-300 text-slate-400 dark:bg-slate-700 dark:border-slate-600'}`}>
                  <Smartphone className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Habilitar App Mobile</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {mobileModules.app_enabled
                      ? 'O seller pode fazer login e usar o app.'
                      : 'App bloqueado — o seller não consegue entrar.'}
                  </p>
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-3">
                {loadingMobile && <Loader2 className="h-4 w-4 animate-spin text-violet-500" />}
                {togglingMobile === 'app_enabled'
                  ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                  : (
                    <Switch
                      active={mobileModules.app_enabled}
                      onClick={() => handleToggleMobileModule('app_enabled')}
                      disabled={loadingMobile || togglingMobile !== null}
                      colorClass="bg-violet-500"
                    />
                  )
                }
              </div>
            </div>

            {/* ── Módulos individuais (desabilitados se app não ativo) ── */}
            <div className={`transition-opacity ${mobileModules.app_enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>

            {([
              { key: 'pdv',         label: 'PDV — Ponto de Venda',          desc: 'Realiza vendas e emite pedidos diretamente pelo celular.',           icon: MonitorSmartphone, color: 'violet' },
              { key: 'conferencia', label: 'Conferência de Pedidos',         desc: 'Leitura de código de barras e conferência integrada ao Horus.',      icon: ScanBarcode,       color: 'sky'    },
              { key: 'vendas',      label: 'Resultado de Vendas',            desc: 'Dashboard com indicadores de performance do período.',               icon: BarChart3,          color: 'emerald'},
              { key: 'pedidos',     label: 'Consulta de Pedidos',            desc: 'Consulta e acompanhamento de pedidos em tempo real.',                icon: ListOrdered,        color: 'orange' },
              { key: 'catalogo',    label: 'Catálogo de Produtos',           desc: 'Consulta de produtos, preços e disponibilidade de estoque.',         icon: BookOpen,           color: 'indigo' },
              { key: 'clientes',    label: 'Ficha de Clientes',              desc: 'Acesso à carteira de clientes e histórico de compras.',              icon: UserCircle,         color: 'rose'   },
            ] as { key: keyof MobileModules; label: string; desc: string; icon: any; color: string }[]).map((mod, idx) => {
              const active = mobileModules[mod.key];
              const Icon = mod.icon;
              const colors: Record<string, string> = {
                violet: 'bg-violet-500/10 border-violet-500/20 text-violet-500',
                sky:    'bg-sky-500/10 border-sky-500/20 text-sky-500',
                emerald:'bg-emerald-500/10 border-emerald-500/20 text-emerald-500',
                orange: 'bg-orange-500/10 border-orange-500/20 text-orange-500',
                indigo: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-500',
                rose:   'bg-rose-500/10 border-rose-500/20 text-rose-500',
              };
              const switchColors: Record<string, string> = {
                violet: 'bg-violet-500', sky: 'bg-sky-500', emerald: 'bg-emerald-500',
                orange: 'bg-orange-500', indigo: 'bg-indigo-500', rose: 'bg-rose-500',
              };
              return (
                <div key={mod.key} className={`p-5 flex items-center justify-between ${idx > 0 ? 'border-t border-slate-100 dark:border-slate-800' : ''} hover:bg-slate-50 dark:hover:bg-white/5 transition-colors`}>
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-xl border ${active ? colors[mod.color] : 'bg-slate-100 border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700'}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{mod.label}</p>
                      <p className="text-xs text-slate-500">{mod.desc}</p>
                    </div>
                  </div>
                  <div className="shrink-0 pl-4 flex items-center gap-3">
                    {togglingMobile === mod.key
                      ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                      : (
                        <Switch
                          active={active}
                          onClick={() => handleToggleMobileModule(mod.key)}
                          disabled={loadingMobile || togglingMobile !== null}
                          colorClass={switchColors[mod.color]}
                        />
                      )
                    }
                  </div>
                </div>
              );
            })}

            </div>{/* fim wrapper opacity — módulos individuais */}

          </div>
        </section>


      </div>
    </motion.div>
  );
}
