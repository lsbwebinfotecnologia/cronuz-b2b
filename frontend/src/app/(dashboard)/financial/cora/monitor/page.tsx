'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity, CheckCircle2, Clock, Database, AlertTriangle, RefreshCw, Loader2,
  Settings, ShieldCheck, FileText, ArrowUpRight, Zap, Landmark, Play,
} from 'lucide-react';
import { toast } from 'sonner';
import { getToken, getUser } from '@/lib/auth';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const fmtBRL = (v?: number | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0));

const fmtDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR') : '-';

const fmtDate = (iso?: string | null) =>
  iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '-';

interface MonitorStatus {
  job_interval_minutes: number;
  active_environment: 'STAGE' | 'PRODUCTION';
  webhook_registered: boolean;
  webhook_environment: string | null;
  horus_enabled: boolean;
  horus_sql_enabled: boolean;
  horus_baixa_enabled: boolean;
  horus_bank_summary: string | null;
  cronuz_baixa_enabled: boolean;
  open_monitored_qty: number;
  last_sync_at: string | null;
  paid_total_qty: number;
  settled_qty: number;
  pending_settlement_qty: number;
  error_settlement_qty: number;
}

interface PaidChargeItem {
  id: number;
  code: string;
  origin_type: string;
  invoice_number?: string | null;
  order_number?: string | null;
  financial_launch_id?: string | null;
  installment_number?: string | null;
  payer_name?: string | null;
  payer_document?: string | null;
  amount: number;
  total_paid?: number | null;
  due_date?: string | null;
  paid_at?: string | null;
  our_number?: string | null;
  settlement: {
    status: 'SETTLED_HORUS' | 'SETTLED_CRONUZ' | 'ERROR' | 'PENDING';
    event_type?: string | null;
    message?: string | null;
    settled_at?: string | null;
    paid_detected_by?: string | null;
    cpagar_tarifa_settled?: boolean;
  };
}

interface MonitorEventItem {
  id: number;
  charge_id: number;
  source: string;
  event_type: string;
  status_before?: string | null;
  status_after?: string | null;
  message?: string | null;
  created_at?: string | null;
  payer_name?: string | null;
  amount: number;
  invoice_number?: string | null;
  financial_launch_id?: string | null;
  installment_number?: string | null;
  order_number?: string | null;
  origin_type?: string | null;
}

