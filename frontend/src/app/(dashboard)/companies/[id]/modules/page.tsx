'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Loader2, Globe } from 'lucide-react';
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
    
    const payload = {
      module_horus_erp: company.module_horus_erp,
      module_subscriptions: company.module_subscriptions,
      module_pdv: company.module_pdv,
      [moduleName]: !currentValue
    };

    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/modules`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Falha ao atualizar módulo');
      toast.success('Módulo atualizado com sucesso!');
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

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full overflow-y-auto">
      <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md sticky top-0 z-10 flex items-center justify-between">
         <div>
           <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
             Módulos da Empresa
           </h2>
           <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
             Habilite as integrações e aplicativos disponíveis para essa organização.
           </p>
         </div>
      </div>

      <div className="p-6 space-y-8">
        
        {/* Module Section */}
        <section className="space-y-4">
           <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm dark:border-slate-800/60 dark:bg-slate-900/40">
              
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                 <Globe className="h-5 w-5 text-indigo-500" />
                 <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">Ativar ou desativar módulos</h3>
              </div>
              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/30">
                 <p className="text-sm text-slate-500 font-medium">Preencha as chaves de acesso fornecidas pelos fornecedores nas respectivas páginas (como Ponto de Venda ou Integração Especializada) para iniciar a sincronização para esta organização.</p>
              </div>

              <div className="p-6 flex items-center justify-between border-t border-slate-100 dark:border-slate-800">
                <div className="space-y-1">
                  <p className="text-sm font-bold text-rose-500 tracking-wide">MÓDULO: ASSINATURAS & RECORRÊNCIA</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Habilite para permitir a criação de Hotsites dinâmicos e venda de assinaturas com cobrança recorrente via EFI Automática para este Seller.</p>
                </div>
                <button 
                  onClick={() => handleToggleModule('module_subscriptions', company.module_subscriptions)}
                  disabled={togglingModule === 'module_subscriptions'}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] focus:ring-offset-2 ${company.module_subscriptions ? 'bg-rose-500' : 'bg-slate-200 dark:bg-slate-700'} ${togglingModule === 'module_subscriptions' ? 'opacity-50' : ''}`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${company.module_subscriptions ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
              
              <div className="p-6 flex items-center justify-between border-t border-slate-100 dark:border-slate-800">
                <div className="space-y-1">
                  <p className="text-sm font-bold text-blue-600 tracking-wide">MÓDULO: PONTO DE VENDA (PDV)</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Habilite para permitir que o Seller utilize a frente de caixa integrada (Vendedores e PDV).</p>
                </div>
                <button 
                  onClick={() => handleToggleModule('module_pdv', company.module_pdv)}
                  disabled={togglingModule === 'module_pdv'}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] focus:ring-offset-2 ${company.module_pdv ? 'bg-slate-900' : 'bg-slate-200 dark:bg-slate-700'} ${togglingModule === 'module_pdv' ? 'opacity-50' : ''}`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${company.module_pdv ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

           </div>
        </section>

      </div>
    </motion.div>
  );
}
