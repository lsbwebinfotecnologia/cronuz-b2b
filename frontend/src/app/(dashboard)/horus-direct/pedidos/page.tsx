'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
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
  Tag,
  Send,
  PackageCheck,
  PackageX,
  MapPin,
  ClipboardCheck,
  Zap
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
  lft_count?: number;
  faturados_count: number;
  cancelados_count: number;
  alertas_expedicao_count: number;
  abertos_valor_bruto: number;
  abertos_valor_liquido: number;
  abertos_valor: number;
  lft_valor_bruto?: number;
  lft_valor_liquido?: number;
  total_count: number;
  filial_consultada: string;
  dias_alerta_expedicao: number;
}

interface SalesMethodItem {
  cod_metodo: string;
  desc_metodo: string;
}

function formatLogisticsDetail(detail: string | null | undefined): string {
  if (!detail) return '';
  return detail
    .replace(/'(\d{7})'/g, (_m, p1) => `'0${p1.slice(0, 4)}-${p1.slice(4)}'`)
    .replace(/\b(\d{7})\b/g, (_m, p1) => {
      const full = '0' + p1;
      return `${full.slice(0, 5)}-${full.slice(5)}`;
    })
    .replace(/\b(\d{8})\b/g, (_m, p1) => {
      return `${p1.slice(0, 5)}-${p1.slice(5)}`;
    });
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
  const [statusTab, setStatusTab] = useState<'DEFAULT' | 'LFT' | 'FAT' | 'CAN' | 'TODOS'>('DEFAULT');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedMetodo, setSelectedMetodo] = useState('TODOS');
  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 15);
    return d.toISOString().split('T')[0];
  });
  const [dataFim, setDataFim] = useState(() => new Date().toISOString().split('T')[0]);

  // Drawer de Detalhes do Pedido
  const [selectedOrder, setSelectedOrder] = useState<OrderHeader | null>(null);
  const [orderDetails, setOrderDetails] = useState<{
    order: OrderHeader;
    items: OrderItem[];
    invoice: InvoiceData | null;
    has_invoice: boolean;
  } | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Logística WMS — mapa de situação por cod_ped_venda
  const [logisticsMap, setLogisticsMap] = useState<Record<number, {
    situation: string;
    cep_validated: boolean | null;
    cep_error_detail: string | null;
    error_log?: string | null;
    id_ord_sys_log?: string | null;
    key_nfe?: string | null;
    nfe_number?: string | null;
    invoiced_at?: string | null;
  }>>({});
  const [loadingLogistics, setLoadingLogistics] = useState(false);
  // Modal de envio para logística
  const [sendModal, setSendModal] = useState<{ order: OrderHeader } | null>(null);
  const [sendingLogistics, setSendingLogistics] = useState(false);
  const [filterLogisticsErrors, setFilterLogisticsErrors] = useState(false);
  const [filterNfEnviada, setFilterNfEnviada] = useState(false);
  const [filterProntoFaturar, setFilterProntoFaturar] = useState(false);

  // Sincronização & Conciliação com WMS
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncingWms, setSyncingWms] = useState(false);
  const [syncStartDate, setSyncStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [syncEndDate, setSyncEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [syncResult, setSyncResult] = useState<{
    total_wms: number;
    synced_count: number;
    updated_count: number;
    created_count: number;
    message: string;
    orders: Array<{ cod_ped_venda: number; id_ord_sys_log: string | null; action: string; situation: string }>;
  } | null>(null);

  // Conferência WMS (process-check -> LFT)
  const [checkingWms, setCheckingWms] = useState(false);
  const [checkingOrderId, setCheckingOrderId] = useState<number | null>(null);
  const [checkResult, setCheckResult] = useState<{
    processed_count: number;
    conferred_count: number;
    errors_count: number;
    message: string;
    results: Array<{ cod_ped_venda: number; status: string; items_checked?: number; volumes?: number; message: string }>;
    errors: Array<{ cod_ped_venda: number; error: string }>;
  } | null>(null);

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

  // Carrega situação logística dos pedidos visíveis
  // Busca fila da logística
  const fetchLogisticsQueue = useCallback(async () => {
    if (!companyId) return;
    const token = getToken();
    if (!token) return;
    setLoadingLogistics(true);
    try {
      const res = await fetch(`${API}/companies/${companyId}/logistics/queue`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const queue: Array<{
          cod_ped_venda: number;
          situation: string;
          cep_validated: boolean | null;
          cep_error_detail: string | null;
          id_ord_sys_log?: string | null;
          error_log?: string | null;
          key_nfe?: string | null;
          nfe_number?: string | null;
          invoiced_at?: string | null;
        }> = await res.json();
        const map: Record<number, {
          situation: string;
          cep_validated: boolean | null;
          cep_error_detail: string | null;
          id_ord_sys_log?: string | null;
          error_log?: string | null;
          key_nfe?: string | null;
          nfe_number?: string | null;
          invoiced_at?: string | null;
        }> = {};
        for (const item of queue) {
          map[item.cod_ped_venda] = {
            situation: item.situation,
            cep_validated: item.cep_validated,
            cep_error_detail: item.cep_error_detail,
            id_ord_sys_log: item.id_ord_sys_log,
            error_log: item.error_log,
            key_nfe: item.key_nfe,
            nfe_number: item.nfe_number,
            invoiced_at: item.invoiced_at,
          };
        }
        setLogisticsMap(map);
      }
    } catch {
      // silencioso — logística pode não estar configurada
    } finally {
      setLoadingLogistics(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (orders.length > 0) {
      fetchLogisticsQueue();
    }
  }, [orders, fetchLogisticsQueue]);

  // Executa Sincronização e Conciliação com WMS por período
  const handleExecuteSyncWms = async () => {
    if (!syncStartDate || !syncEndDate) {
      toast.error('Informe a data inicial e final.');
      return;
    }
    setSyncingWms(true);
    setSyncResult(null);
    try {
      const token = getToken();
      const res = await fetch(`${API}/companies/${companyId}/logistics/sync-from-wms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          start_date: syncStartDate,
          end_date: syncEndDate
        })
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.detail || 'Erro ao sincronizar com WMS');
      } else {
        setSyncResult(data);
        toast.success(`Sincronização concluída! ${data.synced_count} pedidos conciliados.`);
        fetchLogisticsQueue();
      }
    } catch (err: any) {
      toast.error(err.message || 'Falha na comunicação com o servidor.');
    } finally {
      setSyncingWms(false);
    }
  };

  // Executa Conferência WMS e Liberação para Faturamento (LFT) no Hórus
  const handleExecuteProcessCheck = async (codPedVenda?: number) => {
    setCheckingWms(true);
    if (codPedVenda) setCheckingOrderId(codPedVenda);
    setCheckResult(null);
    try {
      const token = getToken();
      let url = `${API}/companies/${companyId}/logistics/process-check?start_date=${syncStartDate}&end_date=${syncEndDate}`;
      if (codPedVenda) {
        url += `&cod_ped_venda=${codPedVenda}`;
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.detail || 'Erro ao processar conferência WMS');
      } else {
        setCheckResult(data);
        if (data.conferred_count > 0) {
          toast.success(data.message || `${data.conferred_count} pedido(s) conferido(s) e liberado(s) para faturamento (LFT) no Hórus!`);
        } else {
          toast.info(data.message || 'Nenhum pedido novo pendente de liberação para faturamento.');
        }
        fetchLogisticsQueue();
        fetchOrders();
      }
    } catch (err: any) {
      toast.error(err.message || 'Falha ao processar conferência.');
    } finally {
      setCheckingWms(false);
      setCheckingOrderId(null);
    }
  };

  // Força conferência e transição para LFT exclusivamente no Hórus ERP
  const [forcingHorusOrderId, setForcingHorusOrderId] = useState<number | null>(null);

  const handleForceHorusConference = async (codPedVenda: number) => {
    setForcingHorusOrderId(codPedVenda);
    try {
      const token = getToken();
      const res = await fetch(`${API}/companies/${companyId}/logistics/orders/${codPedVenda}/force-horus-conference`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.detail || 'Erro ao forçar conferência no Hórus');
      } else {
        toast.success(data.message || `Pedido #${codPedVenda} conferido e liberado (LFT) no Hórus com sucesso!`);
        fetchLogisticsQueue();
        fetchOrders();
        if (selectedOrder && selectedOrder.cod_ped_venda === codPedVenda) {
          setSelectedOrder({ ...selectedOrder, sta_pedido_venda: 'LFT' });
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Falha ao forçar conferência no Hórus.');
    } finally {
      setForcingHorusOrderId(null);
    }
  };

  // Tipo dos checks de preflight
  type PreflightCheck = { key: string; label: string; status: 'ok' | 'error' | 'warning'; detail: string };
  type PreflightResult = { can_send: boolean; checks: PreflightCheck[]; order: Record<string, unknown> | null; client: Record<string, unknown> | null; items: Record<string, unknown>[] };

  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [loadingPreflight, setLoadingPreflight] = useState(false);

  // Abre modal e dispara preflight automaticamente
  const handleOpenSendModal = async (order: OrderHeader) => {
    setSendModal({ order });
    setPreflight(null);
    setLoadingPreflight(true);
    try {
      const r = await fetch(
        `${API}/companies/${companyId}/logistics/preflight/${order.cod_ped_venda}?cod_filial=${selectedFilial}`,
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      const data = await r.json();
      if (!r.ok) {
        setPreflight({
          can_send: false,
          checks: [{ key: 'error', label: 'Erro ao validar', status: 'error', detail: data.detail || 'Erro desconhecido' }],
          order: null, client: null, items: []
        });
      } else {
        const pref = data as PreflightResult;
        setPreflight(pref);
        // Se o preflight passar (ex: o CEP agora foi normalizado/corrigido com 8 dígitos), remove o estado de erro visual
        if (pref.can_send) {
          setLogisticsMap(prev => ({
            ...prev,
            [order.cod_ped_venda]: {
              ...prev[order.cod_ped_venda],
              situation: prev[order.cod_ped_venda]?.situation === 'CEP_INVALID' ? 'PENDING_SEND' : (prev[order.cod_ped_venda]?.situation || 'PENDING_SEND'),
              cep_validated: true,
              cep_error_detail: null,
            }
          }));
        }
      }
    } catch (e) {
      setPreflight({
        can_send: false,
        checks: [{ key: 'network', label: 'Erro de conexão', status: 'error', detail: 'Não foi possível conectar ao servidor. Verifique a conexão.' }],
        order: null, client: null, items: []
      });
    } finally {
      setLoadingPreflight(false);
    }
  };

  // Envio de pedido para WMS (só chamado após preflight OK)
  const handleSendToLogistics = async () => {
    if (!sendModal || !companyId) return;
    setSendingLogistics(true);
    try {
      const r = await fetch(
        `${API}/companies/${companyId}/logistics/send/${sendModal.order.cod_ped_venda}?cod_filial=${selectedFilial}`,
        { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` } }
      );
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || 'Erro ao enviar pedido.');
      toast.success(`Pedido #${sendModal.order.cod_ped_venda} enviado à logística!`);
      const sentOrderCod = sendModal.order.cod_ped_venda;
      setSendModal(null);
      setPreflight(null);
      setLogisticsMap(prev => ({
        ...prev,
        [sentOrderCod]: {
          situation: 'IN_LOGISTICS',
          cep_validated: true,
          cep_error_detail: null,
          error_log: null,
          id_ord_sys_log: data.id_ord_sys_log || prev[sentOrderCod]?.id_ord_sys_log || null
        },
      }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro ao enviar.';
      toast.error(msg);
      const cod = sendModal.order.cod_ped_venda;
      setLogisticsMap(prev => ({
        ...prev,
        [cod]: {
          situation: msg.toLowerCase().includes('cep') ? 'CEP_INVALID' : 'PENDING_SEND',
          cep_validated: msg.toLowerCase().includes('cep') ? false : null,
          cep_error_detail: msg,
          error_log: msg,
        },
      }));
    } finally {
      setSendingLogistics(false);
    }
  };

  // Badge de situação logística
  const getLogisticsBadge = (
    logi: {
      situation: string;
      cep_validated: boolean | null;
      cep_error_detail: string | null;
      id_ord_sys_log?: string | null;
      key_nfe?: string | null;
      nfe_number?: string | null;
    } | undefined,
    order: OrderHeader
  ) => {
    // Só mostra botão Enviar para pedidos LEX que ainda não tenham ID confirmado no WMS
    const sta = (order.sta_pedido_venda || '').toUpperCase().trim();
    if (!logi || (logi.situation === 'IN_LOGISTICS' && !logi.id_ord_sys_log)) {
      if (sta !== 'LEX') return <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>;
      return (
        <button
          type="button"
          onClick={() => handleOpenSendModal(order)}
          className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-700 hover:bg-violet-100 dark:hover:bg-violet-900/50 transition-colors"
        >
          <Send className="h-3 w-3" /> Enviar WMS
        </button>
      );
    }

    // 1. Se a NF já foi enviada para o WMS MKT (INVOICED)
    if (logi.situation === 'INVOICED') {
      return (
        <div className="flex flex-col items-center gap-0.5">
          <span
            className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border bg-emerald-100/90 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 shadow-2xs whitespace-nowrap"
            title={logi.key_nfe ? `Chave NFe: ${logi.key_nfe}` : 'Nota Fiscal transmitida com sucesso ao WMS'}
          >
            <CheckCircle className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
            NF Enviada MKT
          </span>
          {logi.nfe_number && (
            <span className="font-mono text-[9px] font-bold text-emerald-700 dark:text-emerald-400">
              NF #{logi.nfe_number}
            </span>
          )}
        </div>
      );
    }

    // 2. Se o pedido está FAT no ERP e tem WMS ID, mas a NF ainda não foi enviada
    if (sta === 'FAT' && logi.id_ord_sys_log && logi.situation !== 'INVOICED') {
      return (
        <div className="flex flex-col items-center gap-0.5">
          <span
            className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700 whitespace-nowrap"
            title="Pedido faturado no ERP aguardando transmissão de NF ao WMS"
          >
            <Clock className="h-3 w-3 text-amber-600" />
            Pendente NF
          </span>
        </div>
      );
    }

    const situationMap: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
      PENDING_SEND: { label: 'Pendente', cls: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700', icon: <Truck className="h-3 w-3" /> },
      CEP_INVALID: { label: 'CEP Inválido', cls: 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800', icon: <MapPin className="h-3 w-3" /> },
      IN_LOGISTICS: { label: 'No WMS', cls: 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800', icon: <PackageCheck className="h-3 w-3" /> },
      CHECKED: { label: 'Conferido (LFT)', cls: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800', icon: <ClipboardCheck className="h-3 w-3 text-emerald-600" /> },
      CANCELED: { label: 'Cancelado', cls: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-500 border-slate-200 dark:border-slate-700', icon: <PackageX className="h-3 w-3" /> },
    };
    const s = situationMap[logi.situation] || situationMap['PENDING_SEND'];

    const isPendingHorusLFT = (sta === 'LEX' || sta === 'CON' || sta === 'IMP' || sta === 'ABERTO') &&
      (logi.situation === 'CHECKED');

    if (isPendingHorusLFT) {
      return (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${s.cls}`}>
            {s.icon}{s.label}
          </span>
          <button
            type="button"
            onClick={() => handleForceHorusConference(order.cod_ped_venda)}
            disabled={forcingHorusOrderId === order.cod_ped_venda}
            className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 dark:text-amber-300 border border-amber-300 dark:border-amber-700 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
            title="WMS já conferiu/separou, mas o Hórus ainda não avançou para LFT. Clique para forçar a conferência e liberação (LFT) apenas no Hórus."
          >
            {forcingHorusOrderId === order.cod_ped_venda ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            ) : (
              <Zap className="h-2.5 w-2.5 text-amber-600" />
            )}
            Forçar LFT Hórus
          </button>
        </div>
      );
    }

    return (
      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${s.cls}`}>
        {s.icon}{s.label}
      </span>
    );
  };

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
    const cls = 'inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap';
    const s = (status || '').toUpperCase().trim();

    if (s === 'FAT') return (
      <span className={`${cls} bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800`}>
        <CheckCircle className="h-3 w-3 shrink-0 text-emerald-600" />
        Faturado {nroNf ? `(NF ${nroNf})` : ''}
      </span>
    );
    if (s === 'CAN' || s === 'CA') return (
      <span className={`${cls} bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 border-rose-300 dark:border-rose-800`}>
        <XCircle className="h-3 w-3 shrink-0 text-rose-600" />
        Cancelado
      </span>
    );
    if (s === 'LFT') return (
      <span className={`${cls} bg-indigo-100 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800`} title="Passou pela logística, pendente faturamento">
        <Receipt className="h-3 w-3 shrink-0 text-indigo-600" />
        Lib. Fat. (LFT)
      </span>
    );
    if (s === 'LEX' || s === 'EXP' || s === 'EXPEDICAO') return (
      <span className={`${cls} bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-300 border-purple-300 dark:border-purple-800`}>
        <Truck className="h-3 w-3 shrink-0 text-purple-600" />
        Em Expedição (LEX)
      </span>
    );
    if (s === 'IMP') return (
      <span className={`${cls} bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300 border-sky-300 dark:border-sky-800`}>
        <Clock className="h-3 w-3 shrink-0 text-sky-600" />
        Impresso (IMP)
      </span>
    );
    if (s === 'CON') return (
      <span className={`${cls} bg-teal-100 text-teal-800 dark:bg-teal-950/50 dark:text-teal-300 border-teal-300 dark:border-teal-800`}>
        <Clock className="h-3 w-3 shrink-0 text-teal-600" />
        Conferência (CON)
      </span>
    );
    if (s === 'NOV') return (
      <span className={`${cls} bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700`}>
        <Clock className="h-3 w-3 shrink-0 text-slate-500" />
        Novo (NOV)
      </span>
    );
    return (
      <span className={`${cls} bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border-amber-300 dark:border-amber-800`}>
        <Clock className="h-3 w-3 shrink-0 text-amber-600" />
        {status || 'Em Aberto'}
      </span>
    );
  };

  const displayedOrders = filterLogisticsErrors
    ? orders.filter((o) => {
        const logi = logisticsMap[o.cod_ped_venda];
        return logi?.situation === 'CEP_INVALID' || Boolean(logi?.error_log);
      })
    : filterNfEnviada
    ? orders.filter((o) => {
        const logi = logisticsMap[o.cod_ped_venda];
        return logi?.situation === 'INVOICED';
      })
    : filterProntoFaturar
    ? orders.filter((o) => {
        const logi = logisticsMap[o.cod_ped_venda];
        const sta = (o.sta_pedido_venda || '').toUpperCase().trim();
        return sta === 'LFT' && logi?.situation === 'CHECKED';
      })
    : orders;

  return (
    <div className="space-y-5 w-full pb-16">
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
            onClick={() => {
              console.log('[Sincronizar WMS] Abrindo modal de sincronização');
              setSyncModalOpen(true);
            }}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-violet-50 hover:bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:hover:bg-violet-900/60 dark:text-violet-300 border border-violet-200 dark:border-violet-800 transition-colors shadow-sm cursor-pointer"
            title="Consultar remessas existentes no WMS e conciliar com os pedidos do Hórus"
          >
            <Truck className="h-3.5 w-3.5" />
            Sincronizar WMS
          </button>

          <button
            type="button"
            onClick={() => handleExecuteProcessCheck()}
            disabled={checkingWms}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 transition-colors shadow-sm cursor-pointer disabled:opacity-50"
            title="Processar conferência dos pedidos no WMS e liberar para faturamento (LFT) no Hórus"
          >
            {checkingWms && !checkingOrderId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardCheck className="h-3.5 w-3.5" />}
            Conferir WMS (LFT)
          </button>

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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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

          {/* Card: Pronto p/ Faturar (LFT) */}
          <div className="p-5 rounded-2xl border border-indigo-200 bg-indigo-50/50 dark:border-indigo-800/40 dark:bg-indigo-950/20 shadow-sm cursor-pointer hover:border-indigo-300 transition-colors"
               onClick={() => { setStatusTab('LFT'); setPage(1); }}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider">Prontos p/ Faturar (LFT)</p>
              <Receipt className="h-4 w-4 text-indigo-600" />
            </div>
            <p className="text-2xl font-black text-indigo-800 dark:text-indigo-200 mt-2">{summary.lft_count || 0}</p>
            <div className="flex items-center justify-between mt-1 text-[11px] text-indigo-700 dark:text-indigo-300 font-semibold">
              <span>Líquido: {formatBRL(summary.lft_valor_liquido || 0)}</span>
              {(summary.lft_valor_bruto || 0) > (summary.lft_valor_liquido || 0) && (
                <span className="text-indigo-600/70 font-normal">Bruto: {formatBRL(summary.lft_valor_bruto)}</span>
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
        </div>
      )}

      {/* ─── BARRA DE FILTROS E ABAS (MOBILE FIRST & COMPACTA) ──────────────── */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm space-y-3.5">
        {/* Linha 1: Abas Rápidas de Status + Filtro de Problemas + Link de Logs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
          <button
            type="button"
            onClick={() => { setStatusTab('DEFAULT'); setFilterProntoFaturar(false); setPage(1); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0 flex items-center gap-1.5 ${
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
            onClick={() => { setStatusTab('LFT'); setFilterProntoFaturar(false); setPage(1); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0 flex items-center gap-1.5 ${
              statusTab === 'LFT'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-indigo-700 dark:text-indigo-400 bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100'
            }`}
            title="Exibir pedidos liberados para faturamento (LFT)"
          >
            <Receipt className="h-3.5 w-3.5" />
            Prontos p/ Faturar (LFT) {summary?.lft_count !== undefined ? `(${summary.lft_count})` : ''}
          </button>

          <button
            type="button"
            onClick={() => { setStatusTab('FAT'); setFilterProntoFaturar(false); setPage(1); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0 flex items-center gap-1.5 ${
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
            onClick={() => { setStatusTab('CAN'); setFilterProntoFaturar(false); setPage(1); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0 flex items-center gap-1.5 ${
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
            onClick={() => { setStatusTab('TODOS'); setFilterProntoFaturar(false); setPage(1); }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0 flex items-center gap-1.5 ${
              statusTab === 'TODOS'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            Todos os Status
          </button>

          {/* Separador */}
          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 shrink-0 mx-1" />

          {/* Filtro: Prontos p/ Faturar (LFT e Conferidos no WMS) */}
          <button
            type="button"
            onClick={() => {
              setFilterProntoFaturar(!filterProntoFaturar);
              if (!filterProntoFaturar) {
                setFilterLogisticsErrors(false);
                setFilterNfEnviada(false);
              }
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0 flex items-center gap-1.5 ${
              filterProntoFaturar
                ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-400'
                : 'text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100'
            }`}
            title="Filtrar pedidos com status LFT que já foram conferidos na logística"
          >
            <CheckCircle className="h-3.5 w-3.5" />
            LFT Conferidos ({orders.filter(o => (o.sta_pedido_venda || '').toUpperCase() === 'LFT' && logisticsMap[o.cod_ped_venda]?.situation === 'CHECKED').length})
          </button>

          {/* Filtro: Apenas com Problemas de Logística */}
          <button
            type="button"
            onClick={() => {
              setFilterLogisticsErrors(!filterLogisticsErrors);
              if (!filterLogisticsErrors) {
                setFilterNfEnviada(false);
                setFilterProntoFaturar(false);
              }
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0 flex items-center gap-1.5 ${
              filterLogisticsErrors
                ? 'bg-rose-600 text-white shadow-sm ring-2 ring-rose-400'
                : 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 hover:bg-rose-100'
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Problemas de Logística ({Object.values(logisticsMap).filter(l => l.situation === 'CEP_INVALID' || Boolean(l.error_log)).length})
          </button>

          {/* Filtro: NF Enviada ao WMS MKT */}
          <button
            type="button"
            onClick={() => {
              setFilterNfEnviada(!filterNfEnviada);
              if (!filterNfEnviada) {
                setFilterLogisticsErrors(false);
                setFilterProntoFaturar(false);
              }
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0 flex items-center gap-1.5 ${
              filterNfEnviada
                ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-400'
                : 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100'
            }`}
            title="Filtrar pedidos cuja Nota Fiscal já foi transmitida com sucesso para o WMS MKT"
          >
            <CheckCircle className="h-3.5 w-3.5" />
            NF Enviada MKT ({Object.values(logisticsMap).filter(l => l.situation === 'INVOICED').length})
          </button>

          {/* Link para a tela completa de Logs da Logística */}
          <Link
            href="/horus-direct/logistica-logs"
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300 border border-violet-200 dark:border-violet-800 hover:bg-violet-100 flex items-center gap-1.5 shrink-0 transition-colors"
          >
            <Truck className="h-3.5 w-3.5" />
            Logs da Logística
          </Link>
        </div>

        {/* Linha 2: Busca Rápida (abaixo dos status) + Método de Venda + Período */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
          {/* Campo de Busca Rápida (Destaque abaixo dos status) */}
          <div className="sm:col-span-2 lg:col-span-5 relative">
            <Search className="h-3.5 w-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              placeholder="Buscar Pedido #, Cliente, NF, Natureza..."
              className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 font-medium"
            />
          </div>

          {/* Método de Venda */}
          <div className="sm:col-span-1 lg:col-span-3 flex items-center gap-1.5">
            <span className="font-bold text-slate-500 shrink-0 text-[11px]">Método:</span>
            <select
              value={selectedMetodo}
              onChange={(e) => { setSelectedMetodo(e.target.value); setPage(1); }}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-2.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 font-semibold truncate"
            >
              <option value="TODOS">Todos os Métodos</option>
              {methodsList.map((m) => (
                <option key={m.cod_metodo} value={m.cod_metodo}>
                  {m.desc_metodo ? `${m.desc_metodo} (${m.cod_metodo})` : `Método ${m.cod_metodo}`}
                </option>
              ))}
            </select>
          </div>

          {/* Data Início & Fim */}
          <div className="sm:col-span-1 lg:col-span-4 flex items-center gap-1.5">
            <div className="flex-1 flex items-center gap-1">
              <span className="font-bold text-slate-500 shrink-0 text-[11px]">De:</span>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => { setDataInicio(e.target.value); setPage(1); }}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-2 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <div className="flex-1 flex items-center gap-1">
              <span className="font-bold text-slate-500 shrink-0 text-[11px]">Até:</span>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => { setDataFim(e.target.value); setPage(1); }}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-2 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ─── TABELA DE PEDIDOS (RESPONSIVA & ENCAIXADA NA TELA) ───────────────────── */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="overflow-x-auto rounded-2xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-bold sticky top-0 border-b border-slate-200/80 dark:border-slate-800 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="p-3 w-28 whitespace-nowrap">Pedido</th>
                <th className="p-3 min-w-[200px]">Cliente / Método / Operação</th>
                <th className="p-3 w-36 whitespace-nowrap">Cronologia / Liberações</th>
                <th className="p-3 w-32 text-right whitespace-nowrap">Valores</th>
                <th className="p-3 w-16 text-center whitespace-nowrap">Itens</th>
                <th className="p-3 w-36 text-center whitespace-nowrap">Logística WMS</th>
                <th className="p-3 w-24 text-center whitespace-nowrap">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-400">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-violet-500" />
                    Consultando pedidos no Horus ERP...
                  </td>
                </tr>
              ) : displayedOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-400">
                    {filterLogisticsErrors
                      ? 'Nenhum pedido com problemas de logística localizado nesta página.'
                      : 'Nenhum pedido localizado com os filtros selecionados.'}
                  </td>
                </tr>
              ) : (
                displayedOrders.map((o) => {
                  const isAtrasado = Boolean(o.is_alerta_expedicao);
                  const hasLogisticsProblem = logisticsMap[o.cod_ped_venda]?.situation === 'CEP_INVALID' || Boolean(logisticsMap[o.cod_ped_venda]?.error_log);
                  const rowBgClass = hasLogisticsProblem
                    ? 'bg-rose-50/50 dark:bg-rose-950/20 border-l-4 border-l-rose-500 hover:bg-rose-100/40 dark:hover:bg-rose-900/20'
                    : isAtrasado
                    ? 'bg-amber-50/75 dark:bg-amber-950/25 border-l-4 border-l-amber-500 hover:bg-amber-100/60 dark:hover:bg-amber-900/30'
                    : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40';

                  const valorLiquido = o.vlr_total_liquido !== undefined && o.vlr_total_liquido !== null
                    ? o.vlr_total_liquido
                    : o.vlr_total_pedido;
                  const valorBruto = o.vlr_total_pedido;
                  const hasDesconto = valorBruto > valorLiquido;

                  return (
                    <React.Fragment key={`${o.cod_filial}-${o.cod_ped_venda}`}>
                    <tr className={`transition-colors ${rowBgClass}`}>
                      {/* 1. Pedido Web & Horus + Filial */}
                      <td className="p-3 align-top whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <span className="font-mono font-black text-violet-700 dark:text-violet-300 text-xs bg-violet-50 dark:bg-violet-950/50 px-2 py-0.5 rounded border border-violet-200 dark:border-violet-800 inline-block w-fit">
                            #{o.cod_ped_venda}
                          </span>
                          <div className="flex flex-col gap-0.5 text-[10px] text-slate-500">
                            {o.pedido_web ? (
                              <span className="font-mono text-slate-700 dark:text-slate-300 font-medium">
                                <span className="text-slate-400 font-normal">Origem:</span> #{o.pedido_web}
                              </span>
                            ) : null}
                            <span className="text-slate-500 dark:text-slate-400 font-semibold" title={`Filial ${o.cod_filial}`}>
                              Filial - {o.cod_filial}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* 2. Cliente + Status + Método + Natureza na mesma coluna */}
                      <td className="p-3 align-top">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-slate-900 dark:text-slate-100 text-xs truncate max-w-[260px] sm:max-w-xs" title={o.nom_cli || 'Cliente Balcão'}>
                              {o.nom_cli || 'Cliente Balcão'}
                            </p>
                            {o.cod_cli && (
                              <span className="text-[10px] text-slate-400 font-mono bg-slate-100 dark:bg-slate-800/80 px-1.5 py-0.2 rounded">
                                Cód: {o.cod_cli}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap">
                            {/* Status do Pedido */}
                            {getStatusBadge(o.sta_pedido_venda, o.nro_nota_fiscal)}

                            {/* Método de Venda */}
                            {(o.desc_metodo || o.cod_metodo) && (
                              <span
                                className="inline-flex items-center text-[10px] font-semibold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md border border-slate-200/60 dark:border-slate-700/60"
                                title={`Método de Venda: ${o.desc_metodo || ''} (${o.cod_metodo || ''})`}
                              >
                                {o.desc_metodo || `Método ${o.cod_metodo}`}
                              </span>
                            )}

                            {/* Natureza Fiscal */}
                            {o.natureza_operacao && (
                              <span
                                className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border border-violet-200/60 dark:border-violet-800/60"
                                title={`Natureza Fiscal: ${o.natureza_operacao}`}
                              >
                                <Tag className="h-2.5 w-2.5" />
                                {o.natureza_operacao}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 3. Cronologia / Liberações (Criação, Expedição, LFT agrupadas) */}
                      <td className="p-3 align-top text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        <div className="space-y-0.5">
                          <p title="Data de Criação">
                            <span className="text-slate-400 text-[10px]">Criação:</span> <span className="font-medium text-slate-700 dark:text-slate-300">{formatDate(o.data_criacao)}</span>
                          </p>
                          <p title="Liberação para Expedição">
                            <span className="text-slate-400 text-[10px]">Expedição:</span> <span className="font-medium text-slate-700 dark:text-slate-300">{formatDate(o.data_expedicao)}</span>
                          </p>
                          {o.data_lft && (
                            <p title="Liberação de Faturamento (LFT)">
                              <span className="text-slate-400 text-[10px]">LFT:</span> <span className="font-medium text-slate-700 dark:text-slate-300">{formatDate(o.data_lft)}</span>
                            </p>
                          )}
                          {isAtrasado && o.dias_expedicao !== undefined && (
                            <div className="pt-0.5">
                              <span className="inline-flex items-center gap-1 text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-200 text-amber-950 dark:bg-amber-900/70 dark:text-amber-200 border border-amber-300 dark:border-amber-700">
                                <AlertTriangle className="h-3 w-3 text-amber-700 dark:text-amber-400" />
                                {o.dias_expedicao}d em atraso
                              </span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* 4. Valores (Líquido e Bruto) */}
                      <td className="p-3 align-top text-right font-mono whitespace-nowrap">
                        <p className="font-black text-slate-900 dark:text-white text-xs">
                          {formatBRL(valorLiquido)}
                        </p>
                        {hasDesconto && (
                          <p className="text-[10px] text-slate-400 line-through">
                            Bruto: {formatBRL(valorBruto)}
                          </p>
                        )}
                      </td>

                      {/* 5. Qtd Itens */}
                      <td className="p-3 align-top text-center font-bold text-slate-700 dark:text-slate-300 text-xs">
                        {o.qtd_itens || o.qtd_itens_total || 1}
                      </td>

                      {/* 6. Logística WMS */}
                      <td className="p-3 align-top text-center">
                        <div className="flex flex-col items-center gap-1">
                          {loadingLogistics
                            ? <span className="inline-block w-14 h-4 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
                            : getLogisticsBadge(logisticsMap[o.cod_ped_venda], o)
                          }
                          {/* Número do Pedido / Remessa do WMS */}
                          {logisticsMap[o.cod_ped_venda]?.id_ord_sys_log && (
                            <div className="flex items-center justify-center gap-1 font-mono text-[10px]" title="Número da Remessa no WMS">
                              <span className="text-slate-400 font-semibold">WMS:</span>
                              <span className="font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                                #{logisticsMap[o.cod_ped_venda]?.id_ord_sys_log}
                              </span>
                            </div>
                          )}
                          {/* Crítica do MKT exibida abaixo do badge */}
                          {logisticsMap[o.cod_ped_venda]?.error_log && logisticsMap[o.cod_ped_venda]?.situation === 'PENDING_SEND' && (
                            <p className="text-[9px] text-rose-600 dark:text-rose-400 max-w-[120px] truncate" title={logisticsMap[o.cod_ped_venda]?.error_log || ''}>
                              ⚠️ {logisticsMap[o.cod_ped_venda]?.error_log}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* 7. Ações */}
                      <td className="p-3 align-top text-center">
                        <button
                          type="button"
                          onClick={() => handleOpenDetails(o)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-violet-700 bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-900/60 transition-colors shadow-2xs"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Detalhes
                        </button>
                      </td>
                    </tr>

                    {/* Sub-linha de destaque para pedidos com críticas de logística */}
                    {hasLogisticsProblem && (
                      <tr className="bg-rose-50/70 dark:bg-rose-950/25 border-b border-rose-200 dark:border-rose-900/50">
                        <td colSpan={7} className="px-4 py-2">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                            <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300">
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-600" />
                              <span className="font-black uppercase tracking-wider text-[10px] bg-rose-100 dark:bg-rose-900/50 px-1.5 py-0.5 rounded">
                                Crítica de Logística:
                              </span>
                              <span>
                                {formatLogisticsDetail(
                                  logisticsMap[o.cod_ped_venda]?.situation === 'CEP_INVALID'
                                    ? (logisticsMap[o.cod_ped_venda]?.cep_error_detail || 'CEP inválido ou não localizado no ViaCEP.')
                                    : logisticsMap[o.cod_ped_venda]?.error_log
                                )}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleOpenSendModal(o)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold text-rose-800 bg-rose-200/80 hover:bg-rose-300/80 dark:bg-rose-900/50 dark:text-rose-200 transition-colors"
                            >
                              <Send className="h-3 w-3" /> Revalidar / Enviar WMS
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ─── PAGINAÇÃO ────────────────────────────────────────── */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <span className="text-slate-500">
            Mostrando <strong>{displayedOrders.length}</strong> de <strong>{totalRecords}</strong> pedidos {filterLogisticsErrors ? '(filtrado por problemas de logística)' : filterNfEnviada ? '(filtrado por NF enviada MKT)' : filterProntoFaturar ? '(filtrado por prontos p/ faturar LFT)' : ''} (Página {page} de {totalPages})
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

                  <div className="flex items-center gap-2">
                    {logisticsMap[selectedOrder.cod_ped_venda]?.situation === 'CHECKED' && selectedOrder.sta_pedido_venda !== 'LFT' && selectedOrder.sta_pedido_venda !== 'FAT' && selectedOrder.sta_pedido_venda !== 'CAN' && (
                      <button
                        type="button"
                        onClick={() => handleForceHorusConference(selectedOrder.cod_ped_venda)}
                        disabled={forcingHorusOrderId === selectedOrder.cod_ped_venda}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 dark:text-amber-300 border border-amber-300 dark:border-amber-700 shadow-sm cursor-pointer disabled:opacity-50"
                        title="Forçar conferência dos itens e liberação para faturamento (LFT) no Hórus"
                      >
                        {forcingHorusOrderId === selectedOrder.cod_ped_venda ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Zap className="h-3.5 w-3.5 text-amber-600" />
                        )}
                        Forçar LFT Hórus
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setSelectedOrder(null)}
                      className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
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

      {/* ─── MODAL: PRÉ-VALIDAÇÃO + CONFIRMAR ENVIO ─────────── */}
      {sendModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-3 p-5 border-b border-slate-100 dark:border-slate-800">
              <div className="p-2.5 rounded-xl bg-violet-100 dark:bg-violet-950/40 shrink-0">
                <Truck className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Enviar WMS</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  Pedido #{sendModal.order.cod_ped_venda} — {sendModal.order.nom_cli} | Filial {selectedFilial}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setSendModal(null); setPreflight(null); }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body — check-list */}
            <div className="flex-1 overflow-y-auto p-5 space-y-2">
              {loadingPreflight && (
                <div className="flex flex-col items-center justify-center py-8 gap-3 text-slate-400">
                  <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
                  <p className="text-sm font-medium">Validando pedido no Horus...</p>
                </div>
              )}

              {!loadingPreflight && !preflight && (
                <p className="text-xs text-slate-400 text-center py-4">Aguardando validação...</p>
              )}

              {!loadingPreflight && preflight && (
                <>
                  {/* Resultado global */}
                  <div className={`rounded-xl px-4 py-2.5 flex items-center gap-2 text-sm font-semibold mb-3 ${
                    preflight.can_send
                      ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                      : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800'
                  }`}>
                    {preflight.can_send
                      ? <><CheckCircle className="h-4 w-4 shrink-0" /> Tudo certo! Pedido pronto para envio.</>
                      : <><XCircle className="h-4 w-4 shrink-0" /> Há problemas que impedem o envio. Corrija e tente novamente.</>
                    }
                  </div>

                  {/* Lista de checks */}
                  <div className="space-y-1.5">
                    {preflight.checks.map((c, i) => (
                      <div
                        key={`${c.key}-${i}`}
                        className={`rounded-xl px-3.5 py-2.5 border text-xs ${
                          c.status === 'ok'
                            ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900'
                            : c.status === 'error'
                            ? 'bg-rose-50/80 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800'
                            : 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5 shrink-0">
                            {c.status === 'ok' && <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />}
                            {c.status === 'error' && <XCircle className="h-3.5 w-3.5 text-rose-500" />}
                            {c.status === 'warning' && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className={`font-semibold ${
                              c.status === 'ok' ? 'text-emerald-700 dark:text-emerald-400'
                              : c.status === 'error' ? 'text-rose-700 dark:text-rose-400'
                              : 'text-amber-700 dark:text-amber-400'
                            }`}>{c.label}</p>
                            <p className="text-slate-600 dark:text-slate-400 mt-0.5 break-words leading-relaxed">{formatLogisticsDetail(c.detail)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Resumo de itens (opcional) */}
                  {preflight.items && preflight.items.length > 0 && (
                    <details className="mt-2 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                      <summary className="px-3.5 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                        Ver {preflight.items.length} item(ns) do pedido
                      </summary>
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {preflight.items.map((it, idx) => (
                          <div key={idx} className="px-3.5 py-1.5 flex justify-between items-center text-xs">
                            <span className="font-mono text-violet-700 dark:text-violet-300 mr-2">{String(it.cod_item || '')}</span>
                            <span className="flex-1 text-slate-700 dark:text-slate-300 truncate">{String(it.nom_item || '—')}</span>
                            <span className="ml-2 text-slate-500 whitespace-nowrap">x{Number(it.qtd || 0).toFixed(0)}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-3 p-5 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => { setSendModal(null); setPreflight(null); }}
                disabled={sendingLogistics}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSendToLogistics}
                disabled={sendingLogistics || loadingPreflight || !preflight?.can_send}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {sendingLogistics ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {sendingLogistics ? 'Enviando ao WMS...' : loadingPreflight ? 'Validando...' : !preflight?.can_send && preflight ? 'Corrija os erros' : 'Enviar WMS'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL DE SINCRONIZAÇÃO E CONCILIAÇÃO COM WMS ─────────────── */}
      {syncModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-violet-100 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 flex items-center justify-center font-bold">
                  <Truck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Sincronização com WMS MKT
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Concilia pedidos já criados na logística para evitar duplicidade
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSyncModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Conteúdo */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Esta rotina consulta a API do WMS no período selecionado, localiza as remessas criadas e atualiza o número do pedido WMS (<span className="font-mono font-bold text-violet-600 dark:text-violet-400">id_ord_sys_log</span>) e a situação correspondente no Cronuz.
              </div>

              {/* Atalhos Rápidos */}
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                  Atalhos de Período
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: '7 dias', days: 7 },
                    { label: '15 dias', days: 15 },
                    { label: '30 dias', days: 30 },
                    { label: '60 dias', days: 60 },
                  ].map(p => (
                    <button
                      key={p.days}
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setDate(d.getDate() - p.days);
                        setSyncStartDate(d.toISOString().split('T')[0]);
                        setSyncEndDate(new Date().toISOString().split('T')[0]);
                      }}
                      className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors text-center"
                    >
                      Últimos {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Filtro de Datas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Data Inicial
                  </label>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs">
                    <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
                    <input
                      type="date"
                      value={syncStartDate}
                      onChange={e => setSyncStartDate(e.target.value)}
                      className="bg-transparent w-full text-slate-900 dark:text-white focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Data Final
                  </label>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs">
                    <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
                    <input
                      type="date"
                      value={syncEndDate}
                      onChange={e => setSyncEndDate(e.target.value)}
                      className="bg-transparent w-full text-slate-900 dark:text-white focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Botões de Ação: Conciliação e Conferência LFT */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleExecuteSyncWms}
                  disabled={syncingWms || checkingWms}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold shadow-md shadow-violet-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {syncingWms ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {syncingWms ? 'Conciliando...' : '1. Conciliar com WMS'}
                </button>

                <button
                  type="button"
                  onClick={() => handleExecuteProcessCheck()}
                  disabled={syncingWms || checkingWms}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {checkingWms ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
                  {checkingWms ? 'Conferindo no Hórus...' : '2. Conferir e Liberar LFT'}
                </button>
              </div>

              {/* Feedback de Conferência */}
              {checkResult && (
                <div className="mt-4 p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-xs">
                    <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>{checkResult.message}</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-white/80 dark:bg-slate-900/60 p-2 rounded-xl border border-emerald-100 dark:border-emerald-900/40">
                      <span className="text-[10px] text-slate-500 block uppercase font-bold">Processados</span>
                      <span className="text-base font-black text-slate-900 dark:text-white">{checkResult.processed_count}</span>
                    </div>
                    <div className="bg-white/80 dark:bg-slate-900/60 p-2 rounded-xl border border-emerald-100 dark:border-emerald-900/40">
                      <span className="text-[10px] text-slate-500 block uppercase font-bold">Conferidos (LFT)</span>
                      <span className="text-base font-black text-emerald-600 dark:text-emerald-400">{checkResult.conferred_count}</span>
                    </div>
                    <div className="bg-white/80 dark:bg-slate-900/60 p-2 rounded-xl border border-emerald-100 dark:border-emerald-900/40">
                      <span className="text-[10px] text-slate-500 block uppercase font-bold">Falhas/Alertas</span>
                      <span className="text-base font-black text-rose-600 dark:text-rose-400">
                        {checkResult.errors_count}
                      </span>
                    </div>
                  </div>

                  {checkResult.results && checkResult.results.length > 0 && (
                    <div className="max-h-40 overflow-y-auto divide-y divide-emerald-100 dark:divide-emerald-900/30 rounded-xl border border-emerald-200/50 dark:border-emerald-900/40 bg-white/50 dark:bg-slate-900/40">
                      {checkResult.results.map((r, idx) => (
                        <div key={idx} className="p-2 flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            Pedido #{r.cod_ped_venda}
                          </span>
                          <span className="text-[11px] text-slate-600 dark:text-slate-400">
                            {r.items_checked !== undefined ? `${r.items_checked} itens • ${r.volumes} vol` : ''}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 font-bold uppercase">
                            {r.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Feedback de Resultado */}
              {syncResult && (
                <div className="mt-4 p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-xs">
                    <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>{syncResult.message}</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-white/80 dark:bg-slate-900/60 p-2 rounded-xl border border-emerald-100 dark:border-emerald-900/40">
                      <span className="text-[10px] text-slate-500 block uppercase font-bold">WMS Total</span>
                      <span className="text-base font-black text-slate-900 dark:text-white">{syncResult.total_wms}</span>
                    </div>
                    <div className="bg-white/80 dark:bg-slate-900/60 p-2 rounded-xl border border-emerald-100 dark:border-emerald-900/40">
                      <span className="text-[10px] text-slate-500 block uppercase font-bold">Conciliados</span>
                      <span className="text-base font-black text-emerald-600 dark:text-emerald-400">{syncResult.synced_count}</span>
                    </div>
                    <div className="bg-white/80 dark:bg-slate-900/60 p-2 rounded-xl border border-emerald-100 dark:border-emerald-900/40">
                      <span className="text-[10px] text-slate-500 block uppercase font-bold">Criados/Atu.</span>
                      <span className="text-base font-black text-violet-600 dark:text-violet-400">
                        {syncResult.created_count}/{syncResult.updated_count}
                      </span>
                    </div>
                  </div>

                  {syncResult.orders && syncResult.orders.length > 0 && (
                    <div className="max-h-40 overflow-y-auto divide-y divide-emerald-100 dark:divide-emerald-900/30 rounded-xl border border-emerald-200/50 dark:border-emerald-900/40 bg-white/50 dark:bg-slate-900/40">
                      {syncResult.orders.map((o, idx) => (
                        <div key={idx} className="p-2 flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            Hórus #{o.cod_ped_venda}
                          </span>
                          <span className="font-mono text-violet-700 dark:text-violet-300 font-semibold">
                            WMS #{o.id_ord_sys_log || '—'}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 font-bold uppercase">
                            {o.situation}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setSyncModalOpen(false);
                  fetchLogisticsQueue();
                }}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
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
