'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Landmark, Search, Loader2, FileText, Calendar, Hash, RefreshCw, CheckCircle2,
  Lock, ChevronDown, ChevronUp, FileDown, Copy, ExternalLink, Send, X, Building2,
  AlertTriangle, ListChecks, CheckSquare, Square,
} from 'lucide-react';
import { toast } from 'sonner';
import { getUser } from '@/lib/auth';
import { CurrencyInput } from '@/components/CurrencyInput';
import {
  Charge, StatusBadge, brl, copyText, fmtDate, maskDoc, paymentsApi,
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
  installments: InvoiceInstallment[];
}

interface HorusInvoicesResponse {
  horus_enabled: boolean;
  date_from: string;
  date_to: string;
  summary: {
    total_invoices: number;
    total_installments: number;
    pending_installments: number;
    emitted_installments: number;
    total_amount: number;
    pending_amount: number;
  };
  items: HorusInvoiceItem[];
}

const inputCls = 'w-full h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs md:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500/40';
const btnCls = 'inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl text-xs md:text-sm font-semibold transition-colors disabled:opacity-50';

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
  const [expandedNfs, setExpandedNfs] = useState<Record<string, boolean>>({});
  const [pdfBusyId, setPdfBusyId] = useState<number | null>(null);
  const [emitModalInvoice, setEmitModalInvoice] = useState<HorusInvoiceItem | null>(null);

  const load = useCallback(async (overrideDates?: { from: string; to: string }) => {
    if (!companyId) return;
    setLoading(true);
    try {
      const df = overrideDates ? overrideDates.from : dateFrom;
      const dt = overrideDates ? overrideDates.to : dateTo;
      const qs = new URLSearchParams({ provider: 'CORA', status_filter: statusFilter });
      if (df) qs.set('date_from', df);
      if (dt) qs.set('date_to', dt);
      if (codPedVenda.trim()) qs.set('cod_ped_venda', codPedVenda.trim());
      if (nroNotaFiscal.trim()) qs.set('nro_nota_fiscal', nroNotaFiscal.trim());
      if (search.trim()) qs.set('search', search.trim());

      const res = await paymentsApi<HorusInvoicesResponse>(companyId, `/horus-invoices?${qs.toString()}`);
      setData(res);
      // Expande automaticamente se vier poucas notas ou notas com múltiplas parcelas
      const autoExpand: Record<string, boolean> = {};
      res.items.slice(0, 5).forEach(it => {
        if (it.installments_count > 1) autoExpand[it.nro_nota_fiscal] = true;
      });
      setExpandedNfs(prev => ({ ...autoExpand, ...prev }));
    } catch (e: any) {
      toast.error(e.message || 'Falha ao consultar Notas Fiscais no Horus.');
    } finally {
      setLoading(false);
    }
  }, [companyId, dateFrom, dateTo, codPedVenda, nroNotaFiscal, search, statusFilter]);

  useEffect(() => {
    load();
  }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const copy = async (text: string | null, label: string) => {
    if (await copyText(text)) toast.success(`${label} copiado(a).`);
  };

  const s = data?.summary;

  return (
    <div className="p-3 md:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/financial/cora" className="p-2.5 rounded-2xl bg-pink-500/10 border border-pink-500/20 text-pink-600">
            <FileText className="h-6 w-6" />
          </Link>
          <div>
            <h1 className="text-lg md:text-2xl font-bold text-slate-900 dark:text-white">Notas Fiscais Emitidas (Horus ERP)</h1>
            <p className="text-xs md:text-sm text-slate-500">
              Consulta 100% via API Horus das últimas notas faturadas com parcelas do XML/Contas a Receber e trava contra emissão duplicada
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/financial/cora/boletos" className={`${btnCls} border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200`}>
            <ListChecks className="h-4 w-4" /> Boletos Emitidos
          </Link>
          <button type="button" onClick={() => load()} disabled={loading} className={`${btnCls} bg-pink-600 hover:bg-pink-700 text-white`}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Consultar Horus
          </button>
        </div>
      </div>

      {/* KPIs do período */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Notas fiscais no período</p>
          <p className="mt-1 text-base md:text-xl font-bold text-slate-900 dark:text-white">{brl(s?.total_amount)}</p>
          <p className="text-xs text-slate-500">{s?.total_invoices ?? 0} nota(s) · {s?.total_installments ?? 0} parcela(s)</p>
        </div>
        <div className="rounded-2xl border border-pink-200/80 dark:border-pink-900/50 bg-pink-50/40 dark:bg-pink-950/20 p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-pink-700 dark:text-pink-300">Pendentes de boleto</p>
          <p className="mt-1 text-base md:text-xl font-bold text-pink-900 dark:text-pink-100">{brl(s?.pending_amount)}</p>
          <p className="text-xs text-pink-700/80 dark:text-pink-300/80">{s?.pending_installments ?? 0} parcela(s) pronta(s) para emitir</p>
        </div>
        <div className="rounded-2xl border border-emerald-200/70 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Parcelas já com boleto</p>
          <p className="mt-1 text-base md:text-xl font-bold text-emerald-900 dark:text-emerald-100">{s?.emitted_installments ?? 0}</p>
          <p className="text-xs text-emerald-700/80 dark:text-emerald-300/80">Bloqueadas contra emissão duplicada</p>
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

          {/* Filtro rápido por Status de Emissão */}
          <div className="flex gap-1.5 overflow-x-auto">
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

      {/* Tabela de Notas Fiscais e Parcelas */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        {loading && !data ? (
          <div className="flex h-56 items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin text-pink-600" /> Consultando Notas Fiscais na API do Horus ERP...
          </div>
        ) : !data?.items.length ? (
          <div className="p-10 text-center space-y-1">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Nenhuma Nota Fiscal localizada no período ou filtro informado.</p>
            <p className="text-xs text-slate-500">Tente ampliar o período de datas ou pesquisar diretamente pelo código de pedido Horus (COD_PED_VENDA).</p>
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
                <th className="px-3 py-3 text-right">Emissão de Boleto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.items.map(nf => {
                const isExpanded = !!expandedNfs[nf.nro_nota_fiscal];
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
                              {nf.chave_acesso_nfe && (
                                <span className="font-mono text-[10px] text-slate-400">
                                  Chave NF-e: {nf.chave_acesso_nfe}
                                </span>
                              )}
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
                                                  title="2ª via do boleto (PDF)"
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

      {/* Modal de Emissão de Boletos da Nota Fiscal */}
      {emitModalInvoice && companyId && (
        <EmitInvoiceBoletosModal
          companyId={companyId}
          invoice={emitModalInvoice}
          onClose={() => setEmitModalInvoice(null)}
          onEmitted={() => {
            setEmitModalInvoice(null);
            load();
          }}
        />
      )}
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
  onEmitted: () => void;
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

  // Estado editável das parcelas (apenas as pendentes vêm selecionadas; as já emitidas ficam bloqueadas)
  const [rows, setRows] = useState(() =>
    invoice.installments.map(inst => ({
      ...inst,
      selected: !inst.has_existing_boleto,
    }))
  );
  const [submitting, setSubmitting] = useState(false);

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
          ? `1 boleto emitido com sucesso no Banco Cora para a NF ${invoice.nro_nota_fiscal}!`
          : `${res.created_count} boletos emitidos com sucesso no Banco Cora para a NF ${invoice.nro_nota_fiscal}!`
      );
      onEmitted();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao emitir boleto(s) da Nota Fiscal.');
    } finally {
      setSubmitting(false);
    }
  };

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
