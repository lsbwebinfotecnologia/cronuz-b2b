'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Layers,
  Search,
  Eye,
  Plus,
  Trash2,
  XCircle,
  FileSpreadsheet,
  Mail,
  Keyboard,
  ShieldCheck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  DollarSign,
  ShoppingBag,
  Users,
  SlidersHorizontal,
  Download,
  Upload,
  Loader2,
  Sparkles,
  Send,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { getToken } from '@/lib/auth';
import CustomerAutocomplete from '@/components/CustomerAutocomplete';
import { CurrencyInput } from '@/components/CurrencyInput';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface IntakePolicies {
  direct_sale_pass_through: boolean;
  direct_sale_allow_without_stock: boolean;
  min_stock_buffer: number;
  block_consign_low_stock: boolean;
  consign_low_stock_threshold: number;
  consign_existing_balance_mode: 'BLOCK_IF_CONSIGNED' | 'DEDUCT_TO_CEILING' | 'WARN_ONLY';
  consign_block_threshold: number;
  max_consign_client_units: number;
  allow_partial_fulfill: boolean;
  auto_apply_horus_discount: boolean;
  block_exceeded_discount: boolean;
  suggestions_window_days: number;
}

const DEFAULT_POLICIES: IntakePolicies = {
  direct_sale_pass_through: true,
  direct_sale_allow_without_stock: false,
  min_stock_buffer: 0,
  block_consign_low_stock: true,
  consign_low_stock_threshold: 5,
  consign_existing_balance_mode: 'DEDUCT_TO_CEILING',
  consign_block_threshold: 1,
  max_consign_client_units: 10,
  allow_partial_fulfill: true,
  auto_apply_horus_discount: true,
  block_exceeded_discount: false,
  suggestions_window_days: 90,
};

