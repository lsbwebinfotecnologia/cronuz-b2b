'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Landmark, Search, Loader2, Plus, Copy, ChevronLeft, ChevronRight, X, Send,
  Calendar, Hash, FileDown, Building2, CheckCircle2, Ban, ExternalLink, RefreshCw, UserCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { getUser } from '@/lib/auth';
import { CurrencyInput } from '@/components/CurrencyInput';
import {
  Charge, ChargeSummary, StatusBadge, EnvBadge, OriginContextTags,
  brl, copyText, fmtDate, maskDoc, paymentsApi,
} from '@/components/payments/chargeUi';

const TABS = [
  { key: '', label: 'Todos' },
  { key: 'due', label: 'A vencer' },
  { key: 'overdue', label: 'Vencidos' },
  { key: 'paid', label: 'Pagos' },
  { key: 'cancelled', label: 'Cancelados' },
  { key: 'error', label: 'Com erro' },
];

const ORIGIN_FILTER_OPTIONS = [
  { value: '', label: 'Todas as origens' },
  { value: 'HORUS', label: 'Lançamento Horus ERP' },
  { value: 'ORDER', label: 'Pedido (B2B / B2C)' },
  { value: 'PDV', label: 'Cupom de PDV' },
  { value: 'FINANCIAL', label: 'Lançamento Financeiro Cronuz' },
  { value: 'MANUAL', label: 'Avulso' },
];

const inputCls = 'w-full h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs md:text-sm focus:outline-none focus:ring-2 focus:ring-pink-500/40';
const btnCls = 'inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl text-xs md:text-sm font-semibold transition-colors disabled:opacity-50';

interface ListResponse {
  items: Charge[];
  summary: ChargeSummary;
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

interface CustomerOption {
  customer_id: number | null;
  source: string;
  name: string;
  trade_name: string;
  document: string;
  email: string;
  id_guid: string;
  horus_cod_cli: string;
  has_horus_link: boolean;
  address: {
    street: string;
    number: string;
    complement: string;
    district: string;
    city: string;
    state: string;
    zip_code: string;
  };
}

interface OpenOriginItem {
  origin_type: string;
  origin_ref: string;
  financial_launch_id: string | null;
  installment_number: string | null;
  invoice_number: string | null;
  order_number: string | null;
  pdv_coupon_number: string | null;
  horus_cod_cli: string | null;
  issue_date: string | null;
  due_date: string | null;
  amount: number;
  payment_form: string | null;
  description: string;
  has_existing_boleto: boolean;
  existing_boleto_source: string | null;
  existing_charge_id: number | null;
  existing_digitable_line: string | null;
  existing_our_number: string | null;
  origin_meta: Record<string, any> | null;
}

interface OpenItemsResponse {
  customer_id: number | null;
  document: string;
  id_guid: string;
  horus_cod_cli: string;
  horus_enabled: boolean;
  horus_sql_enabled: boolean;
  horus_items: OpenOriginItem[];
  financial_items: OpenOriginItem[];
  order_items: OpenOriginItem[];
  pdv_items: OpenOriginItem[];
}

export default function CoraBoletosPage() {
  const router = useRouter();
  const companyId = getUser()?.company_id;
  const [tab, setTab] = useState('');
  const [search, setSearch] = useState('');
  const [numberFilter, setNumberFilter] = useState('');
  const [dateField, setDateField] = useState<'due' | 'issue' | 'paid'>('due');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [origin, setOrigin] = useState('');
  const [sort, setSort] = useState('due_asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [pdfBusyId, setPdfBusyId] = useState<number | null>(null);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    setTab(qs.get('tab') || '');
    if (qs.get('novo') === '1') setShowNew(true);
  }, []);

