'use client';

import { useParams } from 'next/navigation';
import { PackageCheck, Info } from 'lucide-react';
import { DropshipTab } from '@/app/(dashboard)/settings/DropshipTab';

export default function CompanyDropshipPage() {
  const params = useParams();
  const companyId = Number(params.id);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="border-b border-slate-200 dark:border-slate-800 px-6 py-4 bg-gradient-to-r from-violet-600/5 to-purple-600/5 dark:from-violet-900/20 dark:to-purple-900/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md">
              <PackageCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 dark:text-white">Dropshipping — Hub-Erdos & Hórus ERP</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Configurações unificadas com o painel do Seller (Credenciais Multi-Token por CNPJ, Parâmetros Fiscais e Remessa)
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-5 flex-1">
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-violet-50 dark:bg-violet-900/15 border border-violet-200 dark:border-violet-800/40">
          <Info className="w-4 h-4 text-violet-600 dark:text-violet-400 mt-0.5 shrink-0" />
          <p className="text-xs text-violet-800 dark:text-violet-300 leading-relaxed">
            <strong>Configuração espelhada em tempo real com o Seller:</strong> As credenciais Erdos (Multi-Token por CNPJ), vínculos de Customer Hórus e parâmetros fiscais de Remessa/Venda abaixo são exatamente os mesmos exibidos ao Seller em <code className="font-mono font-bold">/settings?tab=dropship</code>.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
          {companyId ? <DropshipTab companyIdProp={companyId} /> : null}
        </div>
      </div>
    </div>
  );
}
