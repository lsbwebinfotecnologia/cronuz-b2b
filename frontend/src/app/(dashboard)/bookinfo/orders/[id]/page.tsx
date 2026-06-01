'use client';

import { useState, useEffect, use, useCallback } from 'react';
import { getToken } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import {
  Layers, ArrowLeft, CheckCircle2, Play, Save, Info, AlertTriangle,
  AlertCircle, ShoppingCart, DollarSign, Wallet, CreditCard, Package,
  Sparkles, RefreshCw, RotateCcw, Lock, Clock, ArrowUpDown,
  Search, ArrowUp, ArrowDown, SlidersHorizontal
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

// ─── Helpers ────────────────────────────────────────────────────────────────

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const SITUATION_LABELS: Record<string, string> = {
  reservado_total: 'Atender Total',
  atendimento_parcial_sem_reserva: 'Atend. Parcial',
  sem_estoque: 'Sem Estoque',
  esgotado: 'Esgotado',
  fora_catalogo: 'Fora de Catálogo',
  item_nao_comercializado: 'Não Comercializado',
  item_rejeitado: 'Rejeitado',
};

const SITUATION_STYLE: Record<string, string> = {
  reservado_total: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30',
  atendimento_parcial_sem_reserva: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30',
  sem_estoque: 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-500/20 dark:text-rose-400 dark:border-rose-500/30',
  esgotado: 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-500/20 dark:text-rose-400 dark:border-rose-500/30',
  fora_catalogo: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-500/20 dark:text-orange-400 dark:border-orange-500/30',
  item_nao_comercializado: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
  item_rejeitado: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700',
};

const SITUATION_BORDER: Record<string, string> = {
  reservado_total: 'border-l-4 border-l-emerald-500 dark:border-l-emerald-600',
  atendimento_parcial_sem_reserva: 'border-l-4 border-l-amber-500 dark:border-l-amber-600',
  sem_estoque: 'border-l-4 border-l-rose-500 dark:border-l-rose-600',
  esgotado: 'border-l-4 border-l-rose-500 dark:border-l-rose-600',
  fora_catalogo: 'border-l-4 border-l-orange-500 dark:border-l-orange-600',
  item_nao_comercializado: 'border-l-4 border-l-slate-400 dark:border-l-slate-600',
  item_rejeitado: 'border-l-4 border-l-red-600 dark:border-l-red-700',
};

function SituationBadge({ situation, manual }: { situation: string; manual?: boolean }) {
  const label = SITUATION_LABELS[situation] || situation;
  const style = SITUATION_STYLE[situation] || 'bg-slate-100 text-slate-600 border-slate-200';
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border shadow-sm ${style}`}>
      {label}
      {manual && <span className="ml-0.5 text-[9px] opacity-75">(manual)</span>}
    </span>
  );
}

function SummaryPill({ situation, count }: { situation: string; count: number }) {
  const label = SITUATION_LABELS[situation] || situation;
  const style = SITUATION_STYLE[situation] || 'bg-slate-100 text-slate-600 border-slate-200';
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all shadow-sm ${style}`}>
      <span>{label}</span>
      <span className="font-extrabold text-sm px-1.5 py-0.2 bg-white/40 dark:bg-black/20 rounded-md">{count}</span>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function BookinfoOrderDetailPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const router = useRouter();

  const [orderData, setOrderData] = useState<any>(null);
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState<'BOOKINFO' | 'HORUS'>('BOOKINFO');

  // Itens analisados (persistidos no BD)
  const [analysedItems, setAnalysedItems] = useState<any[]>([]);
  const [summary, setSummary]             = useState<Record<string, number>>({});
  const [lastAnalysedAt, setLastAnalysedAt] = useState<string | null>(null);

  // Filtros/Ordenação dos itens analisados
  const [sortBy, setSortBy]       = useState<'title' | 'qty' | 'situation' | 'default'>('default');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [searchQuery, setSearchQuery] = useState('');

  const handleTabChange = (tab: 'BOOKINFO' | 'HORUS') => {
    setActiveTab(tab);
    if (tab === 'BOOKINFO' && sortBy === 'situation') {
      setSortBy('default');
    }
  };

  // Estados de loading por ação
  const [isAnalysing,     setIsAnalysing]     = useState(false);
  const [isAcknowledging, setIsAcknowledging] = useState(false);
  const [isSubmitting,    setIsSubmitting]     = useState(false);
  const [updatingItem,    setUpdatingItem]     = useState<number | null>(null);

  const parseBookinfoDate = (dateStr: string | null | undefined): Date | null => {
    if (!dateStr) return null;
    if (dateStr.includes('/')) {
      const parts = dateStr.split(' ');
      const dateParts = parts[0].split('/');
      if (dateParts.length === 3) {
        const day = parseInt(dateParts[0], 10);
        const month = parseInt(dateParts[1], 10) - 1;
        const year = parseInt(dateParts[2], 10);
        if (parts[1]) {
          const timeParts = parts[1].split(':');
          return new Date(year, month, day, parseInt(timeParts[0]||'0'), parseInt(timeParts[1]||'0'), parseInt(timeParts[2]||'0'));
        }
        return new Date(year, month, day);
      }
    }
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  };

  // ── Fetch pedido (com itens analisados do BD) ──────────────────────────────
  const fetchOrderDetails = useCallback(async () => {
    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`${API}/bookinfo/orders/${params.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Falha ao buscar detalhes do pedido');
      const data = await res.json();
      setOrderData(data);

      // Carrega itens analisados que já estão no BD (ord_order_item)
      const items: any[] = data.order_internal?.analysed_items || [];
      if (items.length > 0) {
        setAnalysedItems(items);
        buildSummary(items);
        const latest = items.reduce((acc: string, it: any) =>
          it.analysed_at && it.analysed_at > acc ? it.analysed_at : acc, '');
        setLastAnalysedAt(latest || null);
        setActiveTab('HORUS');
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao comunicar com o servidor');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => { fetchOrderDetails(); }, [fetchOrderDetails]);

  const buildSummary = (items: any[]) => {
    const s: Record<string, number> = {};
    items.forEach(it => {
      const sit = it.partner_situation || 'sem_estoque';
      s[sit] = (s[sit] || 0) + 1;
    });
    setSummary(s);
  };

  // ── Receber pedido ─────────────────────────────────────────────────────────
  const acknowledgeOrder = async () => {
    setIsAcknowledging(true);
    try {
      const token = getToken();
      const res = await fetch(`${API}/bookinfo/orders/${params.id}/acknowledge`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Não foi possível registrar o recebimento');
      toast.success('Pedido marcado como Recebido!');
      await fetchOrderDetails();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsAcknowledging(false);
    }
  };

  // ── ANALISAR ITENS (persiste no BD) ───────────────────────────────────────
  const analyseItems = async () => {
    setIsAnalysing(true);
    try {
      const token = getToken();
      const res = await fetch(`${API}/bookinfo/orders/${params.id}/analyse`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao analisar itens');

      setAnalysedItems(data.items || []);
      setSummary(data.summary || {});
      const now = new Date().toISOString();
      setLastAnalysedAt(now);
      setActiveTab('HORUS');

      toast.success(`Análise concluída! ${data.analysed} item(ns) processado(s).`);
      await fetchOrderDetails();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsAnalysing(false);
    }
  };

  // ── Alterar situação manualmente ───────────────────────────────────────────
  const updateSituation = async (itemId: number, isbn: string, newSituation: string) => {
    setUpdatingItem(itemId);
    try {
      const token = getToken();
      const res = await fetch(`${API}/bookinfo/orders/${params.id}/items/${itemId}/situation`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ situation: newSituation })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao atualizar situação');

      // Atualiza localmente
      setAnalysedItems(prev => prev.map(it =>
        it.id === itemId ? { ...it, partner_situation: newSituation, sit_manual_change: true } : it
      ));
      buildSummary(analysedItems.map(it =>
        it.id === itemId ? { ...it, partner_situation: newSituation } : it
      ));
      toast.success(`Situação do item atualizada para "${SITUATION_LABELS[newSituation] || newSituation}"`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUpdatingItem(null);
    }
  };

  // ── Enviar avaliação para Bookinfo ─────────────────────────────────────────
  const submitEvaluation = async () => {
    setIsSubmitting(true);
    try {
      const token = getToken();
      const payload = analysedItems.map(ev => ({
        isbn13: ev.isbn13 || ev.ean_isbn,
        quantidadeEfetiva: ['esgotado','fora_catalogo','item_nao_comercializado','item_rejeitado'].includes(ev.partner_situation)
          ? 0
          : Math.min(ev.qty_requested || ev.quantity_requested || 0, ev.available_qty || 0) || (ev.qty_requested || ev.quantity_requested || 0),
        status: (ev.partner_situation || 'sem_estoque').toUpperCase(),
        descontoEfetivo: ev.partner_discount || 0,
        precoCapa: parseFloat(ev.price_gross || 0)
      }));

      const res = await fetch(`${API}/bookinfo/orders/${params.id}/evaluate-submit`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payload })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao enviar avaliação');
      toast.success('Avaliação enviada à Bookinfo com sucesso!');
      await fetchOrderDetails();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading || !orderData) {
    return (
      <div className="p-8 max-w-[1600px] mx-auto animate-pulse">
        <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded w-64 mb-6"></div>
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="w-full lg:w-1/3 h-96 bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
          <div className="w-full lg:w-2/3 h-96 bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
        </div>
      </div>
    );
  }

  const order         = orderData.bookinfo_api || {};
  const orderInternal = orderData.order_internal || {};
  const customer      = orderData.customer || {};
  const company       = orderData.company || {};
  const bookinfoItems = order.itens || [];

  // Ordena os itens analisados se houver ordenação ativa
  const sortedItems = [...analysedItems].sort((a, b) => {
    if (sortBy === 'title') {
      const nameA = a.name || '';
      const nameB = b.name || '';
      return sortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
    }
    if (sortBy === 'qty') {
      const qtyA = a.qty_requested ?? a.quantity_requested ?? 0;
      const qtyB = b.qty_requested ?? b.quantity_requested ?? 0;
      return sortOrder === 'asc' ? qtyA - qtyB : qtyB - qtyA;
    }
    if (sortBy === 'situation') {
      const sitA = a.partner_situation || '';
      const sitB = b.partner_situation || '';
      return sortOrder === 'asc' ? sitA.localeCompare(sitB) : sitB.localeCompare(sitA);
    }
    return 0;
  });

  // Ordena os itens originais do pedido
  const sortedBookinfoItems = [...bookinfoItems].sort((a, b) => {
    if (sortBy === 'title') {
      const nameA = a.titulo || a.nome || '';
      const nameB = b.titulo || b.nome || '';
      return sortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
    }
    if (sortBy === 'qty') {
      const qtyA = a.quantidade ?? 0;
      const qtyB = b.quantidade ?? 0;
      return sortOrder === 'asc' ? qtyA - qtyB : qtyB - qtyA;
    }
    return 0;
  });

  // Filtragem dos itens originais por busca (título ou ISBN)
  const filteredBookinfoItems = sortedBookinfoItems.filter((item: any) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const title = (item.titulo || item.nome || '').toLowerCase();
    const isbn = (item.isbn13 || '').toLowerCase();
    return title.includes(q) || isbn.includes(q);
  });

  // Filtragem dos itens analisados por busca (título, ISBN ou editora)
  const filteredSortedItems = sortedItems.filter((ev: any) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const title = (ev.name || '').toLowerCase();
    const isbn = (ev.isbn13 || ev.ean_isbn || '').toLowerCase();
    const brand = (ev.brand || '').toLowerCase();
    return title.includes(q) || isbn.includes(q) || brand.includes(q);
  });

  const isBlocked         = !!orderInternal.horus_pedido_venda;
  const isAlreadyAnalysed = orderInternal.validated_items_erp === true || analysedItems.length > 0;
  const canAnalyse        = !isBlocked && !!orderInternal.id;
  const canSubmit         = isAlreadyAnalysed && !isBlocked && activeTab === 'HORUS' && analysedItems.length > 0;

  const limitUsedPercent = customer.credit_limit && customer.credit_limit > 0
    ? Math.min(100, Math.max(0, (customer.open_debts || 0) / customer.credit_limit * 100))
    : 0;

  return (
    <div className="p-8 max-w-[1600px] mx-auto">

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row items-start md:items-center gap-4 mb-6 justify-between">
        <div className="flex items-start md:items-center gap-4">
          <Link href="/bookinfo/orders" className="p-2 rounded-lg bg-white text-slate-500 hover:bg-slate-50 border border-slate-200 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 transition mt-1 md:mt-0">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex flex-wrap items-center gap-2">
              Detalhe do Pedido
              <span className="hidden md:inline text-slate-300 dark:text-slate-700">|</span>
              <span className="text-slate-500 font-mono text-xl">{order.id}</span>
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded text-xs font-bold border border-slate-200 dark:border-slate-700 shadow-sm">
                {order.status || 'Status Desconhecido'}
              </span>
              <span className={`inline-flex items-center px-2.5 py-1 rounded text-[10px] font-bold uppercase shadow-sm ${order.compraConsignacao === 'S' ? 'bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30' : 'bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30'}`}>
                {order.compraConsignacao === 'S' ? 'CONSIGNAÇÃO' : 'VENDA B2B'}
              </span>
              {isBlocked && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-bold uppercase bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm">
                  <Lock className="w-3 h-3" /> Integrado ao Horus #{orderInternal.horus_pedido_venda}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">

        {/* ── LEFT PANEL ── */}
        <div className="xl:col-span-1 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">

            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 mb-2 text-slate-600 dark:text-slate-300 font-medium text-sm">
                <Info className="w-4 h-4" />
                Pedido B2B: {orderInternal.id || '—'} | Horus: {orderInternal.horus_pedido_venda || 'Pendente'}
              </div>
            </div>

            <div className="p-6 bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-800/50 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Pedido Parceiro</span>
                  <p className="font-bold text-slate-900 dark:text-white text-base truncate" title={order.pedidoCliente}>
                    {order.pedidoCliente || 'ND'}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Data</span>
                  <p className="font-bold text-slate-900 dark:text-white text-base">
                    {parseBookinfoDate(order.dataCriacao)?.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
                      || parseBookinfoDate(order.dataPedido)?.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
                      || (orderInternal.created_at ? new Date(orderInternal.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'ND')}
                  </p>
                </div>
              </div>

              <hr className="border-slate-100 dark:border-slate-800" />

              <div className="space-y-4">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Cliente Solicitante</span>
                  <p className="font-bold text-slate-900 dark:text-white text-sm leading-tight">
                    {customer.name || order.nomeComprador || 'Não informado'}
                  </p>
                  <p className="text-[11px] font-mono text-slate-500 mt-1">{customer.document || order.cnpjComprador}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Fornecedor</span>
                  <p className="font-bold text-slate-900 dark:text-white text-sm leading-tight">{company.name || 'Não informado'}</p>
                  <p className="text-[11px] font-mono text-slate-500 mt-1">{company.document}</p>
                </div>
              </div>

              {order.observacao && (
                <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30 p-4 rounded-xl">
                  <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block mb-2 flex items-center gap-1">
                    <Info className="w-3 h-3" /> Observações do Pedido
                  </span>
                  <p className="text-sm text-blue-900 dark:text-blue-200 leading-relaxed whitespace-pre-wrap">{order.observacao}</p>
                </div>
              )}

              {customer.commercial_notes && (
                <div className="bg-amber-50/50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/30 p-4 rounded-xl">
                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider block mb-2 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Observações Fixas (Horus)
                  </span>
                  <p className="text-[11px] font-mono text-amber-900 dark:text-amber-200 leading-relaxed whitespace-pre-wrap font-medium">{customer.commercial_notes}</p>
                </div>
              )}

              <hr className="border-slate-200 dark:border-slate-800/60" />

              {/* Resumo Financeiro */}
              <div className="bg-white dark:bg-slate-900 rounded-xl p-5 shadow-[0_0_40px_-10px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-800">
                <h3 className="text-xs font-bold uppercase tracking-widest mb-4 text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-indigo-500" /> Resumo Financeiro
                </h3>
                <div className="flex flex-col gap-3 mb-5">
                  <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-100 dark:border-slate-700/50">
                    <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      <CreditCard className="w-3 h-3" /> Limite Total
                    </span>
                    <strong className="text-sm text-slate-800 dark:text-slate-200 font-bold">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(customer.credit_limit || 0)}
                    </strong>
                  </div>
                  <div className="flex justify-between items-center bg-rose-50/50 dark:bg-rose-900/10 p-3 rounded-lg border border-rose-100 dark:border-rose-800/30">
                    <span className="flex items-center gap-1.5 text-[10px] font-bold text-rose-500 uppercase tracking-wider">
                      <DollarSign className="w-3 h-3" /> Débitos
                    </span>
                    <strong className="text-sm text-rose-700 dark:text-rose-400 font-bold">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(customer.open_debts || 0)}
                    </strong>
                  </div>
                  <div className="flex justify-between items-center bg-emerald-50/50 dark:bg-emerald-900/10 p-3 rounded-lg border border-emerald-100 dark:border-emerald-800/30">
                    <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
                      <CheckCircle2 className="w-3 h-3" /> Disponível
                    </span>
                    <strong className="text-sm text-emerald-700 dark:text-emerald-400 font-bold">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((customer.credit_limit || 0) - (customer.open_debts || 0))}
                    </strong>
                  </div>
                  <div className="flex justify-between items-center bg-amber-50/50 dark:bg-amber-900/10 p-3 rounded-lg border border-amber-100 dark:border-amber-800/30">
                    <span className="flex items-center gap-1.5 text-[10px] font-bold text-amber-600 uppercase tracking-wider">
                      <Package className="w-3 h-3" /> Consignado
                    </span>
                    <strong className="text-sm text-amber-700 dark:text-amber-400 font-bold">
                      {customer.consignment_status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                    </strong>
                  </div>
                </div>
                <div className="mt-2">
                  <div className="flex justify-between items-end mb-1.5">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Uso do Limite</span>
                    <span className={`text-xs font-bold ${limitUsedPercent > 80 ? 'text-rose-600' : limitUsedPercent > 50 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {limitUsedPercent.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner">
                    <div
                      className={`h-full transition-all duration-1000 ease-out ${limitUsedPercent > 80 ? 'bg-gradient-to-r from-rose-400 to-rose-600' : limitUsedPercent > 50 ? 'bg-gradient-to-r from-amber-400 to-amber-500' : 'bg-gradient-to-r from-emerald-400 to-emerald-500'}`}
                      style={{ width: `${limitUsedPercent}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              <div className="mt-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Data do Último Acerto</span>
                <p className="font-bold text-slate-900 dark:text-white text-sm">
                  {customer.last_settlement_date ? new Date(customer.last_settlement_date).toLocaleDateString('pt-BR') : 'Não informada'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div className="xl:col-span-3">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden flex flex-col h-[calc(100vh-180px)]">

            {/* Tabs + Ações */}
            <div className="px-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/20 flex-wrap gap-2">
              <div className="flex gap-4">
                <button
                  onClick={() => handleTabChange('HORUS')}
                  className={`py-4 font-semibold text-sm border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'HORUS' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                  <Layers className="w-4 h-4" />
                  Análise B2B Horus ({analysedItems.length})
                  {isAlreadyAnalysed && (
                    <span className="ml-1 w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                  )}
                </button>
                <button
                  onClick={() => handleTabChange('BOOKINFO')}
                  className={`py-4 font-semibold text-sm border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'BOOKINFO' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                  <ShoppingCart className="w-4 h-4" />
                  Bookinfo Original ({bookinfoItems.length})
                </button>
              </div>

              <div className="flex gap-2 my-2 flex-wrap">
                {/* Receber pedido — aparece quando não há espelho local ainda */}
                {!orderInternal.id && !isBlocked && (
                  <button
                    onClick={acknowledgeOrder}
                    disabled={isAcknowledging}
                    className="flex items-center gap-2 bg-slate-900 text-white dark:bg-white dark:text-slate-900 px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {isAcknowledging ? 'Recebendo...' : 'Receber Pedido'}
                  </button>
                )}

                {/* Analisar / Revalidar */}
                {canAnalyse && (
                  <button
                    onClick={analyseItems}
                    disabled={isAnalysing}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition disabled:opacity-50 shadow-sm ${
                      isAlreadyAnalysed
                        ? 'bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    }`}
                  >
                    {isAnalysing
                      ? <><RefreshCw className="w-4 h-4 animate-spin" /> Analisando...</>
                      : isAlreadyAnalysed
                        ? <><RotateCcw className="w-4 h-4" /> Revalidar Itens</>
                        : <><Play className="w-4 h-4" /> Analisar Itens</>
                    }
                  </button>
                )}

                {/* Enviar para Bookinfo */}
                {canSubmit && !isBlocked && (
                  <button
                    onClick={submitEvaluation}
                    disabled={isSubmitting}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition disabled:opacity-50 shadow-sm"
                  >
                    <Save className="w-4 h-4" />
                    {isSubmitting ? 'Enviando...' : 'Processar na Bookinfo'}
                  </button>
                )}

                {/* Bloqueado */}
                {isBlocked && (
                  <span className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                    <Lock className="w-4 h-4" /> Pedido Integrado
                  </span>
                )}
              </div>
            </div>

            {/* Resumo por situação (somente na aba HORUS, quando há itens analisados) */}
            {activeTab === 'HORUS' && analysedItems.length > 0 && (
              <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-800/10 flex flex-wrap gap-3 items-center justify-between">
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Resumo:</span>
                  {Object.entries(summary).map(([sit, count]) => (
                    <SummaryPill key={sit} situation={sit} count={count as number} />
                  ))}
                </div>
                {lastAnalysedAt && (
                  <span className="flex items-center gap-1 text-[10px] text-slate-400 font-medium">
                    <Clock className="w-3.5 h-3.5" />
                    Última análise: {new Date(lastAnalysedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                )}
              </div>
            )}

            {/* Filtros e Ordenação */}
            {((activeTab === 'HORUS' && analysedItems.length > 0) || (activeTab === 'BOOKINFO' && bookinfoItems.length > 0)) && (
              <div className="px-6 py-3 bg-slate-50/50 dark:bg-slate-800/10 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                
                {/* Busca */}
                <div className="relative flex-1 max-w-md">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                    <Search className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    placeholder="Buscar por título, ISBN ou editora..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-colors shadow-sm"
                  />
                </div>

                {/* Ordenação */}
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <SlidersHorizontal className="w-3.5 h-3.5" /> Ordenar por:
                  </span>
                  <div className="flex rounded-lg bg-slate-100/80 dark:bg-slate-800/80 p-0.5 border border-slate-200/60 dark:border-slate-700/60 shadow-inner">
                    <button
                      onClick={() => {
                        if (sortBy === 'title') setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                        else { setSortBy('title'); setSortOrder('asc'); }
                      }}
                      className={`px-3 py-1 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${sortBy === 'title' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                    >
                      Título
                      {sortBy === 'title' ? (
                        sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-500" /> : <ArrowDown className="w-3 h-3 text-indigo-500" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-50" />
                      )}
                    </button>
                    <button
                      onClick={() => {
                        if (sortBy === 'qty') setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                        else { setSortBy('qty'); setSortOrder('asc'); }
                      }}
                      className={`px-3 py-1 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${sortBy === 'qty' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                    >
                      Quantidade
                      {sortBy === 'qty' ? (
                        sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-500" /> : <ArrowDown className="w-3 h-3 text-indigo-500" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-50" />
                      )}
                    </button>
                    {activeTab === 'HORUS' && (
                      <button
                        onClick={() => {
                          if (sortBy === 'situation') setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                          else { setSortBy('situation'); setSortOrder('asc'); }
                        }}
                        className={`px-3 py-1 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${sortBy === 'situation' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                      >
                        Situação
                        {sortBy === 'situation' ? (
                          sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-500" /> : <ArrowDown className="w-3 h-3 text-indigo-500" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-50" />
                        )}
                      </button>
                    )}
                  </div>
                  {sortBy !== 'default' && (
                    <button
                      onClick={() => { setSortBy('default'); setSortOrder('asc'); }}
                      className="text-xs font-bold text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 transition"
                    >
                      Limpar
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Conteúdo das tabs */}
            <div className="flex-1 overflow-auto p-0 bg-slate-50/30 dark:bg-slate-950/20">

              {/* ── Tab Bookinfo Original ── */}
              {activeTab === 'BOOKINFO' ? (
                <div className="space-y-3 p-6">
                  {filteredBookinfoItems.map((item: any, idx: number) => {
                    const qty = item.quantidade ?? 0;
                    const proposedDiscount = Number(item.descontoProposto || 0);
                    
                    return (
                      <div key={idx} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-indigo-400 dark:hover:border-indigo-800 hover:shadow-lg transition-all duration-200 border-l-4 border-l-indigo-500/80 hover:scale-[1.005]">
                        {/* Detalhes do Item */}
                        <div className="flex-1 space-y-2">
                          <h4 className="font-bold text-slate-800 dark:text-white text-sm leading-snug">
                            {item.titulo || item.nome || 'Não Informado'}
                          </h4>
                          <span className="inline-block font-mono text-[11px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/85 px-2.5 py-0.5 rounded border border-slate-200/40 dark:border-slate-700/40 shadow-sm">
                            {item.isbn13}
                          </span>
                        </div>
                        
                        {/* Grid de Métricas */}
                        <div className="flex items-center gap-6 shrink-0">
                          {/* Quantidade */}
                          <div className="bg-slate-50/50 dark:bg-slate-800/30 px-4 py-2 rounded-lg border border-slate-100 dark:border-slate-800/50 text-center min-w-[90px] shadow-sm">
                            <span className="text-[9px] text-slate-400 dark:text-slate-500 block font-bold uppercase tracking-wider mb-0.5">Qtd. Pedida</span>
                            <span className="text-sm font-extrabold text-slate-800 dark:text-slate-200">{qty}</span>
                          </div>
                          
                          {/* Desconto */}
                          <div className="bg-slate-50/50 dark:bg-slate-800/30 px-4 py-2 rounded-lg border border-slate-100 dark:border-slate-800/50 text-center min-w-[100px] shadow-sm">
                            <span className="text-[9px] text-slate-400 dark:text-slate-500 block font-bold uppercase tracking-wider mb-0.5">Desconto</span>
                            <span className="text-sm font-extrabold text-slate-800 dark:text-slate-200">{proposedDiscount.toFixed(2)}%</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {filteredBookinfoItems.length === 0 && (
                    <div className="text-center py-12 text-slate-400 dark:text-slate-500 flex flex-col items-center justify-center gap-2">
                      <Search className="w-8 h-8 opacity-40 mb-2" />
                      <p className="font-bold text-sm">Nenhum item localizado</p>
                      <p className="text-xs">Não encontramos nenhum item correspondente à busca "{searchQuery}".</p>
                    </div>
                  )}
                </div>

              ) : (
                /* ── Tab Análise Horus ── */
                analysedItems.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 p-8 text-center space-y-5">
                    <div className="relative">
                      <div className="absolute inset-0 bg-indigo-500/20 rounded-full animate-ping"></div>
                      <div className="bg-white dark:bg-slate-800 p-4 rounded-full relative z-10 shadow-xl border border-slate-100 dark:border-slate-700">
                        <Sparkles className="w-12 h-12 text-indigo-500" />
                      </div>
                    </div>
                    <div className="max-w-sm">
                      <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2">Análise Horus Pendente</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                        {!orderInternal.id
                          ? 'Receba o pedido primeiro para habilitar a análise.'
                          : 'Clique em "Analisar Itens" para consultar o estoque no Horus e salvar o resultado.'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 p-6">
                    {filteredSortedItems.map((ev: any, idx: number) => {
                      const qtyRequested = ev.qty_requested ?? ev.quantity_requested ?? 0;
                      const qtyAvailable = ev.available_qty ?? 0;
                      const hasStock = qtyAvailable >= qtyRequested;
                      const partnerDiscount = Number(ev.partner_discount || 0);
                      const discountAllowed = Number(ev.discount_allowed || 0);
                      const discountExceeded = partnerDiscount > discountAllowed;
                      const borderLeftClass = SITUATION_BORDER[ev.partner_situation] || 'border-l-4 border-l-slate-200 dark:border-l-slate-800';

                      return (
                        <div key={ev.id || idx} className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-5 hover:shadow-lg transition-all duration-200 relative overflow-hidden hover:scale-[1.005] hover:border-slate-300 dark:hover:border-slate-700 ${borderLeftClass}`}>
                          
                          {/* 1. Detalhes do Item */}
                          <div className="flex-1 min-w-[250px] space-y-2">
                            <h4 className="font-bold text-slate-800 dark:text-white text-sm leading-snug">
                              {ev.name || 'Item não localizado no Horus'}
                            </h4>
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="font-mono text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-200/50 dark:border-slate-700/50 shadow-sm">
                                {ev.isbn13 || ev.ean_isbn}
                              </span>
                              {ev.brand && ev.brand !== 'ND' && (
                                <span className="text-slate-400 dark:text-slate-500 font-medium bg-slate-50 dark:bg-slate-800/40 px-2 py-0.5 rounded border border-slate-100 dark:border-slate-800/50">
                                  Editora: <strong className="text-slate-600 dark:text-slate-300 font-semibold">{ev.brand}</strong>
                                </span>
                              )}
                            </div>
                          </div>
                          
                          {/* 2. Grid de Métricas */}
                          <div className="flex flex-wrap items-center gap-4 sm:gap-6 shrink-0">
                            
                            {/* Quantidades */}
                            <div className={`flex items-center gap-3 p-2.5 rounded-lg border min-w-[135px] justify-around transition-all shadow-sm ${
                              hasStock
                                ? 'bg-emerald-50/30 border-emerald-100/40 dark:bg-emerald-950/10 dark:border-emerald-900/20'
                                : 'bg-rose-50/30 border-rose-100/40 dark:bg-rose-950/10 dark:border-rose-900/20'
                            }`}>
                              <div className="text-center px-1">
                                <span className="text-[9px] text-slate-400 dark:text-slate-500 block font-bold uppercase tracking-wider mb-0.5">Pedida</span>
                                <span className="text-sm font-extrabold text-slate-800 dark:text-slate-200">{qtyRequested}</span>
                              </div>
                              <div className="h-6 w-px bg-slate-200 dark:bg-slate-800/80" />
                              <div className="text-center px-1">
                                <span className="text-[9px] text-slate-400 dark:text-slate-500 block font-bold uppercase tracking-wider mb-0.5">Saldo</span>
                                <span className={`text-sm font-extrabold flex items-center gap-1 justify-center ${hasStock ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                  {qtyAvailable}
                                </span>
                              </div>
                            </div>
                            
                            {/* Descontos */}
                            <div className={`flex items-center gap-3 p-2.5 rounded-lg border min-w-[135px] justify-around transition-all shadow-sm ${
                              discountExceeded
                                ? 'bg-amber-50/30 border-amber-100/40 dark:bg-amber-950/10 dark:border-amber-900/20'
                                : 'bg-slate-50/50 border-slate-100/60 dark:bg-slate-800/20 dark:border-slate-800/40'
                            }`}>
                              <div className="text-center px-1">
                                <span className="text-[9px] text-slate-400 dark:text-slate-500 block font-bold uppercase tracking-wider mb-0.5">Prop.</span>
                                <span className="text-sm font-extrabold text-slate-800 dark:text-slate-200">{partnerDiscount.toFixed(1)}%</span>
                              </div>
                              <div className="h-6 w-px bg-slate-200 dark:bg-slate-800/80" />
                              <div className="text-center px-1">
                                <span className="text-[9px] text-slate-400 dark:text-slate-500 block font-bold uppercase tracking-wider mb-0.5">Autoriz.</span>
                                <span className={`text-sm font-extrabold ${discountExceeded ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                  {discountAllowed.toFixed(1)}%
                                </span>
                              </div>
                            </div>

                            {/* Situação */}
                            <div className="min-w-[130px] flex flex-col justify-center">
                              <span className="text-[9px] text-slate-400 dark:text-slate-500 block font-bold uppercase tracking-wider mb-1">Situação</span>
                              <div>
                                <SituationBadge situation={ev.partner_situation} manual={ev.sit_manual_change} />
                              </div>
                              {ev.situation_detail && (
                                <span className="text-[10px] text-slate-400 dark:text-slate-500 block mt-1 leading-tight max-w-[150px] font-medium">
                                  {ev.situation_detail}
                                </span>
                              )}
                            </div>
                            
                          </div>
                          
                          {/* 3. Ajuste Manual */}
                          {!isBlocked && (
                            <div className="lg:w-[180px] shrink-0 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-100 dark:border-slate-800 flex flex-col gap-1 w-full sm:w-auto">
                              <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider block mb-1">Ajuste Manual</span>
                              <div className="relative">
                                <select
                                  value={ev.partner_situation || ''}
                                  disabled={updatingItem === ev.id || isBlocked}
                                  onChange={(e) => {
                                    if (ev.id) updateSituation(ev.id, ev.isbn13 || ev.ean_isbn, e.target.value);
                                  }}
                                  className="w-full px-3 py-1.5 bg-slate-50 hover:bg-slate-100/80 dark:bg-slate-800 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500/50 transition cursor-pointer appearance-none shadow-sm"
                                >
                                  <option value="reservado_total">Atender Total</option>
                                  <option value="atendimento_parcial_sem_reserva">Atend. Parcial</option>
                                  <option value="sem_estoque">Sem Estoque</option>
                                  <option value="esgotado">Esgotado</option>
                                  <option value="fora_catalogo">Fora de Catálogo</option>
                                  <option value="item_nao_comercializado">Não Comercializado</option>
                                  <option value="item_rejeitado">Rejeitar Item</option>
                                </select>
                                <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none text-slate-400">
                                  <span className="text-[10px]">▼</span>
                                </div>
                              </div>
                              {ev.sit_manual_change && (
                                <span className="text-[9px] text-amber-600 dark:text-amber-500 font-semibold flex items-center gap-1 mt-1 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 w-fit">
                                  <AlertTriangle className="w-3 h-3 shrink-0" /> Editado
                                </span>
                              )}
                              {updatingItem === ev.id && (
                                <span className="text-[9px] text-indigo-500 dark:text-indigo-400 mt-1 animate-pulse font-medium">Salvando...</span>
                              )}
                            </div>
                          )}
                          
                        </div>
                      );
                    })}
                    {filteredSortedItems.length === 0 && (
                      <div className="text-center py-12 text-slate-400 dark:text-slate-500 flex flex-col items-center justify-center gap-2">
                        <Search className="w-8 h-8 opacity-40 mb-2" />
                        <p className="font-bold text-sm">Nenhum item localizado</p>
                        <p className="text-xs">Não encontramos nenhum item correspondente à busca "{searchQuery}".</p>
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