  const load = useCallback(async (p = 1, ps = pageSize) => {
    if (!companyId) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ provider: 'CORA', page: String(p), page_size: String(ps), sort });
      if (tab) qs.set('tab', tab);
      if (search.trim()) qs.set('search', search.trim());
      if (numberFilter.trim()) qs.set('number', numberFilter.trim());
      if (origin) qs.set('origin_type', origin);
      if (dateFrom) {
        qs.set(dateField === 'issue' ? 'issue_from' : dateField === 'paid' ? 'paid_from' : 'due_from', dateFrom);
      }
      if (dateTo) {
        qs.set(dateField === 'issue' ? 'issue_to' : dateField === 'paid' ? 'paid_to' : 'due_to', dateTo);
      }
      setData(await paymentsApi<ListResponse>(companyId, `/charges?${qs.toString()}`));
      setPage(p);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [companyId, tab, search, numberFilter, dateField, dateFrom, dateTo, origin, sort, pageSize]);

  useEffect(() => { load(1, pageSize); }, [tab, sort, origin, pageSize]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyPreset = (preset: 'today' | 'next7' | 'month' | 'prev_month' | 'clear') => {
    const now = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    if (preset === 'clear') {
      setDateFrom('');
      setDateTo('');
      return;
    }
    if (preset === 'today') {
      const s = iso(now);
      setDateFrom(s);
      setDateTo(s);
    } else if (preset === 'next7') {
      setDateFrom(iso(now));
      setDateTo(iso(new Date(now.getTime() + 7 * 86400000)));
    } else if (preset === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setDateFrom(iso(start));
      setDateTo(iso(end));
    } else if (preset === 'prev_month') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      setDateFrom(iso(start));
      setDateTo(iso(end));
    }
  };

  const clearAllFilters = () => {
    setSearch('');
    setNumberFilter('');
    setDateFrom('');
    setDateTo('');
    setOrigin('');
    setTab('');
  };

  const copy = async (text: string | null, label: string) => {
    if (await copyText(text)) toast.success(`${label} copiado(a).`);
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

  const s = data?.summary;
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 1;
  const startIdx = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx = Math.min(total, page * pageSize);

  return (
    <div className="p-3 md:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/financial/cora" className="p-2.5 rounded-2xl bg-pink-500/10 border border-pink-500/20 text-pink-600">
            <Landmark className="h-6 w-6" />
          </Link>
          <div>
            <h1 className="text-lg md:text-2xl font-bold text-slate-900 dark:text-white">Boletos Cora</h1>
            <p className="text-xs md:text-sm text-slate-500">
              Gestão de cobranças, consulta por período de vencimento/emissão e emissão vinculada ao Horus ERP, Pedidos, PDV e Financeiro
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => load(page, pageSize)} className={`${btnCls} border border-slate-200 dark:border-slate-700`} title="Atualizar lista">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
          <button type="button" onClick={() => setShowNew(true)} className={`${btnCls} bg-pink-600 hover:bg-pink-700 text-white`}>
            <Plus className="h-4 w-4" /> Novo boleto
          </button>
        </div>
      </div>

      {/* Resumo / KPIs do filtro atual */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Total filtrado</p>
          <p className="mt-1 text-base md:text-xl font-bold text-slate-900 dark:text-white">{brl(s?.total_amount)}</p>
          <p className="text-xs text-slate-500">{s?.total_qty ?? 0} boleto(s)</p>
        </div>
        <div className="rounded-2xl border border-sky-200/70 dark:border-sky-900/50 bg-sky-50/40 dark:bg-sky-950/20 p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">A vencer</p>
          <p className="mt-1 text-base md:text-xl font-bold text-sky-900 dark:text-sky-100">{brl(s?.due_amount)}</p>
          <p className="text-xs text-sky-700/80 dark:text-sky-300/80">{s?.due_qty ?? 0} em aberto no prazo</p>
        </div>
        <div className="rounded-2xl border border-amber-200/70 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20 p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Vencidos</p>
          <p className="mt-1 text-base md:text-xl font-bold text-amber-900 dark:text-amber-100">{brl(s?.overdue_amount)}</p>
          <p className="text-xs text-amber-700/80 dark:text-amber-300/80">{s?.overdue_qty ?? 0} em atraso</p>
        </div>
        <div className="rounded-2xl border border-emerald-200/70 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Pagos</p>
          <p className="mt-1 text-base md:text-xl font-bold text-emerald-900 dark:text-emerald-100">{brl(s?.paid_amount)}</p>
          <p className="text-xs text-emerald-700/80 dark:text-emerald-300/80">{s?.paid_qty ?? 0} liquidado(s)</p>
        </div>
      </div>

      {/* Abas de status */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`shrink-0 h-9 px-3.5 rounded-full text-xs font-semibold border transition-colors ${
              tab === t.key
                ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Painel de Filtros Sempre Visível */}
      <form
        onSubmit={e => { e.preventDefault(); load(1, pageSize); }}
        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 md:p-4 space-y-3 shadow-sm"
      >
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Busca por Número (Pedido, Cupom PDV, Lançamento, NF, Nosso Nº) */}
          <div className="md:col-span-4">
            <label className="text-[11px] font-semibold text-slate-500 mb-1 block">
              Nº Pedido / Cupom PDV / Lançamento / NF / Nosso Nº
            </label>
            <div className="relative">
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                value={numberFilter}
                onChange={e => setNumberFilter(e.target.value)}
                placeholder="Ex.: 12345, NF 980, Cupom 45..."
                className={`${inputCls} pl-9`}
              />
            </div>
          </div>

          {/* Busca por Cliente / Pagador */}
          <div className="md:col-span-5">
            <label className="text-[11px] font-semibold text-slate-500 mb-1 block">
              Cliente / Pagador / CPF-CNPJ / Linha digitável
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Nome, Razão Social, CPF/CNPJ, descrição..."
                className={`${inputCls} pl-9`}
              />
            </div>
          </div>

          {/* Origem */}
          <div className="md:col-span-3">
            <label className="text-[11px] font-semibold text-slate-500 mb-1 block">Origem do boleto</label>
            <select value={origin} onChange={e => setOrigin(e.target.value)} className={inputCls}>
              {ORIGIN_FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {/* Linha 2: Período (Vencimento vs Emissão vs Pagamento) + Ordenação + Botões */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end pt-1 border-t border-slate-100 dark:border-slate-800">
          <div className="lg:col-span-2">
            <label className="text-[11px] font-semibold text-slate-500 mb-1 flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-pink-600" /> Filtrar período por
            </label>
            <select value={dateField} onChange={e => setDateField(e.target.value as any)} className={inputCls}>
              <option value="due">Data de Vencimento</option>
              <option value="issue">Data de Emissão</option>
              <option value="paid">Data de Pagamento</option>
            </select>
          </div>

          <div className="lg:col-span-2">
            <label className="text-[11px] font-semibold text-slate-500 mb-1 block">De (Data inicial)</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} />
          </div>

          <div className="lg:col-span-2">
            <label className="text-[11px] font-semibold text-slate-500 mb-1 block">Até (Data final)</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputCls} />
          </div>

          <div className="lg:col-span-3">
            <label className="text-[11px] font-semibold text-slate-500 mb-1 block">Atalhos de período</label>
            <div className="flex flex-wrap gap-1">
              <button type="button" onClick={() => applyPreset('today')} className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-medium hover:bg-slate-50 dark:hover:bg-slate-800">Hoje</button>
              <button type="button" onClick={() => applyPreset('next7')} className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-medium hover:bg-slate-50 dark:hover:bg-slate-800">7 dias</button>
              <button type="button" onClick={() => applyPreset('month')} className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-medium hover:bg-slate-50 dark:hover:bg-slate-800">Este mês</button>
              <button type="button" onClick={() => applyPreset('prev_month')} className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-medium hover:bg-slate-50 dark:hover:bg-slate-800">Mês ant.</button>
              {(dateFrom || dateTo) && (
                <button type="button" onClick={() => applyPreset('clear')} className="h-8 px-2 rounded-lg text-[11px] text-rose-600 hover:bg-rose-50">Limpar</button>
              )}
            </div>
          </div>

          <div className="lg:col-span-2">
            <label className="text-[11px] font-semibold text-slate-500 mb-1 block">Ordenar por</label>
            <select value={sort} onChange={e => setSort(e.target.value)} className={inputCls}>
              <option value="due_asc">Vencimento (mais próximo)</option>
              <option value="due_desc">Vencimento (mais distante)</option>
              <option value="created_desc">Emissão (mais recente)</option>
              <option value="created_asc">Emissão (mais antiga)</option>
              <option value="paid_desc">Pagamento (mais recente)</option>
              <option value="amount_desc">Maior valor</option>
            </select>
          </div>

          <div className="lg:col-span-1 flex gap-1.5">
            <button type="submit" className={`${btnCls} w-full bg-slate-900 text-white dark:bg-white dark:text-slate-900`}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Filtrar'}
            </button>
          </div>
        </div>

        {(search || numberFilter || dateFrom || dateTo || origin || tab) && (
          <div className="flex items-center justify-between pt-1 text-xs text-slate-500">
            <span>Filtros ativos aplicados na listagem abaixo.</span>
            <button type="button" onClick={() => { clearAllFilters(); setTimeout(() => load(1, pageSize), 0); }} className="text-pink-600 hover:underline font-semibold">
              Limpar todos os filtros
            </button>
          </div>
        )}
      </form>

      {/* Mobile: cards */}
      <div className="md:hidden space-y-2">
        {data?.items.map(c => (
          <div key={c.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 space-y-2">
            <Link href={`/financial/cora/boletos/${c.id}`} className="block space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{c.payer_name || '-'}</p>
                  <p className="text-[11px] text-slate-500">{maskDoc(c.payer_document)}</p>
                </div>
                <StatusBadge charge={c} />
              </div>
              <OriginContextTags charge={c} />
              <p className="text-xs text-slate-500 truncate">{c.description}</p>
              <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800 text-xs">
                <span className="text-slate-500">Emissão: <b>{fmtDate(c.issue_date || c.created_at)}</b> · Venc.: <b>{fmtDate(c.due_date)}</b></span>
                <span className="text-sm font-bold text-slate-900 dark:text-white">{brl(c.amount)}</span>
              </div>
            </Link>
            <div className="grid grid-cols-3 gap-1.5 pt-1">
              <button type="button" disabled={!c.has_pdf || pdfBusyId === c.id} onClick={() => openPdf(c.id)} className="h-8 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center justify-center gap-1 disabled:opacity-40">
                <FileDown className="h-3.5 w-3.5" /> PDF
              </button>
              <button type="button" disabled={!c.digitable_line || c.status === 'CANCELLED'} onClick={() => copy(c.digitable_line, 'Linha digitável')} className="h-8 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center justify-center gap-1 disabled:opacity-40">
                <Copy className="h-3.5 w-3.5" /> Linha
              </button>
              <button type="button" disabled={!c.pix_emv || c.status === 'CANCELLED'} onClick={() => copy(c.pix_emv, 'Pix copia e cola')} className="h-8 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold inline-flex items-center justify-center gap-1 disabled:opacity-40">
                <Copy className="h-3.5 w-3.5" /> Pix
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: tabela rica */}
      <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase tracking-wide border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="p-3 text-left">Nº / Origem & Referências</th>
              <th className="p-3 text-left">Cliente / Pagador</th>
              <th className="p-3 text-left">Emissão</th>
              <th className="p-3 text-left">Vencimento</th>
              <th className="p-3 text-left">Nosso Nº / Cora</th>
              <th className="p-3 text-right">Valor</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {data?.items.map(c => (
              <tr
                key={c.id}
                className="hover:bg-slate-50/80 dark:hover:bg-white/5 cursor-pointer transition-colors"
                onClick={() => router.push(`/financial/cora/boletos/${c.id}`)}
              >
                <td className="p-3 align-top">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-slate-900 dark:text-white">#{c.id}</span>
                    <EnvBadge env={c.environment} />
                    <span className="text-slate-600 dark:text-slate-300 truncate max-w-[230px] font-medium">{c.description}</span>
                  </div>
                  <OriginContextTags charge={c} />
                </td>
                <td className="p-3 align-top">
                  <p className="font-semibold text-slate-900 dark:text-white">{c.payer_name || '-'}</p>
                  <p className="text-slate-500 font-mono text-[11px]">{maskDoc(c.payer_document)}</p>
                </td>
                <td className="p-3 align-top whitespace-nowrap text-slate-600 dark:text-slate-300">
                  {fmtDate(c.issue_date || c.created_at)}
                </td>
                <td className="p-3 align-top whitespace-nowrap">
                  <p className={`font-semibold ${c.is_overdue ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'}`}>
                    {fmtDate(c.due_date)}
                  </p>
                  {c.paid_at && <p className="text-[11px] text-emerald-600">Pago em {fmtDate(c.paid_at)}</p>}
                </td>
                <td className="p-3 align-top font-mono text-[11px] text-slate-500">
                  <p>{c.our_number || '-'}</p>
                  {c.provider_charge_id && <p className="text-[10px] text-slate-400 truncate max-w-[110px]">{c.provider_charge_id}</p>}
                </td>
                <td className="p-3 align-top text-right whitespace-nowrap">
                  <p className="font-bold text-slate-900 dark:text-white text-sm">{brl(c.amount)}</p>
                  {c.total_paid != null && c.total_paid > 0 && c.total_paid !== c.amount && (
                    <p className="text-[11px] text-emerald-600">Pago: {brl(c.total_paid)}</p>
                  )}
                </td>
                <td className="p-3 align-top">
                  <StatusBadge charge={c} />
                </td>
                <td className="p-3 align-top" onClick={e => e.stopPropagation()}>
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      title="Abrir 2ª via do PDF"
                      disabled={!c.has_pdf || c.status === 'CANCELLED' || pdfBusyId === c.id}
                      onClick={() => openPdf(c.id)}
                      className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1 disabled:opacity-30 font-semibold"
                    >
                      {pdfBusyId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5 text-pink-600" />} PDF
                    </button>
                    <button
                      type="button"
                      title="Copiar linha digitável"
                      disabled={!c.digitable_line || c.status === 'CANCELLED'}
                      onClick={() => copy(c.digitable_line, 'Linha digitável')}
                      className="h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1 disabled:opacity-30"
                    >
                      <Copy className="h-3.5 w-3.5" /> Linha
                    </button>
                    <button
                      type="button"
                      title="Copiar Pix Copia e Cola"
                      disabled={!c.pix_emv || c.status === 'CANCELLED'}
                      onClick={() => copy(c.pix_emv, 'Pix copia e cola')}
                      className="h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1 disabled:opacity-30"
                    >
                      <Copy className="h-3.5 w-3.5" /> Pix
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && (data?.items.length ?? 0) === 0 && (
              <tr>
                <td colSpan={8} className="p-10 text-center text-slate-400">
                  Nenhum boleto encontrado para os filtros selecionados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Barra de Paginação Persistente */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 text-xs">
        <div className="flex items-center gap-3 text-slate-500">
          <span>
            Mostrando <b className="text-slate-800 dark:text-slate-100">{startIdx}</b>–<b className="text-slate-800 dark:text-slate-100">{endIdx}</b> de{' '}
            <b className="text-slate-800 dark:text-slate-100">{total}</b> boleto(s)
          </span>
          <label className="inline-flex items-center gap-1.5">
            <span>Por página:</span>
            <select
              value={pageSize}
              onChange={e => setPageSize(Number(e.target.value))}
              className="h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs font-semibold"
            >
              {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => load(1, pageSize)}
            className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold"
          >
            «
          </button>
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => load(page - 1, pageSize)}
            className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1 font-semibold"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Anterior
          </button>
          <span className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-semibold text-slate-700 dark:text-slate-200">
            Página {page} de {pages}
          </span>
          <button
            type="button"
            disabled={page >= pages || loading}
            onClick={() => load(page + 1, pageSize)}
            className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1 font-semibold"
          >
            Próxima <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            disabled={page >= pages || loading}
            onClick={() => load(pages, pageSize)}
            className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold"
          >
            »
          </button>
        </div>
      </div>

      {showNew && companyId && (
        <NewChargeModal
          companyId={companyId}
          onClose={() => setShowNew(false)}
          onCreated={(c) => { setShowNew(false); router.push(`/financial/cora/boletos/${c.id}`); }}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Modal de Emissão de Novo Boleto (Cliente -> Origem/Lançamentos Horus/Cronuz -> Emissão)
 * ───────────────────────────────────────────────────────────────────────────── */
function NewChargeModal({
  companyId,
  onClose,
  onCreated,
}: {
  companyId: number;
  onClose: () => void;
  onCreated: (c: Charge) => void;
}) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const defaultDue = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);

  // Passo 1: Busca e seleção de cliente
  const [custQuery, setCustQuery] = useState('');
  const [custLoading, setCustLoading] = useState(false);
  const [custResults, setCustResults] = useState<CustomerOption[]>([]);
  const [horusConfigured, setHorusConfigured] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);

  // Passo 2: Origem do boleto e títulos em aberto do cliente
  const [originTab, setOriginTab] = useState<'HORUS' | 'FINANCIAL' | 'ORDER' | 'PDV' | 'MANUAL'>('HORUS');
  const [openItemsData, setOpenItemsData] = useState<OpenItemsResponse | null>(null);
  const [openItemsLoading, setOpenItemsLoading] = useState(false);
  const [selectedItemRef, setSelectedItemRef] = useState<string | null>(null);

  // Passo 3: Dados do boleto e metadados de origem
  const [originType, setOriginType] = useState('MANUAL');
  const [originRef, setOriginRef] = useState('');
  const [financialLaunchId, setFinancialLaunchId] = useState('');
  const [installmentNumber, setInstallmentNumber] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [pdvCouponNumber, setPdvCouponNumber] = useState('');
  const [originMeta, setOriginMeta] = useState<Record<string, any> | null>(null);

  const [amount, setAmount] = useState(0);
  const [issueDate, setIssueDate] = useState(todayStr);
  const [dueDate, setDueDate] = useState(defaultDue);
  const [description, setDescription] = useState('');

  const [payer, setPayer] = useState({
    name: '', document: '', email: '', zip_code: '', street: '', number: '', complement: '', district: '', city: '', state: '',
  });
  const [saving, setSaving] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);

  const setPayerField = (k: keyof typeof payer, v: string) => setPayer(p => ({ ...p, [k]: v }));

  // Busca clientes (Cronuz + Horus)
  const searchCustomers = useCallback(async (q: string) => {
    setCustLoading(true);
    try {
      const qs = new URLSearchParams({ limit: '15' });
      if (q.trim()) qs.set('search', q.trim());
      const res = await paymentsApi<{
        horus_enabled: boolean;
        horus_sql_enabled: boolean;
        items: CustomerOption[];
      }>(companyId, `/customers?${qs.toString()}`);
      setCustResults(res.items || []);
      const usesHorus = Boolean(res.horus_enabled || res.horus_sql_enabled);
      setHorusConfigured(usesHorus);
      if (!usesHorus && originTab === 'HORUS') {
        setOriginTab('FINANCIAL');
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCustLoading(false);
    }
  }, [companyId, originTab]);

  useEffect(() => {
    const t = setTimeout(() => { searchCustomers(custQuery); }, 280);
    return () => clearTimeout(t);
  }, [custQuery, searchCustomers]);

  // Ao selecionar um cliente, preenche o sacado e busca lançamentos em aberto (Horus / Financeiro / Pedidos / PDV)
  const handleSelectCustomer = async (c: CustomerOption) => {
    setSelectedCustomer(c);
    setSelectedItemRef(null);
    setPayer({
      name: c.name || c.trade_name || '',
      document: c.document || '',
      email: c.email || '',
      zip_code: c.address?.zip_code || '',
      street: c.address?.street || '',
      number: c.address?.number || 'S/N',
      complement: c.address?.complement || '',
      district: c.address?.district || '',
      city: c.address?.city || '',
      state: c.address?.state || '',
    });

    setOpenItemsLoading(true);
    try {
      const qs = new URLSearchParams({ origin_group: 'ALL' });
      if (c.customer_id) qs.set('customer_id', String(c.customer_id));
      if (c.document) qs.set('document', c.document);
      if (c.id_guid) qs.set('id_guid', c.id_guid);
      if (c.horus_cod_cli) qs.set('horus_cod_cli', c.horus_cod_cli);
      const openRes = await paymentsApi<OpenItemsResponse>(companyId, `/customers/open-items?${qs.toString()}`);
      setOpenItemsData(openRes);
      if ((openRes.horus_items?.length ?? 0) > 0 || openRes.horus_enabled || openRes.horus_sql_enabled) {
        setOriginTab('HORUS');
      } else if ((openRes.financial_items?.length ?? 0) > 0) {
        setOriginTab('FINANCIAL');
      } else if ((openRes.order_items?.length ?? 0) > 0) {
        setOriginTab('ORDER');
      } else if ((openRes.pdv_items?.length ?? 0) > 0) {
        setOriginTab('PDV');
      } else {
        setOriginTab('MANUAL');
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setOpenItemsLoading(false);
    }
  };

  // Ao selecionar um lançamento/pedido/cupom da lista
  const handleSelectOpenItem = (item: OpenOriginItem) => {
    if (item.has_existing_boleto) {
      toast.error('Este lançamento já possui um boleto gerado e não pode ser emitido em duplicidade.');
      return;
    }
    setSelectedItemRef(item.origin_ref);
    setOriginType(item.origin_type);
    setOriginRef(item.origin_ref);
    setFinancialLaunchId(item.financial_launch_id || '');
    setInstallmentNumber(item.installment_number || '1');
    setInvoiceNumber(item.invoice_number || '');
    setOrderNumber(item.order_number || '');
    setPdvCouponNumber(item.pdv_coupon_number || '');
    setOriginMeta(item.origin_meta || null);
    setAmount(item.amount || 0);
    if (item.issue_date) setIssueDate(item.issue_date);
    if (item.due_date) {
      // Se o vencimento do lançamento estiver no passado, sugere hoje ou mantém editável com aviso
      setDueDate(item.due_date < todayStr ? todayStr : item.due_date);
    }
    setDescription(item.description || '');
    toast.success('Dados do lançamento carregados para emissão.');
  };

  // Quando o usuário troca manualmente a aba de situação/origem
  const handleChangeOriginTab = (tabKey: typeof originTab) => {
    setOriginTab(tabKey);
    if (tabKey === 'MANUAL') {
      setSelectedItemRef(null);
      setOriginType('MANUAL');
      setOriginRef('');
    } else if (tabKey === 'HORUS') {
      setOriginType(horusConfigured ? 'HORUS_API' : 'HORUS_SQL');
    } else if (tabKey === 'FINANCIAL') {
      setOriginType('FINANCIAL');
    } else if (tabKey === 'ORDER') {
      setOriginType('B2B_ORDER');
    } else if (tabKey === 'PDV') {
      setOriginType('PDV');
    }
  };

  const lookupCep = async () => {
    const cep = payer.zip_code.replace(/\D/g, '');
    if (cep.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const d = await res.json();
      if (!d.erro) {
        setPayer(p => ({
          ...p,
          street: d.logradouro || p.street,
          district: d.bairro || p.district,
          city: d.localidade || p.city,
          state: d.uf || p.state,
        }));
      }
    } catch { /* preenchimento manual */ } finally {
      setCepLoading(false);
    }
  };

  const submit = async () => {
    if (amount < 5) {
      toast.error('Valor mínimo do boleto no Banco Cora é R$ 5,00.');
      return;
    }
    if (!description.trim()) {
      toast.error('Informe a descrição da cobrança.');
      return;
    }
    setSaving(true);
    try {
      const body = {
        provider: 'CORA',
        method: 'BOLETO',
        amount: amount.toFixed(2),
        due_date: dueDate,
        issue_date: issueDate || null,
        description: description.trim(),
        origin_type: originType,
        origin_ref: originRef || null,
        customer_id: selectedCustomer?.customer_id || openItemsData?.customer_id || null,
        financial_launch_id: financialLaunchId.trim() || null,
        installment_number: installmentNumber.trim() || null,
        invoice_number: invoiceNumber.trim() || null,
        order_number: orderNumber.trim() || null,
        pdv_coupon_number: pdvCouponNumber.trim() || null,
        horus_cod_cli: selectedCustomer?.horus_cod_cli || openItemsData?.horus_cod_cli || null,
        horus_id_guid: selectedCustomer?.id_guid || openItemsData?.id_guid || null,
        origin_meta: originMeta,
        payer: {
          ...payer,
          document: payer.document.replace(/\D/g, ''),
          zip_code: payer.zip_code.replace(/\D/g, ''),
          state: payer.state.toUpperCase(),
          email: payer.email || null,
          complement: payer.complement || null,
          number: payer.number || 'S/N',
        },
      };
      const res = await paymentsApi<{ charge: Charge }>(companyId, '/charges', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      toast.success('Boleto emitido com sucesso no Banco Cora!');
      onCreated(res.charge);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const currentOpenList: OpenOriginItem[] =
    originTab === 'HORUS' ? (openItemsData?.horus_items || [])
    : originTab === 'FINANCIAL' ? (openItemsData?.financial_items || [])
    : originTab === 'ORDER' ? (openItemsData?.order_items || [])
    : originTab === 'PDV' ? (openItemsData?.pdv_items || [])
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={onClose}>
      <div
        className="w-full sm:max-w-4xl max-h-[94vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-900 p-4 md:p-6 space-y-5 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Cabeçalho do modal */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
          <div>
            <h2 className="text-base md:text-lg font-bold text-slate-900 dark:text-white">Emitir Novo Boleto Cora</h2>
            <p className="text-xs text-slate-500">
              1º Selecione o cliente (Horus / Cronuz) · 2º Escolha o lançamento, pedido ou cupom PDV · 3º Confirme e emita
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* PASSO 1: Selecionar Cliente */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
              <Building2 className="h-4 w-4 text-pink-600" /> 1. Selecionar Cliente ({horusConfigured ? 'Horus ERP & Cronuz' : 'Cronuz'})
            </span>
            {selectedCustomer && (
              <button
                type="button"
                onClick={() => { setSelectedCustomer(null); setOpenItemsData(null); setSelectedItemRef(null); }}
                className="text-xs text-pink-600 hover:underline font-semibold"
              >
                Trocar cliente
              </button>
            )}
          </div>

          {!selectedCustomer ? (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  value={custQuery}
                  onChange={e => setCustQuery(e.target.value)}
                  placeholder="Digite o nome, Razão Social, CPF/CNPJ ou código Horus do cliente..."
                  className={`${inputCls} pl-9`}
                />
                {custLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-pink-600" />}
              </div>
              <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
                {custResults.map((c, idx) => (
                  <button
                    key={`${c.customer_id || 'h'}-${c.document}-${idx}`}
                    type="button"
                    onClick={() => handleSelectCustomer(c)}
                    className="w-full text-left px-3 py-2.5 hover:bg-pink-50/50 dark:hover:bg-white/5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{c.name}</p>
                      <p className="text-[11px] text-slate-500">
                        {maskDoc(c.document)}
                        {c.address?.city ? ` · ${c.address.city}/${c.address.state}` : ''}
                        {c.email ? ` · ${c.email}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {c.has_horus_link && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
                          Horus {c.horus_cod_cli ? `#${c.horus_cod_cli}` : 'GUID'}
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        Selecionar
                      </span>
                    </div>
                  </button>
                ))}
                {!custLoading && custResults.length === 0 && (
                  <p className="p-3 text-center text-xs text-slate-400">
                    Nenhum cliente localizado. Digite o CPF/CNPJ completo para buscar direto no Horus ou preencha abaixo manualmente.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl bg-white dark:bg-slate-900 border border-emerald-500/30 p-3">
              <div className="flex items-start gap-2.5">
                <UserCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{selectedCustomer.name}</p>
                  <p className="text-xs text-slate-500">
                    {maskDoc(selectedCustomer.document)}
                    {selectedCustomer.email ? ` · ${selectedCustomer.email}` : ''}
                    {selectedCustomer.address?.city ? ` · ${selectedCustomer.address.city}/${selectedCustomer.address.state}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {(selectedCustomer.horus_cod_cli || openItemsData?.horus_cod_cli) && (
                  <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-[11px] font-mono font-bold">
                    Cód. Horus: {selectedCustomer.horus_cod_cli || openItemsData?.horus_cod_cli}
                  </span>
                )}
                {(selectedCustomer.id_guid || openItemsData?.id_guid) && (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold">
                    GUID Horus autenticado
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* PASSO 2: Origem do Boleto & Lançamentos Financeiros do Cliente */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">
              2. Origem da Cobrança & Títulos do Cliente
            </span>
            {openItemsLoading && (
              <span className="inline-flex items-center gap-1.5 text-xs text-pink-600 font-medium">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Consultando lançamentos no Horus / Cronuz...
              </span>
            )}
          </div>

          {/* Seletor de situação/origem */}
          <div className="flex flex-wrap gap-1.5">
            {[
              { key: 'HORUS', label: `Lançamento Horus ERP (${openItemsData?.horus_items?.length ?? 0})` },
              { key: 'FINANCIAL', label: `Financeiro Cronuz (${openItemsData?.financial_items?.length ?? 0})` },
              { key: 'ORDER', label: `Pedido (${openItemsData?.order_items?.length ?? 0})` },
              { key: 'PDV', label: `Cupom PDV (${openItemsData?.pdv_items?.length ?? 0})` },
              { key: 'MANUAL', label: 'Avulso / Digitação Manual' },
            ].map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => handleChangeOriginTab(t.key as any)}
                className={`h-8 px-3 rounded-xl text-xs font-semibold border transition-colors ${
                  originTab === t.key
                    ? 'bg-pink-600 text-white border-pink-600'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tabela de lançamentos da aba selecionada */}
          {originTab !== 'MANUAL' && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 max-h-56">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase">
                  <tr>
                    <th className="p-2.5 text-left">Lançamento / Doc</th>
                    <th className="p-2.5 text-left">Nota Fiscal</th>
                    <th className="p-2.5 text-left">Pedido / Cupom</th>
                    <th className="p-2.5 text-left">Emissão</th>
                    <th className="p-2.5 text-left">Vencimento</th>
                    <th className="p-2.5 text-right">Valor</th>
                    <th className="p-2.5 text-right">Situação / Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {currentOpenList.map(item => {
                    const isSelected = selectedItemRef === item.origin_ref;
                    return (
                      <tr
                        key={item.origin_ref}
                        className={`${
                          isSelected
                            ? 'bg-pink-50/70 dark:bg-pink-950/20'
                            : item.has_existing_boleto
                            ? 'bg-slate-50/60 dark:bg-slate-800/20 opacity-75'
                            : 'hover:bg-slate-50 dark:hover:bg-white/5'
                        }`}
                      >
                        <td className="p-2.5 font-mono font-bold text-slate-900 dark:text-white">
                          {item.financial_launch_id
                            ? `#${item.financial_launch_id}${item.installment_number ? `/${item.installment_number}` : ''}`
                            : item.origin_ref}
                          {item.payment_form && (
                            <span className="block font-sans font-normal text-[10px] text-slate-500">{item.payment_form}</span>
                          )}
                        </td>
                        <td className="p-2.5 font-mono text-slate-600 dark:text-slate-300">{item.invoice_number || '-'}</td>
                        <td className="p-2.5 font-mono text-slate-600 dark:text-slate-300">
                          {item.order_number ? `Ped. #${item.order_number}` : item.pdv_coupon_number ? `Cupom #${item.pdv_coupon_number}` : '-'}
                        </td>
                        <td className="p-2.5 text-slate-500">{fmtDate(item.issue_date)}</td>
                        <td className="p-2.5 font-semibold text-slate-800 dark:text-slate-100">{fmtDate(item.due_date)}</td>
                        <td className="p-2.5 text-right font-bold text-slate-900 dark:text-white">{brl(item.amount)}</td>
                        <td className="p-2.5 text-right">
                          {item.has_existing_boleto ? (
                            <div className="inline-flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 text-[10px] font-bold">
                                <Ban className="h-3 w-3" />
                                {item.existing_boleto_source === 'HORUS' ? 'Já tem boleto no Horus' : `Boleto Cora #${item.existing_charge_id}`}
                              </span>
                              {item.existing_charge_id && (
                                <Link
                                  href={`/financial/cora/boletos/${item.existing_charge_id}`}
                                  className="text-pink-600 hover:underline inline-flex items-center gap-0.5 text-[11px] font-semibold"
                                >
                                  Ver <ExternalLink className="h-3 w-3" />
                                </Link>
                              )}
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleSelectOpenItem(item)}
                              className={`h-7 px-2.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 ${
                                isSelected
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-pink-600 hover:bg-pink-700 text-white'
                              }`}
                            >
                              {isSelected ? <><CheckCircle2 className="h-3.5 w-3.5" /> Selecionado</> : 'Gerar boleto'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!openItemsLoading && currentOpenList.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-5 text-center text-slate-400">
                        {selectedCustomer
                          ? 'Nenhum título em aberto encontrado nesta categoria para este cliente.'
                          : 'Selecione um cliente no Passo 1 para listar automaticamente seus títulos em aberto.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Campos de vínculo de número (preenchidos automaticamente ao selecionar título ou editáveis) */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1">
            <label className="text-[11px] text-slate-500 space-y-1 block">
              Nº Lançamento (Horus/Fin)
              <input value={financialLaunchId} onChange={e => setFinancialLaunchId(e.target.value)} placeholder="Ex.: 45890" className={inputCls} />
            </label>
            <label className="text-[11px] text-slate-500 space-y-1 block">
              Parcela
              <input value={installmentNumber} onChange={e => setInstallmentNumber(e.target.value)} placeholder="Ex.: 1" className={inputCls} />
            </label>
            <label className="text-[11px] text-slate-500 space-y-1 block">
              Nº Nota Fiscal (NF-e)
              <input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="Ex.: 10234" className={inputCls} />
            </label>
            <label className="text-[11px] text-slate-500 space-y-1 block">
              Nº do Pedido
              <input value={orderNumber} onChange={e => setOrderNumber(e.target.value)} placeholder="Ex.: 8901" className={inputCls} />
            </label>
            <label className="text-[11px] text-slate-500 space-y-1 block">
              Nº Cupom PDV
              <input value={pdvCouponNumber} onChange={e => setPdvCouponNumber(e.target.value)} placeholder="Ex.: 000125" className={inputCls} />
            </label>
          </div>
        </div>

        {/* PASSO 3: Valores, Datas e Endereço do Sacado */}
        <div className="space-y-3">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200 block">
            3. Valores, Datas e Dados do Pagador
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="text-xs text-slate-500 space-y-1 block">
              Valor do boleto *
              <CurrencyInput value={amount} onChangeValue={setAmount} prefixStr="R$ " className={inputCls} />
            </label>
            <label className="text-xs text-slate-500 space-y-1 block">
              Data de Emissão
              <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className={inputCls} />
            </label>
            <label className="text-xs text-slate-500 space-y-1 block">
              Data de Vencimento *
              <input type="date" value={dueDate} min={todayStr} onChange={e => setDueDate(e.target.value)} className={inputCls} />
            </label>
          </div>

          <label className="text-xs text-slate-500 space-y-1 block">
            Descrição / Discriminação do Serviço enviada ao Banco Cora *
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              maxLength={100}
              placeholder="Ex.: ERP Horus - Lanç. 12345/1 | NF 6789 | Pedido 4321"
              className={inputCls}
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <label className="text-xs text-slate-500 space-y-1 block">
              Nome / Razão Social *
              <input value={payer.name} onChange={e => setPayerField('name', e.target.value)} className={inputCls} />
            </label>
            <label className="text-xs text-slate-500 space-y-1 block">
              CPF / CNPJ *
              <input value={payer.document} onChange={e => setPayerField('document', e.target.value)} inputMode="numeric" className={inputCls} />
            </label>
            <label className="text-xs text-slate-500 space-y-1 block">
              E-mail (para notificação do boleto)
              <input type="email" value={payer.email} onChange={e => setPayerField('email', e.target.value)} className={inputCls} />
            </label>
            <label className="text-xs text-slate-500 space-y-1 block">
              CEP *
              <div className="relative">
                <input value={payer.zip_code} onChange={e => setPayerField('zip_code', e.target.value)} onBlur={lookupCep} inputMode="numeric" className={inputCls} />
                {cepLoading && <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-slate-400" />}
              </div>
            </label>
            <label className="text-xs text-slate-500 space-y-1 block">
              Logradouro *
              <input value={payer.street} onChange={e => setPayerField('street', e.target.value)} className={inputCls} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-slate-500 space-y-1 block">
                Número *
                <input value={payer.number} onChange={e => setPayerField('number', e.target.value)} className={inputCls} />
              </label>
              <label className="text-xs text-slate-500 space-y-1 block">
                Complemento
                <input value={payer.complement} onChange={e => setPayerField('complement', e.target.value)} className={inputCls} />
              </label>
            </div>
            <label className="text-xs text-slate-500 space-y-1 block">
              Bairro *
              <input value={payer.district} onChange={e => setPayerField('district', e.target.value)} className={inputCls} />
            </label>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-slate-500 space-y-1 block">
                  Cidade *
                  <input value={payer.city} onChange={e => setPayerField('city', e.target.value)} className={inputCls} />
                </label>
              </div>
              <label className="text-xs text-slate-500 space-y-1 block">
                UF *
                <input value={payer.state} maxLength={2} onChange={e => setPayerField('state', e.target.value)} className={inputCls} />
              </label>
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-3 border-t border-slate-200 dark:border-slate-800">
          <button type="button" onClick={onClose} className={`${btnCls} border border-slate-200 dark:border-slate-700`}>
            Cancelar
          </button>
          <button type="button" onClick={submit} disabled={saving} className={`${btnCls} bg-pink-600 hover:bg-pink-700 text-white`}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Emitir boleto no Cora
          </button>
        </div>
      </div>
    </div>
  );
}
