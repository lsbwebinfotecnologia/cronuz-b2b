'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { 
  Boxes, 
  Plus, 
  Play, 
  CheckCircle2, 
  Clock, 
  FileText, 
  ScanBarcode, 
  ArrowRight, 
  AlertCircle,
  Loader2,
  Calendar,
  Layers
} from 'lucide-react';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';

interface InventoryItem {
  id: number;
  company_id: number;
  code: string;
  name: string;
  status: 'EM_ANDAMENTO' | 'FINALIZADO' | 'CANCELADO';
  description?: string;
  total_expected_skus: number;
  total_scanned_items: number;
  total_sessions: number;
  open_sessions: number;
  created_at: string;
  finalized_at?: string;
}

export default function InventoryListPage() {
  const [inventories, setInventories] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const user = getUser();
  const companyId = user?.company_id;

  useEffect(() => {
    async function fetchInventories() {
      if (!companyId) return;
      try {
        const token = getToken();
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/inventory`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setInventories(data);
        } else {
          toast.error('Erro ao carregar inventários.');
        }
      } catch (err) {
        toast.error('Falha de conexão com a API.');
      } finally {
        setLoading(false);
      }
    }
    fetchInventories();
  }, [companyId]);

  const activeCount = inventories.filter(i => i.status === 'EM_ANDAMENTO').length;
  const finalizedCount = inventories.filter(i => i.status === 'FINALIZADO').length;

  return (
    <div className="p-4 sm:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20">
              <Boxes className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Módulo de Inventário
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Gestão e contagem física de estoque com auditoria e suporte offline.
              </p>
            </div>
          </div>
        </div>

        <Link
          href="/inventory/new"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-medium shadow-sm transition-colors text-sm"
        >
          <Plus className="h-4 w-4" />
          Novo Inventário
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Criados</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{inventories.length}</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            <Layers className="h-5 w-5" />
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-teal-100 dark:border-teal-500/20 bg-teal-50/50 dark:bg-teal-950/20 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-400">Em Andamento</p>
            <p className="text-2xl font-bold text-teal-950 dark:text-teal-200 mt-1">{activeCount}</p>
          </div>
          <div className="p-3 rounded-xl bg-teal-500/20 text-teal-600 dark:text-teal-400">
            <Clock className="h-5 w-5" />
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Finalizados</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{finalizedCount}</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Lista de Inventários */}
      {loading ? (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
          <p className="text-sm text-slate-500">Carregando inventários...</p>
        </div>
      ) : inventories.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50">
          <div className="inline-flex p-4 rounded-full bg-teal-500/10 text-teal-600 mb-4">
            <Boxes className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Nenhum inventário aberto</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            Comece abrindo um novo inventário para carregar a base de produtos esperada e iniciar as contagens físicas.
          </p>
          <Link
            href="/inventory/new"
            className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-medium text-sm"
          >
            <Plus className="h-4 w-4" />
            Criar Primeiro Inventário
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {inventories.map((inv) => {
            const isEmAndamento = inv.status === 'EM_ANDAMENTO';
            return (
              <motion.div
                key={inv.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow"
              >
                <div className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-xs font-mono font-bold text-teal-600 dark:text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded-md">
                        {inv.code}
                      </span>
                      <h3 className="font-bold text-slate-900 dark:text-white text-base mt-2 line-clamp-1">
                        {inv.name}
                      </h3>
                      {inv.description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-1">
                          {inv.description}
                        </p>
                      )}
                    </div>

                    <span className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                      isEmAndamento 
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                    }`}>
                      {isEmAndamento && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                      {inv.status === 'EM_ANDAMENTO' ? 'Em Andamento' : 'Finalizado'}
                    </span>
                  </div>

                  {/* Métricas do Inventário */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-xs">
                    <div>
                      <span className="text-slate-400">SKUs na Base:</span>
                      <p className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                        {inv.total_expected_skus.toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-400">Peças Bipadas:</span>
                      <p className="font-bold text-teal-600 dark:text-teal-400 text-sm">
                        {inv.total_scanned_items.toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-400">Sessões:</span>
                      <p className="font-semibold text-slate-700 dark:text-slate-300">
                        {inv.total_sessions} ({inv.open_sessions} ativas)
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-400">Data de Abertura:</span>
                      <p className="font-semibold text-slate-700 dark:text-slate-300">
                        {new Date(inv.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Ações */}
                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <Link
                    href={`/inventory/${inv.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Painel Gestor
                  </Link>

                  {isEmAndamento ? (
                    <Link
                      href={`/inventory/${inv.id}/count`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold transition-colors shadow-sm"
                    >
                      <ScanBarcode className="h-3.5 w-3.5" />
                      Bipar / Contar
                    </Link>
                  ) : (
                    <span className="text-xs text-slate-400 font-medium px-2">
                      Somente Leitura
                    </span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
