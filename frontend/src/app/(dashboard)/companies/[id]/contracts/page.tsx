'use client';

import { motion } from 'framer-motion';
import { useParams } from 'next/navigation';
import { FileSignature, Plus } from 'lucide-react';

export default function CompanyContractsPage() {
  const contracts: any[] = [
    {
       id: 90,
       subject: "Integração Tray x Horus",
       type: "Desenvolvimento",
       value: "R$3.650,00",
       start_date: "12/03/2026",
       end_date: "31/03/2026",
       signature: "Não assinado"
    }
  ]; // Placeholder based on print

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full">
      <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
         <div className="flex items-center gap-3">
           <FileSignature className="h-6 w-6 text-slate-500" />
           <div>
             <h2 className="text-xl font-bold text-slate-900 dark:text-white">Contratos</h2>
           </div>
         </div>
         <button className="bg-[var(--color-primary-base)] hover:opacity-90 text-white font-medium py-2 px-4 rounded-xl flex items-center gap-2 transition-all shadow-sm">
           <Plus className="h-4 w-4" />
           Novo Contrato
         </button>
      </div>

      <div className="flex-1 overflow-x-auto p-0">
         <table className="w-full text-left text-sm whitespace-nowrap">
           <thead className="bg-slate-50 dark:bg-slate-950/50 text-slate-500 font-medium border-b border-slate-200 dark:border-slate-800">
             <tr>
               <th className="px-6 py-4">#</th>
               <th className="px-6 py-4">Assunto</th>
               <th className="px-6 py-4">Tipo de Contrato</th>
               <th className="px-6 py-4">Valor do Contrato</th>
               <th className="px-6 py-4">Data de Início</th>
               <th className="px-6 py-4">Data Final</th>
               <th className="px-6 py-4">Assinatura</th>
             </tr>
           </thead>
           <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 leading-relaxed">
             {contracts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center text-slate-500 dark:text-slate-400">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <FileSignature className="h-12 w-12 text-slate-300 dark:text-slate-700" />
                      <p>Nenhum contrato encontrado</p>
                    </div>
                  </td>
                </tr>
             ) : (
                contracts.map(contract => (
                   <tr key={contract.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20">
                     <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-200">{contract.id}</td>
                     <td className="px-6 py-4 text-[var(--color-primary-base)] font-medium hover:underline cursor-pointer">{contract.subject}</td>
                     <td className="px-6 py-4 text-slate-600 dark:text-slate-300">{contract.type}</td>
                     <td className="px-6 py-4 text-slate-600 dark:text-slate-300">{contract.value}</td>
                     <td className="px-6 py-4 text-slate-600 dark:text-slate-300">{contract.start_date}</td>
                     <td className="px-6 py-4 text-slate-600 dark:text-slate-300">{contract.end_date}</td>
                     <td className="px-6 py-4 text-slate-600 dark:text-slate-300">{contract.signature}</td>
                   </tr>
                ))
             )}
           </tbody>
         </table>
      </div>
    </motion.div>
  );
}
