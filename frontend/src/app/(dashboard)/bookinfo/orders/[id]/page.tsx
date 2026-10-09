'use client';

import { useState, useEffect, use, useCallback } from 'react';
import { getToken } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import {
  Layers, ArrowLeft, CheckCircle2, Play, Save, Info, AlertTriangle,
  AlertCircle, ShoppingCart, DollarSign, Wallet, CreditCard, Package,
  Sparkles, RefreshCw, Lock, Clock, ArrowUpDown,
  Search, ArrowUp, ArrowDown, SlidersHorizontal, FileSpreadsheet,
  Send, Check, X, ExternalLink, RotateCcw
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

// ─── Helpers & Constantes ───────────────────────────────────────────────────

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const SITUATION_LABELS: Record<string, string> = {
  reservado_total: 'Atender Total',
  atendimento_parcial_sem_reserva: 'Atend. Parcial',
  sem_estoque: 'Sem Estoque',
  esgotado: 'Esgotado',
  fora_catalogo: 'Fora de Catálogo',
  item_nao_comercializado: 'Não Comercializado',
  sem_cadastro_erp: 'Sem Cadastro no ERP',
  item_rejeitado: 'Rejeitado',
};

const SITUATION_STYLE: Record<string, string> = {
  reservado_total: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30',
  atendimento_parcial_sem_reserva: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30',
  sem_estoque: 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-500/20 dark:text-rose-400 dark:border-rose-500/30',
  esgotado: 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-500/20 dark:text-rose-400 dark:border-rose-500/30',
  fora_catalogo: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-500/20 dark:text-orange-400 dark:border-orange-500/30',
  item_nao_comercializado: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
  sem_cadastro_erp: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-700',
  item_rejeitado: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700',
};

const SITUATION_BORDER: Record<string, string> = {
  reservado_total: 'border-l-4 border-l-emerald-500 dark:border-l-emerald-600',
  atendimento_parcial_sem_reserva: 'border-l-4 border-l-amber-500 dark:border-l-amber-600',
  sem_estoque: 'border-l-4 border-l-rose-500 dark:border-l-rose-600',
  esgotado: 'border-l-4 border-l-rose-500 dark:border-l-rose-600',
  fora_catalogo: 'border-l-4 border-l-orange-500 dark:border-l-orange-600',
  item_nao_comercializado: 'border-l-4 border-l-slate-400 dark:border-l-slate-600',
  sem_cadastro_erp: 'border-l-4 border-l-purple-500 dark:border-l-purple-600',
  item_rejeitado: 'border-l-4 border-l-red-600 dark:border-l-red-700',
};

const HORUS_STATUS_LABELS: Record<string, { label: string; desc: string; style: string }> = {
  LFT: { label: 'LFT - Liberado Faturamento', desc: 'Conferido fisicamente e liberado para faturar', style: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700' },
  FAT: { label: 'FAT - Faturado', desc: 'Conferido e nota fiscal gerada', style: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700' },
  DIG: { label: 'DIG - Em Digitação', desc: 'Pedido aguardando liberação para separação', style: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-700' },
  LIB: { label: 'LIB - Liberado Comercial', desc: 'Aprovado pelo comercial, aguardando separação', style: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-700' },
  LEX: { label: 'LEX - Em Separação / Expedição', desc: 'Em processo de conferência física no depósito', style: 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-700' },
  CAN: { label: 'CAN - Cancelado', desc: 'Pedido cancelado no ERP', style: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-700' },
};

function SituationBadge({ situation, manual }: { situation: string; manual?: boolean }) {
  const label = SITUATION_LABELS[situation] || situation;
  const style = SITUATION_STYLE[situation] || 'bg-slate-100 text-slate-600 border-slate-200';
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border shadow-sm ${style}`}>
      {label}
      {manual && <span className="ml-0.5 text-[9px] opacity-75 font-normal">(manual)</span>}
    </span>
  );
}

function SummaryPill({
  situation,
  count,
  isSelected,
  onClick,
}: {
  situation: string;
  count: number;
  isSelected?: boolean;
  onClick?: () => void;
}) {
  const label = SITUATION_LABELS[situation] || situation;
  const style = SITUATION_STYLE[situation] || 'bg-slate-100 text-slate-600 border-slate-200';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all shadow-sm cursor-pointer select-none active:scale-95 ${style} ${
        isSelected
          ? 'ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-slate-900 shadow-md scale-105 font-extrabold'
          : 'hover:opacity-90 hover:shadow opacity-85 hover:opacity-100'
      }`}
      title={`Filtrar por ${label}`}
    >
      <span>{label}</span>
      <span className={`font-extrabold text-xs px-1.5 py-0.5 rounded-md ${
        isSelected ? 'bg-indigo-600 text-white dark:bg-indigo-500' : 'bg-white/50 dark:bg-black/20'
      }`}>
        {count}
      </span>
    </button>
  );
}

// ─── Componente Principal ───────────────────────────────────────────────────

export default function BookinfoOrderDetailPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const router = useRouter();

  const [orderData, setOrderData] = useState<any>(null);
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState<'HORUS' | 'BOOKINFO' | 'SUGGESTIONS'>('HORUS');

  // Itens analisados (persistidos no BD)
  const [analysedItems, setAnalysedItems] = useState<any[]>([]);
  const [summary, setSummary]             = useState<Record<string, number>>({});
  const [lastAnalysedAt, setLastAnalysedAt] = useState<string | null>(null);

  // Sugestões comerciais
  const [suggestions, setSuggestions]               = useState<any[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // Filtros/Ordenação
  const [sortBy, setSortBy]       = useState<'title' | 'qty' | 'situation' | 'default'>('default');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSituation, setSelectedSituation] = useState<string | null>(null);

  // Modais de suporte UX
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [showFinancialModal, setShowFinancialModal] = useState(false);

  // Estados de loading por ação
  const [isAnalysing,         setIsAnalysing]         = useState(false);
  const [isAnalysingPost,     setIsAnalysingPost]     = useState(false);
  const [isAcknowledging,     setIsAcknowledging]     = useState(false);
  const [isSubmitting,        setIsSubmitting]        = useState(false);
  const [isSendingHorus,      setIsSendingHorus]      = useState(false);
  const [isRefreshingStatus,  setIsRefreshingStatus]  = useState(false);
  const [updatingItem,        setUpdatingItem]        = useState<number | null>(null);

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

  const buildSummary = (items: any[]) => {
    const s: Record<string, number> = {};
    items.forEach(it => {
      const sit = it.partner_situation || 'sem_estoque';
      s[sit] = (s[sit] || 0) + 1;
    });
    setSummary(s);
  };

  // ── Fetch Detalhes do Pedido ──────────────────────────────────────────────
  const fetchOrderDetails = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`${API}/bookinfo/orders/${params.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Falha ao buscar detalhes do pedido');
      const data = await res.json();
      setOrderData(data);

      const items: any[] = data.order_internal?.analysed_items || [];
      if (items.length > 0) {
        setAnalysedItems(items);
        buildSummary(items);
        const latest = items.reduce((acc: string, it: any) =>
          it.analysed_at && it.analysed_at > acc ? it.analysed_at : acc, '');
        setLastAnalysedAt(latest || null);
      } else {
        // Se ainda não tem análise, aba padrão fica Bookinfo Original
        setActiveTab(prev => prev === 'SUGGESTIONS' ? 'SUGGESTIONS' : 'BOOKINFO');
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao comunicar com o servidor');
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    fetchOrderDetails();
  }, [fetchOrderDetails]);

  // ── Fetch Sugestões ───────────────────────────────────────────────────────
  const fetchSuggestions = useCallback(async () => {
    setLoadingSuggestions(true);
    try {
      const token = getToken();
      const res = await fetch(`${API}/bookinfo/orders/${params.id}/suggestions`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions || []);
      }
    } catch (err) {
      console.error('Erro ao buscar sugestões:', err);
    } finally {
      setLoadingSuggestions(false);
    }
  }, [params.id]);

  const handleTabChange = (tab: 'HORUS' | 'BOOKINFO' | 'SUGGESTIONS') => {
    setActiveTab(tab);
    setSelectedSituation(null);
    if (tab !== 'HORUS' && sortBy === 'situation') {
      setSortBy('default');
    }
    if (tab === 'SUGGESTIONS' && suggestions.length === 0) {
      fetchSuggestions();
    }
  };

  // ── Receber Pedido ────────────────────────────────────────────────────────
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
      await fetchOrderDetails(true);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsAcknowledging(false);
    }
  };

  // ── Enviar Pedido ao Hórus (Original sem corte - Pós-Conferência) ─────────
  const sendOrderToHorus = async () => {
    setIsSendingHorus(true);
    try {
      const token = getToken();
      const res = await fetch(`${API}/bookinfo/orders/${params.id}/send-horus`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Falha ao enviar pedido ao Hórus');
      toast.success(data.message || 'Pedido enviado ao Hórus com sucesso!');
      await fetchOrderDetails(true);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSendingHorus(false);
    }
  };

  // ── Atualizar Status do Hórus em Tempo Real ───────────────────────────────
  const refreshHorusStatus = async () => {
    setIsRefreshingStatus(true);
    try {
      await fetchOrderDetails(true);
      toast.success('Status do Hórus atualizado!');
    } catch (err: any) {
      toast.error('Erro ao atualizar status do pedido.');
    } finally {
      setIsRefreshingStatus(false);
    }
  };

  // ── Analisar / Reavaliar Itens (Catálogo & Estoque Horus) ──────────────────
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

      toast.success(`Análise concluída com sucesso! ${data.analysed} item(ns) consultados no Hórus.`);
      await fetchOrderDetails(true);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsAnalysing(false);
    }
  };

  // ── Analisar Pós-Conferência (NF-e/Expedição Hórus - LFT/FAT) ─────────────
  const analysePostConference = async () => {
    setIsAnalysingPost(true);
    try {
      const token = getToken();
      const res = await fetch(`${API}/bookinfo/orders/${params.id}/analyse-post-conference`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao confrontar pós-conferência');

      setAnalysedItems(data.items || []);
      setSummary(data.summary || {});
      const now = new Date().toISOString();
      setLastAnalysedAt(now);
      setActiveTab('HORUS');

      toast.success(`Análise pós-conferência concluída! ${data.analysed} item(ns) confrontado(s) com a conferência.`);
      await fetchOrderDetails(true);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsAnalysingPost(false);
    }
  };

  // ── Alterar Situação Manualmente ──────────────────────────────────────────
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

      setAnalysedItems(prev => prev.map(it =>
        it.id === itemId ? { ...it, partner_situation: newSituation, sit_manual_change: true } : it
      ));
      buildSummary(analysedItems.map(it =>
        it.id === itemId ? { ...it, partner_situation: newSituation } : it
      ));
      toast.success(`Situação alterada para "${SITUATION_LABELS[newSituation] || newSituation}"`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUpdatingItem(null);
    }
  };

  // ── Enviar Avaliação para Bookinfo ────────────────────────────────────────
  const submitEvaluation = async () => {
    setIsSubmitting(true);
    try {
      const token = getToken();
      const payload = analysedItems.map(ev => ({
        isbn13: ev.isbn13 || ev.ean_isbn,
        quantidadeEfetiva: ['esgotado','fora_catalogo','item_nao_comercializado','item_rejeitado','sem_estoque','sem_cadastro_erp'].includes(ev.partner_situation)
          ? 0
          : ev.partner_situation === 'atendimento_parcial_sem_reserva'
          ? Math.min(Number(ev.qty_requested || ev.quantity_requested || 0), Number(ev.available_qty || 0))
          : Number(ev.qty_requested || ev.quantity_requested || 0),
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
      if (!res.ok) throw new Error(data.detail || 'Erro ao enviar avaliação à Bookinfo');
      toast.success('Avaliação processada na Bookinfo com sucesso!');
      await fetchOrderDetails(true);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Exportação Excel ──────────────────────────────────────────────────────
  const handleExportExcel = () => {
    try {
      if (activeTab === 'HORUS') {
        if (!analysedItems || analysedItems.length === 0) {
          toast.error('Nenhum item analisado para exportar.');
          return;
        }

        const itemsToExport = filteredSortedItems.length > 0 ? filteredSortedItems : analysedItems;
        const dataToExport = itemsToExport.map((it: any) => {
          const qtyReq = Number(it.qty_requested ?? it.quantity_requested ?? 0);
          const qtyAvail = Number(it.available_qty ?? 0);
          const grossPrice = Number(it.price_gross || 0);
          const propDiscount = Number(it.partner_discount || 0);
          const authDiscount = Number(it.discount_allowed || 0);
          const netPrice = Math.round(grossPrice * (1 - propDiscount / 100) * 100) / 100;
          const netTotal = Math.round(netPrice * qtyReq * 100) / 100;
          const situationLabel = SITUATION_LABELS[it.partner_situation] || it.partner_situation || 'Sem Estoque';

          return {
            'ISBN / EAN': it.isbn13 || it.ean_isbn || '',
            'Título': it.name || 'Item não localizado no Horus',
            'Editora': it.brand && it.brand !== 'ND' ? it.brand : '',
            'Qtd. Pedida': qtyReq,
            'Saldo Hórus': qtyAvail,
            'Saldo Consignado': Number(it.consigned_balance ?? 0),
            'Preço Capa (R$)': grossPrice,
            'Desc. Proposto (%)': propDiscount,
            'Desc. Autorizado (%)': authDiscount,
            'Preço Líquido (R$)': netPrice,
            'Total Líquido (R$)': netTotal,
            'Situação': situationLabel,
            'Detalhes Situação': it.situation_detail || '',
            'Ajuste Manual': it.sit_manual_change ? 'Sim' : 'Não',
          };
        });

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Itens Analisados');
        const orderCode = order.pedidoCliente || order.numero || orderInternal.id || params.id;
        XLSX.writeFile(wb, `Pedido_Bookinfo_${orderCode}_Analise.xlsx`);
        toast.success(`Planilha gerada com sucesso! (${itemsToExport.length} itens)`);
      } else {
        if (!bookinfoItems || bookinfoItems.length === 0) {
          toast.error('Nenhum item do pedido para exportar.');
          return;
        }

        const itemsToExport = filteredBookinfoItems.length > 0 ? filteredBookinfoItems : bookinfoItems;
        const dataToExport = itemsToExport.map((it: any) => {
          const qty = Number(it.quantidade ?? 0);
          const propDiscount = Number(it.descontoProposto || 0);
          const grossPrice = Number(it.precoCapa || 0);
          const netPrice = Number(it.precoLiquido || 0);
          const netTotal = Number(it.totalLiquido || (netPrice * qty));

          return {
            'ISBN / EAN': it.isbn13 || '',
            'Título': it.titulo || it.nome || '',
            'Qtd. Pedida': qty,
            'Desc. Proposto (%)': propDiscount,
            'Preço Capa (R$)': grossPrice,
            'Preço Líquido (R$)': netPrice,
            'Total Líquido (R$)': netTotal,
          };
        });

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Itens Bookinfo');
        const orderCode = order.pedidoCliente || order.numero || orderInternal.id || params.id;
        XLSX.writeFile(wb, `Pedido_Bookinfo_${orderCode}_Original.xlsx`);
        toast.success(`Planilha gerada com sucesso! (${itemsToExport.length} itens)`);
      }
    } catch (err: any) {
      console.error('Erro ao exportar Excel:', err);
      toast.error('Falha ao exportar planilha Excel.');
    }
  };

  // ── Loading Skeleton ──────────────────────────────────────────────────────
  if (loading || !orderData) {
    return (
      <div className="w-full max-w-[1920px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6 animate-pulse">
        <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded-xl w-72"></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="h-32 bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
          <div className="h-32 bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
          <div className="h-32 bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
          <div className="h-32 bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
        </div>
        <div className="h-[500px] bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
      </div>
    );
  }

  // ── Extração de Dados e Regras de Negócio ──────────────────────────────────
  const order         = orderData.bookinfo_api || {};
  const orderInternal = orderData.order_internal || {};
  const customer      = orderData.customer || {};
  const company       = orderData.company || {};
  const orderSettings = orderData.settings || {};
  const bookinfoItems = order.itens || [];

  const orderStatus        = (order.status || '').toUpperCase().trim();
  const isPostConference   = orderSettings.bookinfo_analysis_timing === 'AFTER_CONFERENCE';
  const horusPedidoVenda   = orderInternal.horus_pedido_venda;
  const horusStatus        = (orderInternal.horus_status || '').toUpperCase().trim();
  const horusInvoice       = orderInternal.horus_invoice;
  const isHorusConferred   = horusStatus === 'LFT' || horusStatus === 'FAT';
  const hasAnalysedItems   = analysedItems.length > 0;

  // Pedidos concluídos / finalizados na Bookinfo (somente leitura)
  const isCompletedOnBookinfo = [
    'PROCESSADO', 'FATURADO', 'CONCLUIDO', 'CANCELADO', 'FINALIZADO', 'ENTREGUE'
  ].includes(orderStatus) || !!orderInternal.validated_items_partner;

  // Lógica de habilitação dos botões
  let canSubmit = false;
  let canSendHorus = false;
  let workflowStepTitle = '';
  let workflowStepDescription = '';

  if (isCompletedOnBookinfo) {
    if (!horusPedidoVenda) {
      canSendHorus = true;
      workflowStepTitle = 'Pedido Processado na Bookinfo — Pronto para Envio ao Hórus';
      workflowStepDescription = 'As situações e quantidades foram consolidadas na Bookinfo. Agora você pode enviar o pedido ao Hórus com os dados processados para iniciar o faturamento no ERP.';
    } else {
      workflowStepTitle = 'Pedido Concluído e Integrado ao ERP';
      workflowStepDescription = `Pedido integrado ao Hórus (#${horusPedidoVenda}) e processado na Bookinfo com sucesso.`;
    }
  } else if (isPostConference) {
    // Modo PÓS-CONFERÊNCIA:
    if (!horusPedidoVenda) {
      canSendHorus = true;
      workflowStepTitle = 'Etapa 1: Pré-Análise & Envio ao ERP Hórus';
      workflowStepDescription = hasAnalysedItems
        ? 'Pré-análise realizada! Agora envie o pedido na íntegra para o Hórus para que o depósito inicie a conferência física.'
        : 'Você pode analisar os itens preliminarmente para verificar catálogo e estoques, e em seguida enviar o pedido ao Hórus na íntegra.';
    } else if (!isHorusConferred) {
      workflowStepTitle = `Etapa 2: Aguardando Conferência Física no Depósito (Hórus: ${horusStatus || 'DIG'})`;
      workflowStepDescription = `O pedido #${horusPedidoVenda} está em processo de separação física. O botão "Processar na Bookinfo" será liberado automaticamente após a conferência e liberação (LFT/FAT) no ERP.`;
    } else {
      canSubmit = hasAnalysedItems;
      workflowStepTitle = `Etapa 3: Pedido Conferido no Hórus (${horusStatus})!`;
      workflowStepDescription = hasAnalysedItems
        ? 'Conferência física finalizada e confrontada com sucesso. Agora você pode processar e sincronizar as situações finais na Bookinfo!'
        : 'O pedido foi conferido no Hórus! Clique em "Confrontar Conferência Hórus" para carregar as quantidades efetivamente atendidas.';
    }
  } else {
    // Modo PRÉ-CONFERÊNCIA (TRADICIONAL):
    if (!hasAnalysedItems) {
      workflowStepTitle = 'Etapa 1: Análise de Catálogo & Estoque Hórus';
      workflowStepDescription = 'Clique no botão "Analisar Itens do Pedido" para consultar a disponibilidade no ERP Hórus e classificar cada item.';
    } else {
      canSubmit = !horusPedidoVenda && !isCompletedOnBookinfo;
      workflowStepTitle = 'Etapa 2: Validação Comercial & Processamento';
      workflowStepDescription = 'Estoque e regras comerciais calculados. Você pode reavaliar os itens a qualquer momento, aplicar ajustes manuais se necessário e processar na Bookinfo.';
    }
  }

  // Ordenação dos itens analisados
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

  // Filtragem dos itens originais da Bookinfo
  const filteredBookinfoItems = bookinfoItems.filter((item: any) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const title = (item.titulo || item.nome || '').toLowerCase();
    const isbn = (item.isbn13 || '').toLowerCase();
    return title.includes(q) || isbn.includes(q);
  });

  // Filtragem dos itens analisados
  const filteredSortedItems = sortedItems.filter((ev: any) => {
    if (selectedSituation && ev.partner_situation !== selectedSituation) {
      return false;
    }
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    const title = (ev.name || '').toLowerCase();
    const isbn = (ev.isbn13 || ev.ean_isbn || '').toLowerCase();
    const brand = (ev.brand || '').toLowerCase();
    return title.includes(q) || isbn.includes(q) || brand.includes(q);
  });

  // Métricas do Pedido
  const totalItemsCount = bookinfoItems.reduce((acc: number, it: any) => acc + Number(it.quantidade || 0), 0);
  const totalItemsAnalysed = analysedItems.reduce((acc: number, it: any) => acc + Number(it.qty_requested ?? it.quantity_requested ?? 0), 0);
  const totalItemsAttended = analysedItems.reduce((acc: number, it: any) => {
    if (['esgotado','fora_catalogo','item_nao_comercializado','item_rejeitado','sem_estoque'].includes(it.partner_situation)) return acc;
    const req = Number(it.qty_requested ?? it.quantity_requested ?? 0);
    const avail = Number(it.available_qty ?? 0);
    return acc + (it.partner_situation === 'atendimento_parcial_sem_reserva' ? Math.min(req, avail) : req);
  }, 0);
  const attendanceRate = totalItemsAnalysed > 0 ? Math.round((totalItemsAttended / totalItemsAnalysed) * 100) : 0;

  const limitUsedPercent = customer.credit_limit && customer.credit_limit > 0
    ? Math.min(100, Math.max(0, (customer.open_debts || 0) / customer.credit_limit * 100))
    : 0;

  const consignmentItemsCount = Number(customer.consignment_balance_items || 0);
  const consignmentValue = Number(customer.consignment_balance_value || 0);

  const horusStatusInfo = HORUS_STATUS_LABELS[horusStatus] || {
    label: horusStatus || 'Não integrado',
    desc: horusStatus ? 'Status retornado pelo ERP' : 'Aguardando envio ao Hórus',
    style: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
  };

  return (
    <div className="w-full max-w-[1920px] mx-auto p-3 sm:p-5 lg:p-6 space-y-5">

      {/* ── 1. Top Header com Navegação e Ações Principais ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <Link
            href="/bookinfo/orders"
            className="p-2.5 rounded-xl bg-white text-slate-500 hover:bg-slate-50 border border-slate-200 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 transition shadow-sm active:scale-95"
            title="Voltar para a lista de pedidos"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Pedido Bookinfo <span className="font-mono text-indigo-600 dark:text-indigo-400 font-bold">#{order.id}</span>
              </h1>
              {order.pedidoCliente && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                  Ref: {order.pedidoCliente}
                </span>
              )}
              {isCompletedOnBookinfo && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                  <CheckCircle2 className="w-3 h-3" /> Concluído na Bookinfo
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
              <span>Canal: <strong>Bookinfo Hub</strong></span>
              <span>•</span>
              <span>Emitido em: {parseBookinfoDate(order.dataCriacao)?.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) || 'ND'}</span>
            </p>
          </div>
        </div>

        {/* Botões Rápidos e Modais */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Botão de Observações */}
          {(order.observacao || customer.commercial_notes) && (
            <button
              type="button"
              onClick={() => setShowNotesModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-800 text-xs font-bold transition shadow-sm cursor-pointer"
            >
              <Info className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>Ver Observações</span>
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
            </button>
          )}

          {/* Botão de Limite & Consignação */}
          <button
            type="button"
            onClick={() => setShowFinancialModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold transition shadow-sm cursor-pointer"
          >
            <Wallet className="w-4 h-4 text-indigo-500" />
            <span>Limite & Consignação</span>
            {consignmentItemsCount > 0 && (
              <span className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-1.5 py-0.5 rounded text-[10px] font-extrabold border border-amber-300 dark:border-amber-700">
                {consignmentItemsCount} un
              </span>
            )}
          </button>

          {/* Botão Marcar como Recebido (se pendente) */}
          {order.status === 'NOVO' && (
            <button
              type="button"
              onClick={acknowledgeOrder}
              disabled={isAcknowledging}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-sm disabled:opacity-50 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>{isAcknowledging ? 'Confirmando...' : 'Confirmar Recebimento'}</span>
            </button>
          )}
        </div>
      </div>

      {/* ── 2. Grade de Indicadores & Contexto Full Width (4 Colunas) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

        {/* Card 1: Cliente & Canal */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cliente Solicitante</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                order.compraConsignacao === 'S'
                  ? 'bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300'
                  : 'bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300'
              }`}>
                {order.compraConsignacao === 'S' ? 'Consignação' : 'Venda Direta'}
              </span>
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white text-sm line-clamp-1" title={customer.name || order.nomeComprador}>
              {customer.name || order.nomeComprador || 'Não Informado'}
            </h3>
            <p className="font-mono text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              CNPJ: {customer.document || order.cnpjComprador || '—'}
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
            <span>Fornecedor:</span>
            <span className="font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[150px]">{company.name || 'Cronuz'}</span>
          </div>
        </div>

        {/* Card 2: Fluxo Comercial & Status Bookinfo */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Regra de Análise</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                Bookinfo: {order.status || 'NOVO'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold ${
                isPostConference
                  ? 'bg-purple-100 text-purple-800 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800'
                  : 'bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800'
              }`}>
                <SlidersHorizontal className="w-3.5 h-3.5" />
                {isPostConference ? 'Pós-Conferência (NF-e)' : 'Pré-Conferência (Catálogo)'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
              {isPostConference
                ? 'Separação física ocorre no Hórus primeiro. Libera Bookinfo após LFT/FAT.'
                : 'Valida estoque no catálogo e envia retorno antes do faturamento.'}
            </p>
          </div>
        </div>

        {/* Card 3: Status no ERP Hórus */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Integração ERP Hórus</span>
              {horusPedidoVenda && (
                <button
                  type="button"
                  onClick={refreshHorusStatus}
                  disabled={isRefreshingStatus}
                  className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition cursor-pointer"
                  title="Atualizar status do Hórus agora"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingStatus ? 'animate-spin' : ''}`} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {horusPedidoVenda ? (
                <span className="font-mono text-sm font-black text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                  #{horusPedidoVenda}
                </span>
              ) : (
                <span className="text-xs text-slate-400 font-medium italic">Não integrado ainda</span>
              )}
            </div>
            <div className="mt-2">
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold border ${horusStatusInfo.style}`}>
                {isHorusConferred ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                {horusStatusInfo.label}
              </span>
            </div>
          </div>
          {horusInvoice && (
            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-between">
              <span>Nota Fiscal:</span>
              <span>NF-e #{horusInvoice}</span>
            </div>
          )}
        </div>

        {/* Card 4: Resumo de Atendimento & Métricas */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Atendimento de Itens</span>
              <span className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400">
                {attendanceRate}%
              </span>
            </div>
            <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
              <span>{totalItemsAttended} atendidos</span>
              <span className="text-slate-400 font-normal">de {totalItemsCount || totalItemsAnalysed} un</span>
            </div>
            <div className="mt-2 h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  attendanceRate >= 80 ? 'bg-emerald-500' : attendanceRate >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                }`}
                style={{ width: `${attendanceRate}%` }}
              ></div>
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
            <span>Total Itens: <strong>{bookinfoItems.length} títulos</strong></span>
            <span>Analisados: <strong>{analysedItems.length}</strong></span>
          </div>
        </div>

      </div>

      {/* ── 3. Barra de Workflow & Ações Operacionais (SEMPRE VISÍVEL) ── */}
      <div className={`p-4 sm:p-5 rounded-2xl border flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-sm transition-all ${
        isCompletedOnBookinfo
          ? 'bg-emerald-50/70 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800/60'
          : isPostConference && isHorusConferred
          ? 'bg-emerald-50/60 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800/50'
          : isPostConference && horusPedidoVenda
          ? 'bg-amber-50/70 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800/60'
          : 'bg-slate-50/80 border-slate-200 dark:bg-slate-900/80 dark:border-slate-800'
      }`}>
        {/* Status Textual & Indicador */}
        <div className="flex items-start gap-3.5">
          <div className="mt-0.5 shrink-0">
            {isCompletedOnBookinfo ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            ) : isPostConference && isHorusConferred ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            ) : isPostConference && horusPedidoVenda ? (
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            ) : (
              <Info className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            )}
          </div>
          <div>
            <h4 className="font-bold text-sm tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              {workflowStepTitle}
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed max-w-3xl">
              {workflowStepDescription}
            </p>
          </div>
        </div>

        {/* Botões Operacionais (Mobile First) */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">

          {/* BOTÃO 1: ANALISAR ITENS (1ª vez) OU REAVALIAR ITENS (se já analisado) */}
          {!isCompletedOnBookinfo && (
            <button
              type="button"
              onClick={analyseItems}
              disabled={isAnalysing || (isPostConference && !!horusPedidoVenda)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition shadow-sm active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                !hasAnalysedItems
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  : 'bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800'
              }`}
              title={
                isPostConference && !!horusPedidoVenda
                  ? 'O pedido já está no Hórus. Use o botão "Confrontar Conferência Hórus".'
                  : hasAnalysedItems
                  ? 'Reconsultar estoque atualizado no Hórus e reavaliar itens'
                  : 'Consultar estoque e catálogo no ERP Hórus'
              }
            >
              {hasAnalysedItems ? (
                <RotateCcw className={`w-4 h-4 ${isAnalysing ? 'animate-spin' : ''}`} />
              ) : (
                <Play className="w-4 h-4" />
              )}
              <span>
                {isAnalysing
                  ? 'Consultando Hórus...'
                  : hasAnalysedItems
                  ? 'Reavaliar Itens'
                  : '1. Analisar Itens do Pedido'}
              </span>
            </button>
          )}

          {/* BOTÃO 2: ENVIAR AO HÓRUS (PÓS-CONFERÊNCIA OU PÓS-PROCESSAMENTO PRÉ-CONFERÊNCIA) */}
          {!horusPedidoVenda && ((isPostConference && !isCompletedOnBookinfo) || isCompletedOnBookinfo) && (
            <button
              type="button"
              onClick={sendOrderToHorus}
              disabled={isSendingHorus}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 active:scale-95 text-white text-xs font-bold transition shadow-md disabled:opacity-50 cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>{isSendingHorus ? 'Enviando ao Hórus...' : 'Enviar Pedido ao Hórus'}</span>
            </button>
          )}

          {/* BOTÃO 3: VERIFICAR STATUS DO HÓRUS (quando em separação física) */}
          {isPostConference && horusPedidoVenda && !isHorusConferred && !isCompletedOnBookinfo && (
            <button
              type="button"
              onClick={refreshHorusStatus}
              disabled={isRefreshingStatus}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 active:scale-95 text-white text-xs font-bold transition shadow-sm disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshingStatus ? 'animate-spin' : ''}`} />
              <span>{isRefreshingStatus ? 'Checando...' : 'Verificar Conferência no Hórus'}</span>
            </button>
          )}

          {/* BOTÃO 4: CONFRONTAR CONFERÊNCIA HÓRUS (quando LFT/FAT) */}
          {isPostConference && horusPedidoVenda && isHorusConferred && !isCompletedOnBookinfo && (
            <button
              type="button"
              onClick={analysePostConference}
              disabled={isAnalysingPost}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold transition shadow-md disabled:opacity-50 cursor-pointer"
            >
              <Play className="w-4 h-4" />
              <span>{isAnalysingPost ? 'Confrontando...' : '2. Confrontar Conferência Hórus'}</span>
            </button>
          )}

          {/* BOTÃO 5: PROCESSAR NA BOOKINFO */}
          {!isCompletedOnBookinfo ? (
            <button
              type="button"
              onClick={submitEvaluation}
              disabled={isSubmitting || !canSubmit}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition shadow-md ${
                canSubmit
                  ? 'bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white cursor-pointer'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed border border-slate-300/40 dark:border-slate-700/40'
              }`}
              title={
                !canSubmit
                  ? isPostConference
                    ? 'Bloqueado: Requer que o pedido seja conferido no Hórus (LFT ou FAT) e confrontado.'
                    : 'Bloqueado: Requer que a análise de catálogo tenha sido realizada primeiro.'
                  : 'Enviar avaliação e resposta definitiva para a Bookinfo'
              }
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {isSubmitting
                  ? 'Processando...'
                  : isPostConference
                  ? '3. Processar na Bookinfo'
                  : '2. Processar na Bookinfo'}
              </span>
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 text-xs font-bold">
              <CheckCircle2 className="w-4 h-4" /> Processado na Bookinfo
            </span>
          )}

        </div>
      </div>

      {/* ── 4. Painel Principal de Itens e Conferência (Full Width 100%) ── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden flex flex-col">

        {/* Barra de Abas e Ações Rápidas */}
        <div className="px-4 sm:px-6 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/20">
          <div className="flex items-center gap-2 sm:gap-6 overflow-x-auto">
            <button
              onClick={() => handleTabChange('HORUS')}
              className={`py-3.5 font-bold text-xs sm:text-sm border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                activeTab === 'HORUS'
                  ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Análise B2B / Hórus ({analysedItems.length})</span>
              {hasAnalysedItems && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
              )}
            </button>

            <button
              onClick={() => handleTabChange('BOOKINFO')}
              className={`py-3.5 font-bold text-xs sm:text-sm border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                activeTab === 'BOOKINFO'
                  ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Itens Originais Bookinfo ({bookinfoItems.length})</span>
            </button>

            <button
              onClick={() => handleTabChange('SUGGESTIONS')}
              className={`py-3.5 font-bold text-xs sm:text-sm border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                activeTab === 'SUGGESTIONS'
                  ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>Sugestões Comerciais {suggestions.length > 0 && `(${suggestions.length})`}</span>
            </button>
          </div>

          {/* Exportar Excel */}
          <div className="flex items-center gap-2 py-2 sm:py-0">
            <button
              type="button"
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold transition shadow-sm cursor-pointer ml-auto"
              title="Exportar dados para Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Exportar Excel</span>
            </button>
          </div>
        </div>

        {/* Pílulas de Resumo de Situações (Aba Hórus) */}
        {activeTab === 'HORUS' && hasAnalysedItems && (
          <div className="px-4 sm:px-6 py-3 bg-slate-50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Filtrar Situação:</span>
              {Object.entries(summary).map(([sit, count]) => (
                <SummaryPill
                  key={sit}
                  situation={sit}
                  count={count as number}
                  isSelected={selectedSituation === sit}
                  onClick={() => setSelectedSituation(prev => prev === sit ? null : sit)}
                />
              ))}

              {selectedSituation && (
                <button
                  type="button"
                  onClick={() => setSelectedSituation(null)}
                  className="text-xs font-bold text-rose-500 hover:text-rose-600 underline ml-1 cursor-pointer transition"
                >
                  Limpar filtro
                </button>
              )}
            </div>

            {lastAnalysedAt && (
              <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                Última análise: {new Date(lastAnalysedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
              </span>
            )}
          </div>
        )}

        {/* Barra de Filtros e Busca */}
        <div className="px-4 sm:px-6 py-3 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Campo de Busca */}
          <div className="relative flex-1 max-w-md">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              placeholder="Buscar por título, ISBN ou editora..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-colors shadow-sm"
            />
          </div>

          {/* Opções de Ordenação */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <SlidersHorizontal className="w-3.5 h-3.5" /> Ordenar por:
            </span>
            <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => {
                  if (sortBy === 'title') setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                  else { setSortBy('title'); setSortOrder('asc'); }
                }}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1 cursor-pointer ${
                  sortBy === 'title' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Título
                {sortBy === 'title' ? (
                  sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-500" /> : <ArrowDown className="w-3 h-3 text-indigo-500" />
                ) : (
                  <ArrowUpDown className="w-3 h-3 opacity-40" />
                )}
              </button>

              <button
                onClick={() => {
                  if (sortBy === 'qty') setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                  else { setSortBy('qty'); setSortOrder('asc'); }
                }}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1 cursor-pointer ${
                  sortBy === 'qty' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Quantidade
                {sortBy === 'qty' ? (
                  sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-500" /> : <ArrowDown className="w-3 h-3 text-indigo-500" />
                ) : (
                  <ArrowUpDown className="w-3 h-3 opacity-40" />
                )}
              </button>

              {activeTab === 'HORUS' && (
                <button
                  onClick={() => {
                    if (sortBy === 'situation') setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                    else { setSortBy('situation'); setSortOrder('asc'); }
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1 cursor-pointer ${
                    sortBy === 'situation' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  Situação
                  {sortBy === 'situation' ? (
                    sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-500" /> : <ArrowDown className="w-3 h-3 text-indigo-500" />
                  ) : (
                    <ArrowUpDown className="w-3 h-3 opacity-40" />
                  )}
                </button>
              )}
            </div>

            {sortBy !== 'default' && (
              <button
                onClick={() => { setSortBy('default'); setSortOrder('asc'); }}
                className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                Limpar
              </button>
            )}
          </div>
        </div>

        {/* ── Conteúdo das Abas ── */}
        <div className="p-4 sm:p-6 bg-slate-50/40 dark:bg-slate-950/20 min-h-[400px]">

          {/* ABA 1: ANÁLISE B2B / HÓRUS */}
          {activeTab === 'HORUS' && (
            analysedItems.length === 0 ? (
              <div className="py-16 flex flex-col items-center justify-center text-center space-y-4">
                <div className="p-4 bg-indigo-50 dark:bg-indigo-950/40 rounded-full border border-indigo-100 dark:border-indigo-800">
                  <Sparkles className="w-10 h-10 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="max-w-md">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
                    Análise Horus Pendente
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Clique em <strong>&quot;1. Analisar Itens do Pedido&quot;</strong> na barra superior para consultar estoque, preços e políticas comerciais diretamente no ERP Hórus.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredSortedItems.map((ev: any, idx: number) => {
                  const qtyRequested = ev.qty_requested ?? ev.quantity_requested ?? 0;
                  const qtyAvailable = ev.available_qty ?? 0;
                  const consignedBalance = Number(ev.consigned_balance ?? 0);
                  const hasStock = qtyAvailable >= qtyRequested;
                  const partnerDiscount = Number(ev.partner_discount || 0);
                  const discountAllowed = Number(ev.discount_allowed || 0);
                  const discountExceeded = partnerDiscount > discountAllowed;
                  const isCutSituation = ['esgotado', 'fora_catalogo', 'item_nao_comercializado', 'item_rejeitado', 'sem_estoque', 'sem_cadastro_erp'].includes(ev.partner_situation);
                  const qtyAttended = isCutSituation
                    ? 0
                    : ev.quantity_fulfilled !== undefined && ev.quantity_fulfilled !== null
                    ? Number(ev.quantity_fulfilled)
                    : ev.quantity !== undefined && ev.quantity !== null
                    ? Number(ev.quantity)
                    : ev.partner_situation === 'atendimento_parcial_sem_reserva'
                    ? Math.min(qtyRequested, qtyAvailable)
                    : qtyRequested;
                  const borderLeftClass = SITUATION_BORDER[ev.partner_situation] || 'border-l-4 border-l-slate-200 dark:border-l-slate-800';

                  return (
                    <div
                      key={ev.id || idx}
                      className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-4 hover:shadow-md transition-all ${borderLeftClass}`}
                    >
                      {/* 1. Informações do Livro */}
                      <div className="flex-1 min-w-[280px] space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base leading-snug">
                            {ev.name || 'Item não localizado no Hórus'}
                          </h4>
                          {(ev.has_erp_registration === false || ev.partner_situation === 'sem_cadastro_erp') && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                              <AlertCircle className="w-3 h-3" /> Sem Cadastro no Hórus
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-mono text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                            {ev.isbn13 || ev.ean_isbn}
                          </span>
                          {ev.brand && ev.brand !== 'ND' && (
                            <span className="text-slate-500 dark:text-slate-400">
                              Editora: <strong className="text-slate-700 dark:text-slate-300">{ev.brand}</strong>
                            </span>
                          )}
                          {consignedBalance > 0 && (
                            <span className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                              Consignado: <strong>{consignedBalance} un</strong>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 2. Métricas (Quantidades, Descontos, Situação) */}
                      <div className="flex flex-wrap items-center gap-3 sm:gap-6 shrink-0">

                        {/* Quantidades e Saldos */}
                        <div className={`flex items-center gap-2.5 sm:gap-3 px-3 py-2 rounded-xl border min-w-[170px] justify-around shadow-sm ${
                          hasStock
                            ? 'bg-emerald-50/50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800/60'
                            : 'bg-rose-50/50 border-rose-200 dark:bg-rose-950/20 dark:border-rose-800/60'
                        }`}>
                          <div className="text-center" title="Quantidade solicitada no pedido">
                            <span className="text-[9px] text-slate-400 uppercase font-bold block">Pedida</span>
                            <span className="text-sm font-black text-slate-800 dark:text-slate-200">{qtyRequested}</span>
                          </div>
                          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />
                          <div className="text-center" title="Estoque livre no Hórus ERP">
                            <span className="text-[9px] text-slate-400 uppercase font-bold block">Saldo</span>
                            <span className={`text-sm font-black ${hasStock ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                              {qtyAvailable}
                            </span>
                          </div>
                          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />
                          <div className="text-center" title="Saldo consignado atual do cliente para este item">
                            <span className="text-[9px] text-amber-500 uppercase font-bold block">Consig.</span>
                            <span className="text-sm font-black text-amber-600 dark:text-amber-400">
                              {consignedBalance}
                            </span>
                          </div>
                          {isCompletedOnBookinfo && (
                            <>
                              <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />
                              <div className="text-center" title="Quantidade aprovada no processamento e enviada ao Hórus">
                                <span className="text-[9px] text-emerald-600 dark:text-emerald-400 uppercase font-bold block">Atendida</span>
                                <span className={`text-sm font-black ${qtyAttended > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-600'}`}>
                                  {qtyAttended}
                                </span>
                              </div>
                            </>
                          )}
                        </div>

                        {/* Descontos */}
                        <div className={`flex items-center gap-3 px-3 py-2 rounded-xl border min-w-[130px] justify-around shadow-sm ${
                          discountExceeded
                            ? 'bg-amber-50/50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800/60'
                            : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700'
                        }`}>
                          <div className="text-center">
                            <span className="text-[9px] text-slate-400 uppercase font-bold block">Prop.</span>
                            <span className="text-sm font-black text-slate-800 dark:text-slate-200">{partnerDiscount.toFixed(1)}%</span>
                          </div>
                          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />
                          <div className="text-center">
                            <span className="text-[9px] text-slate-400 uppercase font-bold block">Autoriz.</span>
                            <span className={`text-sm font-black ${discountExceeded ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                              {discountAllowed.toFixed(1)}%
                            </span>
                          </div>
                        </div>

                        {/* Situação Atual */}
                        <div className="min-w-[140px] flex flex-col justify-center">
                          <span className="text-[9px] text-slate-400 uppercase font-bold block mb-1">Situação</span>
                          <SituationBadge situation={ev.partner_situation} manual={ev.sit_manual_change} />
                          {ev.situation_detail && (
                            <span className="text-[10px] text-slate-400 block mt-1 max-w-[160px] truncate" title={ev.situation_detail}>
                              {ev.situation_detail}
                            </span>
                          )}
                        </div>

                        {/* 3. Ajuste Manual Sem Cortes Laterais (Bloqueado se Concluído) */}
                        <div className="w-full sm:w-auto min-w-[190px] pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800 flex flex-col gap-1">
                          <span className="text-[9px] text-slate-400 uppercase font-bold block">
                            {isCompletedOnBookinfo ? 'Situação Final' : 'Ajuste Manual'}
                          </span>
                          <div className="relative w-full">
                            <select
                              value={ev.partner_situation || ''}
                              disabled={updatingItem === ev.id || isCompletedOnBookinfo}
                              onChange={(e) => {
                                if (ev.id) updateSituation(ev.id, ev.isbn13 || ev.ean_isbn, e.target.value);
                              }}
                              className={`w-full px-3 py-2 border rounded-xl text-xs font-bold transition shadow-sm pr-8 ${
                                isCompletedOnBookinfo
                                  ? 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800/60 dark:text-slate-400 dark:border-slate-700 cursor-not-allowed opacity-80'
                                  : 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700/80 border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 cursor-pointer outline-none focus:ring-2 focus:ring-indigo-500 appearance-none'
                              }`}
                            >
                              <option value="reservado_total">Atender Total</option>
                              <option value="atendimento_parcial_sem_reserva">Atend. Parcial</option>
                              <option value="sem_estoque">Sem Estoque</option>
                              <option value="esgotado">Esgotado</option>
                              <option value="fora_catalogo">Fora de Catálogo</option>
                              <option value="item_nao_comercializado">Não Comercializado</option>
                              <option value="sem_cadastro_erp">Sem Cadastro no ERP</option>
                              <option value="item_rejeitado">Rejeitar Item</option>
                            </select>
                            {!isCompletedOnBookinfo && (
                              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400">
                                <span className="text-[10px]">▼</span>
                              </div>
                            )}
                          </div>
                          {updatingItem === ev.id && (
                            <span className="text-[10px] text-indigo-500 font-bold animate-pulse">Salvando...</span>
                          )}
                        </div>

                      </div>
                    </div>
                  );
                })}

                {filteredSortedItems.length === 0 && (
                  <div className="text-center py-12 text-slate-400 flex flex-col items-center justify-center gap-2">
                    <Search className="w-8 h-8 opacity-40 mb-1" />
                    <p className="font-bold text-sm">Nenhum item localizado</p>
                    <p className="text-xs">Não encontramos itens correspondentes aos filtros aplicados.</p>
                  </div>
                )}
              </div>
            )
          )}

          {/* ABA 2: ITENS ORIGINAIS BOOKINFO */}
          {activeTab === 'BOOKINFO' && (
            <div className="space-y-3">
              {filteredBookinfoItems.map((item: any, idx: number) => {
                const qty = item.quantidade ?? 0;
                const proposedDiscount = Number(item.descontoProposto || 0);

                return (
                  <div
                    key={idx}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:shadow-md transition-all border-l-4 border-l-indigo-500"
                  >
                    <div className="flex-1 space-y-1">
                      <h4 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base leading-snug">
                        {item.titulo || item.nome || 'Não Informado'}
                      </h4>
                      <span className="inline-block font-mono text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                        {item.isbn13}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      <div className="bg-slate-50 dark:bg-slate-800/40 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-center min-w-[100px]">
                        <span className="text-[9px] text-slate-400 block font-bold uppercase tracking-wider">Qtd. Pedida</span>
                        <span className="text-sm font-black text-slate-800 dark:text-slate-200">{qty}</span>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-800/40 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-center min-w-[100px]">
                        <span className="text-[9px] text-slate-400 block font-bold uppercase tracking-wider">Desconto</span>
                        <span className="text-sm font-black text-slate-800 dark:text-slate-200">{proposedDiscount.toFixed(2)}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {filteredBookinfoItems.length === 0 && (
                <div className="text-center py-12 text-slate-400 flex flex-col items-center justify-center gap-2">
                  <Search className="w-8 h-8 opacity-40 mb-1" />
                  <p className="font-bold text-sm">Nenhum item original encontrado</p>
                  <p className="text-xs">Verifique a busca digitada acima.</p>
                </div>
              )}
            </div>
          )}

          {/* ABA 3: SUGESTÕES COMERCIAIS */}
          {activeTab === 'SUGGESTIONS' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 gap-3">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-amber-500" /> Sugestões Comerciais Inteligentes
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Títulos com estoque livre e alto potencial que o cliente não incluiu neste pedido.
                  </p>
                </div>
                <button
                  onClick={fetchSuggestions}
                  disabled={loadingSuggestions}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50 w-fit cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingSuggestions ? 'animate-spin' : ''}`} />
                  Atualizar Sugestões
                </button>
              </div>

              {loadingSuggestions ? (
                <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
                  <p className="text-sm font-medium">Buscando oportunidades comerciais...</p>
                </div>
              ) : suggestions.length === 0 ? (
                <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                  <Package className="w-8 h-8 opacity-40 mb-1" />
                  <p className="font-bold text-sm">Nenhuma sugestão no momento</p>
                  <p className="text-xs">Todos os títulos com estoque livre já estão no pedido ou o estoque está esgotado.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {suggestions.map((item, sIdx) => (
                    <div
                      key={item.product_id || sIdx}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col justify-between hover:shadow-md transition-all border-l-4 border-l-amber-500"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800">
                            {item.reason}
                          </span>
                          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded">
                            {item.stock_balance} un disponíveis
                          </span>
                        </div>
                        <h4 className="font-bold text-slate-900 dark:text-white text-sm line-clamp-2 leading-tight">
                          {item.title}
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          {item.brand && `Editora: ${item.brand}`}
                        </p>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">Preço de Capa</span>
                          <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.price || 0)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (item.isbn) {
                              navigator.clipboard.writeText(item.isbn);
                              toast.success(`ISBN ${item.isbn} copiado!`);
                            }
                          }}
                          className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition cursor-pointer"
                          title="Copiar ISBN para sugerir ao cliente"
                        >
                          Copiar ISBN: <span className="font-mono">{item.isbn}</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* ── 5. Modal de Observações do Pedido e Hórus ── */}
      {showNotesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <Info className="w-5 h-5 text-amber-500" />
                Observações do Pedido & Cliente
              </h3>
              <button
                onClick={() => setShowNotesModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              {order.observacao && (
                <div className="bg-blue-50/60 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 p-4 rounded-2xl">
                  <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block mb-1">
                    Observação enviada no Pedido (Bookinfo)
                  </span>
                  <p className="text-xs text-blue-950 dark:text-blue-200 leading-relaxed whitespace-pre-wrap">
                    {order.observacao}
                  </p>
                </div>
              )}

              {customer.commercial_notes && (
                <div className="bg-amber-50/60 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40 p-4 rounded-2xl">
                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider block mb-1">
                    Observações Fixas do Cliente (ERP Hórus)
                  </span>
                  <p className="text-xs text-amber-950 dark:text-amber-200 leading-relaxed whitespace-pre-wrap font-mono">
                    {customer.commercial_notes}
                  </p>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowNotesModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 6. Modal de Resumo Financeiro, Limite de Crédito & Saldo Consignado ── */}
      {showFinancialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <Wallet className="w-5 h-5 text-indigo-500" />
                Resumo de Crédito & Consignação
              </h3>
              <button
                onClick={() => setShowFinancialModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="text-xs text-slate-500 font-bold flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4 text-slate-400" /> Limite de Crédito Total
                </span>
                <strong className="text-sm text-slate-900 dark:text-white font-black">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(customer.credit_limit || 0)}
                </strong>
              </div>

              <div className="flex justify-between items-center bg-rose-50/50 dark:bg-rose-950/20 p-3 rounded-xl border border-rose-200 dark:border-rose-900/40">
                <span className="text-xs text-rose-600 font-bold flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4" /> Débitos / Em Aberto
                </span>
                <strong className="text-sm text-rose-700 dark:text-rose-400 font-black">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(customer.open_debts || 0)}
                </strong>
              </div>

              <div className="flex justify-between items-center bg-emerald-50/50 dark:bg-emerald-950/20 p-3 rounded-xl border border-emerald-200 dark:border-emerald-900/40">
                <span className="text-xs text-emerald-600 font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> Saldo Disponível de Crédito
                </span>
                <strong className="text-sm text-emerald-700 dark:text-emerald-400 font-black">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((customer.credit_limit || 0) - (customer.open_debts || 0))}
                </strong>
              </div>

              {/* Card de Consignação */}
              <div className="bg-amber-50/60 dark:bg-amber-950/20 p-3.5 rounded-xl border border-amber-200 dark:border-amber-900/40 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-amber-800 dark:text-amber-300 font-bold flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-amber-600" /> Saldo Consignado Atual
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                    customer.consignment_status === 'ACTIVE'
                      ? 'bg-amber-200/80 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200'
                      : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                  }`}>
                    {customer.consignment_status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-amber-200/60 dark:border-amber-900/40 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Quantidade</span>
                    <strong className="text-sm font-black text-amber-900 dark:text-amber-200">
                      {consignmentItemsCount} un
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-bold block">Valor Consignado</span>
                    <strong className="text-sm font-black text-amber-900 dark:text-amber-200">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(consignmentValue)}
                    </strong>
                  </div>
                </div>
                {customer.id && (
                  <div className="pt-1">
                    <Link
                      href={`/customers/${customer.id}/consignment`}
                      target="_blank"
                      className="text-[11px] font-bold text-amber-700 dark:text-amber-300 hover:underline flex items-center gap-1"
                    >
                      <span>Ver contratos de consignação do cliente</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                )}
              </div>

              {/* Barra de Uso do Limite */}
              <div className="pt-2">
                <div className="flex justify-between items-end mb-1.5">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Uso do Limite</span>
                  <span className={`text-xs font-bold ${limitUsedPercent > 80 ? 'text-rose-600' : limitUsedPercent > 50 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {limitUsedPercent.toFixed(1)}%
                  </span>
                </div>
                <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner">
                  <div
                    className={`h-full transition-all duration-700 ${
                      limitUsedPercent > 80 ? 'bg-rose-500' : limitUsedPercent > 50 ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${limitUsedPercent}%` }}
                  ></div>
                </div>
              </div>

              {customer.last_settlement_date && (
                <div className="text-center pt-2 text-xs text-slate-400">
                  Último acerto em: {new Date(customer.last_settlement_date).toLocaleDateString('pt-BR')}
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowFinancialModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
