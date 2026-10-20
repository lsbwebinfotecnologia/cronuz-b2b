'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Receipt, Search, RefreshCw, Loader2, CheckSquare, Square, Copy, FileDown, XCircle,
  Settings2, ListChecks, Landmark, ShieldCheck, AlertTriangle, CheckCircle2, Clock, Send, Upload, Link2,
} from 'lucide-react';
import { toast } from 'sonner';
import { getToken, getUser } from '@/lib/auth';
import { CurrencyInput } from '@/components/CurrencyInput';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const MAX_PEM_BYTES = 20 * 1024;

type Tab = 'titulos' | 'boletos' | 'config';

interface Title {
  nro_lancamento: number;
  cod_parcela: number;
  cliente_nome: string;
  documento: string;
  forma_nome: string;
  vencimento: string | null;
  valor: number;
  cod_ped_venda?: number | null;
  cod_nf?: number | null;
  vencido: boolean;
  horus_tem_boleto: boolean;
  boleto: { id: number; status: string; erro?: string | null } | null;
}

interface Invoice {
  id: number;
  status: string;
  nro_lancamento: number;
  cod_parcela: number;
  cod_ped_venda?: number | null;
  cliente_nome: string;
  documento: string;
  valor: number;
  valor_pago: number | null;
  vencimento: string | null;
  pago_em: string | null;
  linha_digitavel: string | null;
  pix_copia_cola: string | null;
  horus_gravado: boolean;
  bordero_baixa: number | null;
  erro: string | null;
}

interface CoraSettings {
  feature_enabled: boolean;
  cora_enabled: boolean;
  cora_sandbox: boolean;
  cora_client_id: string;
  has_certificate: boolean;
  has_private_key: boolean;
  cora_fine_rate: number | null;
  cora_interest_rate: number | null;
  cora_notify_email: boolean;
  cora_horus_cod_formas: string;
  cora_horus_write_back: boolean;
  cora_horus_auto_baixa: boolean;
  cora_horus_banco_forma_pagto: string;
  cora_horus_banco_codigo: string;
  cora_horus_banco_agencia: string;
  cora_horus_banco_conta: string;
  cora_horus_banco_carteira: string;
  webhook_registered: boolean;
}

const STATUS_STYLE: Record<string, string> = {
  OPEN: 'bg-sky-500/10 text-sky-700 border-sky-500/20 dark:text-sky-300',
  LATE: 'bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-300',
  IN_PAYMENT: 'bg-violet-500/10 text-violet-700 border-violet-500/20 dark:text-violet-300',
  PAID: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-300',
  CANCELLED: 'bg-slate-500/10 text-slate-600 border-slate-500/20 dark:text-slate-300',
  ERROR: 'bg-rose-500/10 text-rose-700 border-rose-500/20 dark:text-rose-300',
  PENDING: 'bg-slate-500/10 text-slate-600 border-slate-500/20 dark:text-slate-300',
  DRAFT: 'bg-slate-500/10 text-slate-600 border-slate-500/20 dark:text-slate-300',
};
const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Em aberto', LATE: 'Vencido', IN_PAYMENT: 'Em pagamento', PAID: 'Pago',
  CANCELLED: 'Cancelado', ERROR: 'Erro', PENDING: 'Pendente', DRAFT: 'Registrando',
};

const INVOICE_FILTERS: { key: string; label: string; status?: string; pendingBaixa?: boolean }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'open', label: 'Em aberto', status: 'OPEN,LATE,IN_PAYMENT,DRAFT,PENDING' },
  { key: 'paid', label: 'Pagos', status: 'PAID' },
  { key: 'baixa', label: 'Pagos sem baixa', pendingBaixa: true },
  { key: 'error', label: 'Erros', status: 'ERROR' },
  { key: 'cancelled', label: 'Cancelados', status: 'CANCELLED' },
];

