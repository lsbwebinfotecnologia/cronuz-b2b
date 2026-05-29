'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, Play, Pause, CheckCircle2, AlertTriangle, AlertCircle,
  Clock, Package, Send, RotateCw, ChevronDown, ChevronUp, ArrowLeft,
  Info, Zap, Building2, Activity, X
} from 'lucide-react';
import { toast } from 'sonner';
import { getToken } from '@/lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/* ─────────────────── helpers ─────────────────── */
const statusBadge = (status: string | null) => {
  if (!status) return null;
  const map: Record<string, { label: string; cls: string }> = {
    SUCCESS:   { label: 'Sucesso',     cls: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' },
    PARTIAL:   { label: 'Parcial',     cls: 'bg-amber-500/20 text-amber-400 border border-amber-500/30' },
    ERROR:     { label: 'Erro',        cls: 'bg-red-500/20 text-red-400 border border-red-500/30' },
    NO_ORDERS: { label: 'Sem pedidos', cls: 'bg-slate-500/20 text-slate-400 border border-slate-500/30' },
  };
  const cfg = map[status] ?? { label: status, cls: 'bg-slate-700 text-slate-300' };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
};

const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
};

const getLogErrorMessage = (log: JobLog) => {
  if (log.status === 'ERROR' && log.details && Array.isArray(log.details)) {
    const fetchError = log.details.find(d => d.step || d.error);
    if (fetchError && fetchError.error) {
      return fetchError.error;
    }
    const detailError = log.details.find(d => d.status === 'error');
    if (detailError && detailError.detail) {
      return detailError.detail;
    }
  }
  return null;
};

/* ─────────────────── types ─────────────────── */
interface SellerSummary {
  company_id: number;
  company_name: string;
  bookinfo_purchase_auto: boolean;
  bookinfo_api_key_set: boolean;
  supplier_count: number;
  last_run_at: string | null;
  last_status: string | null;
  last_orders_found: number;
  last_orders_sent: number;
  last_orders_error: number;
  last_syncs_done: number;
  total_sent_30d: number;
  total_error_30d: number;
  total_syncs_30d: number;
}

interface JobLog {
  id: number;
  company_id: number;
  supplier_id: number | null;
  supplier_name: string | null;
  run_at: string | null;
  orders_found: number;
  orders_sent: number;
  orders_skipped: number;
  orders_error: number;
  syncs_done: number;
  syncs_error: number;
  status: string;
  details: any[] | null;
}

interface LogDetail {
  pedido?: string | number;
  transmission_id?: number;
  acao: string;
  status: string;
  detail: string;
}

