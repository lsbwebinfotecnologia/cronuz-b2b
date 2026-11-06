'use client';

import { motion } from 'framer-motion';
import { Loader2, BookOpen, Key, Info } from 'lucide-react';
import Link from 'next/link';
import { useCompany } from '../context';
import { BookinfoTab } from '@/app/(dashboard)/settings/BookinfoTab';

export default function CompanyBookinfoPage() {
  const { company } = useCompany();

  if (!company) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary-base)]" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full overflow-y-auto">
      <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md sticky top-0 z-10">
        <h2 className="text-xl font-bold text-indigo-700 dark:text-indigo-400 flex items-center gap-2">
          <BookOpen className="w-6 h-6" /> Integração B2B Bookinfo
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Configurações unificadas com o painel do Seller (Credenciais API, Regras Comerciais e Automações de Vendas/Compras).
        </p>
      </div>

      <div className="p-6 space-y-5">
        {/* Banner Informativo para Master sobre Metadados Globais */}
        <div className="p-4 rounded-2xl bg-teal-500/10 border border-teal-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <BookOpen className="w-5 h-5 text-teal-500 dark:text-teal-400 mt-0.5 shrink-0" />
            <div>
              <span className="font-bold text-teal-900 dark:text-teal-200 block text-sm">
                Procurando a Chave Global da Bookinfo para o Busca Preço?
              </span>
              <span className="text-slate-600 dark:text-slate-300 block text-xs mt-0.5">
                As credenciais abaixo pertencem exclusivamente a <strong>{company.name}</strong> (espelhadas em{' '}
                <code className="font-mono font-bold">/settings?tab=bookinfo</code>). Para configurar a <strong>Chave Global</strong> usada pelo Busca Preço, acesse:
              </span>
            </div>
          </div>
          <Link
            href="/master/bookinfo-metadata"
            className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs transition-colors shadow-sm"
          >
            <Key className="w-3.5 h-3.5" />
            Configurar Chave Global
          </Link>
        </div>

        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/15 border border-indigo-200 dark:border-indigo-800/40">
          <Info className="w-4 h-4 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
          <p className="text-xs text-indigo-800 dark:text-indigo-300 leading-relaxed">
            <strong>Configuração espelhada em tempo real com o Seller:</strong> O próprio Seller pode preencher seu Token Bookinfo e gerenciar as automações diretamente em seu painel (<code className="font-mono font-bold">/settings?tab=bookinfo</code>).
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
          <BookinfoTab companyIdProp={Number(company.id)} />
        </div>
      </div>
    </motion.div>
  );
}