export default function OrderIntakeDeskListPage() {
  const router = useRouter();

  // Listagem e Filtros
  const [orders, setOrders] = useState<any[]>([]);
  const [kpis, setKpis] = useState<any>({
    total: 0,
    recebido: 0,
    analisado: 0,
    enviado_horus: 0,
    cancelado: 0,
    total_revenue_approved: 0,
    total_units_requested: 0,
    total_units_approved: 0,
    total_units_cut: 0,
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [page, setPage] = useState(0);
  const [pageSize] = useState(30);
  const [totalElements, setTotalElements] = useState(0);

  // Modal: Novo Pedido na Mesa
  const [showNewOrderModal, setShowNewOrderModal] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | number>('');
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [typeOrder, setTypeOrder] = useState<'V' | 'C'>('V');
  const [customerOrderRef, setCustomerOrderRef] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [intakeChannel, setIntakeChannel] = useState<'EXCEL' | 'EMAIL' | 'MANUAL'>('EXCEL');
  const [rawText, setRawText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [manualEan, setManualEan] = useState('');
  const [manualQty, setManualQty] = useState<number>(1);
  const [manualDiscount, setManualDiscount] = useState<number>(0);
  const [draftItems, setDraftItems] = useState<Array<{ ean: string; quantity: number; discount: number }>>([]);
  const [creatingOrder, setCreatingOrder] = useState(false);

  // Modal: Políticas Comerciais da Mesa
  const [showPoliciesModal, setShowPoliciesModal] = useState(false);
  const [policies, setPolicies] = useState<IntakePolicies>(DEFAULT_POLICIES);
  const [savingPolicies, setSavingPolicies] = useState(false);

  // Modal: Cancelamento
  const [cancelOrderTarget, setCancelOrderTarget] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancellingOrder, setCancellingOrder] = useState(false);

  const formatCnpj = (cnpj: string) => {
    if (!cnpj) return '—';
    const clean = cnpj.replace(/\D/g, '');
    if (clean.length === 14) {
      return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }
    return cnpj;
  };

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const token = getToken();
      const params = new URLSearchParams({
        pagina: String(page),
        tamanho: String(pageSize),
      });
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (typeFilter !== 'ALL') params.append('type_order', typeFilter);
      if (searchTerm.trim()) params.append('search', searchTerm.trim());

      const res = await fetch(`${API}/orders/intake/orders?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Falha ao carregar pedidos da Mesa.');
      const data = await res.json();
      setOrders(data.itens || []);
      setTotalElements(data.total || 0);
      if (data.kpis) setKpis(data.kpis);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao buscar pedidos da Mesa.');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, typeFilter, searchTerm]);

  const fetchPolicies = useCallback(async () => {
    try {
      const token = getToken();
      const res = await fetch(`${API}/orders/intake/policies`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPolicies({ ...DEFAULT_POLICIES, ...data });
      }
    } catch (e) {
      console.error('Erro ao buscar políticas da mesa:', e);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    fetchPolicies();
  }, [fetchPolicies]);

  // ── Funções de Captura / Importação de Itens ──────────────────────────────

  const mergeIntoDraft = (newItems: Array<{ ean: string; quantity: number; discount?: number }>) => {
    setDraftItems((prev) => {
      const map = new Map<string, { quantity: number; discount: number }>();
      for (const item of prev) {
        map.set(item.ean, { quantity: item.quantity, discount: item.discount || 0 });
      }
      for (const item of newItems) {
        const existing = map.get(item.ean);
        map.set(item.ean, {
          quantity: (existing?.quantity || 0) + Number(item.quantity || 1),
          discount: item.discount && item.discount > 0 ? Number(item.discount) : existing?.discount || 0,
        });
      }
      return Array.from(map.entries()).map(([ean, val]) => ({
        ean,
        quantity: val.quantity,
        discount: val.discount,
      }));
    });
  };

  const handleParseText = async () => {
    if (!rawText.trim()) {
      toast.error('Cole o texto do e-mail, WhatsApp ou colunas copiadas do Excel.');
      return;
    }
    setParsing(true);
    try {
      const token = getToken();
      const res = await fetch(`${API}/orders/intake/parse-text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ raw_text: rawText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao processar texto.');
      if (!data.items || data.items.length === 0) {
        toast.warning('Nenhum ISBN válido (10 ou 13 dígitos) foi identificado no texto.');
        return;
      }
      mergeIntoDraft(data.items);
      toast.success(`${data.total_items} ISBN(s) extraído(s) com sucesso!`);
      setRawText('');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setParsing(false);
    }
  };

  const handleParseFile = async (fileToParse?: File) => {
    const targetFile = fileToParse || selectedFile;
    if (!targetFile) {
      toast.error('Selecione uma planilha Excel (.xlsx, .csv) ou PDF.');
      return;
    }
    if (targetFile.size > 10 * 1024 * 1024) {
      toast.error('O arquivo excede o limite máximo permitido de 10 MB.');
      return;
    }
    setParsing(true);
    try {
      const token = getToken();
      const formData = new FormData();
      formData.append('file', targetFile);

      const res = await fetch(`${API}/orders/intake/parse-file`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Falha ao ler arquivo.');
      if (!data.items || data.items.length === 0) {
        toast.warning('Nenhum ISBN válido foi identificado na planilha.');
        return;
      }
      mergeIntoDraft(data.items);
      toast.success(`${data.total_items} item(ns) importado(s) da planilha!`);
      setSelectedFile(null);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setParsing(false);
    }
  };

  const handleAddManualItem = () => {
    const cleanEan = manualEan.trim().replace(/[^0-9X]/gi, '').toUpperCase();
    if (cleanEan.length !== 10 && cleanEan.length !== 13) {
      toast.error('Informe um ISBN válido de 10 ou 13 dígitos.');
      return;
    }
    if (manualQty < 1) {
      toast.error('A quantidade deve ser de pelo menos 1 exemplar.');
      return;
    }
    mergeIntoDraft([{ ean: cleanEan, quantity: manualQty, discount: manualDiscount }]);
    setManualEan('');
    setManualQty(1);
    toast.success(`ISBN ${cleanEan} adicionado à lista!`);
  };

  const handleDownloadExcelTemplate = () => {
    const csvContent = 'ISBN;Quantidade;Desconto\n9786588513408;10;50\n9788535914848;5;45\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.setAttribute('download', 'modelo_mesa_pedidos_isbn_qtd.csv');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // ── Criar Pedido na Mesa ──────────────────────────────────────────────────

  const handleCreateOrder = async (autoAnalyse: boolean) => {
    if (!selectedCustomerId) {
      toast.error('Selecione primeiro o Cliente antes de gravar o pedido na Mesa.');
      return;
    }
    if (draftItems.length === 0) {
      toast.error('Adicione pelo menos 1 item (via Excel, E-mail ou Digitação Manual).');
      return;
    }

    setCreatingOrder(true);
    try {
      const token = getToken();
      const res = await fetch(`${API}/orders/intake/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          customer_id: Number(selectedCustomerId),
          type_order: typeOrder,
          channel: intakeChannel,
          customer_order_ref: customerOrderRef.trim() || null,
          notes: orderNotes.trim() || null,
          auto_analyse: autoAnalyse,
          items: draftItems,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao criar pedido na Mesa.');

      if (data.analysis_warning) {
        toast.warning(`Pedido #${data.order_id} salvo como Recebido (${data.analysis_warning})`);
      } else {
        toast.success(data.message || `Pedido #${data.order_id} criado na Mesa!`);
      }

      setShowNewOrderModal(false);
      setDraftItems([]);
      setCustomerOrderRef('');
      setOrderNotes('');
      router.push(`/orders/intake/${data.order_id}`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreatingOrder(false);
    }
  };

  // ── Excluir / Cancelar Pedido ─────────────────────────────────────────────

  const handleDeleteOrder = async (orderId: number) => {
    if (!confirm(`Deseja excluir definitivamente o Pedido #${orderId} da Mesa de Pedidos?`)) return;
    try {
      const token = getToken();
      const res = await fetch(`${API}/orders/intake/orders/${orderId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Não foi possível excluir o pedido.');
      toast.success(data.message || 'Pedido excluído da Mesa.');
      fetchOrders();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleConfirmCancelOrder = async () => {
    if (!cancelOrderTarget) return;
    setCancellingOrder(true);
    try {
      const token = getToken();
      const res = await fetch(`${API}/orders/intake/orders/${cancelOrderTarget.id}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          reason: cancelReason.trim() || 'Cancelado manualmente na Mesa de Pedidos',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao cancelar pedido.');
      toast.success(data.message || 'Pedido cancelado com sucesso!');
      setCancelOrderTarget(null);
      setCancelReason('');
      fetchOrders();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCancellingOrder(false);
    }
  };

  // ── Salvar Políticas Comerciais ───────────────────────────────────────────

  const handleSavePolicies = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPolicies(true);
    try {
      const token = getToken();
      const res = await fetch(`${API}/orders/intake/policies`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(policies),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao salvar políticas comerciais.');
      setPolicies(data.policies);
      toast.success('Políticas comerciais da Mesa salvas com sucesso!');
      setShowPoliciesModal(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingPolicies(false);
    }
  };

  return (
    <div className="w-full max-w-[1920px] mx-auto p-3 sm:p-5 lg:p-6 space-y-6">
      {/* ── Header Superior ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2.5 text-slate-900 dark:text-white tracking-tight">
            <Layers className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            Mesa de Pedidos B2B
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Canal único de digitação, importação (Excel / E-mail / Manual), análise de políticas comerciais e integração ao ERP Hórus.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <button
            type="button"
            onClick={() => setShowPoliciesModal(true)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold transition shadow-sm cursor-pointer flex-1 sm:flex-initial"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Políticas Comerciais da Mesa</span>
          </button>

          <button
            type="button"
            onClick={() => setShowNewOrderModal(true)}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs sm:text-sm font-bold transition shadow-md cursor-pointer flex-1 sm:flex-initial"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Pedido na Mesa</span>
          </button>
        </div>
      </div>

      {/* ── Cards de Indicadores (KPIs da Mesa) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div
          onClick={() => setStatusFilter('ALL')}
          className={`bg-white dark:bg-slate-900 border rounded-2xl p-4 shadow-sm flex items-center gap-3.5 cursor-pointer transition ${
            statusFilter === 'ALL'
              ? 'border-indigo-500 ring-1 ring-indigo-500'
              : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
          }`}
        >
          <div className="w-11 h-11 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total na Mesa</p>
            <h3 className="text-xl font-black text-slate-900 dark:text-white">{kpis.total}</h3>
            <p className="text-[11px] text-slate-500">Todos os pedidos</p>
          </div>
        </div>

        <div
          onClick={() => setStatusFilter('RECEBIDO')}
          className={`bg-white dark:bg-slate-900 border rounded-2xl p-4 shadow-sm flex items-center gap-3.5 cursor-pointer transition ${
            statusFilter === 'RECEBIDO'
              ? 'border-amber-500 ring-1 ring-amber-500'
              : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
          }`}
        >
          <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Recebidos / Digitação</p>
            <h3 className="text-xl font-black text-slate-900 dark:text-white">{kpis.recebido}</h3>
            <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">Aguardando análise</p>
          </div>
        </div>

        <div
          onClick={() => setStatusFilter('ANALISADO')}
          className={`bg-white dark:bg-slate-900 border rounded-2xl p-4 shadow-sm flex items-center gap-3.5 cursor-pointer transition ${
            statusFilter === 'ANALISADO'
              ? 'border-blue-500 ring-1 ring-blue-500'
              : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
          }`}
        >
          <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
            <SlidersHorizontal className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Em Análise / Validados</p>
            <h3 className="text-xl font-black text-slate-900 dark:text-white">{kpis.analisado}</h3>
            <p className="text-[11px] text-blue-600 dark:text-blue-400 font-medium">Prontos p/ envio Hórus</p>
          </div>
        </div>

        <div
          onClick={() => setStatusFilter('SENT_TO_HORUS')}
          className={`bg-white dark:bg-slate-900 border rounded-2xl p-4 shadow-sm flex items-center gap-3.5 cursor-pointer transition ${
            statusFilter === 'SENT_TO_HORUS'
              ? 'border-emerald-500 ring-1 ring-emerald-500'
              : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
          }`}
        >
          <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Enviados ao Hórus</p>
            <h3 className="text-xl font-black text-slate-900 dark:text-white">{kpis.enviado_horus}</h3>
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">Integrados ao ERP</p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center text-violet-600 dark:text-violet-400 shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Líquido Aprovado</p>
            <h3 className="text-lg font-black text-slate-900 dark:text-white truncate">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(kpis.total_revenue_approved || 0)}
            </h3>
            <p className="text-[10px] text-slate-500">
              Cortados (Histórico): <strong className="text-rose-600 dark:text-rose-400">{kpis.total_units_cut || 0} un</strong>
            </p>
          </div>
        </div>
      </div>

      {/* ── Resumo Rápido da Política Comercial Ativa ── */}
      <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            Política Comercial Ativa:
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-emerald-100/80 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 font-semibold border border-emerald-200 dark:border-emerald-800">
            Venda Direta: {policies.direct_sale_pass_through ? 'Passa Direto' : `Buffer Mín. ${policies.min_stock_buffer} un`}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-amber-100/80 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 font-semibold border border-amber-200 dark:border-amber-800">
            Consignação Estoque Mín.: {policies.block_consign_low_stock ? `${policies.consign_low_stock_threshold} un` : 'Sem trava'}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-indigo-100/80 dark:bg-indigo-950/50 text-indigo-800 dark:text-indigo-300 font-semibold border border-indigo-200 dark:border-indigo-800">
            Saldo Já Consignado no Cliente:{' '}
            {policies.consign_existing_balance_mode === 'BLOCK_IF_CONSIGNED'
              ? `Bloquear se >= ${policies.consign_block_threshold} un`
              : policies.consign_existing_balance_mode === 'DEDUCT_TO_CEILING'
              ? `Abater até Teto de ${policies.max_consign_client_units} un`
              : 'Apenas Alertar'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowPoliciesModal(true)}
          className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer self-start lg:self-auto"
        >
          Configurar Regras Comerciais →
        </button>
      </div>

      {/* ── Tabela e Filtros da Mesa de Pedidos ── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row gap-3 justify-between items-center bg-slate-50/50 dark:bg-slate-800/30">
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por Cliente, CNPJ, Ref, #ID ou Pedido Hórus..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(0);
              }}
              className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(0);
              }}
              className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200"
            >
              <option value="ALL">Status: Todos</option>
              <option value="RECEBIDO">Recebidos (Em Digitação)</option>
              <option value="ANALISADO">Analisados (Em Validação)</option>
              <option value="SENT_TO_HORUS">Enviados ao Hórus</option>
              <option value="CANCELADO">Cancelados</option>
            </select>

            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(0);
              }}
              className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200"
            >
              <option value="ALL">Operação: Todas</option>
              <option value="V">Venda Direta</option>
              <option value="C">Consignação</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50/50 dark:bg-slate-900/50">
                <th className="py-3.5 px-4">Pedido / Origem</th>
                <th className="py-3.5 px-4">Cliente Solicitante</th>
                <th className="py-3.5 px-4">Operação</th>
                <th className="py-3.5 px-4">Status na Mesa</th>
                <th className="py-3.5 px-4">Pedido Hórus</th>
                <th className="py-3.5 px-4">Atendimento (Pedida vs Atendida)</th>
                <th className="py-3.5 px-4 text-right">Total Aprovado</th>
                <th className="py-3.5 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
                    Carregando pedidos da Mesa...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-14 text-center text-slate-400 space-y-3">
                    <Layers className="w-10 h-10 mx-auto opacity-30" />
                    <div className="font-bold text-sm text-slate-600 dark:text-slate-300">
                      Nenhum pedido encontrado na Mesa de Pedidos
                    </div>
                    <p className="text-xs max-w-md mx-auto">
                      Clique em <strong>&quot;Novo Pedido na Mesa&quot;</strong> para selecionar um cliente e importar uma planilha Excel, colar um e-mail ou digitar os itens manualmente.
                    </p>
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr
                    key={order.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/orders/intake/${order.id}`}
                          className="font-mono font-black text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                          #{order.id}
                        </Link>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          {order.channel}
                        </span>
                      </div>
                      {order.customer_order_ref && (
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Ref: <strong>{order.customer_order_ref}</strong>
                        </div>
                      )}
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {order.created_at ? new Date(order.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900 dark:text-white line-clamp-1 max-w-[260px]">
                        {order.customer?.name || 'Cliente'}
                      </div>
                      <div className="font-mono text-[11px] text-slate-500">
                        CNPJ: {formatCnpj(order.customer?.document)}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                          order.type_order === 'C'
                            ? 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                            : 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                        }`}
                      >
                        {order.type_order === 'C' ? 'Consignação' : 'Venda Direta'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      {order.status === 'RECEBIDO' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
                          <Clock className="w-3 h-3" /> Recebido (Em Digitação)
                        </span>
                      )}
                      {order.status === 'ANALISADO' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800">
                          <SlidersHorizontal className="w-3 h-3" /> Analisando / Validado
                        </span>
                      )}
                      {order.status === 'SENT_TO_HORUS' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
                          <CheckCircle2 className="w-3 h-3" /> Integrado ao Hórus
                        </span>
                      )}
                      {order.status === 'CANCELADO' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800">
                          <XCircle className="w-3 h-3" /> Cancelado
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      {order.horus_pedido_venda ? (
                        <span className="font-mono font-black text-xs px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800">
                          #{order.horus_pedido_venda}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">Não enviado</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {order.units_approved} / {order.units_requested} un
                        </span>
                        <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                          ({order.attendance_rate}%)
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2">
                        <span>{order.titles_count} título(s)</span>
                        {order.units_cut > 0 && (
                          <span className="text-rose-600 dark:text-rose-400 font-semibold">
                            • {order.units_cut} un cortadas
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right font-bold text-slate-900 dark:text-white">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.total || 0)}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          href={`/orders/intake/${order.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-bold text-xs transition"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Validar / Mesa</span>
                        </Link>

                        {order.can_delete && (
                          <button
                            type="button"
                            onClick={() => handleDeleteOrder(order.id)}
                            className="p-1.5 rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-transparent hover:border-rose-200 transition cursor-pointer"
                            title="Excluir pedido (ainda não analisado)"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}

                        {order.can_cancel && (
                          <button
                            type="button"
                            onClick={() => {
                              setCancelOrderTarget(order);
                              setCancelReason('');
                            }}
                            className="p-1.5 rounded-xl text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 border border-transparent hover:border-amber-200 transition cursor-pointer"
                            title="Cancelar pedido"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {totalElements > pageSize && (
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
            <span>
              Mostrando {orders.length} de {totalElements} pedidos na Mesa
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={page === 0}
                onClick={() => setPage(0)}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 font-bold text-slate-700 dark:text-slate-300">Página {page + 1}</span>
              <button
                disabled={(page + 1) * pageSize >= totalElements}
                onClick={() => setPage((p) => p + 1)}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 1: NOVO PEDIDO NA MESA (Cliente Obrigatório -> Excel/Email/Man) */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {showNewOrderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header Modal */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/40">
              <div>
                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-indigo-600" />
                  Novo Pedido na Mesa de Análise
                </h3>
                <p className="text-xs text-slate-500">
                  1º Selecione o cliente e o tipo de operação • 2º Importe a planilha Excel, cole o e-mail ou digite os ISBNs.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewOrderModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* PASSO 1: SELEÇÃO DO CLIENTE E TIPO DE OPERAÇÃO */}
              <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                    <Users className="w-4 h-4" />
                    Passo 1: Identificação do Cliente & Operação (Obrigatório)
                  </span>
                  {selectedCustomer && (
                    <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Cliente vinculado
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                  <div className="md:col-span-6">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Cliente Solicitante *
                    </label>
                    <CustomerAutocomplete
                      value={selectedCustomerId}
                      onChange={(id, cust) => {
                        setSelectedCustomerId(id);
                        setSelectedCustomer(cust);
                      }}
                    />
                  </div>

                  <div className="md:col-span-3">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Tipo de Operação *
                    </label>
                    <div className="grid grid-cols-2 gap-1.5 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                      <button
                        type="button"
                        onClick={() => setTypeOrder('V')}
                        className={`py-2 px-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                          typeOrder === 'V'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        Venda Direta
                      </button>
                      <button
                        type="button"
                        onClick={() => setTypeOrder('C')}
                        className={`py-2 px-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                          typeOrder === 'C'
                            ? 'bg-amber-600 text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        Consignação
                      </button>
                    </div>
                  </div>

                  <div className="md:col-span-3">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Ref. Pedido do Cliente
                    </label>
                    <input
                      type="text"
                      value={customerOrderRef}
                      onChange={(e) => setCustomerOrderRef(e.target.value)}
                      placeholder="Ex: OC-9840 / E-mail"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Observações Comerciais do Pedido (Opcional - Enviado ao Hórus)
                  </label>
                  <input
                    type="text"
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    placeholder="Ex: Entregar aos cuidados do setor de compras / Pedido urgente..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  />
                </div>
              </div>

              {/* PASSO 2: ENTRADA DE ITENS (HABILITADO APÓS SELECIONAR CLIENTE) */}
              <div
                className={`space-y-4 transition-opacity ${
                  !selectedCustomerId ? 'opacity-45 pointer-events-none select-none' : 'opacity-100'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                    Passo 2: Origem dos Itens (Padrão ISBN + Quantidade)
                  </span>
                  {!selectedCustomerId && (
                    <span className="text-xs font-bold text-rose-600 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> Selecione o cliente acima para liberar a digitação/importação
                    </span>
                  )}
                </div>

                {/* Abas de Canal */}
                <div className="grid grid-cols-3 gap-2 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl">
                  <button
                    type="button"
                    onClick={() => setIntakeChannel('EXCEL')}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition cursor-pointer ${
                      intakeChannel === 'EXCEL'
                        ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>1. Planilha Excel / CSV</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIntakeChannel('EMAIL')}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition cursor-pointer ${
                      intakeChannel === 'EMAIL'
                        ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    <Mail className="w-4 h-4" />
                    <span>2. E-mail / Copiar & Colar</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIntakeChannel('MANUAL')}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition cursor-pointer ${
                      intakeChannel === 'MANUAL'
                        ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    <Keyboard className="w-4 h-4" />
                    <span>3. Inserção Manual</span>
                  </button>
                </div>

                {/* Conteúdo Aba EXCEL */}
                {intakeChannel === 'EXCEL' && (
                  <div className="bg-slate-50 dark:bg-slate-800/30 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="space-y-1 text-center sm:text-left">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        Importação Automática de Planilha (ISBN + Quantidade)
                      </h4>
                      <p className="text-xs text-slate-500">
                        Aceita arquivos <strong>.XLSX, .XLS, .CSV ou .PDF</strong> (até 10 MB). Identifica automaticamente as colunas de ISBN, Quantidade e Desconto.
                      </p>
                      <button
                        type="button"
                        onClick={handleDownloadExcelTemplate}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline mt-1 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" /> Baixar Planilha Modelo Padrão
                      </button>
                    </div>

                    <label className="relative inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm cursor-pointer shrink-0">
                      {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      <span>{parsing ? 'Lendo planilha...' : 'Selecionar Planilha / PDF'}</span>
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv,.pdf"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) {
                            setSelectedFile(f);
                            handleParseFile(f);
                          }
                          e.target.value = '';
                        }}
                        className="sr-only"
                      />
                    </label>
                  </div>
                )}

                {/* Conteúdo Aba EMAIL / TEXTO COPIADO */}
                {intakeChannel === 'EMAIL' && (
                  <div className="bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Cole abaixo o corpo do E-mail, mensagem de WhatsApp ou linhas copiadas do Excel (ISBN + Quantidade):
                      </span>
                    </div>
                    <textarea
                      rows={4}
                      value={rawText}
                      onChange={(e) => setRawText(e.target.value)}
                      placeholder={'Exemplo:\n9786588513408 10\n9788535914848 - 5 un\nISBN: 9788576572008 Qtd: 8'}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-xs font-mono"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleParseText}
                        disabled={parsing}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition cursor-pointer"
                      >
                        {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        <span>Extrair ISBNs e Quantidades do Texto</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Conteúdo Aba MANUAL */}
                {intakeChannel === 'MANUAL' && (
                  <div className="bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                      <div className="sm:col-span-5">
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          ISBN-13 / Código de Barras
                        </label>
                        <input
                          type="text"
                          value={manualEan}
                          onChange={(e) => setManualEan(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddManualItem())}
                          placeholder="Ex: 9786588513408"
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Quantidade
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={manualQty}
                          onChange={(e) => setManualQty(Math.max(1, parseInt(e.target.value || '1', 10)))}
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddManualItem())}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Desconto Proposto (%)
                        </label>
                        <CurrencyInput
                          value={manualDiscount}
                          onChangeValue={(val) => setManualDiscount(val)}
                          suffixStr="%"
                          max={100}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <button
                          type="button"
                          onClick={handleAddManualItem}
                          className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Plus className="w-4 h-4" /> Adicionar
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Lista Preliminar de Itens Capturados */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-100/70 dark:bg-slate-800/60 flex items-center justify-between text-xs font-bold">
                    <span>
                      Itens na Fila de Digitação ({draftItems.length} títulos •{' '}
                      {draftItems.reduce((acc, i) => acc + i.quantity, 0)} exemplares)
                    </span>
                    {draftItems.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setDraftItems([])}
                        className="text-rose-600 hover:underline text-[11px] cursor-pointer"
                      >
                        Limpar lista
                      </button>
                    )}
                  </div>

                  {draftItems.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400">
                      Nenhum item adicionado ainda. Importe um arquivo Excel, cole um e-mail ou digite o ISBN acima.
                    </div>
                  ) : (
                    <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                      {draftItems.map((it, idx) => (
                        <div key={it.ean} className="px-4 py-2 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-3">
                            <span className="text-slate-400 font-mono w-6">{idx + 1}.</span>
                            <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{it.ean}</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-slate-400 uppercase font-bold">Qtd:</span>
                              <input
                                type="number"
                                min={1}
                                value={it.quantity}
                                onChange={(e) => {
                                  const q = Math.max(1, parseInt(e.target.value || '1', 10));
                                  setDraftItems((prev) =>
                                    prev.map((row) => (row.ean === it.ean ? { ...row, quantity: q } : row))
                                  );
                                }}
                                className="w-16 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-center font-bold text-xs"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => setDraftItems((prev) => prev.filter((row) => row.ean !== it.ean))}
                              className="text-rose-500 hover:text-rose-700 p-1 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer Modal */}
            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setShowNewOrderModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 w-full sm:w-auto cursor-pointer"
              >
                Cancelar
              </button>

              <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  disabled={creatingOrder || !selectedCustomerId || draftItems.length === 0}
                  onClick={() => handleCreateOrder(false)}
                  className="px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-xs font-bold transition disabled:opacity-50 cursor-pointer"
                >
                  Salvar como Recebido (Analisar Depois)
                </button>

                <button
                  type="button"
                  disabled={creatingOrder || !selectedCustomerId || draftItems.length === 0}
                  onClick={() => handleCreateOrder(true)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md transition disabled:opacity-50 cursor-pointer"
                >
                  {creatingOrder ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  <span>Criar & Analisar no Hórus Agora</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 2: POLÍTICAS COMERCIAIS DA MESA DE PEDIDOS                       */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {showPoliciesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <form
            onSubmit={handleSavePolicies}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/40">
              <div>
                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                  Políticas Comerciais da Mesa de Pedidos
                </h3>
                <p className="text-xs text-slate-500">
                  Configure os cenários comerciais que serão aplicados automaticamente na validação dos pedidos deste Seller.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPoliciesModal(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
              {/* Bloco 1: Cenário Venda Direta */}
              <div className="p-4 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 space-y-3">
                <h4 className="font-black text-sm text-emerald-900 dark:text-emerald-300">
                  1. Cenário Comercial: Venda Direta (Firme)
                </h4>
                <label className="flex items-center justify-between gap-4 cursor-pointer">
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-200 block">
                      Venda Direta passa direto (Ignorar travas de consignação e buffer)
                    </span>
                    <span className="text-slate-500">
                      Quando o pedido for Venda Direta, libera todo o estoque disponível no Hórus sem reter estoque mínimo de consignação.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={policies.direct_sale_pass_through}
                    onChange={(e) => setPolicies({ ...policies, direct_sale_pass_through: e.target.checked })}
                    className="w-4 h-4 rounded text-emerald-600"
                  />
                </label>

                <label className="flex items-center justify-between gap-4 cursor-pointer pt-2 border-t border-emerald-200/60 dark:border-emerald-800/40">
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-200 block">
                      Permitir aprovar Venda Direta mesmo sem saldo livre no Hórus
                    </span>
                    <span className="text-slate-500">
                      Se ativado, pedidos de Venda Direta passam 100% para o Hórus mesmo quando o saldo de estoque for zero.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={policies.direct_sale_allow_without_stock}
                    onChange={(e) => setPolicies({ ...policies, direct_sale_allow_without_stock: e.target.checked })}
                    className="w-4 h-4 rounded text-emerald-600"
                  />
                </label>
              </div>

              {/* Bloco 2: Cenário Consignação & Saldo Já Consignado no Cliente */}
              <div className="p-4 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60 space-y-4">
                <h4 className="font-black text-sm text-amber-900 dark:text-amber-300">
                  2. Cenário Comercial: Consignação & Proteção de Acervo
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-slate-800 cursor-pointer">
                    <div>
                      <span className="font-bold text-slate-800 dark:text-slate-200 block">
                        Travar Consignação em Estoque Baixo
                      </span>
                      <span className="text-[11px] text-slate-400">Preserva últimos exemplares p/ Venda</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={policies.block_consign_low_stock}
                      onChange={(e) => setPolicies({ ...policies, block_consign_low_stock: e.target.checked })}
                      className="w-4 h-4 rounded text-amber-600"
                    />
                  </label>

                  <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-slate-800">
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Estoque Mínimo p/ Permitir Consignar (un)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={policies.consign_low_stock_threshold}
                      onChange={(e) =>
                        setPolicies({ ...policies, consign_low_stock_threshold: Math.max(0, parseInt(e.target.value || '0', 10)) })
                      }
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                    />
                  </div>
                </div>

                {/* Regra de Livro que o Cliente JÁ TEM Consignado */}
                <div className="space-y-2 pt-2 border-t border-amber-200/60 dark:border-amber-800/40">
                  <label className="font-bold text-slate-800 dark:text-slate-200 block">
                    Regra quando o Cliente JÁ POSSUI o livro consignado na loja (Campo REMESSA Hórus):
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                    <label
                      className={`p-3 rounded-xl border cursor-pointer transition ${
                        policies.consign_existing_balance_mode === 'DEDUCT_TO_CEILING'
                          ? 'bg-white dark:bg-slate-900 border-indigo-500 ring-1 ring-indigo-500'
                          : 'bg-white/60 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-slate-900 dark:text-white">Abater até o Teto</span>
                        <input
                          type="radio"
                          name="consign_mode"
                          checked={policies.consign_existing_balance_mode === 'DEDUCT_TO_CEILING'}
                          onChange={() => setPolicies({ ...policies, consign_existing_balance_mode: 'DEDUCT_TO_CEILING' })}
                        />
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Desconta o que já está consignado no cliente até o limite máximo por título.
                      </p>
                    </label>

                    <label
                      className={`p-3 rounded-xl border cursor-pointer transition ${
                        policies.consign_existing_balance_mode === 'BLOCK_IF_CONSIGNED'
                          ? 'bg-white dark:bg-slate-900 border-indigo-500 ring-1 ring-indigo-500'
                          : 'bg-white/60 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-slate-900 dark:text-white">Bloquear se Já Tiver</span>
                        <input
                          type="radio"
                          name="consign_mode"
                          checked={policies.consign_existing_balance_mode === 'BLOCK_IF_CONSIGNED'}
                          onChange={() => setPolicies({ ...policies, consign_existing_balance_mode: 'BLOCK_IF_CONSIGNED' })}
                        />
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Não consigna novamente livros que o cliente já possui em saldo consignado.
                      </p>
                    </label>

                    <label
                      className={`p-3 rounded-xl border cursor-pointer transition ${
                        policies.consign_existing_balance_mode === 'WARN_ONLY'
                          ? 'bg-white dark:bg-slate-900 border-indigo-500 ring-1 ring-indigo-500'
                          : 'bg-white/60 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-slate-900 dark:text-white">Apenas Alertar</span>
                        <input
                          type="radio"
                          name="consign_mode"
                          checked={policies.consign_existing_balance_mode === 'WARN_ONLY'}
                          onChange={() => setPolicies({ ...policies, consign_existing_balance_mode: 'WARN_ONLY' })}
                        />
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Aprova normalmente, mas exibe alerta visual do saldo já consignado.
                      </p>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        Teto Máximo de Exemplares Consignados por Título no Cliente
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={policies.max_consign_client_units}
                        onChange={(e) =>
                          setPolicies({ ...policies, max_consign_client_units: Math.max(1, parseInt(e.target.value || '10', 10)) })
                        }
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                      />
                    </div>

                    <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        Bloquear Consignação a partir de X un já consignadas
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={policies.consign_block_threshold}
                        onChange={(e) =>
                          setPolicies({ ...policies, consign_block_threshold: Math.max(1, parseInt(e.target.value || '1', 10)) })
                        }
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Bloco 3: Descontos, Buffer e Sugestões */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-4">
                <h4 className="font-black text-sm text-slate-900 dark:text-white">
                  3. Descontos, Atendimento Parcial & Sugestões Comerciais
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Buffer Geral de Estoque (un)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={policies.min_stock_buffer}
                      onChange={(e) =>
                        setPolicies({ ...policies, min_stock_buffer: Math.max(0, parseInt(e.target.value || '0', 10)) })
                      }
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Janela de Giro p/ Reposição (dias)
                    </label>
                    <input
                      type="number"
                      min={15}
                      max={365}
                      value={policies.suggestions_window_days}
                      onChange={(e) =>
                        setPolicies({ ...policies, suggestions_window_days: Math.max(15, parseInt(e.target.value || '90', 10)) })
                      }
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-bold"
                    />
                  </div>

                  <label className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer">
                    <span className="font-bold text-slate-800 dark:text-slate-200">Permitir Atendimento Parcial</span>
                    <input
                      type="checkbox"
                      checked={policies.allow_partial_fulfill}
                      onChange={(e) => setPolicies({ ...policies, allow_partial_fulfill: e.target.checked })}
                      className="w-4 h-4 rounded text-indigo-600"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <label className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer">
                    <div>
                      <span className="font-bold text-slate-800 dark:text-slate-200 block">
                        Aplicar Desconto Autorizado do Hórus Automaticamente
                      </span>
                      <span className="text-[11px] text-slate-400">Quando o pedido vier sem desconto informado</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={policies.auto_apply_horus_discount}
                      onChange={(e) => setPolicies({ ...policies, auto_apply_horus_discount: e.target.checked })}
                      className="w-4 h-4 rounded text-indigo-600"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer">
                    <div>
                      <span className="font-bold text-slate-800 dark:text-slate-200 block">
                        Bloquear Item se Desconto Exceder Alçada Hórus
                      </span>
                      <span className="text-[11px] text-slate-400">Rejeita automaticamente divergência de desconto</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={policies.block_exceeded_discount}
                      onChange={(e) => setPolicies({ ...policies, block_exceeded_discount: e.target.checked })}
                      className="w-4 h-4 rounded text-indigo-600"
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowPoliciesModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300"
              >
                Fechar
              </button>
              <button
                type="submit"
                disabled={savingPolicies}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md cursor-pointer"
              >
                {savingPolicies ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                <span>Salvar Políticas Comerciais</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 3: CONFIRMAÇÃO DE CANCELAMENTO                                  */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {cancelOrderTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <XCircle className="w-5 h-5 text-rose-600" />
                Cancelar Pedido #{cancelOrderTarget.id}
              </h3>
              <button onClick={() => setCancelOrderTarget(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500">
              O pedido já iniciou análise comercial{cancelOrderTarget.horus_pedido_venda ? ` e possui vínculo com o Hórus (#${cancelOrderTarget.horus_pedido_venda})` : ''}. Ele será marcado como <strong>Cancelado</strong> preservando o histórico do que o cliente solicitou.
            </p>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Motivo do Cancelamento
              </label>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Ex: Solicitação do cliente / Duplicidade..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCancelOrderTarget(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={cancellingOrder}
                onClick={handleConfirmCancelOrder}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
              >
                {cancellingOrder ? 'Cancelando...' : 'Confirmar Cancelamento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}