/* ─────────────────── component ─────────────────── */
export default function BookinfoPurchaseAutomationPage() {
  const [sellers, setSellers] = useState<SellerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const [expandedSeller, setExpandedSeller] = useState<number | null>(null);
  const [sellerLogs, setSellerLogs] = useState<JobLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(1);

  const [selectedLog, setSelectedLog] = useState<JobLog | null>(null);

  const fetchSummary = useCallback(async () => {
    try {
      setLoading(true);
      const token = getToken();
      const res = await fetch(`${API_URL}/bookinfo-purchases/job-logs/summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Falha ao buscar resumo');
      setSellers(await res.json());
    } catch (e: any) {
      toast.error(e.message || 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  const toggleAuto = async (companyId: number, current: boolean) => {
    setTogglingId(companyId);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/bookinfo-purchases/job-logs/settings/${companyId}/auto`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookinfo_purchase_auto: !current }),
      });
      if (!res.ok) throw new Error('Falha ao atualizar configuração');
      toast.success(!current ? 'Automação ativada com sucesso!' : 'Automação desativada.');
      await fetchSummary();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao alterar automação');
    } finally {
      setTogglingId(null);
    }
  };

  const loadLogs = async (companyId: number, page = 1) => {
    setLoadingLogs(true);
    try {
      const token = getToken();
      const res = await fetch(
        `${API_URL}/bookinfo-purchases/job-logs?company_id=${companyId}&page=${page}&limit=20`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error('Falha ao buscar logs');
      const data = await res.json();
      setSellerLogs(data.items);
      setLogsTotal(data.total);
      setLogsPage(page);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleExpandSeller = (companyId: number) => {
    if (expandedSeller === companyId) {
      setExpandedSeller(null);
      setSellerLogs([]);
    } else {
      setExpandedSeller(companyId);
      loadLogs(companyId, 1);
    }
  };

  const totalPages = Math.ceil(logsTotal / 20);

  /* ─── UI ─── */
  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg-primary)' }}>
      {/* Header */}
      <div className="border-b px-6 py-4 flex items-center justify-between"
           style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-secondary)' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
               style={{ background: 'linear-gradient(135deg, var(--color-primary-base), var(--color-primary-dark))' }}>
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Automação — Pedidos de Compra Bookinfo
            </h1>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Job automático · Intervalo: 15 minutos · Timezone: Brasília
            </p>
          </div>
        </div>
        <button
          onClick={fetchSummary}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
          style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* Legenda */}
      <div className="mx-6 mt-4 mb-2 flex items-start gap-2 p-3 rounded-lg border"
           style={{ background: 'rgba(59,130,246,0.08)', borderColor: 'rgba(59,130,246,0.2)' }}>
        <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          O job roda automaticamente a cada <strong className="text-blue-400">15 minutos</strong> para cada seller com automação ativada.
          Ele busca pedidos <strong>não transmitidos</strong> no Horus, envia para a Bookinfo e sincroniza os retornos.
          Pedidos com <code className="bg-slate-700 px-1 rounded">COMPRA_CONSIG</code> diferente de N ou S são ignorados automaticamente.
        </p>
      </div>

      {/* Tabela de sellers */}
      <div className="px-6 py-4 space-y-3">
        {loading && sellers.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-6 h-6 animate-spin" style={{ color: 'var(--color-primary-base)' }} />
          </div>
        ) : sellers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Building2 className="w-12 h-12 opacity-20" style={{ color: 'var(--color-text-muted)' }} />
            <p style={{ color: 'var(--color-text-muted)' }}>Nenhum seller com Bookinfo configurado.</p>
          </div>
        ) : (
          sellers.map(seller => {
            const isExpanded = expandedSeller === seller.company_id;
            const isToggling = togglingId === seller.company_id;

            return (
              <div key={seller.company_id}
                   className="rounded-xl border overflow-hidden transition-all"
                   style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-secondary)' }}>

                {/* Linha do seller */}
                <div className="flex items-center gap-3 p-4">
                  {/* Toggle */}
                  <button
                    id={`toggle-auto-${seller.company_id}`}
                    onClick={() => toggleAuto(seller.company_id, seller.bookinfo_purchase_auto)}
                    disabled={isToggling || !seller.bookinfo_api_key_set}
                    title={!seller.bookinfo_api_key_set ? 'Configure a API Key da Bookinfo primeiro' : ''}
                    className="relative shrink-0 w-11 h-6 rounded-full transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      background: seller.bookinfo_purchase_auto
                        ? 'var(--color-primary-base)'
                        : 'var(--color-bg-tertiary)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    <span
                      className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-300 shadow-sm"
                      style={{ transform: seller.bookinfo_purchase_auto ? 'translateX(20px)' : 'translateX(0)' }}
                    />
                  </button>

                  {/* Info empresa */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                        {seller.company_name}
                      </span>
                      {seller.bookinfo_purchase_auto ? (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          <Activity className="w-3 h-3" /> Ativo
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs text-slate-400 border border-slate-600">
                          Inativo
                        </span>
                      )}
                      {!seller.bookinfo_api_key_set && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30">
                          <AlertTriangle className="w-3 h-3" /> Sem API Key
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      <span>{seller.supplier_count} fornecedor{seller.supplier_count !== 1 ? 'es' : ''}</span>
                      <span>·</span>
                      <span>Último ciclo: {fmtDate(seller.last_run_at)}</span>
                      {seller.last_status && <span>·</span>}
                      {statusBadge(seller.last_status)}
                    </div>
                  </div>

                  {/* Stats 30d */}
                  <div className="hidden md:flex items-center gap-6 text-center">
                    <div>
                      <p className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                        {seller.total_sent_30d}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>enviados (30d)</p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold" style={{ color: seller.total_error_30d > 0 ? '#f87171' : 'var(--color-text-primary)' }}>
                        {seller.total_error_30d}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>erros (30d)</p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                        {seller.total_syncs_30d}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>sincronizados (30d)</p>
                    </div>
                  </div>

                  {/* Expand */}
                  <button
                    id={`expand-seller-${seller.company_id}`}
                    onClick={() => handleExpandSeller(seller.company_id)}
                    className="shrink-0 p-2 rounded-lg transition-colors"
                    style={{ color: 'var(--color-text-muted)', background: 'var(--color-bg-tertiary)' }}
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>

                {/* Histórico expandido */}
                {isExpanded && (
                  <div className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                    <div className="px-4 py-3 flex items-center justify-between">
                      <p className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                        Histórico de execuções
                      </p>
                      <button
                        onClick={() => loadLogs(seller.company_id, logsPage)}
                        disabled={loadingLogs}
                        className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg transition-colors"
                        style={{ color: 'var(--color-text-muted)', background: 'var(--color-bg-tertiary)' }}
                      >
                        <RefreshCw className={`w-3 h-3 ${loadingLogs ? 'animate-spin' : ''}`} />
                        Atualizar
                      </button>
                    </div>

                    {loadingLogs ? (
                      <div className="flex justify-center py-8">
                        <RefreshCw className="w-5 h-5 animate-spin" style={{ color: 'var(--color-primary-base)' }} />
                      </div>
                    ) : sellerLogs.length === 0 ? (
                      <p className="text-center py-8 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                        Nenhuma execução registrada ainda.
                      </p>
                    ) : (
                      <div className="px-4 pb-4 space-y-2">
                        {/* Cabeçalho tabela */}
                        <div className="grid grid-cols-7 text-xs px-3 py-1.5 rounded-lg"
                             style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-muted)' }}>
                          <span className="col-span-2">Data / Fornecedor</span>
                          <span className="text-center">Encontrados</span>
                          <span className="text-center">Enviados</span>
                          <span className="text-center">Ignorados</span>
                          <span className="text-center">Sincronizados</span>
                          <span className="text-center">Status</span>
                        </div>

                        {sellerLogs.map(log => (
                          <button
                            key={log.id}
                            id={`log-row-${log.id}`}
                            onClick={() => setSelectedLog(log)}
                            className="w-full grid grid-cols-7 text-sm px-3 py-2.5 rounded-lg text-left transition-all hover:scale-[1.005]"
                            style={{
                              background: 'var(--color-bg-primary)',
                              border: '1px solid var(--color-border)',
                              color: 'var(--color-text-secondary)',
                            }}
                          >
                            <div className="col-span-2 pr-2">
                              <p className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
                                {fmtDate(log.run_at)}
                              </p>
                              <p className="text-xs truncate font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                                {log.supplier_name || `Supplier #${log.supplier_id}`}
                              </p>
                              {getLogErrorMessage(log) && (
                                <p className="text-[10px] text-red-400 mt-0.5 truncate font-mono" title={getLogErrorMessage(log)!}>
                                  Erro: {getLogErrorMessage(log)}
                                </p>
                              )}
                            </div>
                            <span className="text-center self-center font-semibold">
                              {log.orders_found}
                            </span>
                            <span className="text-center self-center text-emerald-400 font-semibold">
                              {log.orders_sent}
                            </span>
                            <span className="text-center self-center" style={{ color: 'var(--color-text-muted)' }}>
                              {log.orders_skipped}
                            </span>
                            <span className="text-center self-center text-blue-400 font-semibold">
                              {log.syncs_done}
                            </span>
                            <span className="self-center flex justify-center">
                              {statusBadge(log.status)}
                            </span>
                          </button>
                        ))}

                        {/* Paginação */}
                        {totalPages > 1 && (
                          <div className="flex items-center justify-center gap-2 pt-2">
                            <button
                              disabled={logsPage === 1}
                              onClick={() => loadLogs(seller.company_id, logsPage - 1)}
                              className="px-3 py-1 text-xs rounded-lg disabled:opacity-40 transition-colors"
                              style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
                            >
                              ← Anterior
                            </button>
                            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                              {logsPage} / {totalPages}
                            </span>
                            <button
                              disabled={logsPage === totalPages}
                              onClick={() => loadLogs(seller.company_id, logsPage + 1)}
                              className="px-3 py-1 text-xs rounded-lg disabled:opacity-40 transition-colors"
                              style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}
                            >
                              Próximo →
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Modal de detalhes do log */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-2xl border overflow-hidden"
               style={{ background: 'var(--color-bg-secondary)', borderColor: 'var(--color-border)' }}>
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b"
                 style={{ borderColor: 'var(--color-border)' }}>
              <div>
                <h3 className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  Detalhes do Ciclo #{selectedLog.id}
                </h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  {selectedLog.supplier_name} · {fmtDate(selectedLog.run_at)}
                </p>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-2 rounded-lg transition-colors"
                style={{ color: 'var(--color-text-muted)', background: 'var(--color-bg-tertiary)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Counters */}
            <div className="grid grid-cols-3 gap-3 px-6 py-4">
              {[
                { label: 'Encontrados', value: selectedLog.orders_found, icon: Package, color: 'text-slate-300' },
                { label: 'Enviados',    value: selectedLog.orders_sent,  icon: Send, color: 'text-emerald-400' },
                { label: 'Sincronizados', value: selectedLog.syncs_done, icon: RotateCw, color: 'text-blue-400' },
              ].map(stat => (
                <div key={stat.label} className="rounded-xl p-3 flex items-center gap-3"
                     style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)' }}>
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                  <div>
                    <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{stat.label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Detail lines */}
            <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-1.5">
              {(!selectedLog.details || selectedLog.details.length === 0) ? (
                <p className="text-center py-8 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  Sem detalhes registrados para este ciclo.
                </p>
              ) : (
                (selectedLog.details as any[]).map((d, i) => {
                  const isErrorStep = d.error !== undefined || d.step !== undefined;
                  const isError = d.status === 'error' || isErrorStep;
                  const isSkipped = d.status === 'skipped' || d.status === 'duplicate';
                  const isOk = d.status === 'sent' || d.status === 'synced';
                  const isPartial = d.status === 'partial';

                  return (
                    <div key={i}
                         className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs"
                         style={{
                           background: 'var(--color-bg-primary)',
                           border: '1px solid var(--color-border)',
                           color: 'var(--color-text-secondary)',
                         }}>
                      {isError && <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />}
                      {isSkipped && <Info className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />}
                      {isOk && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />}
                      {isPartial && <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />}
                      <div className="flex-1">
                        {isErrorStep ? (
                          <div>
                            <span className="font-semibold text-red-400">
                              Erro no passo: {d.step === 'fetch_horus' ? 'Buscar Pedidos no Horus' : d.step}
                            </span>
                            <p className="mt-1 font-mono text-[11px] whitespace-pre-wrap bg-slate-950/80 p-2.5 rounded border border-red-900/30 text-red-300">
                              {d.error}
                            </p>
                          </div>
                        ) : (
                          <>
                            <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                              {d.acao === 'send' ? `Pedido ${d.pedido}` : `Transmissão #${d.transmission_id}`}
                            </span>
                            {' — '}
                            <span>{d.detail || d.message || 'Sem detalhes'}</span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
