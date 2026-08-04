'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw, Loader2, CheckCircle2, AlertTriangle,
  PackageSearch, ChevronLeft, ChevronRight,
  ChevronDown, ChevronUp, Clock, Send, Filter,
  BarChart3, Boxes, CalendarClock,
} from 'lucide-react';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface StockItem {
  sku: string;
  quantidade: number;
}

interface SyncLog {
  id: number;
  triggered_by: 'manual' | 'scheduler';
  status: 'ok' | 'no_items' | 'error';
  data_ini: string | null;
  data_fim: string | null;
  skus_sent: number;
  items_payload: StockItem[] | null;
  hub_response: any;
  error_msg: string | null;
  executed_at: string;
}

interface LogsResponse {
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  logs: SyncLog[];
}

const STATUS_CONFIG = {
  ok:       { label: 'Enviado',    bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-800/40', icon: CheckCircle2 },
  no_items: { label: 'Sem itens',  bg: 'bg-slate-50 dark:bg-slate-800/50',     text: 'text-slate-500 dark:text-slate-400',     border: 'border-slate-200 dark:border-slate-700',         icon: PackageSearch },
  error:    { label: 'Erro',       bg: 'bg-rose-50 dark:bg-rose-900/20',       text: 'text-rose-600 dark:text-rose-400',       border: 'border-rose-200 dark:border-rose-800/40',        icon: AlertTriangle },
};

export default function StockSyncLogsPage() {
  const user = getUser();
  const companyId = user?.company_id;

  const [data, setData] = useState<LogsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pushing, setPushing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchLogs = useCallback(async (page = 1) => {
    if (!companyId) return;
    setLoading(true);
    try {
      const token = getToken();
      const params = new URLSearchParams({ page: String(page), page_size: '15' });
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`${API_URL}/dropship/stock/${companyId}/logs?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setData(await res.json());
        setCurrentPage(page);
      }
    } catch {
      toast.error('Erro ao carregar logs.');
    } finally {
      setLoading(false);
    }
  }, [companyId, statusFilter]);

  useEffect(() => { fetchLogs(1); }, [fetchLogs]);

  const handleManualPush = async () => {
    if (!companyId) return;
    setPushing(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/dropship/stock/${companyId}/push`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await res.json();
      if (res.ok) {
        if (result.status === 'ok') toast.success(`✅ ${result.skus_sent} SKUs enviados ao Hub-Erdos!`);
        else if (result.status === 'no_items') toast.info('Nenhum item atualizado no período.');
        fetchLogs(1);
      } else {
        toast.error(result.detail || 'Erro ao enviar estoque.');
      }
    } catch {
      toast.error('Erro de conexão.');
    } finally {
      setPushing(false);
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
    } catch { return iso; }
  };

  const totalPages = data?.total_pages ?? 1;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-800 px-6 py-4 bg-gradient-to-r from-indigo-600/5 to-blue-600/5 dark:from-indigo-900/20 dark:to-blue-900/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-md">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 dark:text-white">Logs de Estoque — Dropship</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">Histórico de sincronizações Hórus → Hub-Erdos</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => fetchLogs(currentPage)} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
            <button onClick={handleManualPush} disabled={pushing}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm shadow-indigo-500/30 transition-all disabled:opacity-60">
              {pushing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {pushing ? 'Enviando...' : 'Enviar Agora'}
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-4 flex-1">

        {/* Resumo rápido */}
        {data && data.total > 0 && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total de execuções', value: data.total, color: 'text-slate-900 dark:text-white' },
              { label: 'Com itens enviados', value: data.logs.filter(l => l.status === 'ok').length + (data.total > 15 ? '+' : ''), color: 'text-emerald-600 dark:text-emerald-400' },
              { label: 'Com erro', value: data.logs.filter(l => l.status === 'error').length + (data.total > 15 ? '+' : ''), color: 'text-rose-600 dark:text-rose-400' },
            ].map(s => (
              <div key={s.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 text-center">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{s.label}</p>
              </div>
            ))}
          </motion.div>
        )}

        {/* Filtros */}
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Filtrar:</span>
          {(['', 'ok', 'no_items', 'error'] as const).map(s => (
            <button key={s} onClick={() => { setStatusFilter(s); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                statusFilter === s
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
              }`}>
              {s === '' ? 'Todos' : STATUS_CONFIG[s].label}
            </button>
          ))}
        </motion.div>

        {/* Lista de logs */}
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">

          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {data?.total ?? 0} execução(ões) registrada(s)
              {statusFilter && <span className="text-slate-400 font-normal ml-1">— filtrado por "{STATUS_CONFIG[statusFilter as keyof typeof STATUS_CONFIG]?.label}"</span>}
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
            </div>
          ) : !data || data.logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                Nenhum log ainda — clique em "Enviar Agora" para a primeira execução
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50 dark:divide-slate-800">
              {data.logs.map(entry => {
                const cfg = STATUS_CONFIG[entry.status] ?? STATUS_CONFIG.error;
                const Icon = cfg.icon;
                const isExpanded = expandedId === entry.id;

                return (
                  <div key={entry.id}>
                    {/* Linha principal */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                      className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left"
                    >
                      {/* Status badge */}
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border shrink-0 ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                        <Icon className="w-3 h-3" />
                        {cfg.label}
                      </span>

                      {/* Período */}
                      <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 shrink-0">
                        <CalendarClock className="w-3 h-3" />
                        <span className="font-mono">{entry.data_ini?.split(' ')[0] ?? '—'}</span>
                        <span>→</span>
                        <span className="font-mono">{entry.data_fim?.split(' ')[0] ?? '—'}</span>
                      </div>

                      {/* SKUs */}
                      <div className="flex items-center gap-1.5 text-xs shrink-0">
                        <Boxes className="w-3.5 h-3.5 text-indigo-500" />
                        <span className="font-bold text-slate-700 dark:text-slate-300">{entry.skus_sent}</span>
                        <span className="text-slate-400">SKUs</span>
                      </div>

                      {/* Trigger */}
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold shrink-0 ${
                        entry.triggered_by === 'scheduler'
                          ? 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-800/40'
                          : 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/40'
                      }`}>
                        {entry.triggered_by === 'scheduler' ? '⏱ Auto' : '👤 Manual'}
                      </span>

                      {/* Data/hora */}
                      <div className="flex items-center gap-1 text-xs text-slate-400 ml-auto shrink-0">
                        <Clock className="w-3 h-3" />
                        {formatDate(entry.executed_at)}
                      </div>

                      {/* Expand toggle */}
                      <div className="text-slate-400 shrink-0">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </button>

                    {/* Detalhe expandido */}
                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-5 pb-5 pt-2 space-y-4 bg-slate-50/50 dark:bg-slate-950/30">

                            {/* Erro */}
                            {entry.error_msg && (
                              <div className="bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800/40 rounded-xl p-3">
                                <p className="text-xs font-semibold text-rose-700 dark:text-rose-400 mb-1">Mensagem de erro</p>
                                <p className="text-xs text-rose-600 dark:text-rose-300 font-mono">{entry.error_msg}</p>
                              </div>
                            )}

                            {/* Resposta Erdos */}
                            {entry.hub_response && (
                              <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800/40 rounded-xl p-3">
                                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-1">Resposta do Hub-Erdos</p>
                                <pre className="text-[10px] text-emerald-700 dark:text-emerald-300 overflow-x-auto">
                                  {JSON.stringify(entry.hub_response, null, 2)}
                                </pre>
                              </div>
                            )}

                            {/* Itens enviados */}
                            {entry.items_payload && entry.items_payload.length > 0 ? (
                              <div>
                                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">
                                  Itens enviados ({entry.items_payload.length} SKUs)
                                </p>
                                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                                  <div className="max-h-64 overflow-y-auto">
                                    <table className="w-full text-xs">
                                      <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                                        <tr>
                                          <th className="text-left px-3 py-2 font-semibold text-slate-500 dark:text-slate-400">#</th>
                                          <th className="text-left px-3 py-2 font-semibold text-slate-500 dark:text-slate-400">ISBN (SKU)</th>
                                          <th className="text-right px-3 py-2 font-semibold text-slate-500 dark:text-slate-400">Quantidade</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                        {entry.items_payload.map((item, i) => (
                                          <tr key={item.sku} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                            <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                                            <td className="px-3 py-2 font-mono font-semibold text-slate-700 dark:text-slate-300">{item.sku}</td>
                                            <td className="px-3 py-2 text-right">
                                              <span className={`font-bold ${item.quantidade === 0 ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                                {item.quantidade}
                                              </span>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              !entry.error_msg && (
                                <p className="text-xs text-slate-400 italic">Nenhum item foi enviado nesta execução.</p>
                              )
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pág. <span className="font-semibold text-slate-700 dark:text-slate-300">{currentPage}</span> de{' '}
                <span className="font-semibold text-slate-700 dark:text-slate-300">{totalPages}</span>
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => fetchLogs(Math.max(1, currentPage - 1))} disabled={currentPage === 1}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none transition-all">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => i + 1).map(p => (
                  <button key={p} onClick={() => fetchLogs(p)}
                    className={`min-w-[28px] h-7 px-2 rounded-lg text-xs font-semibold transition-all ${
                      currentPage === p
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}>
                    {p}
                  </button>
                ))}
                <button onClick={() => fetchLogs(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none transition-all">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
