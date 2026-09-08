'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShoppingBag,
  Search,
  RefreshCw,
  Loader2,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Receipt,
  Layers,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
  Truck,
  Building2,
  Copy,
  Tag
} from 'lucide-react';
import { toast } from 'sonner';
import { getToken, getUser } from '@/lib/auth';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface OrderItem {
  cod_item: string | number;
  nom_item?: string;
  qtd_item: number;
  vlr_unitario: number;
  vlr_total_item: number;
  seq_item?: number;
}

interface InvoiceItem {
  cod_item: string | number;
  nom_item?: string;
  qtd_item: number;
  vlr_unitario: number;
  vlr_total_item: number;
}

interface InvoiceData {
  nro_nota_fiscal: string;
  serie_nota_fiscal?: string;
  chave_nfe?: string;
  dat_emissao?: string;
  vlr_total_nota?: number;
  vlr_produtos?: number;
  vlr_frete?: number;
  sta_nota_fiscal?: string;
  itens?: InvoiceItem[];
}

interface OrderHeader {
  cod_ped_venda: number;
  cod_filial: string;
  cod_empresa?: string;
  pedido_web: string;
  cod_cli: number | string;
  nom_cli?: string;
  cod_metodo?: string;
  desc_metodo?: string;
  cod_param_fiscal?: number | string;
  natureza_operacao?: string;
  sta_pedido_venda: string;
  data_criacao?: string;
  data_expedicao?: string;
  data_lft?: string;
  dias_expedicao?: number;
  is_alerta_expedicao?: boolean;
  vlr_total_pedido: number;
  vlr_total_liquido?: number;
  vlr_total_desconto?: number;
  qtd_itens: number;
  qtd_itens_total?: number;
  nro_nota_fiscal?: string;
  serie_nota_fiscal?: string;
  data_emissao_nf?: string;
  chave_nfe?: string;
  obs_pedido?: string;
}

interface SummaryData {
  abertos_count: number;
  faturados_count: number;
  cancelados_count: number;
  alertas_expedicao_count: number;
  abertos_valor_bruto: number;
  abertos_valor_liquido: number;
  abertos_valor: number;
  total_count: number;
  filial_consultada: string;
  dias_alerta_expedicao: number;
}

interface SalesMethodItem {
  cod_metodo: string;
  desc_metodo: string;
}

