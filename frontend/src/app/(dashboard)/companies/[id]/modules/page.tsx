'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Loader2, Globe, Box, Users, Megaphone, MonitorSmartphone, Layers, ShieldAlert, ArrowRightLeft, DollarSign, Tags, ShoppingBag } from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';
import { useCompany } from '../layout';

export default function CompanyModulesPage() {
  const params = useParams();
  const companyId = params.id as string;
  const { company, refreshCompany } = useCompany();
  
  const [togglingModule, setTogglingModule] = useState<string | null>(null);

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

           </div>
        </section>

      </div>
    </motion.div>
  );
}