const brl = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '-';
const maskDoc = (d: string) =>
  d?.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
    : d?.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : d || '-';

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-bold whitespace-nowrap ${STATUS_STYLE[status] || STATUS_STYLE.PENDING}`}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

export default function BoletoCoraPage() {
  const user = getUser();
  const companyId = user?.company_id;
  const [tab, setTab] = useState<Tab>('titulos');

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const res = await fetch(`${API}/companies/${companyId}/horus-cora${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, ...(init?.headers || {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.detail || `Erro HTTP ${res.status}`);
    return body;
  }, [companyId]);

  const copy = (text: string | null, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} copiado(a).`));
  };

  // ── Títulos (Horus) ─────────────────────────────────────────────────────
  const [titles, setTitles] = useState<Title[]>([]);
  const [titlesTotal, setTitlesTotal] = useState(0);
  const [titlesValor, setTitlesValor] = useState(0);
  const [titlesPage, setTitlesPage] = useState(1);
  const [titlesLoading, setTitlesLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [selected, setSelected] = useState<Record<string, Title>>({});
  const [emitting, setEmitting] = useState(false);
  const [overdueDate, setOverdueDate] = useState('');
  const [emitResult, setEmitResult] = useState<any>(null);
  const PAGE_SIZE = 50;

  const loadTitles = useCallback(async (page = 1) => {
    if (!companyId) return;
    setTitlesLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
      if (search.trim()) qs.set('search', search.trim());
      if (dueFrom) qs.set('due_from', dueFrom);
      if (dueTo) qs.set('due_to', dueTo);
      const data = await api(`/titles?${qs.toString()}`);
      setTitles(data.items || []);
      setTitlesTotal(data.total || 0);
      setTitlesValor(data.total_valor || 0);
      setTitlesPage(page);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setTitlesLoading(false);
    }
  }, [api, companyId, search, dueFrom, dueTo]);

  const keyOf = (t: { nro_lancamento: number; cod_parcela: number }) => `${t.nro_lancamento}-${t.cod_parcela}`;
  const selectable = (t: Title) => !t.boleto || ['ERROR', 'PENDING'].includes(t.boleto.status);
  const selectedList = Object.values(selected);
  const selectedHasOverdue = selectedList.some(t => t.vencido);
  const selectedTotal = selectedList.reduce((s, t) => s + t.valor, 0);
  const pageSelectable = titles.filter(selectable);
  const allPageSelected = pageSelectable.length > 0 && pageSelectable.every(t => selected[keyOf(t)]);

  const toggleTitle = (t: Title) => setSelected(prev => {
    const next = { ...prev };
    if (next[keyOf(t)]) delete next[keyOf(t)]; else next[keyOf(t)] = t;
    return next;
  });
  const togglePage = () => setSelected(prev => {
    const next = { ...prev };
    pageSelectable.forEach(t => { if (allPageSelected) delete next[keyOf(t)]; else next[keyOf(t)] = t; });
    return next;
  });

  const handleEmit = async () => {
    if (!selectedList.length) return;
    if (selectedList.length > 100) { toast.error('Emita no máximo 100 boletos por vez.'); return; }
    if (selectedHasOverdue && !overdueDate) { toast.error('Há títulos vencidos: informe o novo vencimento.'); return; }
    setEmitting(true);
    setEmitResult(null);
    try {
      const data = await api('/invoices', {
        method: 'POST',
        body: JSON.stringify({
          items: selectedList.map(t => ({ nro_lancamento: t.nro_lancamento, cod_parcela: t.cod_parcela })),
          overdue_due_date: selectedHasOverdue ? overdueDate : null,
        }),
      });
      setEmitResult(data);
      if (data.emitted) toast.success(`${data.emitted} boleto(s) emitido(s) no Cora.`);
      if (data.failed) toast.warning(`${data.failed} título(s) não emitido(s). Veja os detalhes.`);
      setSelected({});
      loadTitles(titlesPage);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setEmitting(false);
    }
  };

  // ── Boletos emitidos ────────────────────────────────────────────────────
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invTotal, setInvTotal] = useState(0);
  const [invPage, setInvPage] = useState(1);
  const [invFilter, setInvFilter] = useState('open');
  const [invSearch, setInvSearch] = useState('');
  const [invLoading, setInvLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);

  const loadInvoices = useCallback(async (page = 1) => {
    if (!companyId) return;
    setInvLoading(true);
    try {
      const f = INVOICE_FILTERS.find(x => x.key === invFilter);
      const qs = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
      if (f?.status) qs.set('status', f.status);
      if (f?.pendingBaixa) qs.set('pending_baixa', 'true');
      if (invSearch.trim()) qs.set('search', invSearch.trim());
      const data = await api(`/invoices?${qs.toString()}`);
      setInvoices(data.items || []);
      setInvTotal(data.total || 0);
      setInvPage(page);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setInvLoading(false);
    }
  }, [api, companyId, invFilter, invSearch]);

  const invoiceAction = async (inv: Invoice, action: 'sync' | 'cancel' | 'pdf') => {
    if (action === 'cancel' && !confirm(`Cancelar o boleto do título ${inv.nro_lancamento}/${inv.cod_parcela} no Cora?`)) return;
    setBusyId(inv.id);
    try {
      if (action === 'pdf') {
        const data = await api(`/invoices/${inv.id}/pdf`);
        window.open(data.url, '_blank', 'noopener,noreferrer');
      } else {
        await api(`/invoices/${inv.id}/${action}`, { method: 'POST' });
        toast.success(action === 'sync' ? 'Status atualizado.' : 'Boleto cancelado.');
        loadInvoices(invPage);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const bulkSync = async () => {
    setBulkBusy('sync');
    try {
      const data = await api('/invoices/sync-pending', { method: 'POST' });
      toast.success(data.message || `${data.updated} de ${data.checked} boletos atualizados.`);
      if (data.baixa?.bordero) toast.success(`Borderô #${data.baixa.bordero} gerado no Horus.`);
      loadInvoices(invPage);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBulkBusy(null);
    }
  };

  const bulkBaixa = async () => {
    if (!confirm('Gerar borderô de baixa no Horus para todos os boletos pagos ainda sem baixa?')) return;
    setBulkBusy('baixa');
    try {
      const data = await api('/baixa', { method: 'POST', body: JSON.stringify({}) });
      data.success ? toast.success(data.message) : toast.warning(data.message);
      loadInvoices(invPage);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBulkBusy(null);
    }
  };

  // ── Configurações ───────────────────────────────────────────────────────
  const [cfg, setCfg] = useState<CoraSettings | null>(null);
  const [cfgError, setCfgError] = useState<string | null>(null);
  const [savingCfg, setSavingCfg] = useState(false);
  const [testing, setTesting] = useState(false);
  const [certText, setCertText] = useState('');
  const [keyText, setKeyText] = useState('');
  const [webhookBase, setWebhookBase] = useState('');
  const [registering, setRegistering] = useState(false);

  const loadSettings = useCallback(async () => {
    if (!companyId) return;
    try {
      setCfg(await api('/settings'));
      setCfgError(null);
    } catch (e: any) {
      setCfgError(e.message);
    }
  }, [api, companyId]);

  useEffect(() => { loadSettings(); }, [loadSettings]);
  useEffect(() => { if (tab === 'titulos') loadTitles(1); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'boletos') loadInvoices(1); }, [tab, invFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (typeof window !== 'undefined') setWebhookBase(API.startsWith('https://') ? API : ''); }, []);

  const readPemFile = (file: File | undefined, setter: (v: string) => void) => {
    if (!file) return;
    if (file.size > MAX_PEM_BYTES) { toast.error('O arquivo excede o limite máximo permitido de 20 KB.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      if (!text.includes('-----BEGIN')) { toast.error('Arquivo não está no formato PEM.'); return; }
      setter(text);
      toast.success(`${file.name} carregado.`);
    };
    reader.readAsText(file);
  };

  const saveSettings = async () => {
    if (!cfg) return;
    setSavingCfg(true);
    try {
      const payload: Record<string, any> = {
        cora_enabled: cfg.cora_enabled,
        cora_sandbox: cfg.cora_sandbox,
        cora_client_id: cfg.cora_client_id,
        cora_fine_rate: cfg.cora_fine_rate ?? 0,
        cora_interest_rate: cfg.cora_interest_rate ?? 0,
        cora_notify_email: cfg.cora_notify_email,
        cora_horus_cod_formas: cfg.cora_horus_cod_formas,
        cora_horus_write_back: cfg.cora_horus_write_back,
        cora_horus_auto_baixa: cfg.cora_horus_auto_baixa,
        cora_horus_banco_forma_pagto: cfg.cora_horus_banco_forma_pagto,
        cora_horus_banco_codigo: cfg.cora_horus_banco_codigo,
        cora_horus_banco_agencia: cfg.cora_horus_banco_agencia,
        cora_horus_banco_conta: cfg.cora_horus_banco_conta,
        cora_horus_banco_carteira: cfg.cora_horus_banco_carteira,
      };
      if (certText) payload.cora_cert_content = certText;
      if (keyText) payload.cora_key_content = keyText;
      const data = await api('/settings', { method: 'PUT', body: JSON.stringify(payload) });
      setCfg(data.settings);
      setCertText('');
      setKeyText('');
      toast.success('Configurações do Cora salvas.');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingCfg(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      const data = await api('/test-connection', { method: 'POST' });
      toast.success(`${data.message} (${data.environment})`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setTesting(false);
    }
  };

  const registerWebhook = async () => {
    setRegistering(true);
    try {
      const data = await api('/webhook/register', { method: 'POST', body: JSON.stringify({ public_base_url: webhookBase }) });
      toast.success(data.message);
      loadSettings();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRegistering(false);
    }
  };

  const setField = <K extends keyof CoraSettings>(k: K, v: CoraSettings[K]) => setCfg(prev => prev ? { ...prev, [k]: v } : prev);

  const titlesPages = Math.max(1, Math.ceil(titlesTotal / PAGE_SIZE));
  const invPages = Math.max(1, Math.ceil(invTotal / PAGE_SIZE));
  const coraReady = !!cfg?.cora_enabled;

  const tabs = useMemo(() => ([
    { key: 'titulos' as Tab, label: 'Títulos do Horus', icon: ListChecks },
    { key: 'boletos' as Tab, label: 'Boletos emitidos', icon: Receipt },
    { key: 'config' as Tab, label: 'Configurações', icon: Settings2 },
  ]), []);

  if (cfgError) {
    return (
      <div className="p-4 md:p-6">
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200 flex gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0" /> {cfgError}
        </div>
      </div>
    );
  }

  const inputCls = 'w-full h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500/40';
  const btnCls = 'inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50';

  return (
    <div className="p-3 md:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-pink-500/10 border border-pink-500/20 text-pink-600"><Receipt className="h-6 w-6" /></div>
          <div>
            <h1 className="text-lg md:text-2xl font-bold text-slate-900 dark:text-white">Boleto Banco Cora</h1>
            <p className="text-xs md:text-sm text-slate-500">Títulos em aberto do Horus → boleto + Pix no Cora → baixa por borderô.</p>
          </div>
        </div>
        {cfg && (
          <div className="flex flex-wrap gap-2 text-[11px] font-bold">
            <span className={`px-2 py-1 rounded-full border ${coraReady ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700' : 'bg-slate-500/10 border-slate-500/20 text-slate-600'}`}>
              {coraReady ? 'Cora ativo' : 'Cora inativo'}
            </span>
            {coraReady && <span className="px-2 py-1 rounded-full border bg-sky-500/10 border-sky-500/20 text-sky-700">{cfg.cora_sandbox ? 'STAGE' : 'PRODUÇÃO'}</span>}
            {cfg.cora_horus_auto_baixa && <span className="px-2 py-1 rounded-full border bg-violet-500/10 border-violet-500/20 text-violet-700">Baixa automática</span>}
          </div>
        )}
      </div>

      {/* Tabs — roláveis no mobile */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`shrink-0 inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold border transition-colors ${tab === t.key ? 'bg-pink-600 text-white border-pink-600' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* ── TÍTULOS ─────────────────────────────────────────────────────── */}
      {tab === 'titulos' && (
        <section className="space-y-3">
          {!coraReady && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
              Ative e configure o Cora na aba <b>Configurações</b> para emitir boletos.
            </div>
          )}
          <form onSubmit={e => { e.preventDefault(); loadTitles(1); }} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            <div className="relative lg:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cliente, CPF/CNPJ, lançamento ou pedido" className={`${inputCls} pl-9`} />
            </div>
            <input type="date" value={dueFrom} onChange={e => setDueFrom(e.target.value)} className={inputCls} aria-label="Vencimento de" />
            <input type="date" value={dueTo} onChange={e => setDueTo(e.target.value)} className={inputCls} aria-label="Vencimento até" />
            <button type="submit" className={`${btnCls} bg-slate-900 text-white dark:bg-white dark:text-slate-900`} disabled={titlesLoading}>
              {titlesLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Buscar
            </button>
          </form>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs text-slate-500">
            <span>{titlesTotal} título(s) em aberto · {brl(titlesValor)}</span>
            {selectedList.length > 0 && <span className="font-semibold text-slate-700 dark:text-slate-200">{selectedList.length} selecionado(s) · {brl(selectedTotal)}</span>}
          </div>

          {/* Barra de emissão */}
          {selectedList.length > 0 && (
            <div className="sticky top-2 z-10 rounded-2xl border border-pink-500/30 bg-white/95 dark:bg-slate-900/95 backdrop-blur p-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              {selectedHasOverdue && (
                <label className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-xs text-amber-700 dark:text-amber-300">
                  <span className="font-semibold">Novo vencimento p/ vencidos:</span>
                  <input type="date" value={overdueDate} min={new Date().toISOString().slice(0, 10)} onChange={e => setOverdueDate(e.target.value)} className={`${inputCls} sm:w-44`} />
                </label>
              )}
              <div className="flex gap-2 sm:ml-auto">
                <button onClick={() => setSelected({})} className={`${btnCls} border border-slate-200 dark:border-slate-700`}>Limpar</button>
                <button onClick={handleEmit} disabled={emitting || !coraReady} className={`${btnCls} flex-1 sm:flex-none bg-pink-600 hover:bg-pink-700 text-white`}>
                  {emitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Emitir {selectedList.length} boleto(s)
                </button>
              </div>
            </div>
          )}

          {emitResult && emitResult.failed > 0 && (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-3 space-y-1">
              <p className="text-xs font-bold text-rose-700 dark:text-rose-300">Títulos não emitidos:</p>
              {emitResult.results.filter((r: any) => !r.success).map((r: any) => (
                <p key={`${r.nro_lancamento}-${r.cod_parcela}`} className="text-xs text-rose-700 dark:text-rose-300">
                  <b>{r.nro_lancamento}/{r.cod_parcela}</b> — {r.error}
                </p>
              ))}
            </div>
          )}

          {/* Mobile: cards */}
          <div className="md:hidden space-y-2">
            {titles.map(t => {
              const can = selectable(t);
              const checked = !!selected[keyOf(t)];
              return (
                <button key={keyOf(t)} disabled={!can} onClick={() => toggleTitle(t)}
                  className={`w-full text-left rounded-2xl border p-3 transition-colors ${checked ? 'border-pink-500 bg-pink-500/5' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'} ${!can ? 'opacity-70' : ''}`}>
                  <div className="flex items-start gap-3">
                    {can ? (checked ? <CheckSquare className="h-5 w-5 text-pink-600 shrink-0" /> : <Square className="h-5 w-5 text-slate-400 shrink-0" />) : <CheckCircle2 className="h-5 w-5 text-slate-300 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{t.cliente_nome}</p>
                      <p className="text-[11px] text-slate-500">{maskDoc(t.documento)} · Lanç. {t.nro_lancamento}/{t.cod_parcela}{t.cod_ped_venda ? ` · Ped. ${t.cod_ped_venda}` : ''}</p>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className={`text-xs ${t.vencido ? 'text-amber-600 font-semibold' : 'text-slate-500'}`}>Venc. {fmtDate(t.vencimento)}</span>
                        <span className="text-sm font-bold">{brl(t.valor)}</span>
                      </div>
                      {t.boleto && <div className="mt-1"><StatusBadge status={t.boleto.status} /></div>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Desktop: tabela densa */}
          <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="p-2 w-10 text-center">
                    <button onClick={togglePage} aria-label="Selecionar página">{allPageSelected ? <CheckSquare className="h-4 w-4 text-pink-600" /> : <Square className="h-4 w-4" />}</button>
                  </th>
                  <th className="p-2 text-left">Lançamento</th>
                  <th className="p-2 text-left">Cliente</th>
                  <th className="p-2 text-left">Forma</th>
                  <th className="p-2 text-left">Pedido / NF</th>
                  <th className="p-2 text-left">Vencimento</th>
                  <th className="p-2 text-right">Saldo</th>
                  <th className="p-2 text-left">Boleto Cora</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {titles.map(t => {
                  const can = selectable(t);
                  const checked = !!selected[keyOf(t)];
                  return (
                    <tr key={keyOf(t)} onClick={() => can && toggleTitle(t)} className={`${can ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5' : ''} ${checked ? 'bg-pink-500/5' : ''}`}>
                      <td className="p-2 text-center">{can ? (checked ? <CheckSquare className="h-4 w-4 text-pink-600 inline" /> : <Square className="h-4 w-4 text-slate-400 inline" />) : null}</td>
                      <td className="p-2 font-mono">{t.nro_lancamento}/{t.cod_parcela}</td>
                      <td className="p-2"><p className="font-semibold">{t.cliente_nome}</p><p className="text-slate-500">{maskDoc(t.documento)}</p></td>
                      <td className="p-2 text-slate-500">{t.forma_nome || '-'}</td>
                      <td className="p-2 text-slate-500">{t.cod_ped_venda || '-'} / {t.cod_nf || '-'}</td>
                      <td className={`p-2 ${t.vencido ? 'text-amber-600 font-semibold' : ''}`}>{fmtDate(t.vencimento)}</td>
                      <td className="p-2 text-right font-bold">{brl(t.valor)}</td>
                      <td className="p-2">
                        {t.boleto ? <span title={t.boleto.erro || ''}><StatusBadge status={t.boleto.status} /></span>
                          : t.horus_tem_boleto ? <span className="text-[11px] text-slate-500">Boleto já no Horus</span> : <span className="text-slate-400">—</span>}
                      </td>
                    </tr>
                  );
                })}
                {!titlesLoading && titles.length === 0 && (
                  <tr><td colSpan={8} className="p-6 text-center text-slate-400">Nenhum título em aberto encontrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-xs">
            <button disabled={titlesPage <= 1 || titlesLoading} onClick={() => loadTitles(titlesPage - 1)} className={`${btnCls} border border-slate-200 dark:border-slate-700`}>Anterior</button>
            <span className="text-slate-500">Página {titlesPage} de {titlesPages}</span>
            <button disabled={titlesPage >= titlesPages || titlesLoading} onClick={() => loadTitles(titlesPage + 1)} className={`${btnCls} border border-slate-200 dark:border-slate-700`}>Próxima</button>
          </div>
        </section>
      )}

      {/* ── BOLETOS ─────────────────────────────────────────────────────── */}
      {tab === 'boletos' && (
        <section className="space-y-3">
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {INVOICE_FILTERS.map(f => (
              <button key={f.key} onClick={() => setInvFilter(f.key)}
                className={`shrink-0 h-9 px-3 rounded-full text-xs font-semibold border ${invFilter === f.key ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <form onSubmit={e => { e.preventDefault(); loadInvoices(1); }} className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input value={invSearch} onChange={e => setInvSearch(e.target.value)} placeholder="Cliente, CPF/CNPJ ou lançamento" className={`${inputCls} pl-9`} />
            </form>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button onClick={bulkSync} disabled={!!bulkBusy || !coraReady} className={`${btnCls} border border-slate-200 dark:border-slate-700`}>
                {bulkBusy === 'sync' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Sincronizar
              </button>
              <button onClick={bulkBaixa} disabled={!!bulkBusy} className={`${btnCls} bg-emerald-600 hover:bg-emerald-700 text-white`}>
                {bulkBusy === 'baixa' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Landmark className="h-4 w-4" />} Gerar borderô
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-500">{invTotal} boleto(s)</p>

          {/* Mobile: cards */}
          <div className="md:hidden space-y-2">
            {invoices.map(inv => (
              <div key={inv.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{inv.cliente_nome}</p>
                    <p className="text-[11px] text-slate-500">Lanç. {inv.nro_lancamento}/{inv.cod_parcela} · Venc. {fmtDate(inv.vencimento)}</p>
                  </div>
                  <StatusBadge status={inv.status} />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-bold">{brl(inv.valor)}</span>
                  {inv.bordero_baixa && <span className="text-[11px] text-emerald-600 font-semibold">Borderô #{inv.bordero_baixa}</span>}
                </div>
                {inv.erro && <p className="text-[11px] text-rose-600">{inv.erro}</p>}
                <InvoiceActions inv={inv} busy={busyId === inv.id} onAction={invoiceAction} onCopy={copy} />
              </div>
            ))}
          </div>

          {/* Desktop: tabela */}
          <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="p-2 text-left">Lançamento</th>
                  <th className="p-2 text-left">Cliente</th>
                  <th className="p-2 text-left">Vencimento</th>
                  <th className="p-2 text-right">Valor</th>
                  <th className="p-2 text-left">Status</th>
                  <th className="p-2 text-left">Horus</th>
                  <th className="p-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {invoices.map(inv => (
                  <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-white/5">
                    <td className="p-2 font-mono">{inv.nro_lancamento}/{inv.cod_parcela}</td>
                    <td className="p-2"><p className="font-semibold">{inv.cliente_nome}</p><p className="text-slate-500">{maskDoc(inv.documento)}</p></td>
                    <td className="p-2">{fmtDate(inv.vencimento)}{inv.pago_em && <p className="text-emerald-600">Pago {fmtDate(inv.pago_em)}</p>}</td>
                    <td className="p-2 text-right font-bold">{brl(inv.valor)}{inv.valor_pago != null && inv.status === 'PAID' && <p className="text-emerald-600 font-normal">{brl(inv.valor_pago)}</p>}</td>
                    <td className="p-2"><StatusBadge status={inv.status} />{inv.erro && <p className="text-rose-600 mt-1 max-w-[220px] truncate" title={inv.erro}>{inv.erro}</p>}</td>
                    <td className="p-2 text-slate-500">
                      {inv.bordero_baixa ? <span className="text-emerald-600 font-semibold">Borderô #{inv.bordero_baixa}</span>
                        : inv.horus_gravado ? <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> Gravado</span> : '—'}
                    </td>
                    <td className="p-2"><InvoiceActions inv={inv} busy={busyId === inv.id} onAction={invoiceAction} onCopy={copy} compact /></td>
                  </tr>
                ))}
                {!invLoading && invoices.length === 0 && (
                  <tr><td colSpan={7} className="p-6 text-center text-slate-400">Nenhum boleto neste filtro.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-xs">
            <button disabled={invPage <= 1 || invLoading} onClick={() => loadInvoices(invPage - 1)} className={`${btnCls} border border-slate-200 dark:border-slate-700`}>Anterior</button>
            <span className="text-slate-500">Página {invPage} de {invPages}</span>
            <button disabled={invPage >= invPages || invLoading} onClick={() => loadInvoices(invPage + 1)} className={`${btnCls} border border-slate-200 dark:border-slate-700`}>Próxima</button>
          </div>
        </section>
      )}

      {/* ── CONFIGURAÇÕES ───────────────────────────────────────────────── */}
      {tab === 'config' && cfg && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
            <h2 className="text-sm font-bold flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-pink-600" /> Credenciais Cora (Integração Direta)</h2>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Integração ativa</span>
              <input type="checkbox" className="h-5 w-5 accent-pink-600" checked={cfg.cora_enabled} onChange={e => setField('cora_enabled', e.target.checked)} />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Ambiente de testes (Stage)</span>
              <input type="checkbox" className="h-5 w-5 accent-pink-600" checked={cfg.cora_sandbox} onChange={e => setField('cora_sandbox', e.target.checked)} />
            </label>
            <div>
              <label className="text-xs font-semibold text-slate-500">Client ID</label>
              <input className={inputCls} value={cfg.cora_client_id} onChange={e => setField('cora_client_id', e.target.value)} placeholder="int-xxxxxxxx" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-semibold text-slate-500">Certificado (.pem) {cfg.has_certificate && <span className="text-emerald-600">✓ salvo</span>}</span>
                <span className={`${btnCls} border border-dashed border-slate-300 dark:border-slate-700 cursor-pointer`}>
                  <Upload className="h-4 w-4" /> {certText ? 'Carregado' : 'Selecionar'}
                  <input type="file" accept=".pem,.crt,.cer" className="hidden" onChange={e => readPemFile(e.target.files?.[0], setCertText)} />
                </span>
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-semibold text-slate-500">Chave privada (.key) {cfg.has_private_key && <span className="text-emerald-600">✓ salva</span>}</span>
                <span className={`${btnCls} border border-dashed border-slate-300 dark:border-slate-700 cursor-pointer`}>
                  <Upload className="h-4 w-4" /> {keyText ? 'Carregada' : 'Selecionar'}
                  <input type="file" accept=".key,.pem" className="hidden" onChange={e => readPemFile(e.target.files?.[0], setKeyText)} />
                </span>
              </label>
            </div>
            <p className="text-[11px] text-slate-500">Os arquivos ficam somente no banco (a chave privada é criptografada) — nada é gravado em disco.</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-slate-500">Multa após vencimento</label>
                <CurrencyInput value={cfg.cora_fine_rate ?? 0} onChangeValue={v => setField('cora_fine_rate', v)} suffixStr="%" max={100} className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">Juros ao mês</label>
                <CurrencyInput value={cfg.cora_interest_rate ?? 0} onChangeValue={v => setField('cora_interest_rate', v)} suffixStr="%" max={100} className={inputCls} />
              </div>
            </div>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Cora envia e-mail de cobrança ao cliente</span>
              <input type="checkbox" className="h-5 w-5 accent-pink-600" checked={cfg.cora_notify_email} onChange={e => setField('cora_notify_email', e.target.checked)} />
            </label>
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button onClick={saveSettings} disabled={savingCfg} className={`${btnCls} bg-pink-600 hover:bg-pink-700 text-white flex-1`}>
                {savingCfg ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Salvar
              </button>
              <button onClick={testConnection} disabled={testing || !cfg.cora_enabled} className={`${btnCls} border border-slate-200 dark:border-slate-700 flex-1`}>
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Testar conexão
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
              <h2 className="text-sm font-bold flex items-center gap-2"><Landmark className="h-4 w-4 text-emerald-600" /> Integração com o Horus</h2>
              <div>
                <label className="text-xs font-semibold text-slate-500">Formas de pagamento (COD_FORMA) elegíveis</label>
                <input className={inputCls} value={cfg.cora_horus_cod_formas} onChange={e => setField('cora_horus_cod_formas', e.target.value)} placeholder="Ex: 1,14 (vazio = todas)" />
              </div>
              <label className="flex items-start justify-between gap-3 text-sm">
                <span>Gravar boleto no Horus<span className="block text-[11px] text-slate-500">Nosso número, linha digitável, código de barras, Pix e PDF em LANCTOS_CRECEBERA.</span></span>
                <input type="checkbox" className="h-5 w-5 accent-pink-600 mt-0.5" checked={cfg.cora_horus_write_back} onChange={e => setField('cora_horus_write_back', e.target.checked)} />
              </label>
              <label className="flex items-start justify-between gap-3 text-sm">
                <span>Baixa automática por borderô<span className="block text-[11px] text-slate-500">Ao confirmar o pagamento no Cora, gera o borderô no Horus.</span></span>
                <input type="checkbox" className="h-5 w-5 accent-pink-600 mt-0.5" checked={cfg.cora_horus_auto_baixa} onChange={e => setField('cora_horus_auto_baixa', e.target.checked)} />
              </label>
              <p className="text-xs font-semibold text-slate-500 pt-1">Parâmetros do borderô (conta Cora no Horus)</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {([
                  ['cora_horus_banco_forma_pagto', 'Forma pagto'],
                  ['cora_horus_banco_codigo', 'Banco (COD)'],
                  ['cora_horus_banco_agencia', 'Agência'],
                  ['cora_horus_banco_conta', 'Conta'],
                  ['cora_horus_banco_carteira', 'Carteira'],
                ] as [keyof CoraSettings, string][]).map(([k, label]) => (
                  <div key={k}>
                    <label className="text-[11px] text-slate-500">{label}</label>
                    <input className={inputCls} value={String(cfg[k] ?? '')} onChange={e => setField(k, e.target.value as any)} />
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-slate-500">Use os códigos internos cadastrados no Horus (BBANCOS / BCONTAC_CARTEIRA / FORMA_PAGTO) para a conta do Cora.</p>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
              <h2 className="text-sm font-bold flex items-center gap-2"><Link2 className="h-4 w-4 text-sky-600" /> Webhook de pagamento</h2>
              <p className="text-[11px] text-slate-500 flex items-center gap-1">
                {cfg.webhook_registered ? <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Registrado no Cora.</> : <><Clock className="h-3.5 w-3.5" /> Não registrado — o job de conciliação roda a cada 30 min.</>}
              </p>
              <input className={inputCls} value={webhookBase} onChange={e => setWebhookBase(e.target.value)} placeholder="https://api.seudominio.com.br" />
              <button onClick={registerWebhook} disabled={registering || !cfg.cora_enabled || !webhookBase} className={`${btnCls} w-full border border-slate-200 dark:border-slate-700`}>
                {registering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Registrar webhook no Cora
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function InvoiceActions({ inv, busy, onAction, onCopy, compact }: {
  inv: Invoice; busy: boolean; compact?: boolean;
  onAction: (inv: Invoice, a: 'sync' | 'cancel' | 'pdf') => void;
  onCopy: (text: string | null, label: string) => void;
}) {
  const base = 'inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-semibold disabled:opacity-40';
  const size = compact ? 'h-8 w-8' : 'h-9 px-2 flex-1';
  const canCancel = !['PAID', 'CANCELLED'].includes(inv.status);
  return (
    <div className={`flex gap-1 ${compact ? 'justify-end' : ''}`}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : (
        <>
          <button title="Copiar linha digitável" disabled={!inv.linha_digitavel} onClick={() => onCopy(inv.linha_digitavel, 'Linha digitável')} className={`${base} ${size}`}><Copy className="h-3.5 w-3.5" />{!compact && 'Linha'}</button>
          <button title="Copiar Pix copia e cola" disabled={!inv.pix_copia_cola} onClick={() => onCopy(inv.pix_copia_cola, 'Pix copia e cola')} className={`${base} ${size}`}><Copy className="h-3.5 w-3.5" />{!compact && 'Pix'}</button>
          <button title="PDF do boleto" disabled={!inv.linha_digitavel} onClick={() => onAction(inv, 'pdf')} className={`${base} ${size}`}><FileDown className="h-3.5 w-3.5" />{!compact && 'PDF'}</button>
          <button title="Sincronizar status" onClick={() => onAction(inv, 'sync')} className={`${base} ${size}`}><RefreshCw className="h-3.5 w-3.5" />{!compact && 'Sync'}</button>
          <button title="Cancelar boleto" disabled={!canCancel} onClick={() => onAction(inv, 'cancel')} className={`${base} ${size} text-rose-600`}><XCircle className="h-3.5 w-3.5" />{!compact && 'Cancelar'}</button>
        </>
      )}
    </div>
  );
}