export default function HorusOrdersPage() {
  const currentUser = getUser();
  const companyId = currentUser?.company_id || 1;

  // Estados de dados
  const [orders, setOrders] = useState<OrderHeader[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [methodsList, setMethodsList] = useState<SalesMethodItem[]>([]);

  // Estados de paginação
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Estados de filtros
  const [selectedFilial, setSelectedFilial] = useState('1');
  const [diasAlertaExpedicao, setDiasAlertaExpedicao] = useState<number>(3);
  const [statusTab, setStatusTab] = useState<'DEFAULT' | 'FAT' | 'CAN' | 'TODOS'>('DEFAULT');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedMetodo, setSelectedMetodo] = useState('TODOS');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');

  // Drawer de Detalhes do Pedido
  const [selectedOrder, setSelectedOrder] = useState<OrderHeader | null>(null);
  const [orderDetails, setOrderDetails] = useState<{
    order: OrderHeader;
    items: OrderItem[];
    invoice: InvoiceData | null;
    has_invoice: boolean;
  } | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Debounce na busca de texto (300ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Carrega configuração de filial padrão e métodos de venda
  useEffect(() => {
    let isMounted = true;
    async function loadInitialConfig() {
      try {
        const token = getToken();
        if (!token) return;
        const resSettings = await fetch(`${API}/companies/${companyId}/horus-sql/settings`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (resSettings.ok && isMounted) {
          const data = await resSettings.json();
          if (data.horus_sql_cod_filial) {
            setSelectedFilial(String(data.horus_sql_cod_filial).trim());
          }
          if (data.horus_vendas_metodo) {
            setSelectedMetodo(String(data.horus_vendas_metodo).trim());
          }
        }
      } catch (e) {
        console.error('[HorusOrders] Erro ao carregar settings:', e);
      }
    }
    loadInitialConfig();
    return () => { isMounted = false; };
  }, [companyId]);

  // Carrega métodos de venda disponíveis
  const fetchMethods = useCallback(async () => {
    try {
      const token = getToken();
      if (!token) return;
      const res = await fetch(`${API}/companies/${companyId}/horus-sql/sales-methods?filial=${selectedFilial.trim() || '1'}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const rawMethods = data.methods || [];
        const formatted: SalesMethodItem[] = rawMethods.map((m: any) => {
          if (typeof m === 'string') {
            return { cod_metodo: m, desc_metodo: m };
          }
          return { cod_metodo: String(m.cod_metodo || ''), desc_metodo: String(m.desc_metodo || m.cod_metodo || '') };
        });
        setMethodsList(formatted);
      }
    } catch (e) {
      console.error('[HorusOrders] Erro ao carregar métodos:', e);
    }
  }, [companyId, selectedFilial]);

  useEffect(() => {
    fetchMethods();
  }, [fetchMethods]);

  // Busca lista de pedidos de alta performance
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const token = getToken();
      if (!token) {
        setLoading(false);
        return;
      }
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
        filial: selectedFilial.trim() || '1',
        dias_alerta_expedicao: String(diasAlertaExpedicao || 3),
      });

      if (statusTab !== 'DEFAULT') {
        params.append('status', statusTab);
      }
      if (selectedMetodo && selectedMetodo !== 'TODOS') {
        params.append('cod_metodo', selectedMetodo);
      }
      if (debouncedSearch.trim()) {
        params.append('search', debouncedSearch.trim());
      }
      if (dataInicio) {
        params.append('data_inicio', dataInicio);
      }
      if (dataFim) {
        params.append('data_fim', dataFim);
      }

      const res = await fetch(`${API}/companies/${companyId}/horus-sql/orders?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Erro ao carregar pedidos.');
      }

      const data = await res.json();
      setOrders(data.items || []);
      setTotalRecords(data.total || 0);
      setTotalPages(data.total_pages || 1);
      setSummary(data.summary || null);
    } catch (e: any) {
      console.error('[HorusOrders] Erro:', e);
      toast.error(e.message || 'Erro ao carregar pedidos do Horus.');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [companyId, page, pageSize, selectedFilial, diasAlertaExpedicao, statusTab, selectedMetodo, debouncedSearch, dataInicio, dataFim]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Carrega detalhes do pedido para o Drawer
  const handleOpenDetails = async (order: OrderHeader) => {
    setSelectedOrder(order);
    setLoadingDetails(true);
    setOrderDetails(null);
    try {
      const token = getToken();
      const res = await fetch(`${API}/companies/${companyId}/horus-sql/orders/${order.cod_ped_venda}?filial=${selectedFilial}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Erro ao carregar detalhes do pedido.');
      }
      const data = await res.json();
      setOrderDetails(data);
    } catch (e: any) {
      toast.error(e.message || 'Falha ao buscar itens do pedido.');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleCopyChaveNfe = (chave?: string) => {
    if (!chave) return;
    navigator.clipboard.writeText(chave);
    toast.success('Chave NFe copiada para a área de transferência!');
  };

  const formatBRL = (val?: number) => {
    if (val === undefined || val === null) return 'R$ 0,00';
    return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  const getStatusBadge = (status?: string, nroNf?: string) => {
    const s = (status || '').toUpperCase().trim();
    if (s === 'FAT') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
          <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
          Faturado {nroNf ? `(NF ${nroNf})` : ''}
        </span>
      );
    }
    if (s === 'CAN' || s === 'CA') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
          <XCircle className="h-3.5 w-3.5 text-rose-600" />
          Cancelado
        </span>
      );
    }
    if (s === 'LFT') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800" title="Passou pela logística, pendente faturamento">
          <Receipt className="h-3.5 w-3.5 text-indigo-600" />
          Lib. Faturamento (LFT)
        </span>
      );
    }
    if (s === 'LEX' || s === 'EXP' || s === 'EXPEDICAO') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-300 border border-purple-300 dark:border-purple-800">
          <Truck className="h-3.5 w-3.5 text-purple-600" />
          Em Expedição (LEX)
        </span>
      );
    }
    if (s === 'IMP') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300 border border-sky-300 dark:border-sky-800">
          <Clock className="h-3.5 w-3.5 text-sky-600" />
          Impresso (IMP)
        </span>
      );
    }
    if (s === 'CON') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-teal-100 text-teal-800 dark:bg-teal-950/50 dark:text-teal-300 border border-teal-300 dark:border-teal-800">
          <Clock className="h-3.5 w-3.5 text-teal-600" />
          Conferência (CON)
        </span>
      );
    }
    if (s === 'NOV') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
          <Clock className="h-3.5 w-3.5 text-slate-500" />
          Novo (NOV)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
        <Clock className="h-3.5 w-3.5 text-amber-600" />
        {status || 'Em Aberto'}
      </span>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* ─── CABEÇALHO ────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-violet-600/10 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400 rounded-xl">
            <ShoppingBag className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
              Pedidos (Horus Direct)
              <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300 border border-violet-200 dark:border-violet-800">
                SQL Direto
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Acompanhamento de pedidos, expedição, LFT, métodos de venda, natureza fiscal e valores brutos/líquidos
            </p>
          </div>
        </div>

        {/* Controles de Topo: Filial + Alerta de Expedição + Atualizar */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Filial */}
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
            <span className="text-xs font-bold text-slate-500">Filial:</span>
            <input
              type="text"
              value={selectedFilial}
              onChange={(e) => setSelectedFilial(e.target.value)}
              placeholder="1"
              className="w-10 bg-transparent text-xs font-black text-slate-900 dark:text-white focus:outline-none"
            />
          </div>

          {/* Configuração de Dias para Alerta de Expedição */}
          <div className="flex items-center gap-1.5 bg-amber-50/80 dark:bg-amber-950/30 px-3 py-2 rounded-xl border border-amber-200 dark:border-amber-800/50" title="Destacar pedidos com mais de X dias desde a liberação para expedição">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="text-xs font-bold text-amber-900 dark:text-amber-300">Alerta Exp:</span>
            <input
              type="number"
              min="1"
              max="90"
              value={diasAlertaExpedicao}
              onChange={(e) => setDiasAlertaExpedicao(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-10 bg-transparent text-xs font-black text-amber-900 dark:text-amber-200 focus:outline-none text-center"
            />
            <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">dias</span>
          </div>

          <button
            type="button"
            onClick={() => { setPage(1); fetchOrders(); fetchMethods(); }}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* ─── CARDS ESTATÍSTICOS SUPERIORES ────────────────────────── */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl border border-amber-200 bg-amber-50/50 dark:border-amber-800/40 dark:bg-amber-950/20 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Em Aberto / Expedição</p>
              <Clock className="h-4 w-4 text-amber-600" />
            </div>
            <p className="text-2xl font-black text-amber-800 dark:text-amber-200 mt-2">{summary.abertos_count}</p>
            <div className="flex items-center justify-between mt-1 text-[11px] text-amber-700 dark:text-amber-300 font-semibold">
              <span>Líquido: {formatBRL(summary.abertos_valor_liquido || summary.abertos_valor)}</span>
              {summary.abertos_valor_bruto > (summary.abertos_valor_liquido || 0) && (
                <span className="text-amber-600/70 font-normal">Bruto: {formatBRL(summary.abertos_valor_bruto)}</span>
              )}
            </div>
          </div>

          <div className="p-5 rounded-2xl border border-rose-300 bg-rose-50/60 dark:border-rose-800/50 dark:bg-rose-950/25 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider">Atraso Expedição (≥ {summary.dias_alerta_expedicao}d)</p>
              <AlertTriangle className="h-4 w-4 text-rose-600" />
            </div>
            <p className="text-2xl font-black text-rose-800 dark:text-rose-200 mt-2">{summary.alertas_expedicao_count}</p>
            <p className="text-xs text-rose-600 dark:text-rose-400 mt-1 font-medium">Requerem atenção operacional imediata</p>
          </div>

          <div className="p-5 rounded-2xl border border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/40 dark:bg-emerald-950/20 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Faturados</p>
              <CheckCircle className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="text-2xl font-black text-emerald-800 dark:text-emerald-200 mt-2">{summary.faturados_count}</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 font-medium">Pedidos com NF_MESTRE gerada</p>
          </div>

          <div className="p-5 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total na Filial {summary.filial_consultada}</p>
              <Building2 className="h-4 w-4 text-slate-400" />
            </div>
            <p className="text-2xl font-black text-slate-900 dark:text-white mt-2">{summary.total_count}</p>
            <p className="text-xs text-slate-400 mt-1">Cancelados: {summary.cancelados_count}</p>
          </div>
        </div>
      )}

      {/* ─── BARRA DE FILTROS E ABAS ──────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
          {/* Abas Rápidas de Status */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full lg:w-auto pb-2 lg:pb-0">
            <button
              type="button"
              onClick={() => { setStatusTab('DEFAULT'); setPage(1); }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors shrink-0 flex items-center gap-1.5 ${
                statusTab === 'DEFAULT'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Clock className="h-3.5 w-3.5" />
              Em Aberto / Expedição
            </button>

            <button
              type="button"
              onClick={() => { setStatusTab('FAT'); setPage(1); }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors shrink-0 flex items-center gap-1.5 ${
                statusTab === 'FAT'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <CheckCircle className="h-3.5 w-3.5" />
              Faturados (FAT)
            </button>

            <button
              type="button"
              onClick={() => { setStatusTab('CAN'); setPage(1); }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors shrink-0 flex items-center gap-1.5 ${
                statusTab === 'CAN'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <XCircle className="h-3.5 w-3.5" />
              Cancelados (CAN)
            </button>

            <button
              type="button"
              onClick={() => { setStatusTab('TODOS'); setPage(1); }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors shrink-0 flex items-center gap-1.5 ${
                statusTab === 'TODOS'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Todos os Status
            </button>
          </div>

          {/* Busca Instantânea */}
          <div className="relative w-full lg:w-80">
            <Search className="h-3.5 w-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              placeholder="Buscar Pedido #, Cliente, NF, Natureza..."
              className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
        </div>

        {/* Linha 2 de Filtros: Método de Venda + Período de Data */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
          {/* Método de Venda */}
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-500 shrink-0">Método:</span>
            <select
              value={selectedMetodo}
              onChange={(e) => { setSelectedMetodo(e.target.value); setPage(1); }}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 font-semibold"
            >
              <option value="TODOS">Todos os Métodos</option>
              {methodsList.map((m) => (
                <option key={m.cod_metodo} value={m.cod_metodo}>
                  {m.desc_metodo ? `${m.desc_metodo} (Cód ${m.cod_metodo})` : `Método ${m.cod_metodo}`}
                </option>
              ))}
            </select>
          </div>

          {/* Data Início */}
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-500 shrink-0">De:</span>
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => { setDataInicio(e.target.value); setPage(1); }}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          {/* Data Fim */}
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-500 shrink-0">Até:</span>
            <input
              type="date"
              value={dataFim}
              onChange={(e) => { setDataFim(e.target.value); setPage(1); }}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
        </div>
      </div>

      {/* ─── TABELA DE PEDIDOS ────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold sticky top-0">
              <tr>
                <th className="p-3.5">Pedido Web</th>
                <th className="p-3.5">Pedido Horus</th>
                <th className="p-3.5">Filial</th>
                <th className="p-3.5">Cliente / Sacado</th>
                <th className="p-3.5">Método</th>
                <th className="p-3.5">Natureza Fiscal</th>
                <th className="p-3.5">Data Criação</th>
                <th className="p-3.5">Lib. Expedição</th>
                <th className="p-3.5">Lib. LFT</th>
                <th className="p-3.5 text-right">Valores (Líq / Bruto)</th>
                <th className="p-3.5 text-center">Qtd Itens</th>
                <th className="p-3.5 text-center">Status no ERP</th>
                <th className="p-3.5 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={13} className="p-12 text-center text-slate-400">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-violet-500" />
                    Consultando pedidos no Horus ERP...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={13} className="p-12 text-center text-slate-400">
                    Nenhum pedido localizado com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                orders.map((o) => {
                  const isAtrasado = Boolean(o.is_alerta_expedicao);
                  const rowBgClass = isAtrasado
                    ? 'bg-amber-50/75 dark:bg-amber-950/25 border-l-4 border-l-amber-500 hover:bg-amber-100/60 dark:hover:bg-amber-900/30'
                    : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40';

                  const valorLiquido = o.vlr_total_liquido !== undefined && o.vlr_total_liquido !== null
                    ? o.vlr_total_liquido
                    : o.vlr_total_pedido;
                  const valorBruto = o.vlr_total_pedido;
                  const hasDesconto = valorBruto > valorLiquido;

                  return (
                    <tr
                      key={`${o.cod_filial}-${o.cod_ped_venda}`}
                      className={`transition-colors ${rowBgClass}`}
                    >
                      {/* Pedido Web */}
                      <td className="p-3.5 font-mono font-bold text-slate-900 dark:text-white">
                        #{o.pedido_web}
                      </td>

                      {/* Pedido Horus */}
                      <td className="p-3.5 font-mono font-bold text-violet-700 dark:text-violet-300">
                        <span className="bg-violet-50 dark:bg-violet-950/50 px-2 py-0.5 rounded border border-violet-200 dark:border-violet-800">
                          #{o.cod_ped_venda}
                        </span>
                      </td>

                      {/* Filial */}
                      <td className="p-3.5">
                        <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                          Filial {o.cod_filial}
                        </span>
                      </td>

                      {/* Cliente */}
                      <td className="p-3.5 max-w-[180px] truncate">
                        <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">{o.nom_cli || 'Cliente Balcão'}</p>
                        {o.cod_cli && (
                          <p className="text-[10px] text-slate-400 font-mono">Cód: {o.cod_cli}</p>
                        )}
                      </td>

                      {/* Método de Venda */}
                      <td className="p-3.5">
                        <span className="font-semibold text-slate-700 dark:text-slate-300" title={`Código Método: ${o.cod_metodo || ''}`}>
                          {o.desc_metodo || o.cod_metodo || '—'}
                        </span>
                      </td>

                      {/* Natureza Operação (Parâmetro Fiscal) */}
                      <td className="p-3.5">
                        {o.natureza_operacao ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            <Tag className="h-3 w-3 text-slate-400" />
                            {o.natureza_operacao}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Data Criação */}
                      <td className="p-3.5 text-slate-600 dark:text-slate-400">
                        {formatDate(o.data_criacao)}
                      </td>

                      {/* Liberação Expedição (com Badge de Alerta se Atrasado) */}
                      <td className="p-3.5">
                        <p className="text-slate-700 dark:text-slate-300 font-medium">
                          {formatDate(o.data_expedicao)}
                        </p>
                        {isAtrasado && o.dias_expedicao !== undefined && (
                          <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-black px-2 py-0.5 rounded-md bg-amber-200 text-amber-950 dark:bg-amber-900/70 dark:text-amber-200 border border-amber-300 dark:border-amber-700 animate-pulse">
                            <AlertTriangle className="h-3 w-3 text-amber-700 dark:text-amber-400" />
                            {o.dias_expedicao} dias em exp.
                          </span>
                        )}
                      </td>

                      {/* Liberação LFT */}
                      <td className="p-3.5 text-slate-600 dark:text-slate-400">
                        {formatDate(o.data_lft)}
                      </td>

                      {/* Valores Líquido e Bruto */}
                      <td className="p-3.5 text-right font-mono">
                        <p className="font-black text-slate-900 dark:text-white">
                          {formatBRL(valorLiquido)}
                        </p>
                        {hasDesconto && (
                          <p className="text-[10px] text-slate-400 line-through">
                            Bruto: {formatBRL(valorBruto)}
                          </p>
                        )}
                      </td>

                      {/* Qtd Itens */}
                      <td className="p-3.5 text-center font-semibold text-slate-700 dark:text-slate-300">
                        {o.qtd_itens || o.qtd_itens_total || 1}
                      </td>

                      {/* Status no ERP */}
                      <td className="p-3.5 text-center">
                        {getStatusBadge(o.sta_pedido_venda, o.nro_nota_fiscal)}
                      </td>

                      {/* Ações */}
                      <td className="p-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleOpenDetails(o)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-violet-700 bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-900/60 transition-colors"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Detalhes
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ─── PAGINAÇÃO ────────────────────────────────────────── */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <span className="text-slate-500">
            Mostrando <strong>{orders.length}</strong> de <strong>{totalRecords}</strong> pedidos (Página {page} de {totalPages})
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-50 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-bold px-2 text-slate-700 dark:text-slate-300">{page} / {totalPages}</span>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-50 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ─── DRAWER DE DETALHES DO PEDIDO (ITENS + NF) ─────────────── */}
      <AnimatePresence>
        {selectedOrder && (
          <div className="fixed inset-0 z-50 overflow-hidden">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedOrder(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />

            {/* Drawer Panel */}
            <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="w-screen max-w-2xl bg-white dark:bg-slate-900 shadow-2xl flex flex-col border-l border-slate-200 dark:border-slate-800"
              >
                {/* Header do Drawer */}
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h2 className="text-lg font-black text-slate-900 dark:text-white">
                        Pedido Web #{selectedOrder.pedido_web}
                      </h2>
                      <span className="font-mono text-xs font-bold text-violet-700 bg-violet-100 dark:bg-violet-950/60 dark:text-violet-300 px-2 py-0.5 rounded border border-violet-200 dark:border-violet-800">
                        Horus #{selectedOrder.cod_ped_venda}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Filial {selectedOrder.cod_filial} • Método: {selectedOrder.desc_metodo || selectedOrder.cod_metodo || 'Padrão'}
                      {selectedOrder.natureza_operacao ? ` • ${selectedOrder.natureza_operacao}` : ''}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedOrder(null)}
                    className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Conteúdo do Drawer */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {loadingDetails ? (
                    <div className="p-12 text-center text-slate-400">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-violet-500" />
                      Carregando itens e dados de faturamento...
                    </div>
                  ) : orderDetails ? (
                    <>
                      {/* Alerta de Expedição no Topo do Drawer se Atrasado */}
                      {selectedOrder.is_alerta_expedicao && (
                        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 dark:bg-amber-950/30 dark:border-amber-800 flex items-center gap-3">
                          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
                          <div>
                            <p className="text-xs font-black text-amber-900 dark:text-amber-200">
                              Atenção Operacional: {selectedOrder.dias_expedicao} dias em Expedição!
                            </p>
                            <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-0.5">
                              Este pedido foi liberado para expedição em {formatDate(selectedOrder.data_expedicao)} e ultrapassou o limite de alerta ({diasAlertaExpedicao} dias).
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Grid de Informações Básicas */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 text-xs">
                        <div>
                          <p className="text-slate-400 font-medium">Cliente</p>
                          <p className="font-bold text-slate-900 dark:text-white truncate">{orderDetails.order.nom_cli || 'Balcão'}</p>
                          {orderDetails.order.cod_cli && (
                            <p className="text-[10px] text-slate-400 font-mono">Cód: {orderDetails.order.cod_cli}</p>
                          )}
                        </div>
                        <div>
                          <p className="text-slate-400 font-medium">Status ERP</p>
                          <div className="mt-1">{getStatusBadge(orderDetails.order.sta_pedido_venda, orderDetails.invoice?.nro_nota_fiscal)}</div>
                        </div>
                        <div>
                          <p className="text-slate-400 font-medium">Valor Líquido</p>
                          <p className="font-black text-slate-900 dark:text-white mt-0.5">
                            {formatBRL(orderDetails.order.vlr_total_liquido !== undefined ? orderDetails.order.vlr_total_liquido : orderDetails.order.vlr_total_pedido)}
                          </p>
                          {orderDetails.order.vlr_total_pedido > (orderDetails.order.vlr_total_liquido || 0) && (
                            <p className="text-[10px] text-slate-400 line-through">
                              Bruto: {formatBRL(orderDetails.order.vlr_total_pedido)}
                            </p>
                          )}
                        </div>
                        <div>
                          <p className="text-slate-400 font-medium">Qtd Itens</p>
                          <p className="font-bold text-slate-900 dark:text-white mt-0.5">{orderDetails.order.qtd_itens || orderDetails.items.length}</p>
                        </div>
                      </div>

                      {/* Natureza e Método */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                          <p className="text-[11px] text-slate-400 font-semibold">Método de Venda</p>
                          <p className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                            {orderDetails.order.desc_metodo || orderDetails.order.cod_metodo || '—'}
                          </p>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                          <p className="text-[11px] text-slate-400 font-semibold">Natureza da Operação (Parâmetro Fiscal)</p>
                          <p className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                            {orderDetails.order.natureza_operacao || '—'}
                          </p>
                        </div>
                      </div>

                      {/* Linha do Tempo das Datas Operacionais */}
                      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-violet-500" />
                          Datas Operacionais
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                            <p className="text-[11px] text-slate-400 font-semibold">1. Criação do Pedido</p>
                            <p className="font-bold text-slate-800 dark:text-slate-200 mt-1">{formatDate(orderDetails.order.data_criacao)}</p>
                          </div>
                          <div className="p-3 rounded-xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-800/40">
                            <p className="text-[11px] text-purple-600 dark:text-purple-400 font-semibold">2. Liberação Expedição</p>
                            <p className="font-bold text-purple-900 dark:text-purple-200 mt-1">{formatDate(orderDetails.order.data_expedicao)}</p>
                          </div>
                          <div className="p-3 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-800/40">
                            <p className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold">3. Liberação LFT</p>
                            <p className="font-bold text-blue-900 dark:text-blue-200 mt-1">{formatDate(orderDetails.order.data_lft)}</p>
                          </div>
                        </div>
                      </div>

                      {/* ─── NOTA FISCAL (QUANDO FATURADO) ───────────────────── */}
                      {orderDetails.invoice ? (
                        <div className="rounded-2xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20 p-5 space-y-4">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-2">
                              <Receipt className="h-4 w-4 text-emerald-600" />
                              Nota Fiscal Emitida (NF_MESTRE)
                            </p>
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-200">
                              NF {orderDetails.invoice.nro_nota_fiscal} {orderDetails.invoice.serie_nota_fiscal ? `(Série ${orderDetails.invoice.serie_nota_fiscal})` : ''}
                            </span>
                          </div>

                          {/* Chave de Acesso NFe com Botão de Copiar */}
                          {orderDetails.invoice.chave_nfe && (
                            <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between gap-3">
                              <div className="truncate">
                                <p className="text-[10px] uppercase font-bold text-slate-400">Chave de Acesso NFe (44 dígitos)</p>
                                <p className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 truncate select-all">
                                  {orderDetails.invoice.chave_nfe}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleCopyChaveNfe(orderDetails.invoice?.chave_nfe)}
                                className="p-2 rounded-lg bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/60 dark:hover:bg-emerald-800 text-emerald-800 dark:text-emerald-200 transition-colors shrink-0"
                                title="Copiar Chave NFe"
                              >
                                <Copy className="h-4 w-4" />
                              </button>
                            </div>
                          )}

                          {/* Valores e Emissão da NF */}
                          <div className="grid grid-cols-3 gap-3 text-xs">
                            <div>
                              <p className="text-slate-500 font-medium">Data Emissão</p>
                              <p className="font-bold text-slate-900 dark:text-white mt-0.5">{formatDate(orderDetails.invoice.dat_emissao)}</p>
                            </div>
                            <div>
                              <p className="text-slate-500 font-medium">Valor Produtos</p>
                              <p className="font-bold text-slate-900 dark:text-white mt-0.5">{formatBRL(orderDetails.invoice.vlr_produtos)}</p>
                            </div>
                            <div>
                              <p className="text-slate-500 font-medium">Valor Total NF</p>
                              <p className="font-black text-emerald-700 dark:text-emerald-300 mt-0.5">{formatBRL(orderDetails.invoice.vlr_total_nota)}</p>
                            </div>
                          </div>

                          {/* Itens da NF */}
                          {orderDetails.invoice.itens && orderDetails.invoice.itens.length > 0 && (
                            <div className="pt-2">
                              <p className="text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-2">Itens da Nota Fiscal ({orderDetails.invoice.itens.length}):</p>
                              <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 overflow-hidden bg-white dark:bg-slate-900">
                                <table className="w-full text-left text-[11px]">
                                  <thead className="bg-emerald-100/60 dark:bg-emerald-950/60 font-bold text-emerald-900 dark:text-emerald-300">
                                    <tr>
                                      <th className="p-2">Cód</th>
                                      <th className="p-2">Descrição</th>
                                      <th className="p-2 text-center">Qtd</th>
                                      <th className="p-2 text-right">Unitário</th>
                                      <th className="p-2 text-right">Total</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-emerald-100 dark:divide-emerald-900/40">
                                    {orderDetails.invoice.itens.map((nfi, idx) => (
                                      <tr key={idx}>
                                        <td className="p-2 font-mono">{nfi.cod_item}</td>
                                        <td className="p-2 font-semibold">{nfi.nom_item || 'Item NF'}</td>
                                        <td className="p-2 text-center">{nfi.qtd_item}</td>
                                        <td className="p-2 text-right font-mono">{formatBRL(nfi.vlr_unitario)}</td>
                                        <td className="p-2 text-right font-mono font-bold">{formatBRL(nfi.vlr_total_item)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : null}

                      {/* ─── TABELA DE ITENS DO PEDIDO (ITENS_PEDIDO_VENDA) ── */}
                      <div className="space-y-3">
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                          <Layers className="h-4 w-4 text-violet-500" />
                          Itens do Pedido ({orderDetails.items.length})
                        </p>
                        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">
                              <tr>
                                <th className="p-3 w-12 text-center">#</th>
                                <th className="p-3">Código</th>
                                <th className="p-3">Descrição do Produto</th>
                                <th className="p-3 text-center">Qtd</th>
                                <th className="p-3 text-right">Vlr Unitário</th>
                                <th className="p-3 text-right">Vlr Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {orderDetails.items.map((item, idx) => (
                                <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                                  <td className="p-3 text-center text-slate-400 font-mono">{item.seq_item || idx + 1}</td>
                                  <td className="p-3 font-mono font-bold text-slate-800 dark:text-slate-200">{item.cod_item}</td>
                                  <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{item.nom_item || 'Produto'}</td>
                                  <td className="p-3 text-center font-bold text-slate-900 dark:text-white">{item.qtd_item}</td>
                                  <td className="p-3 text-right font-mono text-slate-600 dark:text-slate-400">{formatBRL(item.vlr_unitario)}</td>
                                  <td className="p-3 text-right font-mono font-bold text-slate-900 dark:text-white">{formatBRL(item.vlr_total_item)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