export default function CoraMonitorPage() {
  const [status, setStatus] = useState<MonitorStatus | null>(null);
  const [paidCharges, setPaidCharges] = useState<PaidChargeItem[]>([]);
  const [events, setEvents] = useState<MonitorEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningSync, setRunningSync] = useState(false);
  const [settlingId, setSettlingId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'paid' | 'events'>('paid');
  const [filterSettle, setFilterSettle] = useState<'ALL' | 'PENDING' | 'SETTLED' | 'ERROR'>('ALL');

  const user = useMemo(() => getUser(), []);
  const companyId = user?.company_id;
  const authHeaders = useCallback(() => ({ Authorization: `Bearer ${getToken()}` }), []);

  const loadMonitor = useCallback(async (silent = false) => {
    if (!companyId) return;
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`${API}/companies/${companyId}/payments/monitor?provider=CORA`, {
        headers: authHeaders(),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail || 'Erro ao carregar monitor de conciliação do Cora.');
      setStatus(body.status);
      setPaidCharges(body.paid_charges || []);
      setEvents(body.events || []);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [companyId, authHeaders]);

  useEffect(() => {
    loadMonitor();
    const timer = setInterval(() => loadMonitor(true), 30000);
    return () => clearInterval(timer);
  }, [loadMonitor]);

  const handleRunSyncNow = async () => {
    if (!companyId) return;
    setRunningSync(true);
    try {
      const res = await fetch(`${API}/companies/${companyId}/payments/monitor/run-sync?provider=CORA`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail || 'Erro ao executar varredura de conciliação.');
      toast.success(body.message || 'Varredura executada com sucesso.');
      await loadMonitor(true);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRunningSync(false);
    }
  };

  const handleSettleCharge = async (chargeId: number) => {
    if (!companyId) return;
    setSettlingId(chargeId);
    try {
      const res = await fetch(`${API}/companies/${companyId}/payments/charges/${chargeId}/settle`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail || 'Erro ao executar baixa.');
      if (body.event_type === 'horus_settled' || body.event_type === 'cronuz_settled') {
        toast.success(body.message);
      } else {
        toast.warning(body.message);
      }
      await loadMonitor(true);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSettlingId(null);
    }
  };

  const filteredPaidCharges = useMemo(() => {
    return paidCharges.filter(item => {
      if (filterSettle === 'PENDING') return item.settlement.status === 'PENDING';
      if (filterSettle === 'SETTLED') return item.settlement.status === 'SETTLED_HORUS' || item.settlement.status === 'SETTLED_CRONUZ';
      if (filterSettle === 'ERROR') return item.settlement.status === 'ERROR';
      return true;
    });
  }, [paidCharges, filterSettle]);

  if (loading && !status) {
    return (
      <div className="flex h-80 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-pink-600" />
      </div>
    );
  }

  return (
    <div className="p-3 md:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-pink-100 dark:bg-pink-900/30">
            <Activity className="h-5 w-5 text-pink-600 dark:text-pink-400" />
          </div>
          <div>
            <h1 className="text-lg md:text-2xl font-bold text-slate-900 dark:text-white">
              Monitor de Retorno & Conciliação (Banco Cora)
            </h1>
            <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400">
              Acompanhamento em tempo real dos boletos pagos no Cora, varredura automática (30 min / Webhook) e baixa no Horus ERP (<code className="font-mono">LANCTOS_CRECEBER</code> + <code className="font-mono">BLANCTOS</code>)
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/settings?tab=pagamentos"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Settings className="h-4 w-4 text-slate-500" />
            Parametrizar Banco / Baixa
          </Link>
          <button
            type="button"
            onClick={handleRunSyncNow}
            disabled={runningSync}
            className="inline-flex items-center gap-2 rounded-xl bg-pink-600 hover:bg-pink-700 px-4 py-2 text-xs md:text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-50"
          >
            {runningSync ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Executar Varredura Agora
          </button>
        </div>
      </div>

      {/* Cards de Status Operacional */}
      {status && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Card 1: Motor de Sincronização (Job 30m + Webhook) */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Motor de Conciliação
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Job 30 min Ativo
              </span>
            </div>
            <div className="text-base font-bold text-slate-900 dark:text-white">
              {status.open_monitored_qty} boleto(s) em aberto
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Última checagem: <b className="text-slate-700 dark:text-slate-200">{fmtDateTime(status.last_sync_at)}</b>
            </p>
            <p className="text-[11px] text-slate-500 flex items-center gap-1">
              {status.webhook_registered ? (
                <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Webhook tempo real ativo ({status.webhook_environment})</>
              ) : (
                <><Clock className="h-3.5 w-3.5 text-amber-500" /> Usando varredura automática de 30 min</>
              )}
            </p>
          </div>

          {/* Card 2: Destino de Baixa (Horus ERP / Cronuz) */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Baixa Automática ERP
              </span>
              {status.horus_enabled ? (
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                  status.horus_baixa_enabled
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    : 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                }`}>
                  <Database className="h-3 w-3" />
                  {status.horus_baixa_enabled ? 'Horus ERP Ativo' : 'Horus Inativo'}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-[10px] font-bold text-indigo-700 dark:text-indigo-300">
                  Cronuz Nativo
                </span>
              )}
            </div>
            <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
              {status.horus_enabled
                ? (status.horus_bank_summary || 'Parametrize Banco/Agência/Conta')
                : (status.cronuz_baixa_enabled ? 'Livro Caixa Cronuz Ativo' : 'Baixa Nativa Desativada')}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {status.horus_enabled
                ? 'Atualiza Contas a Receber e gera BLANCTOS aberto'
                : 'Liquida parcelas nativas do Cronuz B2B'}
            </p>
          </div>

          {/* Card 3: Boletos Liquidados & Baixados */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Liquidados & Baixados
              </span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
              {status.settled_qty} <span className="text-sm font-medium text-slate-400">/ {status.paid_total_qty} pagos</span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Boletos pagos no Cora com baixa concluída
            </p>
          </div>

          {/* Card 4: Pendentes / Alertas de Baixa */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Fila de Baixa / Alertas
              </span>
              <AlertTriangle className={`h-4 w-4 ${status.error_settlement_qty > 0 ? 'text-rose-500' : 'text-amber-500'}`} />
            </div>
            <div className="text-2xl font-extrabold text-slate-900 dark:text-white">
              {status.pending_settlement_qty} <span className="text-xs font-semibold text-amber-600">pendente(s)</span>
              {status.error_settlement_qty > 0 && (
                <span className="ml-2 text-xs font-bold text-rose-600">· {status.error_settlement_qty} alerta(s)</span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Você pode disparar ou reprocessar a baixa com 1 clique abaixo
            </p>
          </div>
        </div>
      )}

      {/* Abas de Visualização */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('paid')}
            className={`rounded-xl px-4 py-2 text-xs md:text-sm font-bold transition-colors ${
              activeTab === 'paid'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            Boletos Pagos & Status de Baixa ({paidCharges.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('events')}
            className={`rounded-xl px-4 py-2 text-xs md:text-sm font-bold transition-colors ${
              activeTab === 'events'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            Log de Eventos em Tempo Real ({events.length})
          </button>
        </div>

        {activeTab === 'paid' && (
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {([
              ['ALL', 'Todos'],
              ['SETTLED', 'Baixados'],
              ['PENDING', 'Pendentes de Baixa'],
              ['ERROR', 'Com Alerta'],
            ] as const).map(([code, label]) => (
              <button
                key={code}
                type="button"
                onClick={() => setFilterSettle(code)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  filterSettle === code
                    ? 'bg-pink-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ABA 1: Boletos Pagos & Status de Baixa */}
      {activeTab === 'paid' && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          {filteredPaidCharges.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Nenhum boleto pago encontrado para o filtro selecionado. Assim que um boleto for pago no Cora (detectado via Webhook, Job de 30 min ou sincronização manual), ele aparecerá aqui com o status da baixa.
            </div>
          ) : (
            <table className="w-full text-left text-xs md:text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-[11px] font-bold uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3">Boleto / Origem</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Pagamento no Cora</th>
                  <th className="px-4 py-3">Situação da Baixa (Horus / Cronuz)</th>
                  <th className="px-4 py-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredPaidCharges.map(item => {
                  const st = item.settlement.status;
                  const isBusy = settlingId === item.id;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-bold text-slate-900 dark:text-white font-mono">
                          #{item.id} · {item.code}
                        </div>
                        <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-1.5 mt-0.5">
                          {item.invoice_number && (
                            <span className="rounded bg-pink-50 dark:bg-pink-950/40 px-1.5 py-0.5 font-mono font-semibold text-pink-700 dark:text-pink-300">
                              NF {item.invoice_number}
                            </span>
                          )}
                          {item.financial_launch_id && (
                            <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 font-mono">
                              Lanç. CR #{item.financial_launch_id}
                            </span>
                          )}
                          {item.installment_number && (
                            <span>Parc. {item.installment_number}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-800 dark:text-slate-100 truncate max-w-[220px]">
                          {item.payer_name || '-'}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {item.payer_document || '-'}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                          {fmtBRL(item.total_paid ?? item.amount)}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Pago em {fmtDateTime(item.paid_at)} · via <b>{item.settlement.paid_detected_by || 'SYNC'}</b>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {st === 'SETTLED_HORUS' && (
                          <div className="space-y-0.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Baixado no Horus ERP + BLANCTOS
                              </span>
                              {item.settlement.cpagar_tarifa_settled && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-pink-500/15 px-2 py-0.5 text-[10px] font-bold text-pink-700 dark:text-pink-300">
                                  + Taxa CAP Baixada
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 max-w-md">{item.settlement.message}</p>
                          </div>
                        )}
                        {st === 'SETTLED_CRONUZ' && (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Baixado no Cronuz B2B
                            </span>
                            <p className="text-[11px] text-slate-500 max-w-md">{item.settlement.message}</p>
                          </div>
                        )}
                        {st === 'PENDING' && (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 dark:text-amber-300">
                              <Clock className="h-3.5 w-3.5" /> Aguardando Baixa no ERP
                            </span>
                            <p className="text-[11px] text-slate-500">
                              Verifique se a chave de Baixa Automática está ativa e clique em Baixar Agora.
                            </p>
                          </div>
                        )}
                        {st === 'ERROR' && (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2.5 py-0.5 text-[11px] font-bold text-rose-700 dark:text-rose-300">
                              <AlertTriangle className="h-3.5 w-3.5" /> Alerta na Baixa
                            </span>
                            <p className="text-[11px] text-rose-600 dark:text-rose-400 max-w-md">
                              {item.settlement.message}
                            </p>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {st !== 'SETTLED_HORUS' && st !== 'SETTLED_CRONUZ' ? (
                          <button
                            type="button"
                            onClick={() => handleSettleCharge(item.id)}
                            disabled={isBusy}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-pink-600 hover:bg-pink-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-50"
                          >
                            {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                            Baixar Agora
                          </button>
                        ) : (
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-[11px] font-mono text-slate-400">
                              {fmtDateTime(item.settlement.settled_at)}
                            </span>
                            {st === 'SETTLED_HORUS' && !item.settlement.cpagar_tarifa_settled && (
                              <button
                                type="button"
                                onClick={() => handleSettleCharge(item.id)}
                                disabled={isBusy}
                                title="Caso você tenha ativado a Taxa no Contas a Pagar após esta baixa, clique para lançar a tarifa no Horus."
                                className="inline-flex items-center gap-1 rounded-md border border-pink-200 dark:border-pink-800 px-2 py-0.5 text-[10px] font-semibold text-pink-600 dark:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-950/30 transition-colors disabled:opacity-50"
                              >
                                {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                                Lançar Taxa CAP
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ABA 2: Log de Eventos em Tempo Real */}
      {activeTab === 'events' && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          {events.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Nenhum evento registrado ainda.
            </div>
          ) : (
            <table className="w-full text-left text-xs md:text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-[11px] font-bold uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3">Data / Hora</th>
                  <th className="px-4 py-3">Origem</th>
                  <th className="px-4 py-3">Evento</th>
                  <th className="px-4 py-3">Boleto / NF / Lançamento</th>
                  <th className="px-4 py-3">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {events.map(ev => (
                  <tr key={ev.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-slate-500">
                      {fmtDateTime(ev.created_at)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-700 dark:text-slate-300">
                        {ev.source}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-semibold text-slate-800 dark:text-slate-200">
                      {ev.event_type}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">
                      #{ev.charge_id}
                      {ev.invoice_number ? ` · NF ${ev.invoice_number}` : ''}
                      {ev.financial_launch_id ? ` · CR #${ev.financial_launch_id}` : ''}
                      {` · ${fmtBRL(ev.amount)}`}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                      {ev.message || `${ev.status_before || '-'} → ${ev.status_after || '-'}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
