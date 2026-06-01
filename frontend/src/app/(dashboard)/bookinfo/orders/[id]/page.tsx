'use client';

import { useState, useEffect, use, useCallback } from 'react';
import { getToken } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import {
  Layers, ArrowLeft, CheckCircle2, Play, Save, Info, AlertTriangle,
  AlertCircle, ShoppingCart, DollarSign, Wallet, CreditCard, Package,
  Sparkles, RefreshCw, RotateCcw, Lock, Clock
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

function SituationBadge({ situation, manual }: { situation: string; manual?: boolean }) {
  const label = SITUATION_LABELS[situation] || situation;
  const style = SITUATION_STYLE[situation] || 'bg-slate-100 text-slate-600 border-slate-200';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${style}`}>
      {label}
      {manual && <span className="ml-0.5 text-[9px] opacity-70">(manual)</span>}
    </span>
  );
}

function SummaryPill({ situation, count }: { situation: string; count: number }) {
  const label = SITUATION_LABELS[situation] || situation;
  const style = SITUATION_STYLE[situation] || 'bg-slate-100 text-slate-600 border-slate-200';
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold ${style}`}>
      <span>{label}</span>
      <span className="font-bold text-sm">{count}</span>
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
                  onClick={() => setActiveTab('HORUS')}
                  className={`py-4 font-semibold text-sm border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'HORUS' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                  <Layers className="w-4 h-4" />
                  Análise B2B Horus ({analysedItems.length})
                  {isAlreadyAnalysed && (
                    <span className="ml-1 w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('BOOKINFO')}
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
              <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-800/10 flex flex-wrap gap-2 items-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Resumo:</span>
                {Object.entries(summary).map(([sit, count]) => (
                  <SummaryPill key={sit} situation={sit} count={count as number} />
                ))}
                {lastAnalysedAt && (
                  <span className="ml-auto flex items-center gap-1 text-[10px] text-slate-400">
                    <Clock className="w-3 h-3" />
                    Última análise: {new Date(lastAnalysedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                )}
              </div>
            )}

            {/* Conteúdo das tabs */}
            <div className="flex-1 overflow-auto p-0">

              {/* ── Tab Bookinfo Original ── */}
              {activeTab === 'BOOKINFO' ? (
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm z-10">
                    <tr>
                      <th className="px-5 py-3 font-semibold text-slate-600 dark:text-slate-300">ISBN / Título</th>
                      <th className="px-5 py-3 font-semibold text-slate-600 dark:text-slate-300 text-center">Qtd.</th>
                      <th className="px-5 py-3 font-semibold text-slate-600 dark:text-slate-300 text-right">Desconto (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                    {bookinfoItems.map((item: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="px-5 py-4">
                          <p className="font-semibold text-slate-800 dark:text-white max-w-xs truncate">{item.titulo || item.nome || 'Não Informado'}</p>
                          <p className="font-mono text-xs text-slate-500 mt-1">{item.isbn13}</p>
                        </td>
                        <td className="px-5 py-4 text-center font-medium">{item.quantidade}</td>
                        <td className="px-5 py-4 text-right font-medium text-slate-700 dark:text-slate-300">
                          {Number(item.descontoProposto || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                        </td>
                      </tr>
                    ))}
                    {bookinfoItems.length === 0 && (
                      <tr><td colSpan={3} className="text-center p-8 text-slate-400">Nenhum item encontrado no pedido original.</td></tr>
                    )}
                  </tbody>
                </table>

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
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm z-10">
                      <tr>
                        <th className="px-5 py-3 font-semibold text-slate-600 dark:text-slate-300">Item / ISBN</th>
                        <th className="px-5 py-3 font-semibold text-slate-600 dark:text-slate-300 text-center">Qtd.</th>
                        <th className="px-5 py-3 font-semibold text-slate-600 dark:text-slate-300 text-center">Desconto</th>
                        <th className="px-5 py-3 font-semibold text-slate-600 dark:text-slate-300">Situação</th>
                        {!isBlocked && (
                          <th className="px-5 py-3 font-semibold text-slate-600 dark:text-slate-300 bg-indigo-50/50 dark:bg-indigo-900/10 min-w-[180px]">Ajuste Manual</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                      {analysedItems.map((ev: any, idx: number) => (
                        <tr key={ev.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                          {/* Item */}
                          <td className="px-5 py-4">
                            <p className="font-semibold text-slate-800 dark:text-white max-w-xs truncate" title={ev.name}>
                              {ev.name || 'Item não localizado no Horus'}
                            </p>
                            <p className="font-mono text-xs text-slate-500 mt-1">{ev.isbn13 || ev.ean_isbn}</p>
                            {ev.brand && ev.brand !== 'ND' && (
                              <p className="text-[10px] text-slate-400 mt-0.5">{ev.brand}</p>
                            )}
                          </td>
                          {/* Quantidades */}
                          <td className="px-5 py-4 text-center">
                            <div className="space-y-1 text-xs">
                              <div className="flex justify-between gap-3">
                                <span className="text-slate-400">Pedida:</span>
                                <span className="font-bold">{ev.qty_requested ?? ev.quantity_requested}</span>
                              </div>
                              <div className="flex justify-between gap-3">
                                <span className="text-slate-400">Saldo:</span>
                                <span className={`font-bold ${(ev.available_qty || 0) >= (ev.qty_requested || ev.quantity_requested || 0) ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  {ev.available_qty ?? 0}
                                </span>
                              </div>
                            </div>
                          </td>
                          {/* Descontos */}
                          <td className="px-5 py-4 text-center">
                            <div className="space-y-1 text-xs">
                              <div className="flex justify-between gap-3">
                                <span className="text-slate-400">Proposto:</span>
                                <span className="font-bold">{Number(ev.partner_discount || 0).toFixed(2)}%</span>
                              </div>
                              <div className="flex justify-between gap-3">
                                <span className="text-slate-400">Autorizado:</span>
                                <span className={`font-bold ${Number(ev.partner_discount || 0) > Number(ev.discount_allowed || 0) ? 'text-rose-600' : 'text-emerald-600'}`}>
                                  {Number(ev.discount_allowed || 0).toFixed(2)}%
                                </span>
                              </div>
                            </div>
                          </td>
                          {/* Situação automática */}
                          <td className="px-5 py-4">
                            <SituationBadge situation={ev.partner_situation} manual={ev.sit_manual_change} />
                            {ev.situation_detail && (
                              <p className="text-[10px] text-slate-400 mt-1 max-w-[160px]">{ev.situation_detail}</p>
                            )}
                          </td>
                          {/* Select manual */}
                          {!isBlocked && (
                            <td className="px-5 py-4 bg-indigo-50/30 dark:bg-indigo-900/10">
                              <select
                                value={ev.partner_situation || ''}
                                disabled={updatingItem === ev.id || isBlocked}
                                onChange={(e) => {
                                  if (ev.id) updateSituation(ev.id, ev.isbn13 || ev.ean_isbn, e.target.value);
                                }}
                                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-50"
                              >
                                <option value="reservado_total">Atender Total</option>
                                <option value="atendimento_parcial_sem_reserva">Atend. Parcial</option>
                                <option value="sem_estoque">Sem Estoque</option>
                                <option value="esgotado">Esgotado</option>
                                <option value="fora_catalogo">Fora de Catálogo</option>
                                <option value="item_nao_comercializado">Não Comercializado</option>
                                <option value="item_rejeitado">Rejeitar Item</option>
                              </select>
                              {ev.sit_manual_change && (
                                <p className="text-[9px] text-amber-600 mt-1 font-medium flex items-center gap-1">
                                  <AlertTriangle className="w-2.5 h-2.5" /> Alterado manualmente
                                </p>
                              )}
                              {updatingItem === ev.id && (
                                <p className="text-[9px] text-indigo-500 mt-1">Salvando...</p>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
