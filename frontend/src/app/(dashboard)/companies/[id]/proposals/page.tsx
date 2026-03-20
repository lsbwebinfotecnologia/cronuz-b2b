'use client';

import { motion } from 'framer-motion';
import { useParams } from 'next/navigation';
import { FileSignature, Plus } from 'lucide-react';

export default function CompanyProposalsPage() {
  const proposals: any[] = []; // Placeholder

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full">
      <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
         <div className="flex items-center gap-3">
           <FileSignature className="h-6 w-6 text-slate-500" />
           <div>
             <h2 className="text-xl font-bold text-slate-900 dark:text-white">Propostas Comerciais</h2>
           </div>
         </div>
         <button className="bg-[var(--color-primary-base)] hover:opacity-90 text-white font-medium py-2 px-4 rounded-xl flex items-center gap-2 transition-all shadow-sm">
           <Plus className="h-4 w-4" />
           Nova Proposta
         </button>
      </div>

      <div className="flex-1 overflow-x-auto p-0">
         <table className="w-full text-left text-sm whitespace-nowrap">
           <thead className="bg-slate-50 dark:bg-slate-950/50 text-slate-500 font-medium border-b border-slate-200 dark:border-slate-800">
             <tr>
               <th className="px-6 py-4">Proposta #</th>
               <th className="px-6 py-4">Assunto</th>
               <th className="px-6 py-4">Total</th>
               <th className="px-6 py-4">Data</th>
               <th className="px-6 py-4">Abrir Até</th>
               <th className="px-6 py-4">Tags</th>
               <th className="px-6 py-4">Data de Criação</th>
               <th className="px-6 py-4">Status</th>
             </tr>
           </thead>
           <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 leading-relaxed">
             {proposals.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center text-slate-500 dark:text-slate-400">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <FileSignature className="h-12 w-12 text-slate-300 dark:text-slate-700" />
                      <p>Nenhuma proposta encontrada</p>
                    </div>
                  </td>
                </tr>
             ) : (
                proposals.map(prop => (
                   <tr key={prop.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20">
                     <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-200">{prop.id}</td>
                     <td className="px-6 py-4 text-[var(--color-primary-base)] font-medium">{prop.subject}</td>
                     <td className="px-6 py-4">{prop.total}</td>
                     <td className="px-6 py-4">{prop.date}</td>
                     <td className="px-6 py-4">{prop.open_until}</td>
                     <td className="px-6 py-4">{prop.tags}</td>
                     <td className="px-6 py-4">{prop.created_at}</td>
                     <td className="px-6 py-4">{prop.status}</td>
                   </tr>
                ))
             )}
           </tbody>
         </table>
      </div>
    </motion.div>
  );
}
