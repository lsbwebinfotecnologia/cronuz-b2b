'use client';

import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Receipt, Plus } from 'lucide-react';

export default function CompanyInvoicesPage() {
  const params = useParams();
  const companyId = params.id as string;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full">
      <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Receipt className="h-5 w-5 text-[var(--color-primary-base)]" />
            Faturas
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gerencie o faturamento e histórico financeiro desta empresa.
          </p>
        </div>
        
        <button 
          type="button"
          className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-medium py-2 px-4 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-[var(--color-primary-base)]/20 hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          Nova Fatura
        </button>
      </div>

      <div className="flex-1 p-6 flex flex-col items-center justify-center text-center">
         <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
            <Receipt className="h-8 w-8 text-slate-400 dark:text-slate-500" />
         </div>
         <h3 className="text-lg font-bold text-slate-900 dark:text-white">Nenhuma fatura encontrada</h3>
         <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mt-2">
           Esta empresa ainda não possui faturas geradas no sistema. Utilize o botão "Nova Fatura" para realizar a primeira cobrança.
         </p>
      </div>
    </motion.div>
  );
}
