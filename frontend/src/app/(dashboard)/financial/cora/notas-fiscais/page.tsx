'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Search, Loader2, FileText, Calendar, Hash, RefreshCw, CheckCircle2,
  Lock, ChevronDown, ChevronUp, FileDown, Copy, ExternalLink, Send, X, Building2,
  AlertTriangle, ListChecks, CheckSquare, Square, SlidersHorizontal, Printer, Play, Pause,
  Zap, Trash2, ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { getUser } from '@/lib/auth';
import { CurrencyInput } from '@/components/CurrencyInput';
import {
  Charge, StatusBadge, brl, copyText, fmtDate, maskDoc, openMergedChargesPdf, paymentsApi,
} from '@/components/payments/chargeUi';

interface InvoiceInstallment {
  installment_number: string;
  installment_label: string;
  raw_dup_number: string;
  due_date: string;
  amount: number;
  financial_launch_id: string | null;
  payment_form: string;
  horus_status: string;
  origin_ref: string;
  description: string;
  has_existing_boleto: boolean;
  existing_boleto_source: 'CORA' | 'HORUS' | null;
  existing_charge: Charge | null;
  existing_digitable_line: string | null;
  existing_our_number: string | null;
}

interface HorusInvoiceItem {
  nro_nota_fiscal: string;
  serie_fiscal: string;
  cod_nf: string;
  cod_ped_venda: string | null;
  cod_pedido_origem: string | null;
  cod_cli: string | null;
  cod_metodo: number | string | null;
  desc_metodo: string;
  natureza_operacao: string | null;
  chave_acesso_nfe: string | null;
  status_nf: string;
  issue_date: string | null;
  vlr_bruto_nf: number;
  vlr_liquido_nf: number;
  customer_id: number | null;
  horus_id_guid: string | null;
  payer: {
    name: string;
    document: string;
    email: string;
    street: string;
    number: string;
    complement: string;
    district: string;
    city: string;
    state: string;
    zip_code: string;
  };
  installments_count: number;
  emitted_count: number;
  pending_count: number;
  pending_amount: number;
  emission_status: 'ALL_EMITTED' | 'PARTIAL' | 'PENDING';
  cora_charge_ids?: number[];
  auto_emit_ready?: boolean;
  auto_emit_issues?: string[];
  installments: InvoiceInstallment[];
}

interface PaymentFormCatalogItem {
  code: string;
  name: string;
}

interface HorusInvoicesResponse {
  horus_enabled: boolean;
  date_from: string;
  date_to: string;
  payment_forms_catalog?: PaymentFormCatalogItem[];
  allowed_payment_forms?: string[];
  auto_emit_enabled?: boolean;
  hidden_by_payment_form_count?: number;
  summary: {
    total_invoices: number;
    total_installments: number;
    pending_installments: number;
    emitted_installments: number;
    total_amount: number;
    pending_amount: number;
    auto_emit_ready_invoices?: number;
    auto_emit_ready_installments?: number;
  };
  items: HorusInvoiceItem[];
}

const inputCls = 'w-full h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs md:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500/40';
const btnCls = 'inline-flex items-center justify-center gap-2 h-10 px-3.5 rounded-xl text-xs md:text-sm font-semibold transition-colors disabled:opacity-50';

const isoDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export default function CoraHorusInvoicesPage() {
  const companyId = getUser()?.company_id;
  const todayStr = isoDate(new Date());
  const threeDaysAgoStr = isoDate(new Date(Date.now() - 3 * 86400000));

  const [dateFrom, setDateFrom] = useState(threeDaysAgoStr);
  const [dateTo, setDateTo] = useState(todayStr);
  const [preset, setPreset] = useState<'today' | '3d' | '7d' | 'custom'>('3d');
  const [codPedVenda, setCodPedVenda] = useState('');
  const [nroNotaFiscal, setNroNotaFiscal] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'EMITTED'>('ALL');

  const [data, setData] = useState<HorusInvoicesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedNfs, setExpandedNfs] = useState<Record<string, boolean>>({});
  const [pdfBusyId, setPdfBusyId] = useState<number | string | null>(null);
  const [emitModalInvoice, setEmitModalInvoice] = useState<HorusInvoiceItem | null>(null);
  const [showPaymentFormsModal, setShowPaymentFormsModal] = useState(false);
  const [showBatchEmitModal, setShowBatchEmitModal] = useState(false);
  const [showPrintQueueModal, setShowPrintQueueModal] = useState(false);

  // Fila de Impressão local + persistente por empresa
  const [printQueue, setPrintQueue] = useState<Charge[]>([]);
  const [autoRunning, setAutoRunning] = useState(false);
  const [togglingAuto, setTogglingAuto] = useState(false);
  const autoProcessedRefs = useRef<Set<string>>(new Set());

  const queueStorageKey = companyId ? `cora_nf_print_queue_${companyId}` : null;

  useEffect(() => {
    if (!queueStorageKey) return;
    try {
      const raw = localStorage.getItem(queueStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setPrintQueue(parsed);
      }
    } catch {
      // ignore
    }
  }, [queueStorageKey]);

  const appendToPrintQueue = useCallback((newCharges: Charge[]) => {
    if (!newCharges?.length) return;
    setPrintQueue(prev => {
      const byId = new Map<number, Charge>();
      prev.forEach(c => byId.set(c.id, c));
      newCharges.forEach(c => byId.set(c.id, c));
      const next = Array.from(byId.values());
      if (queueStorageKey) {
        try {
          localStorage.setItem(queueStorageKey, JSON.stringify(next));
        } catch {
          // ignore
        }
      }
      return next;
    });
  }, [queueStorageKey]);

  const removeFromPrintQueue = useCallback((idsToRemove: number[]) => {
    const rmSet = new Set(idsToRemove);
    setPrintQueue(prev => {
      const next = prev.filter(c => !rmSet.has(c.id));
      if (queueStorageKey) {
        try {
          localStorage.setItem(queueStorageKey, JSON.stringify(next));
        } catch {
          // ignore
        }
      }
      return next;
    });
  }, [queueStorageKey]);

  const clearPrintQueue = useCallback(() => {
    setPrintQueue([]);
    if (queueStorageKey) {
      try {
        localStorage.removeItem(queueStorageKey);
      } catch {
        // ignore
      }
    }
  }, [queueStorageKey]);

  const load = useCallback(async (overrideDates?: { from: string; to: string }, forceRefresh = false) => {
    if (!companyId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const df = overrideDates ? overrideDates.from : dateFrom;
      const dt = overrideDates ? overrideDates.to : dateTo;
      const qs = new URLSearchParams({ provider: 'CORA', status_filter: statusFilter });
      if (df) qs.set('date_from', df);
      if (dt) qs.set('date_to', dt);
      if (codPedVenda.trim()) qs.set('cod_ped_venda', codPedVenda.trim());
      if (nroNotaFiscal.trim()) qs.set('nro_nota_fiscal', nroNotaFiscal.trim());
      if (search.trim()) qs.set('search', search.trim());
      if (forceRefresh) qs.set('force_refresh', 'true');

      const res = await paymentsApi<HorusInvoicesResponse>(companyId, `/horus-invoices?${qs.toString()}`);
      setData(res);
      const autoExpand: Record<string, boolean> = {};
      res.items.slice(0, 5).forEach(it => {
        if (it.installments_count > 1) autoExpand[it.nro_nota_fiscal] = true;
      });
      setExpandedNfs(prev => ({ ...autoExpand, ...prev }));
    } catch (e: any) {
      const msg = e.message || 'Falha ao consultar Notas Fiscais no Horus.';
      setLoadError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [companyId, dateFrom, dateTo, codPedVenda, nroNotaFiscal, search, statusFilter]);

  useEffect(() => {
    load();
  }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rotina Automática (Play): quando habilitada e houver notas prontas elegíveis ainda não processadas, emite e envia para a Fila de Impressão
  useEffect(() => {
    if (!companyId || !data?.auto_emit_enabled || autoRunning || loading) return;
    if (!data.allowed_payment_forms?.length) return;

    const todayIso = isoDate(new Date());
    const eligibleInvoices = data.items.filter(inv => {
      if (!inv.auto_emit_ready || inv.pending_count === 0) return false;
      const pendingNew = inv.installments.filter(
        inst =>
          !inst.has_existing_boleto &&
          inst.amount > 0 &&
          inst.due_date >= todayIso &&
          !autoProcessedRefs.current.has(inst.origin_ref)
      );
      return pendingNew.length > 0;
    });

    if (eligibleInvoices.length === 0) return;

    let cancelled = false;
    const runAutoBatch = async () => {
      setAutoRunning(true);
      try {
        const payloadInvoices = eligibleInvoices.map(inv => {
          const pendingNew = inv.installments.filter(
            inst =>
              !inst.has_existing_boleto &&
              inst.amount > 0 &&
              inst.due_date >= todayIso &&
              !autoProcessedRefs.current.has(inst.origin_ref)
          );
          pendingNew.forEach(inst => autoProcessedRefs.current.add(inst.origin_ref));
          return {
            nro_nota_fiscal: inv.nro_nota_fiscal,
            serie_fiscal: inv.serie_fiscal,
            cod_nf: inv.cod_nf,
            cod_ped_venda: inv.cod_ped_venda,
            cod_pedido_origem: inv.cod_pedido_origem,
            horus_cod_cli: inv.cod_cli,
            horus_id_guid: inv.horus_id_guid,
            customer_id: inv.customer_id,
            issue_date: inv.issue_date,
            chave_acesso_nfe: inv.chave_acesso_nfe,
            payer: {
              ...inv.payer,
              email: inv.payer.email || null,
              complement: inv.payer.complement || null,
            },
            installments: pendingNew.map(r => ({
              installment_number: r.installment_number,
              due_date: r.due_date,
              amount: r.amount,
              financial_launch_id: r.financial_launch_id,
              origin_ref: r.origin_ref,
              description: r.description,
            })),
          };
        });

        const res = await paymentsApi<{
          created_count: number;
          error_count: number;
          charges: Charge[];
          errors: { nro_nota_fiscal: string; error: string }[];
        }>(companyId, '/horus-invoices/emit-batch', {
          method: 'POST',
          body: JSON.stringify({
            provider: 'CORA',
            method: 'BOLETO',
            invoices: payloadInvoices,
          }),
        });

        if (!cancelled) {
          if (res.charges?.length) {
            appendToPrintQueue(res.charges);
            toast.success(
              `Rotina Automática: ${res.created_count} boleto(s) emitido(s) e enviado(s) para a Fila de Impressão!`
            );
          }
          if (res.error_count > 0) {
            toast.warning(`${res.error_count} nota(s) apresentaram alerta na emissão automática.`);
          }
          load(undefined, false);
        }
      } catch (e: any) {
        if (!cancelled) {
          toast.error(e.message || 'Erro ao executar ciclo automático de emissão.');
        }
      } finally {
        if (!cancelled) setAutoRunning(false);
      }
    };

    runAutoBatch();
    return () => {
      cancelled = true;
    };
  }, [companyId, data, autoRunning, loading, appendToPrintQueue, load]);

  // Ciclo periódico a cada 180s enquanto o botão Play (Modo Automático) estiver ativo
  useEffect(() => {
    if (!data?.auto_emit_enabled) return;
    const timer = setInterval(() => {
      if (!loading && !autoRunning) {
        load(undefined, true);
      }
    }, 180000);
    return () => clearInterval(timer);
  }, [data?.auto_emit_enabled, loading, autoRunning, load]);

  const toggleAutoEmit = async () => {
    if (!companyId || !data) return;
    const nextEnabled = !data.auto_emit_enabled;
    if (nextEnabled && !data.allowed_payment_forms?.length) {
      toast.warning(
        'Por segurança, configure primeiro quais Formas de Pagamento (ex.: Boleto Cora) devem ser exibidas antes de ativar o Modo Automático.'
      );
      setShowPaymentFormsModal(true);
      return;
    }
    setTogglingAuto(true);
    try {
      const res = await paymentsApi<{ auto_emit_enabled: boolean }>(
        companyId,
        '/horus-invoices/auto-emit',
        {
          method: 'PUT',
          body: JSON.stringify({ provider: 'CORA', enabled: nextEnabled }),
        }
      );
      setData(prev => (prev ? { ...prev, auto_emit_enabled: res.auto_emit_enabled } : prev));
      toast.success(
        res.auto_emit_enabled
          ? 'Modo Automático (Play) ATIVADO! As notas elegíveis serão emitidas e enviadas para a Fila de Impressão.'
          : 'Modo Automático PAUSADO.'
      );
    } catch (e: any) {
      toast.error(e.message || 'Falha ao alternar Modo Automático.');
    } finally {
      setTogglingAuto(false);
    }
  };

  const handlePreset = (p: 'today' | '3d' | '7d') => {
    const now = new Date();
    const to = isoDate(now);
    const from =
      p === 'today'
        ? to
        : p === '3d'
        ? isoDate(new Date(now.getTime() - 3 * 86400000))
        : isoDate(new Date(now.getTime() - 7 * 86400000));
    setPreset(p);
    setDateFrom(from);
    setDateTo(to);
    load({ from, to });
  };

  const toggleExpand = (nroNf: string) => {
    setExpandedNfs(prev => ({ ...prev, [nroNf]: !prev[nroNf] }));
  };

  const openPdf = async (chargeId: number) => {
    if (!companyId) return;
    setPdfBusyId(chargeId);
    try {
      const r = await paymentsApi<{ url: string }>(companyId, `/charges/${chargeId}/pdf`);
      window.open(r.url, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setPdfBusyId(null);
    }
  };

  const printMultipleCharges = async (chargeIds: number[], busyKey: string | number) => {
    if (!companyId || !chargeIds.length) return;
    setPdfBusyId(busyKey);
    try {
      await openMergedChargesPdf(companyId, chargeIds);
    } catch (e: any) {
      toast.error(e.message || 'Falha ao gerar PDF unificado para impressão.');
    } finally {
      setPdfBusyId(null);
    }
  };

  const copy = async (text: string | null, label: string) => {
    if (await copyText(text)) toast.success(`${label} copiado(a).`);
  };

  const s = data?.summary;
  const readyInvoicesCount = s?.auto_emit_ready_invoices ?? 0;
  const readyInstallmentsCount = s?.auto_emit_ready_installments ?? 0;

  // Coleta todos os boletos Cora emitidos no período visível (para importar rapidamente na fila de impressão se desejado)
  const periodCoraCharges: Charge[] = React.useMemo(() => {
    if (!data?.items) return [];
    const list: Charge[] = [];
    const seen = new Set<number>();
    data.items.forEach(nf => {
      nf.installments.forEach(inst => {
        if (inst.existing_charge && !seen.has(inst.existing_charge.id)) {
          seen.add(inst.existing_charge.id);
          list.push(inst.existing_charge);
        }
      });
    });
    return list;
  }, [data]);

  return (
    <div className="p-3 md:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Cabeçalho + Central de Operação Rápida (Play / Emissão em Lote / Fila de Impressão) */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/financial/cora" className="p-2.5 rounded-2xl bg-pink-500/10 border border-pink-500/20 text-pink-600">
            <FileText className="h-6 w-6" />
          </Link>
          <div>
            <h1 className="text-lg md:text-2xl font-bold text-slate-900 dark:text-white">Notas Fiscais Emitidas (Horus ERP)</h1>
            <p className="text-xs md:text-sm text-slate-500">
              Emissão inteligente 100% via API Horus com geração em lote, modo automático e impressão unificada
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Botão Play / Pause (Modo Automático) */}
          <button
            type="button"
            onClick={toggleAutoEmit}
            disabled={togglingAuto || loading}
            title={
              data?.auto_emit_enabled
                ? 'Modo Automático ATIVO: emite automaticamente as notas elegíveis e envia para a Fila de Impressão. Clique para pausar.'
                : 'Ativar Modo Automático (Play): emite boletos das notas filtradas automaticamente e envia para a Fila de Impressão.'
            }
            className={`${btnCls} border ${
              data?.auto_emit_enabled
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50'
            }`}
          >
            {togglingAuto || autoRunning ? (
              <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
            ) : data?.auto_emit_enabled ? (
              <>
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <Pause className="h-3.5 w-3.5" />
                <span>Automático: Ativo</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 text-emerald-600 fill-emerald-600" />
                <span>Modo Automático</span>
              </>
            )}
          </button>

          {/* Botão Seguro de Emissão em Lote quando houver notas pendentes elegíveis */}
          {readyInstallmentsCount > 0 && (
            <button
              type="button"
              onClick={() => setShowBatchEmitModal(true)}
              className={`${btnCls} bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm`}
            >
              <Zap className="h-4 w-4" />
              Emitir Pendentes ({readyInstallmentsCount})
            </button>
          )}

          {/* Botão da Fila de Impressão Unificada */}
          <button
            type="button"
            onClick={() => setShowPrintQueueModal(true)}
            className={`${btnCls} relative border ${
              printQueue.length > 0
                ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
                : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
            }`}
          >
            <Printer className="h-4 w-4" />
            <span>Fila de Impressão</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[11px] font-mono font-bold ${
                printQueue.length > 0
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
              }`}
            >
              {printQueue.length}
            </span>
          </button>

          <Link href="/financial/cora/boletos" className={`${btnCls} border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200`}>
            <ListChecks className="h-4 w-4" /> Boletos
          </Link>

          <button
            type="button"
            onClick={() => load(undefined, true)}
            disabled={loading}
            className={`${btnCls} bg-pink-600 hover:bg-pink-700 text-white`}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Consultar Horus
          </button>
        </div>
      </div>

      {/* KPIs do período */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Notas fiscais no período</p>
          <p className="mt-1 text-base md:text-xl font-bold text-slate-900 dark:text-white">{brl(s?.total_amount)}</p>
          <p className="text-xs text-slate-500">
            {s?.total_invoices ?? 0} nota(s) · {s?.total_installments ?? 0} parcela(s)
            {!!data?.allowed_payment_forms?.length && (
              <span className="ml-1 text-pink-600 dark:text-pink-400 font-medium">
                (Filtro: {data.allowed_payment_forms.join(', ')})
              </span>
            )}
          </p>
        </div>
        <div className="rounded-2xl border border-pink-200/80 dark:border-pink-900/50 bg-pink-50/40 dark:bg-pink-950/20 p-3.5 flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-pink-700 dark:text-pink-300">Pendentes de boleto</p>
            <p className="mt-1 text-base md:text-xl font-bold text-pink-900 dark:text-pink-100">{brl(s?.pending_amount)}</p>
            <p className="text-xs text-pink-700/80 dark:text-pink-300/80">
              {s?.pending_installments ?? 0} parcela(s) · {readyInvoicesCount} NF(s) validada(s) p/ lote
            </p>
          </div>
          {readyInstallmentsCount > 0 && (
            <button
              type="button"
              onClick={() => setShowBatchEmitModal(true)}
              className="shrink-0 px-3 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white text-xs font-semibold shadow-sm"
            >
              Emitir Lote
            </button>
          )}
        </div>
        <div className="rounded-2xl border border-emerald-200/70 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 p-3.5 flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Parcelas já com boleto</p>
            <p className="mt-1 text-base md:text-xl font-bold text-emerald-900 dark:text-emerald-100">{s?.emitted_installments ?? 0}</p>
            <p className="text-xs text-emerald-700/80 dark:text-emerald-300/80">Bloqueadas contra emissão duplicada</p>
          </div>
          {periodCoraCharges.length > 0 && (
            <button
              type="button"
              disabled={pdfBusyId === 'period-all'}
              onClick={() => printMultipleCharges(periodCoraCharges.map(c => c.id), 'period-all')}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm disabled:opacity-50"
              title="Abrir um único PDF com todos os boletos Cora emitidos neste período"
            >
              {pdfBusyId === 'period-all' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
              Imprimir ({periodCoraCharges.length})
            </button>
          )}
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Atalhos de Período */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-500 mr-1 inline-flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" /> Período de emissão:
            </span>
            {([
              ['today', 'Hoje'],
              ['3d', 'Últimos 3 dias'],
              ['7d', 'Últimos 7 dias'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => handlePreset(key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                  preset === key
                    ? 'bg-pink-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
            <div className="flex items-center gap-1.5 ml-1">
              <input
                type="date"
                value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); setPreset('custom'); }}
                className="h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs"
              />
              <span className="text-xs text-slate-400">até</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => { setDateTo(e.target.value); setPreset('custom'); }}
                className="h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs"
              />
            </div>
          </div>

          {/* Filtro rápido por Status de Emissão + botão discreto de Formas de Pagamento */}
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {([
              ['ALL', 'Todas as notas'],
              ['PENDING', 'Com parcelas pendentes'],
              ['EMITTED', 'Com boletos emitidos'],
            ] as const).map(([st, label]) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                  statusFilter === st
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowPaymentFormsModal(true)}
              title={
                data?.allowed_payment_forms?.length
                  ? `Formas de pagamento filtradas (${data.allowed_payment_forms.join(', ')})`
                  : 'Configurar formas de pagamento exibidas'
              }
              className={`relative shrink-0 p-1.5 rounded-lg border transition-colors ${
                data?.allowed_payment_forms?.length
                  ? 'border-pink-300 dark:border-pink-800 bg-pink-50/70 dark:bg-pink-950/30 text-pink-600 dark:text-pink-400'
                  : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {!!data?.allowed_payment_forms?.length && (
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-pink-600" />
              )}
            </button>
          </div>
        </div>

        {/* Linha de busca por COD_PED_VENDA, Nº da Nota Fiscal e Cliente */}
        <form
          onSubmit={e => { e.preventDefault(); load(); }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800"
        >
          <div className="relative lg:col-span-3">
            <Hash className="h-4 w-4 text-slate-400 absolute left-3 top-3" />
            <input
              value={codPedVenda}
              onChange={e => setCodPedVenda(e.target.value)}
              placeholder="Cód. Pedido Horus (COD_PED_VENDA)"
              className={`${inputCls} pl-9 font-mono`}
            />
          </div>
          <div className="relative lg:col-span-3">
            <FileText className="h-4 w-4 text-slate-400 absolute left-3 top-3" />
            <input
              value={nroNotaFiscal}
              onChange={e => setNroNotaFiscal(e.target.value)}
              placeholder="Nº da Nota Fiscal (NRO_NOTA_FISCAL)"
              className={`${inputCls} pl-9 font-mono`}
            />
          </div>
          <div className="relative lg:col-span-4">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-3" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cliente, Razão Social ou CPF/CNPJ..."
              className={`${inputCls} pl-9`}
            />
          </div>
          <div className="lg:col-span-2 flex gap-2">
            <button type="submit" disabled={loading} className={`${btnCls} flex-1 bg-slate-900 dark:bg-white text-white dark:text-slate-900`}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Filtrar
            </button>
          </div>
        </form>
      </div>

      {/* Aviso se Horus não estiver habilitado */}
      {data && !data.horus_enabled && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-800 dark:bg-amber-950/20 dark:border-amber-900 dark:text-amber-300 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          A integração com o Horus ERP não está ativa para esta empresa. Configure o Horus para consultar as Notas Fiscais emitidas.
        </div>
      )}

      {/* Alerta explícito de erro na consulta */}
      {loadError && (
        <div className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-xs md:text-sm text-rose-900 dark:bg-rose-950/30 dark:border-rose-800 dark:text-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
            <div>
              <p className="font-bold">Falha ao consultar Notas Fiscais no Horus ERP</p>
              <p className="mt-0.5 text-rose-700 dark:text-rose-300">{loadError}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => load(undefined, true)}
            disabled={loading}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Tentar novamente
          </button>
        </div>
      )}

      {/* Tabela de Notas Fiscais e Parcelas */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        {loading && !data ? (
          <div className="flex h-56 items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin text-pink-600" /> Consultando Notas Fiscais na API do Horus ERP...
          </div>
        ) : !data?.items.length ? (
          <div className="p-10 text-center space-y-1">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Nenhuma Nota Fiscal localizada no período ou filtro informado.</p>
            <p className="text-xs text-slate-500">
              {data?.hidden_by_payment_form_count
                ? `${data.hidden_by_payment_form_count} nota(s) foram ocultadas pelo filtro de Formas de Pagamento configurado.`
                : 'Tente ampliar o período de datas ou pesquisar diretamente pelo código de pedido Horus (COD_PED_VENDA).'}
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-xs md:text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-[11px] uppercase text-slate-500">
              <tr>
                <th className="px-3 py-3 w-8"></th>
                <th className="px-3 py-3">Nota Fiscal / Emissão</th>
                <th className="px-3 py-3">Pedido Horus</th>
                <th className="px-3 py-3">Cliente / Destinatário</th>
                <th className="px-3 py-3 text-center">Parcelas (XML / CR)</th>
                <th className="px-3 py-3 text-right">Valor Líquido NF</th>
                <th className="px-3 py-3 text-right">Emissão / Impressão</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.items.map(nf => {
                const isExpanded = !!expandedNfs[nf.nro_nota_fiscal];
                const coraIds = nf.cora_charge_ids || [];
                const nfPrintBusyKey = `nf-${nf.nro_nota_fiscal}`;
                return (
                  <React.Fragment key={`${nf.cod_nf}-${nf.nro_nota_fiscal}`}>
                    <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => toggleExpand(nf.nro_nota_fiscal)}
                          className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                          title={isExpanded ? 'Recolher parcelas' : 'Ver parcelas da Nota Fiscal'}
                        >
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">
                            NF {nf.nro_nota_fiscal}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-500">
                            Série {nf.serie_fiscal}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Emitida em {fmtDate(nf.issue_date)}
                          {nf.desc_metodo ? ` · ${nf.desc_metodo}` : ''}
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {nf.cod_ped_venda ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-mono text-xs font-bold">
                            #{nf.cod_ped_venda}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                        {nf.cod_pedido_origem && nf.cod_pedido_origem !== '0' && (
                          <span className="block text-[10px] text-slate-400 font-mono mt-0.5">
                            Orig: {nf.cod_pedido_origem}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-semibold text-slate-900 dark:text-white">{nf.payer.name}</div>
                        <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
                          <span className="font-mono">{maskDoc(nf.payer.document)}</span>
                          {nf.cod_cli && <span className="text-[10px] text-slate-400">Cód. Horus #{nf.cod_cli}</span>}
                          {nf.payer.city && (
                            <span className="text-[10px] text-slate-400">
                              · {nf.payer.city}/{nf.payer.state}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => toggleExpand(nf.nro_nota_fiscal)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border transition-colors ${
                            nf.emission_status === 'ALL_EMITTED'
                              ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-300'
                              : nf.emission_status === 'PARTIAL'
                              ? 'bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-300'
                              : 'bg-pink-500/10 text-pink-700 border-pink-500/20 dark:text-pink-300'
                          }`}
                        >
                          {nf.installments_count} {nf.installments_count === 1 ? 'parcela' : 'parcelas'}
                          <span className="text-[10px] opacity-80">
                            ({nf.emitted_count}/{nf.installments_count} emitida{nf.installments_count > 1 ? 's' : ''})
                          </span>
                        </button>
                      </td>
                      <td className="px-3 py-3 text-right font-mono font-bold whitespace-nowrap text-slate-900 dark:text-white">
                        {brl(nf.vlr_liquido_nf)}
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {coraIds.length > 0 && (
                            <button
                              type="button"
                              disabled={pdfBusyId === nfPrintBusyKey}
                              onClick={() => printMultipleCharges(coraIds, nfPrintBusyKey)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 text-xs font-semibold transition-colors disabled:opacity-50"
                              title={
                                coraIds.length === 1
                                  ? 'Imprimir boleto desta Nota Fiscal'
                                  : `Imprimir todos os ${coraIds.length} boletos desta Nota Fiscal de uma só vez (PDF único)`
                              }
                            >
                              {pdfBusyId === nfPrintBusyKey ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Printer className="h-3.5 w-3.5" />
                              )}
                              Imprimir {coraIds.length > 1 ? `(${coraIds.length})` : ''}
                            </button>
                          )}

                          {nf.pending_count > 0 ? (
                            <button
                              type="button"
                              onClick={() => setEmitModalInvoice(nf)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-white text-xs font-semibold shadow-sm transition-colors"
                            >
                              <Send className="h-3.5 w-3.5" />
                              Emitir {nf.pending_count === 1 ? '1 boleto' : `${nf.pending_count} boletos`}
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Boleto(s) emitido(s)
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Sub-tabela de Parcelas da Nota Fiscal */}
                    {isExpanded && (
                      <tr className="bg-slate-50/70 dark:bg-slate-950/50">
                        <td colSpan={7} className="px-4 py-3">
                          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                            <div className="px-3.5 py-2 bg-slate-100/70 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                              <span className="font-bold text-slate-700 dark:text-slate-200">
                                Detalhamento das Parcelas da NF {nf.nro_nota_fiscal} ({nf.installments_count}x)
                              </span>
                              <div className="flex flex-wrap items-center gap-2">
                                {nf.chave_acesso_nfe && (
                                  <span className="font-mono text-[10px] text-slate-400">
                                    Chave NF-e: {nf.chave_acesso_nfe}
                                  </span>
                                )}
                                {coraIds.length > 1 && (
                                  <button
                                    type="button"
                                    disabled={pdfBusyId === nfPrintBusyKey}
                                    onClick={() => printMultipleCharges(coraIds, nfPrintBusyKey)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold"
                                  >
                                    {pdfBusyId === nfPrintBusyKey ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Printer className="h-3 w-3" />
                                    )}
                                    Imprimir todas as {coraIds.length} parcelas de uma vez
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-xs">
                                <thead className="text-[10px] uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800">
                                  <tr>
                                    <th className="px-3 py-2">Parcela</th>
                                    <th className="px-3 py-2">Vencimento</th>
                                    <th className="px-3 py-2">Lanç. CR Horus</th>
                                    <th className="px-3 py-2">Forma</th>
                                    <th className="px-3 py-2 text-right">Valor da Parcela</th>
                                    <th className="px-3 py-2">Situação do Boleto</th>
                                    <th className="px-3 py-2 text-right">Ações</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                  {nf.installments.map(inst => {
                                    const ch = inst.existing_charge;
                                    return (
                                      <tr key={inst.origin_ref} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                        <td className="px-3 py-2 font-mono font-bold text-slate-800 dark:text-slate-200">
                                          Parcela {inst.installment_label}
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap font-medium">
                                          {fmtDate(inst.due_date)}
                                        </td>
                                        <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-400">
                                          {inst.financial_launch_id ? `#${inst.financial_launch_id}` : '-'}
                                        </td>
                                        <td className="px-3 py-2 text-slate-500">
                                          {inst.payment_form || 'Boleto'}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono font-bold text-slate-900 dark:text-white">
                                          {brl(inst.amount)}
                                        </td>
                                        <td className="px-3 py-2">
                                          {ch ? (
                                            <div className="flex flex-wrap items-center gap-1.5">
                                              <StatusBadge charge={ch} />
                                              <span className="text-[11px] font-mono text-slate-500">
                                                Cora #{ch.id}
                                              </span>
                                            </div>
                                          ) : inst.has_existing_boleto ? (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[11px] font-bold">
                                              <Lock className="h-3 w-3" /> Emitido no Horus ({inst.existing_boleto_source})
                                            </span>
                                          ) : (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-semibold">
                                              Disponível para emissão
                                            </span>
                                          )}
                                        </td>
                                        <td className="px-3 py-2 text-right whitespace-nowrap">
                                          {ch ? (
                                            <div className="inline-flex items-center gap-1">
                                              {ch.digitable_line && (
                                                <button
                                                  type="button"
                                                  onClick={() => copy(ch.digitable_line, 'Linha digitável')}
                                                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                                                  title="Copiar linha digitável"
                                                >
                                                  <Copy className="h-3.5 w-3.5" />
                                                </button>
                                              )}
                                              {ch.has_pdf && (
                                                <button
                                                  type="button"
                                                  onClick={() => openPdf(ch.id)}
                                                  disabled={pdfBusyId === ch.id}
                                                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-pink-600 hover:bg-pink-50 dark:hover:bg-pink-950/30"
                                                  title="2ª via individual deste boleto (PDF)"
                                                >
                                                  {pdfBusyId === ch.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
                                                </button>
                                              )}
                                              <Link
                                                href={`/financial/cora/boletos/${ch.id}`}
                                                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                                                title="Abrir detalhes da cobrança"
                                              >
                                                <ExternalLink className="h-3.5 w-3.5" />
                                              </Link>
                                            </div>
                                          ) : !inst.has_existing_boleto ? (
                                            <button
                                              type="button"
                                              onClick={() => setEmitModalInvoice(nf)}
                                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-pink-50 dark:bg-pink-950/30 text-pink-700 dark:text-pink-300 font-semibold hover:bg-pink-100"
                                            >
                                              <Send className="h-3 w-3" /> Emitir
                                            </button>
                                          ) : null}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal de Emissão de Boletos da Nota Fiscal (com opção de Imprimir Todos de Uma Vez após gerar) */}
      {emitModalInvoice && companyId && (
        <EmitInvoiceBoletosModal
          companyId={companyId}
          invoice={emitModalInvoice}
          onClose={() => setEmitModalInvoice(null)}
          onEmitted={(newCharges) => {
            appendToPrintQueue(newCharges);
            load();
          }}
        />
      )}

      {/* Modal de Emissão Segura em Lote */}
      {showBatchEmitModal && companyId && data && (
        <BatchEmitBoletosModal
          companyId={companyId}
          invoices={data.items.filter(i => i.pending_count > 0)}
          onClose={() => setShowBatchEmitModal(false)}
          onEmitted={(newCharges) => {
            appendToPrintQueue(newCharges);
            load();
          }}
          onOpenPrintQueue={() => {
            setShowBatchEmitModal(false);
            setShowPrintQueueModal(true);
          }}
        />
      )}

      {/* Modal de Fila de Impressão Unificada */}
      {showPrintQueueModal && companyId && (
        <PrintQueueModal
          companyId={companyId}
          queue={printQueue}
          periodCharges={periodCoraCharges}
          onImportPeriodCharges={() => appendToPrintQueue(periodCoraCharges)}
          onRemoveIds={removeFromPrintQueue}
          onClearQueue={clearPrintQueue}
          onClose={() => setShowPrintQueueModal(false)}
        />
      )}

      {/* Modal discreto de Configuração de Formas de Pagamento do Horus */}
      {showPaymentFormsModal && companyId && (
        <PaymentFormsFilterModal
          companyId={companyId}
          catalog={data?.payment_forms_catalog || []}
          initialAllowed={data?.allowed_payment_forms || []}
          hiddenCount={data?.hidden_by_payment_form_count || 0}
          onClose={() => setShowPaymentFormsModal(false)}
          onSaved={() => {
            setShowPaymentFormsModal(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function PaymentFormsFilterModal({
  companyId,
  catalog,
  initialAllowed,
  hiddenCount,
  onClose,
  onSaved,
}: {
  companyId: number | string;
  catalog: PaymentFormCatalogItem[];
  initialAllowed: string[];
  hiddenCount: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(() => initialAllowed);
  const [saving, setSaving] = useState(false);

  const isChecked = (item: PaymentFormCatalogItem) => {
    const up = selected.map(s => s.toUpperCase());
    return up.includes(item.name.toUpperCase()) || up.includes(item.code.toUpperCase());
  };

  const toggleItem = (item: PaymentFormCatalogItem) => {
    const checked = isChecked(item);
    if (checked) {
      setSelected(prev =>
        prev.filter(
          s =>
            s.toUpperCase() !== item.name.toUpperCase() &&
            s.toUpperCase() !== item.code.toUpperCase()
        )
      );
    } else {
      setSelected(prev => [...prev, item.name]);
    }
  };

  const selectOnlyBoleto = () => {
    const boletoForms = catalog
      .filter(c => c.name.toUpperCase().includes('BOLETO') && !c.name.toUpperCase().includes('VINDI'))
      .map(c => c.name);
    setSelected(boletoForms.length ? boletoForms : ['Boleto']);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await paymentsApi(companyId, '/horus-invoices/payment-forms-filter', {
        method: 'PUT',
        body: JSON.stringify({
          provider: 'CORA',
          allowed_payment_forms: selected,
        }),
      });
      toast.success(
        selected.length
          ? `Filtro salvo: exibindo apenas ${selected.join(', ')}.`
          : 'Filtro removido: exibindo todas as formas de pagamento.'
      );
      onSaved();
    } catch (err: any) {
      toast.error(err.message || 'Falha ao salvar filtro de formas de pagamento.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <form
        onSubmit={save}
        className="w-full sm:max-w-lg max-h-[88vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 md:p-5 space-y-4"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h2 className="text-sm md:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-pink-600" />
              Formas de Pagamento Exibidas (Horus ERP)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Marque quais formas de pagamento do Horus devem aparecer nesta tela. Se nenhuma estiver marcada, todas serão exibidas.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={selectOnlyBoleto}
              className="px-2.5 py-1 rounded-lg bg-pink-50 dark:bg-pink-950/30 text-pink-700 dark:text-pink-300 font-semibold hover:bg-pink-100"
            >
              Apenas Boleto
            </button>
            <button
              type="button"
              onClick={() => setSelected([])}
              className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold hover:bg-slate-200"
            >
              Mostrar todas
            </button>
          </div>
          {hiddenCount > 0 && (
            <span className="text-[11px] text-slate-400">
              {hiddenCount} nota(s) oculta(s) no período pelo filtro atual
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-72 overflow-y-auto pr-1">
          {catalog.map(item => {
            const checked = isChecked(item);
            return (
              <button
                key={`${item.code}-${item.name}`}
                type="button"
                onClick={() => toggleItem(item)}
                className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-left text-xs transition-colors ${
                  checked
                    ? 'border-pink-500 bg-pink-50/50 dark:bg-pink-950/20 text-slate-900 dark:text-white font-semibold'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                }`}
              >
                <span className="flex items-center gap-2 truncate">
                  {checked ? (
                    <CheckSquare className="h-4 w-4 text-pink-600 shrink-0" />
                  ) : (
                    <Square className="h-4 w-4 text-slate-400 shrink-0" />
                  )}
                  <span className="truncate">{item.name}</span>
                </span>
                {item.code !== item.name && (
                  <span className="font-mono text-[10px] text-slate-400 shrink-0">#{item.code}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
          <span className="text-xs text-slate-500">
            {selected.length === 0
              ? 'Exibindo todas as formas'
              : `${selected.length} forma(s) selecionada(s)`}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`${btnCls} border border-slate-200 dark:border-slate-700`}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className={`${btnCls} bg-pink-600 hover:bg-pink-700 text-white`}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar configuração
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function EmitInvoiceBoletosModal({
  companyId,
  invoice,
  onClose,
  onEmitted,
}: {
  companyId: number | string;
  invoice: HorusInvoiceItem;
  onClose: () => void;
  onEmitted: (newCharges: Charge[]) => void;
}) {
  const [method, setMethod] = useState<'BOLETO' | 'PIX'>('BOLETO');
  const [payer, setPayer] = useState({
    name: invoice.payer.name || '',
    document: invoice.payer.document || '',
    email: invoice.payer.email || '',
    street: invoice.payer.street || '',
    number: invoice.payer.number || 'S/N',
    complement: invoice.payer.complement || '',
    district: invoice.payer.district || '',
    city: invoice.payer.city || '',
    state: invoice.payer.state || '',
    zip_code: invoice.payer.zip_code || '',
  });

  const [rows, setRows] = useState(() =>
    invoice.installments.map(inst => ({
      ...inst,
      selected: !inst.has_existing_boleto,
    }))
  );
  const [submitting, setSubmitting] = useState(false);
  const [emittedCharges, setEmittedCharges] = useState<Charge[] | null>(null);
  const [printingAll, setPrintingAll] = useState(false);

  const setP = (k: keyof typeof payer, v: string) => setPayer(p => ({ ...p, [k]: v }));

  const toggleRow = (idx: number) => {
    setRows(prev =>
      prev.map((r, i) => (i === idx && !r.has_existing_boleto ? { ...r, selected: !r.selected } : r))
    );
  };

  const updateRow = (idx: number, patch: Partial<(typeof rows)[0]>) => {
    setRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const selectedRows = rows.filter(r => r.selected && !r.has_existing_boleto);
  const selectedTotal = selectedRows.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedRows.length === 0) {
      toast.error('Selecione ao menos uma parcela pendente para emitir.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await paymentsApi<{ created_count: number; charges: Charge[] }>(
        companyId,
        '/horus-invoices/emit',
        {
          method: 'POST',
          body: JSON.stringify({
            provider: 'CORA',
            method,
            nro_nota_fiscal: invoice.nro_nota_fiscal,
            serie_fiscal: invoice.serie_fiscal,
            cod_nf: invoice.cod_nf,
            cod_ped_venda: invoice.cod_ped_venda,
            cod_pedido_origem: invoice.cod_pedido_origem,
            horus_cod_cli: invoice.cod_cli,
            horus_id_guid: invoice.horus_id_guid,
            customer_id: invoice.customer_id,
            issue_date: invoice.issue_date,
            chave_acesso_nfe: invoice.chave_acesso_nfe,
            payer: {
              ...payer,
              email: payer.email || null,
              complement: payer.complement || null,
            },
            installments: selectedRows.map(r => ({
              installment_number: r.installment_number,
              due_date: r.due_date,
              amount: r.amount,
              financial_launch_id: r.financial_launch_id,
              origin_ref: r.origin_ref,
              description: r.description,
            })),
          }),
        }
      );
      toast.success(
        res.created_count === 1
          ? `1 boleto emitido e adicionado à Fila de Impressão!`
          : `${res.created_count} boletos emitidos e adicionados à Fila de Impressão!`
      );
      setEmittedCharges(res.charges || []);
      onEmitted(res.charges || []);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao emitir boleto(s) da Nota Fiscal.');
    } finally {
      setSubmitting(false);
    }
  };

  // Combina todos os IDs de boletos da NF (os que já existiam + os recém-emitidos) para impressão única
  const allNfChargeIds = React.useMemo(() => {
    const ids = new Set<number>();
    (invoice.cora_charge_ids || []).forEach(id => ids.add(id));
    (emittedCharges || []).forEach(c => ids.add(c.id));
    return Array.from(ids);
  }, [invoice.cora_charge_ids, emittedCharges]);

  const handlePrintAllNow = async () => {
    const targetIds = (emittedCharges?.length ? emittedCharges.map(c => c.id) : allNfChargeIds);
    if (!targetIds.length) return;
    setPrintingAll(true);
    try {
      await openMergedChargesPdf(companyId, targetIds);
    } catch (e: any) {
      toast.error(e.message || 'Falha ao abrir PDF unificado.');
    } finally {
      setPrintingAll(false);
    }
  };

  if (emittedCharges) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div className="w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 md:p-6 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-600">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-base md:text-lg font-bold text-slate-900 dark:text-white">
                  {emittedCharges.length === 1
                    ? 'Boleto Emitido com Sucesso!'
                    : `${emittedCharges.length} Boletos Emitidos com Sucesso!`}
                </h2>
                <p className="text-xs text-slate-500">
                  NF {invoice.nro_nota_fiscal} · {invoice.payer.name} · Já disponíveis na Fila de Impressão
                </p>
              </div>
            </div>
            <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 max-h-60 overflow-y-auto">
            {emittedCharges.map(c => (
              <div key={c.id} className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
                <div>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    Parcela {c.installment_number || '1'}
                  </span>
                  <span className="ml-2 text-slate-500">Venc. {fmtDate(c.due_date)}</span>
                </div>
                <span className="font-mono font-bold text-slate-900 dark:text-white">{brl(c.amount)}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-2">
            <button
              type="button"
              onClick={handlePrintAllNow}
              disabled={printingAll}
              className={`${btnCls} flex-1 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm`}
            >
              {printingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              Imprimir {emittedCharges.length > 1 ? `Todos de Uma Vez (${emittedCharges.length} em 1 PDF)` : 'Boleto Agora'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className={`${btnCls} border border-slate-200 dark:border-slate-700`}
            >
              Concluir
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <form
        onSubmit={submit}
        className="w-full sm:max-w-3xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 md:p-6 space-y-5"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-pink-500/10 text-pink-600 text-xs font-mono font-bold">
                NF {invoice.nro_nota_fiscal}
              </span>
              {invoice.cod_ped_venda && (
                <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 text-xs font-mono font-bold">
                  Pedido #{invoice.cod_ped_venda}
                </span>
              )}
            </div>
            <h2 className="mt-1 text-base md:text-lg font-bold text-slate-900 dark:text-white">
              Emitir Boleto(s) no Banco Cora
            </h2>
            <p className="text-xs text-slate-500">
              As parcelas e o endereço foram extraídos automaticamente do XML da NF-e e do Contas a Receber do Horus ERP.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Seleção de Parcelas */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
              1. Parcelas da Nota Fiscal ({invoice.installments_count}x)
            </label>
            <div className="flex gap-1.5">
              {([
                ['BOLETO', 'Boleto + QR Code Pix'],
                ['PIX', 'Somente Pix'],
              ] as const).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                    method === m
                      ? 'border-pink-600 bg-pink-600 text-white'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
            {rows.map((r, idx) => {
              const locked = r.has_existing_boleto;
              return (
                <div
                  key={r.origin_ref}
                  className={`p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    locked
                      ? 'bg-slate-50 dark:bg-slate-800/40 opacity-75'
                      : r.selected
                      ? 'bg-pink-50/40 dark:bg-pink-950/15'
                      : 'bg-white dark:bg-slate-900'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => toggleRow(idx)}
                      className="mt-0.5 text-pink-600 disabled:text-slate-400"
                    >
                      {locked ? (
                        <Lock className="h-4 w-4 text-amber-500" />
                      ) : r.selected ? (
                        <CheckSquare className="h-4 w-4" />
                      ) : (
                        <Square className="h-4 w-4 text-slate-400" />
                      )}
                    </button>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold font-mono text-slate-900 dark:text-white">
                          Parcela {r.installment_label}
                        </span>
                        {r.financial_launch_id && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-600 dark:text-slate-300">
                            Lanç. CR #{r.financial_launch_id}
                          </span>
                        )}
                        {locked && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 text-[10px] font-bold">
                            Já possui boleto ({r.existing_boleto_source})
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">{r.description}</p>
                    </div>
                  </div>

                  {!locked && (
                    <div className="grid grid-cols-2 gap-2 sm:w-72 shrink-0">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">Vencimento</label>
                        <input
                          type="date"
                          required={r.selected}
                          value={r.due_date}
                          onChange={e => updateRow(idx, { due_date: e.target.value })}
                          className="w-full h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">Valor</label>
                        <CurrencyInput
                          value={r.amount}
                          onChangeValue={v => updateRow(idx, { amount: v })}
                          prefixStr="R$ "
                          className="w-full h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs font-mono"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Dados do Pagador (extraídos do XML da NF-e) */}
        <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
            <Building2 className="h-3.5 w-3.5 text-pink-600" />
            2. Destinatário / Pagador (Extraído da NF-e)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Nome / Razão Social *</label>
              <input required minLength={2} value={payer.name} onChange={e => setP('name', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">CPF / CNPJ *</label>
              <input required minLength={11} value={payer.document} onChange={e => setP('document', e.target.value)} className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">E-mail para envio do boleto</label>
              <input type="email" value={payer.email} onChange={e => setP('email', e.target.value)} className={inputCls} />
            </div>
            <div className="sm:col-span-2 grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Logradouro *</label>
                <input required value={payer.street} onChange={e => setP('street', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Número *</label>
                <input required value={payer.number} onChange={e => setP('number', e.target.value)} className={inputCls} />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Bairro *</label>
              <input required value={payer.district} onChange={e => setP('district', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">CEP *</label>
              <input required minLength={8} maxLength={9} value={payer.zip_code} onChange={e => setP('zip_code', e.target.value)} className={inputCls} />
            </div>
            <div className="grid grid-cols-3 gap-2 sm:col-span-2">
              <div className="col-span-2">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Cidade *</label>
                <input required value={payer.city} onChange={e => setP('city', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">UF *</label>
                <input required minLength={2} maxLength={2} value={payer.state} onChange={e => setP('state', e.target.value.toUpperCase())} className={inputCls} />
              </div>
            </div>
          </div>
        </div>

        {/* Rodapé de confirmação */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="text-xs text-slate-600 dark:text-slate-300">
            Selecionado: <b>{selectedRows.length} boleto(s)</b> · Total: <b className="font-mono">{brl(selectedTotal)}</b>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={`${btnCls} border border-slate-200 dark:border-slate-700`}>
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || selectedRows.length === 0}
              className={`${btnCls} bg-pink-600 hover:bg-pink-700 text-white`}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Emitir {selectedRows.length} boleto(s) no Cora
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function BatchEmitBoletosModal({
  companyId,
  invoices,
  onClose,
  onEmitted,
  onOpenPrintQueue,
}: {
  companyId: number | string;
  invoices: HorusInvoiceItem[];
  onClose: () => void;
  onEmitted: (newCharges: Charge[]) => void;
  onOpenPrintQueue: () => void;
}) {
  const todayIso = isoDate(new Date());
  const [selectedNfs, setSelectedNfs] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    invoices.forEach(inv => {
      if (inv.auto_emit_ready) map[inv.nro_nota_fiscal] = true;
    });
    return map;
  });
  const [submitting, setSubmitting] = useState(false);
  const [resultCharges, setResultCharges] = useState<Charge[] | null>(null);
  const [printingBatch, setPrintingBatch] = useState(false);

  const toggleNf = (nroNf: string, ready?: boolean) => {
    if (!ready) return;
    setSelectedNfs(prev => ({ ...prev, [nroNf]: !prev[nroNf] }));
  };

  const chosenInvoices = invoices.filter(inv => inv.auto_emit_ready && selectedNfs[inv.nro_nota_fiscal]);
  const chosenInstallmentsCount = chosenInvoices.reduce(
    (acc, inv) =>
      acc +
      inv.installments.filter(i => !i.has_existing_boleto && i.amount > 0 && i.due_date >= todayIso).length,
    0
  );
  const chosenTotalAmount = chosenInvoices.reduce((acc, inv) => acc + inv.pending_amount, 0);

  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (chosenInvoices.length === 0) {
      toast.error('Selecione ao menos uma Nota Fiscal validada para emitir.');
      return;
    }
    setSubmitting(true);
    try {
      const payloadInvoices = chosenInvoices.map(inv => ({
        nro_nota_fiscal: inv.nro_nota_fiscal,
        serie_fiscal: inv.serie_fiscal,
        cod_nf: inv.cod_nf,
        cod_ped_venda: inv.cod_ped_venda,
        cod_pedido_origem: inv.cod_pedido_origem,
        horus_cod_cli: inv.cod_cli,
        horus_id_guid: inv.horus_id_guid,
        customer_id: inv.customer_id,
        issue_date: inv.issue_date,
        chave_acesso_nfe: inv.chave_acesso_nfe,
        payer: {
          ...inv.payer,
          email: inv.payer.email || null,
          complement: inv.payer.complement || null,
        },
        installments: inv.installments
          .filter(i => !i.has_existing_boleto && i.amount > 0 && i.due_date >= todayIso)
          .map(r => ({
            installment_number: r.installment_number,
            due_date: r.due_date,
            amount: r.amount,
            financial_launch_id: r.financial_launch_id,
            origin_ref: r.origin_ref,
            description: r.description,
          })),
      }));

      const res = await paymentsApi<{
        created_count: number;
        error_count: number;
        charges: Charge[];
        errors: { nro_nota_fiscal: string; error: string }[];
      }>(companyId, '/horus-invoices/emit-batch', {
        method: 'POST',
        body: JSON.stringify({
          provider: 'CORA',
          method: 'BOLETO',
          invoices: payloadInvoices,
        }),
      });

      toast.success(
        `${res.created_count} boleto(s) emitido(s) com segurança e disponibilizados na Fila de Impressão!`
      );
      setResultCharges(res.charges || []);
      onEmitted(res.charges || []);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao emitir lote de boletos.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrintGeneratedBatch = async () => {
    if (!resultCharges?.length) return;
    setPrintingBatch(true);
    try {
      await openMergedChargesPdf(
        companyId,
        resultCharges.map(c => c.id)
      );
    } catch (e: any) {
      toast.error(e.message || 'Falha ao gerar PDF unificado do lote.');
    } finally {
      setPrintingBatch(false);
    }
  };

  if (resultCharges) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div className="w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 md:p-6 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-600">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-base md:text-lg font-bold text-slate-900 dark:text-white">
                  Lote Emitido com Sucesso ({resultCharges.length} boletos)!
                </h2>
                <p className="text-xs text-slate-500">
                  Todos os boletos foram gerados no Banco Cora e adicionados automaticamente à Fila de Impressão.
                </p>
              </div>
            </div>
            <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <button
              type="button"
              onClick={handlePrintGeneratedBatch}
              disabled={printingBatch || resultCharges.length === 0}
              className={`${btnCls} flex-1 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm`}
            >
              {printingBatch ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              Imprimir Todos Agora ({resultCharges.length} em 1 PDF)
            </button>
            <button
              type="button"
              onClick={onOpenPrintQueue}
              className={`${btnCls} border border-slate-200 dark:border-slate-700`}
            >
              Abrir Fila de Impressão
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <form
        onSubmit={handleBatchSubmit}
        className="w-full sm:max-w-3xl max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 md:p-6 space-y-4"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h2 className="text-base md:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              Emissão Segura em Lote (Cora + Fila de Impressão)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Apenas Notas Fiscais com CPF/CNPJ, endereço completo no XML e vencimento válido são liberadas para emissão automática em lote.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto">
          {invoices.map(inv => {
            const ready = !!inv.auto_emit_ready;
            const checked = !!selectedNfs[inv.nro_nota_fiscal] && ready;
            return (
              <div
                key={inv.nro_nota_fiscal}
                onClick={() => toggleNf(inv.nro_nota_fiscal, ready)}
                className={`p-3 flex items-center justify-between gap-3 text-xs cursor-pointer transition-colors ${
                  !ready
                    ? 'bg-slate-50 dark:bg-slate-800/40 opacity-60 cursor-not-allowed'
                    : checked
                    ? 'bg-emerald-50/40 dark:bg-emerald-950/15'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5">
                    {!ready ? (
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                    ) : checked ? (
                      <CheckSquare className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Square className="h-4 w-4 text-slate-400" />
                    )}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-slate-900 dark:text-white">
                        NF {inv.nro_nota_fiscal}
                      </span>
                      {inv.cod_ped_venda && (
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600">
                          Ped. #{inv.cod_ped_venda}
                        </span>
                      )}
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{inv.payer.name}</span>
                    </div>
                    {ready ? (
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {inv.pending_count} parcela(s) pendente(s) · {maskDoc(inv.payer.document)} · {inv.payer.city}/{inv.payer.state}
                      </p>
                    ) : (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                        Requer revisão manual: {(inv.auto_emit_issues || []).join(', ')}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right font-mono font-bold text-slate-900 dark:text-white shrink-0">
                  {brl(inv.pending_amount)}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="text-xs text-slate-600 dark:text-slate-300">
            Selecionado: <b>{chosenInvoices.length} NF(s)</b> · <b>{chosenInstallmentsCount} boleto(s)</b> · Total:{' '}
            <b className="font-mono">{brl(chosenTotalAmount)}</b>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={`${btnCls} border border-slate-200 dark:border-slate-700`}>
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || chosenInvoices.length === 0}
              className={`${btnCls} bg-emerald-600 hover:bg-emerald-700 text-white`}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Emitir {chosenInstallmentsCount} boleto(s) com Segurança
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function PrintQueueModal({
  companyId,
  queue,
  periodCharges,
  onImportPeriodCharges,
  onRemoveIds,
  onClearQueue,
  onClose,
}: {
  companyId: number | string;
  queue: Charge[];
  periodCharges: Charge[];
  onImportPeriodCharges: () => void;
  onRemoveIds: (ids: number[]) => void;
  onClearQueue: () => void;
  onClose: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<number[]>(() => queue.map(c => c.id));
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    setSelectedIds(queue.map(c => c.id));
  }, [queue]);

  const toggleId = (id: number) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const handlePrintSelected = async () => {
    if (!selectedIds.length) {
      toast.error('Selecione ao menos um boleto da fila para imprimir.');
      return;
    }
    setPrinting(true);
    try {
      await openMergedChargesPdf(companyId, selectedIds);
      toast.success(`PDF unificado com ${selectedIds.length} boleto(s) aberto para impressão!`);
    } catch (e: any) {
      toast.error(e.message || 'Falha ao gerar PDF unificado da fila.');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-3xl max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 md:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h2 className="text-base md:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Printer className="h-5 w-5 text-indigo-600" />
              Fila de Impressão Unificada ({queue.length} boleto{queue.length === 1 ? '' : 's'})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Imprima todas as parcelas e boletos gerados de uma só vez em um único documento PDF contínuo.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedIds(queue.map(c => c.id))}
              className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold"
            >
              Marcar todos
            </button>
            {periodCharges.length > 0 && (
              <button
                type="button"
                onClick={onImportPeriodCharges}
                className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 font-semibold"
              >
                + Trazer todos os boletos deste período ({periodCharges.length})
              </button>
            )}
          </div>
          {queue.length > 0 && (
            <button
              type="button"
              onClick={onClearQueue}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 font-semibold"
            >
              <Trash2 className="h-3.5 w-3.5" /> Limpar fila
            </button>
          )}
        </div>

        {!queue.length ? (
          <div className="p-8 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 space-y-2">
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
              A Fila de Impressão está vazia no momento.
            </p>
            <p className="text-xs text-slate-500">
              Assim que novos boletos forem emitidos (individualmente, em lote ou pelo Modo Automático Play), eles aparecerão automaticamente aqui para impressão única.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto">
            {queue.map(c => {
              const checked = selectedIds.includes(c.id);
              return (
                <div
                  key={c.id}
                  onClick={() => toggleId(c.id)}
                  className={`p-3 flex items-center justify-between gap-3 text-xs cursor-pointer transition-colors ${
                    checked ? 'bg-indigo-50/40 dark:bg-indigo-950/15' : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {checked ? (
                      <CheckSquare className="h-4 w-4 text-indigo-600 shrink-0" />
                    ) : (
                      <Square className="h-4 w-4 text-slate-400 shrink-0" />
                    )}
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold text-slate-900 dark:text-white">
                          NF {c.invoice_number || '-'} · Parc. {c.installment_number || '1'}
                        </span>
                        <span className="font-semibold text-slate-700 dark:text-slate-200">{c.payer_name}</span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Vencimento: {fmtDate(c.due_date)} · Cora #{c.id}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-slate-900 dark:text-white">{brl(c.amount)}</span>
                    <button
                      type="button"
                      onClick={ev => {
                        ev.stopPropagation();
                        onRemoveIds([c.id]);
                      }}
                      className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100"
                      title="Remover da fila"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="text-xs text-slate-500">
            Selecionado para impressão única: <b>{selectedIds.length} boleto(s)</b>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  onRemoveIds(selectedIds);
                  toast.success('Boletos marcados como impressos e removidos da fila.');
                }}
                className={`${btnCls} border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300`}
              >
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Marcar como Impressos
              </button>
            )}
            <button
              type="button"
              disabled={printing || selectedIds.length === 0}
              onClick={handlePrintSelected}
              className={`${btnCls} bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm`}
            >
              {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              Imprimir Todos de Uma Vez ({selectedIds.length} em 1 PDF)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
