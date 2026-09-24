'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Truck,
  RefreshCw,
  Loader2,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Search,
  ChevronLeft,
  ChevronRight,
  Play,
  ArrowLeft,
  Clock,
  PackageCheck,
  Send,
  Building2,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import { getToken, getUser } from '@/lib/auth';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface LogItem {
  id: number;
  company_id: number;
  provider: string;
  cod_ped_venda: number;
  cod_cli: number | null;
  pedido_web_origem: string | null;
  id_ord_sys_log: string | null;
  status_horus: string | null;
  situation: string;
  cep_validated: boolean | null;
  cep_checked_at: string | null;
  cep_error_detail: string | null;
  sent_at: string | null;
  checked_at: string | null;
  invoiced_at: string | null;
  error_log: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface LogStats {
  total: number;
  in_logistics: number;
  cep_invalid: number;
  checked: number;
  invoiced: number;
  errors: number;
}

export default function LogisticaLogsPage() {
  const user = getUser();
  const companyId = user?.company_id;

  const [loading, setLoading] = useState(true);
  const [runningAuto, setRunningAuto] = useState(false);
  const [items, setItems] = useState<LogItem[]>([]);
  const [stats, setStats] = useState<LogStats>({
    total: 0,
    in_logistics: 0,
    cep_invalid: 0,
    checked: 0,
    invoiced: 0,
    errors: 0,
  });

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  // Filtros
  const [activeTab, setActiveTab] = useState<'ALL' | 'ERRORS' | 'IN_LOGISTICS' | 'CEP_INVALID'>('ALL');
  const [search, setSearch] = useState('');

  const fetchLogs = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const token = getToken();
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: '20',
      });

      if (activeTab === 'ERRORS') {
        params.append('only_errors', 'true');
      } else if (activeTab !== 'ALL') {
        params.append('situation', activeTab);
      }

      if (search.trim()) {
        params.append('search', search.trim());
      }

      const res = await fetch(`${API}/companies/${companyId}/logistics/logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error('Falha ao consultar logs de logística.');
      }

      const data = await res.json();
      setItems(data.items || []);
      setTotalPages(data.pages || 1);
      setTotalRecords(data.total || 0);
      if (data.stats) setStats(data.stats);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao carregar logs.');
    } finally {
      setLoading(false);
    }
  }, [companyId, page, activeTab, search]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Disparo manual da rotina automática
  const handleTriggerAuto = async () => {
    if (!companyId || runningAuto) return;
    setRunningAuto(true);
    try {
      const token = getToken();
      const res = await fetch(`${API}/companies/${companyId}/logistics/run-auto`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Erro ao processar envio automático.');
      }
      const st = data.result || {};
      toast.success(
        `Rotina executada! Processados: ${st.processed || 0} | Enviados: ${st.sent || 0} | Críticas/Erros: ${st.errors || 0}`
      );
      fetchLogs();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao disparar rotina.');
    } finally {
      setRunningAuto(false);
    }
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const getSituationBadge = (situation: string) => {
    const cls = 'inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border whitespace-nowrap';
    switch (situation) {
      case 'IN_LOGISTICS':
        return (
          <span className={`${cls} bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-800`}>
            <PackageCheck className="h-3 w-3" /> No WMS (Enviado)
          </span>
        );
      case 'CEP_INVALID':
        return (
          <span className={`${cls} bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-800`}>
            <XCircle className="h-3 w-3" /> CEP Inválido
          </span>
        );
      case 'CHECKED':
        return (
          <span className={`${cls} bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800`}>
            <CheckCircle className="h-3 w-3" /> Conferido no WMS
          </span>
        );
      case 'INVOICED':
        return (
          <span className={`${cls} bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border-purple-200 dark:border-purple-800`}>
            <CheckCircle className="h-3 w-3" /> Faturado
          </span>
        );
      case 'CANCELED':
        return (
          <span className={`${cls} bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700`}>
            Cancelado
          </span>
        );
      default:
        return (
          <span className={`${cls} bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800`}>
            <Clock className="h-3 w-3" /> Pendente / Crítica
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto p-4 md:p-6 pb-24">
      {/* ─── TOPO / CABEÇALHO ──────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/horus-direct/pedidos"
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-600 dark:text-slate-300"
            title="Voltar para Pedidos"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="p-3 bg-violet-100 dark:bg-violet-950/50 rounded-2xl text-violet-700 dark:text-violet-300">
            <Truck className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Logs da Logística WMS
              </h1>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                <Clock className="h-3 w-3" /> Automático: 15 min
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Histórico de envios, validações de CEP e críticas recebidas da integração logística
            </p>
          </div>
        </div>

        {/* Botão de Disparo Manual + Atualizar */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={fetchLogs}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>

          <button
            type="button"
            onClick={handleTriggerAuto}
            disabled={runningAuto || loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white shadow-sm transition-all disabled:opacity-50"
          >
            {runningAuto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-white" />}
            {runningAuto ? 'Processando envio...' : 'Processar Fila Agora'}
          </button>
        </div>
      </div>

      {/* ─── CARDS DE RESUMO ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total na Fila</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{stats.total}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Pedidos registrados</p>
        </div>

        <div className="p-4 rounded-2xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/40 dark:bg-blue-950/20 shadow-sm">
          <p className="text-[11px] font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider">No WMS (Enviados)</p>
          <p className="text-2xl font-black text-blue-800 dark:text-blue-200 mt-1">{stats.in_logistics}</p>
          <p className="text-[10px] text-blue-600/70 dark:text-blue-400/70 mt-0.5">Aguardando conferência</p>
        </div>

        <div className="p-4 rounded-2xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-950/20 shadow-sm">
          <p className="text-[11px] font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider">CEP Inválido</p>
          <p className="text-2xl font-black text-rose-800 dark:text-rose-200 mt-1">{stats.cep_invalid}</p>
          <p className="text-[10px] text-rose-600/70 dark:text-rose-400/70 mt-0.5">Bloqueados pelo ViaCEP</p>
        </div>

        <div className="p-4 rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20 shadow-sm">
          <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Total com Críticas</p>
          <p className="text-2xl font-black text-amber-800 dark:text-amber-200 mt-1">{stats.errors}</p>
          <p className="text-[10px] text-amber-600/70 dark:text-amber-400/70 mt-0.5">Exigem correção</p>
        </div>
      </div>

      {/* ─── BARRA DE FILTROS E ABAS ──────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Abas Rápidas */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
            <button
              type="button"
              onClick={() => { setActiveTab('ALL'); setPage(1); }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors shrink-0 ${
                activeTab === 'ALL'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Todos ({stats.total})
            </button>

            <button
              type="button"
              onClick={() => { setActiveTab('ERRORS'); setPage(1); }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors shrink-0 flex items-center gap-1.5 ${
                activeTab === 'ERRORS'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 hover:bg-rose-100'
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Apenas com Problemas ({stats.errors})
            </button>

            <button
              type="button"
              onClick={() => { setActiveTab('IN_LOGISTICS'); setPage(1); }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors shrink-0 ${
                activeTab === 'IN_LOGISTICS'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              No WMS ({stats.in_logistics})
            </button>

            <button
              type="button"
              onClick={() => { setActiveTab('CEP_INVALID'); setPage(1); }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors shrink-0 ${
                activeTab === 'CEP_INVALID'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              CEP Inválido ({stats.cep_invalid})
            </button>
          </div>

          {/* Campo de Busca */}
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar pedido Horus ou Web..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ─── TABELA DE LOGS ────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold sticky top-0">
              <tr>
                <th className="p-3.5">Data / Hora</th>
                <th className="p-3.5">Pedido Horus</th>
                <th className="p-3.5">Pedido Web</th>
                <th className="p-3.5">Cliente</th>
                <th className="p-3.5 text-center">Situação WMS</th>
                <th className="p-3.5">Crítica / Detalhes</th>
                <th className="p-3.5 text-center">ID no WMS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-400">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-violet-500" />
                    Carregando histórico de envios...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-400">
                    Nenhum registro encontrado com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                items.map((it) => {
                  const hasProblem = it.situation === 'CEP_INVALID' || Boolean(it.error_log);
                  const rowBg = hasProblem
                    ? 'bg-rose-50/40 dark:bg-rose-950/15 hover:bg-rose-50/80 dark:hover:bg-rose-950/25'
                    : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40';

                  return (
                    <tr key={it.id} className={`transition-colors ${rowBg}`}>
                      {/* Data / Hora */}
                      <td className="p-3.5 whitespace-nowrap text-slate-600 dark:text-slate-400">
                        {formatDate(it.sent_at || it.updated_at || it.created_at)}
                      </td>

                      {/* Pedido Horus */}
                      <td className="p-3.5 font-mono font-bold text-violet-700 dark:text-violet-300 whitespace-nowrap">
                        #{it.cod_ped_venda}
                      </td>

                      {/* Pedido Web */}
                      <td className="p-3.5 font-mono font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        {it.pedido_web_origem ? `#${it.pedido_web_origem}` : '—'}
                      </td>

                      {/* Cliente */}
                      <td className="p-3.5 font-semibold text-slate-700 dark:text-slate-300">
                        {it.cod_cli ? `Cód: ${it.cod_cli}` : '—'}
                      </td>

                      {/* Situação WMS */}
                      <td className="p-3.5 text-center whitespace-nowrap">
                        {getSituationBadge(it.situation)}
                        {it.id_ord_sys_log && (
                          <div className="mt-1 flex items-center justify-center gap-1 font-mono text-[10px]" title="ID do Pedido / Remessa no WMS">
                            <span className="text-slate-400 font-semibold">WMS:</span>
                            <span className="font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                              #{it.id_ord_sys_log}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Crítica / Detalhes */}
                      <td className="p-3.5 max-w-md">
                        {it.situation === 'CEP_INVALID' ? (
                          <div className="flex items-start gap-1.5 text-rose-700 dark:text-rose-400">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-rose-600" />
                            <span className="font-semibold">{it.cep_error_detail || 'CEP inválido.'}</span>
                          </div>
                        ) : it.error_log ? (
                          <div className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
                            <span>{it.error_log}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Sem críticas registradas.</span>
                        )}
                      </td>

                      {/* ID no WMS */}
                      <td className="p-3.5 text-center font-mono text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {it.id_ord_sys_log || '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ─── PAGINAÇÃO ────────────────────────────────────────── */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <span className="text-slate-500">
            Mostrando <strong>{items.length}</strong> de <strong>{totalRecords}</strong> registros (Página {page} de {totalPages})
          </span>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2.5 font-bold text-slate-700 dark:text-slate-300">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
