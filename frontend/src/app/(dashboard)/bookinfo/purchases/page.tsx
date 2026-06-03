'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  Plus, Edit2, Trash2, BookOpen, X, Loader2, Search, Calendar, 
  ChevronDown, ChevronUp, RefreshCw, ArrowLeft, CheckCircle2, 
  AlertTriangle, AlertCircle, Info, Clock, ExternalLink 
} from 'lucide-react';
import { toast } from 'sonner';
import { getToken } from '@/lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const formatCNPJ = (value: string) => {
  const digits = value.replace(/\D/g, '');
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, '$1.$2.$3/$4-$5')
    .substring(0, 18);
};

const isTransmissionFinalized = (t: any) => {
  if (!t) return false;
  if (t.status !== 'SYNCED') return false;
  if (!t.items || t.items.length === 0) return false;
  
  const finalizedStatuses = ['RESERVADO_TOTAL', 'ATENDIDO', 'SEM_ESTOQUE', 'CANCELADO', 'REJEITADO'];
  return t.items.every((item: any) => 
    item.situacao_retorno && finalizedStatuses.includes(item.situacao_retorno)
  );
};

export default function BookinfoPurchasesPage() {
  const [viewMode, setViewMode] = useState<'LIST' | 'SUPPLIER_DETAIL' | 'ORDER_DETAIL'>('LIST');
  const [activeTab, setActiveTab] = useState<'pending' | 'integrated'>('pending');
  const [activeMainTab, setActiveMainTab] = useState<'suppliers' | 'global_orders'>('suppliers');
  const [allTransmissions, setAllTransmissions] = useState<any[]>([]);
  const [loadingAllTransmissions, setLoadingAllTransmissions] = useState(false);
  const [globalFilters, setGlobalFilters] = useState({ search: '', status: 'ALL' });
  const [orderDetailBackView, setOrderDetailBackView] = useState<'SUPPLIER_DETAIL' | 'GLOBAL'>('SUPPLIER_DETAIL');

  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    supplier_name: '',
    document_origin: '',
    document_destination: '',
    start_date: '',
    status_pedido_compra: 'AE',
    integrador_compra: 'BOOKINFO'
  });

  // Selected supplier & filters
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [horusOrders, setHorusOrders] = useState<any[]>([]);
  const [searchingHorus, setSearchingHorus] = useState(false);
  const [horusFilters, setHorusFilters] = useState({
    data_ini: '',
    data_fim: '',
    status: 'AE',
    transmitido: 'N'
  });

  const [transmissions, setTransmissions] = useState<any[]>([]);
  const [loadingTransmissions, setLoadingTransmissions] = useState(false);
  const [sendingOrderId, setSendingOrderId] = useState<number | null>(null);
  const [syncingTransmissionId, setSyncingTransmissionId] = useState<number | null>(null);

  // Selected order for detailed view
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  const fetchTransmissions = useCallback(async (supplierId: number) => {
    try {
      setLoadingTransmissions(true);
      const token = getToken();
      const res = await fetch(`${API_URL}/bookinfo-purchases/suppliers/${supplierId}/transmissions`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Falha ao buscar transmissões.');
      const data = await res.json();
      setTransmissions(data);

      // If we are in detail view, update the transmission log
      if (selectedOrder && selectedOrder.transmission) {
        const matchingTx = data.find((tx: any) => tx.id === selectedOrder.transmission.id);
        if (matchingTx) {
          setSelectedOrder((prev: any) => ({
            ...prev,
            transmission: matchingTx
          }));
        }
      }
    } catch (error) {
      console.error('Erro ao buscar transmissões:', error);
    } finally {
      setLoadingTransmissions(false);
    }
  }, [selectedOrder]);

  const handleSendToBookinfo = async (order: any) => {
    if (!selectedSupplier) return;
    const compraConsig = (order.COMPRA_CONSIG || '').toString().trim().toUpperCase();
    if (compraConsig !== 'N' && compraConsig !== 'S') {
      toast.error(`O pedido não é uma compra normal (N) nem uma consignação (S) (COMPRA_CONSIG=${order.COMPRA_CONSIG || 'vazio'}).`);
      return;
    }
    try {
      setSendingOrderId(order.COD_PEDIDO);
      const token = getToken();
      const res = await fetch(`${API_URL}/bookinfo-purchases/suppliers/${selectedSupplier.id}/transmissions/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          cod_pedido: order.COD_PEDIDO,
          order_data: order
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Falha ao enviar pedido.');
      }

      toast.success(data.message || 'Pedido enviado com sucesso para a Bookinfo.');
      
      // Refresh transmissions list
      const txRes = await fetch(`${API_URL}/bookinfo-purchases/suppliers/${selectedSupplier.id}/transmissions`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      let updatedTxList: any[] = [];
      if (txRes.ok) {
        updatedTxList = await txRes.json();
        setTransmissions(updatedTxList);
      }
      
      // Update details view if active
      if (viewMode === 'ORDER_DETAIL' && selectedOrder && (selectedOrder.horusOrder?.COD_PEDIDO === order.COD_PEDIDO || selectedOrder.transmission?.cod_pedido === order.COD_PEDIDO)) {
        const matchingTx = updatedTxList.find((tx: any) => tx.cod_pedido === order.COD_PEDIDO);
        setSelectedOrder((prev: any) => ({
          ...prev,
          transmission: matchingTx
        }));
      }

      // Also refresh Horus list
      handleSearchHorus(selectedSupplier.id);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao enviar pedido para Bookinfo.');
      if (selectedSupplier) {
        fetchTransmissions(selectedSupplier.id);
      }
    } finally {
      setSendingOrderId(null);
    }
  };

  const handleSyncTransmission = async (transmissionId: number, targetSupplierId?: number) => {
    const sId = targetSupplierId || selectedSupplier?.id;
    if (!sId) {
      toast.error('Fornecedor não selecionado.');
      return;
    }
    try {
      setSyncingTransmissionId(transmissionId);
      const token = getToken();
      const res = await fetch(`${API_URL}/bookinfo-purchases/suppliers/${sId}/transmissions/${transmissionId}/sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Falha ao sincronizar.');
      }

      toast.success(data.message || 'Retorno sincronizado com sucesso.');
      
      // Refresh transmissions
      if (activeMainTab === 'global_orders') {
        fetchAllTransmissions();
      }

      let updatedTxList: any[] = [];
      const txRes = await fetch(`${API_URL}/bookinfo-purchases/suppliers/${sId}/transmissions`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (txRes.ok) {
        updatedTxList = await txRes.json();
        if (selectedSupplier && selectedSupplier.id === sId) {
          setTransmissions(updatedTxList);
        }
      }

      // Update details view if active
      if (viewMode === 'ORDER_DETAIL' && selectedOrder && selectedOrder.transmission?.id === transmissionId) {
        const matchingTx = updatedTxList.find((tx: any) => tx.id === transmissionId);
        if (matchingTx) {
          setSelectedOrder((prev: any) => ({
            ...prev,
            transmission: matchingTx
          }));
        }
      }
    } catch (error: any) {
      toast.error(error.message || 'Erro ao sincronizar retorno.');
    } finally {
      setSyncingTransmissionId(null);
    }
  };

  const formatDateInput = (dateVal: any): string => {
    if (!dateVal) return '';
    // Se for um objeto Date, usa toISOString() para garantir formato ISO
    if (dateVal instanceof Date) return dateVal.toISOString().split('T')[0];
    // Se for string no formato dd/mm/yyyy, converte para yyyy-mm-dd
    const strVal = String(dateVal);
    if (/^\d{2}\/\d{2}\/\d{4}/.test(strVal)) {
      const [d, m, y] = strVal.split('/');
      return `${y}-${m}-${d}`;
    }
    // Caso seja ISO string ou qualquer outro formato com T
    return strVal.split('T')[0];
  };

  const fetchSuppliers = useCallback(async () => {
    try {
      setLoading(true);
      const token = getToken();
      const res = await fetch(`${API_URL}/bookinfo-purchases/suppliers`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Falha');
      const data = await res.json();
      setSuppliers(data);
    } catch (error) {
      toast.error('Erro ao buscar fornecedores Bookinfo.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAllTransmissions = useCallback(async () => {
    try {
      setLoadingAllTransmissions(true);
      const token = getToken();
      const res = await fetch(`${API_URL}/bookinfo-purchases/suppliers/transmissions/all`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Falha ao buscar transmissões.');
      const data = await res.json();
      setAllTransmissions(data);
    } catch (error) {
      console.error('Erro ao buscar transmissões globais:', error);
    } finally {
      setLoadingAllTransmissions(false);
    }
  }, []);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  useEffect(() => {
    if (activeMainTab === 'global_orders') {
      fetchAllTransmissions();
    }
  }, [activeMainTab, fetchAllTransmissions]);

  const handleOpenModal = (supplier: any = null) => {
    if (supplier) {
      setEditingId(supplier.id);
      setFormData({
        supplier_name: supplier.supplier_name || '',
        document_origin: formatCNPJ(supplier.document_origin || ''),
        document_destination: formatCNPJ(supplier.document_destination || ''),
        start_date: supplier.start_date ? String(supplier.start_date).split('T')[0] : '',
        status_pedido_compra: supplier.status_pedido_compra || 'AE',
        integrador_compra: supplier.integrador_compra || 'BOOKINFO'
      });
    } else {
      setEditingId(null);
      setFormData({
        supplier_name: '',
        document_origin: '',
        document_destination: '',
        start_date: '',
        status_pedido_compra: 'AE',
        integrador_compra: 'BOOKINFO'
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const token = getToken();
      
      const payload = {
        ...formData,
        start_date: formData.start_date ? new Date(formData.start_date).toISOString() : null
      };

      if (editingId) {
        const res = await fetch(`${API_URL}/bookinfo-purchases/suppliers/${editingId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || 'Falha ao atualizar o fornecedor.');
        }
        toast.success('Fornecedor atualizado com sucesso.');
      } else {
        const res = await fetch(`${API_URL}/bookinfo-purchases/suppliers`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || 'Falha ao criar o fornecedor.');
        }
        toast.success('Fornecedor cadastrado com sucesso.');
      }
      
      handleCloseModal();
      fetchSuppliers();
    } catch (err: any) {
      toast.error(err.message || 'Ocorreu um erro ao salvar o fornecedor.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Deseja realmente deletar este fornecedor?')) return;
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/bookinfo-purchases/suppliers/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Falha ao deletar');
      toast.success('Fornecedor deletado.');
      fetchSuppliers();
    } catch (error) {
      toast.error('Houve um erro ao deletar.');
    }
  };

  const handleSearchHorus = async (supplierId: number, filters: any = null) => {
    try {
      setSearchingHorus(true);
      const token = getToken();
      
      const params = new URLSearchParams();
      const queryFilters = filters || horusFilters;
      if (queryFilters.data_ini) params.append('data_ini', queryFilters.data_ini);
      if (queryFilters.data_fim) params.append('data_fim', queryFilters.data_fim);
      if (queryFilters.status) params.append('status', queryFilters.status);
      if (queryFilters.transmitido) params.append('transmitido', queryFilters.transmitido);

      const res = await fetch(`${API_URL}/bookinfo-purchases/suppliers/${supplierId}/search-horus?${params.toString()}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Falha ao buscar pedidos no Horus.');
      }

      const result = await res.json();
      setHorusOrders(result.pedidos || []);
      toast.success(`${result.pedidos?.length || 0} pedidos encontrados.`);
      fetchSuppliers();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao buscar pedidos no Horus.');
    } finally {
      setSearchingHorus(false);
    }
  };

  const handleSelectSupplier = (spl: any) => {
    setSelectedSupplier(spl);
    const iniDate = spl.start_date ? formatDateInput(spl.start_date) : formatDateInput(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    const fimDate = formatDateInput(new Date());
    const currentFilters = {
      data_ini: iniDate,
      data_fim: fimDate,
      status: spl.status_pedido_compra || 'AE',
      transmitido: 'N'
    };
    setHorusFilters(currentFilters);
    setHorusOrders([]);
    setViewMode('SUPPLIER_DETAIL');
    setActiveTab('pending');
    fetchTransmissions(spl.id);
    handleSearchHorus(spl.id, currentFilters);
  };

  const handleSearchClick = () => {
    if (!selectedSupplier) return;
    const currentTransmitido = activeTab === 'pending' ? 'N' : 'T';
    const updatedFilters = {
      ...horusFilters,
      transmitido: currentTransmitido
    };
    setHorusFilters(updatedFilters);
    handleSearchHorus(selectedSupplier.id, updatedFilters);
    fetchTransmissions(selectedSupplier.id);
  };

  const handleTabChange = (tab: 'pending' | 'integrated') => {
    setActiveTab(tab);
    if (!selectedSupplier) return;
    const targetTransmitido = tab === 'pending' ? 'N' : 'T';
    const updatedFilters = {
      ...horusFilters,
      transmitido: targetTransmitido
    };
    setHorusFilters(updatedFilters);
    handleSearchHorus(selectedSupplier.id, updatedFilters);
  };

  const getFilteredTransmissions = () => {
    return transmissions.filter(t => {
      if (!t.sent_at) return false;
      const sentDateStr = t.sent_at.substring(0, 10);
      const start = horusFilters.data_ini;
      const end = horusFilters.data_fim;
      if (start && sentDateStr < start) return false;
      if (end && sentDateStr > end) return false;
      return true;
    });
  };

  const handleDetailOrderFromHorus = (order: any) => {
    setSelectedOrder({
      horusOrder: order,
      transmission: transmissions.find(t => t.cod_pedido === order.COD_PEDIDO)
    });
    setOrderDetailBackView('SUPPLIER_DETAIL');
    setViewMode('ORDER_DETAIL');
  };

  const handleDetailOrderFromTransmission = (t: any) => {
    setSelectedOrder({
      horusOrder: horusOrders.find(o => o.COD_PEDIDO === t.cod_pedido),
      transmission: t
    });
    setOrderDetailBackView('SUPPLIER_DETAIL');
    setViewMode('ORDER_DETAIL');
  };

  const handleSearchSingleOrderHorus = async (codPedido: number, sentAtStr: string) => {
    if (!selectedSupplier) return;
    try {
      setSearchingHorus(true);
      const orderDate = new Date(sentAtStr);
      const iniDate = formatDateInput(new Date(orderDate.getTime() - 2 * 24 * 60 * 60 * 1000));
      const fimDate = formatDateInput(new Date(orderDate.getTime() + 2 * 24 * 60 * 60 * 1000));
      
      const token = getToken();
      const params = new URLSearchParams();
      params.append('data_ini', iniDate);
      params.append('data_fim', fimDate);
      params.append('status', 'T');
      params.append('transmitido', 'T');
      
      const res = await fetch(`${API_URL}/bookinfo-purchases/suppliers/${selectedSupplier.id}/search-horus?${params.toString()}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!res.ok) {
        throw new Error('Falha ao buscar no Horus.');
      }
      const result = await res.json();
      const found = result.pedidos?.find((o: any) => o.COD_PEDIDO === codPedido);
      if (found) {
        setHorusOrders(prev => {
          const filtered = prev.filter(o => o.COD_PEDIDO !== codPedido);
          return [...filtered, found];
        });
        setSelectedOrder((prev: any) => ({
          ...prev,
          horusOrder: found
        }));
        toast.success('Dados do pedido carregados do Horus.');
      } else {
        toast.error('Pedido não encontrado no Horus para o período.');
      }
    } catch (error: any) {
      toast.error(error.message || 'Erro ao carregar dados do Horus.');
    } finally {
      setSearchingHorus(false);
    }
  };

  const getReturnSituationBadge = (situation: string | null) => {
    if (!situation) return <span className="text-slate-400 font-normal">-</span>;
    
    const statusMap: Record<string, { label: string; class: string }> = {
      RESERVADO_TOTAL: { label: 'Reservado Total', class: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-350 dark:border-emerald-900/50' },
      ATENDIDO: { label: 'Atendido', class: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-350 dark:border-emerald-900/50' },
      SEM_ESTOQUE: { label: 'Sem Estoque', class: 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/30 dark:text-rose-350 dark:border-rose-900/50' },
      CANCELADO: { label: 'Cancelado', class: 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/30 dark:text-rose-350 dark:border-rose-900/50' },
      REJEITADO: { label: 'Rejeitado', class: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-950/30 dark:text-red-350 dark:border-red-900/50' },
      PENDING: { label: 'Pendente', class: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/30 dark:text-amber-350 dark:border-amber-900/50' },
      SENT: { label: 'Enviado', class: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/30 dark:text-blue-350 dark:border-blue-900/50' }
    };
    
    const config = statusMap[situation] || { label: situation, class: 'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800/70 dark:text-slate-300 dark:border-slate-700' };
    
    return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold border ${config.class}`}>
        {config.label}
      </span>
    );
  };

  const getTransmissionStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; class: string }> = {
      SENT: { label: 'Enviado', class: 'bg-amber-100 text-amber-850 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/50' },
      SYNCED: { label: 'Sincronizado', class: 'bg-emerald-100 text-emerald-850 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/50' },
      ERROR: { label: 'Erro', class: 'bg-rose-100 text-rose-850 border-rose-200 dark:bg-rose-955/30 dark:text-rose-300 dark:border-rose-900/50' }
    };
    const config = statusMap[status] || { label: status, class: 'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-350' };
    return (
      <span className={`inline-flex items-center px-3 py-1 rounded-lg text-xs font-bold border ${config.class}`}>
        {config.label}
      </span>
    );
  };

  const getFilteredAllTransmissions = () => {
    return allTransmissions.filter(t => {
      const searchLower = globalFilters.search.toLowerCase();
      const codeMatch = t.cod_pedido.toString().includes(searchLower) || (t.bookinfo_pedido_id && t.bookinfo_pedido_id.toLowerCase().includes(searchLower));
      const supplierMatch = t.supplier_name.toLowerCase().includes(searchLower);
      
      const textMatch = !globalFilters.search || codeMatch || supplierMatch;
      const statusMatch = globalFilters.status === 'ALL' || t.status === globalFilters.status;
      
      return textMatch && statusMatch;
    });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* 1. VIEW MODE: LIST */}
      {viewMode === 'LIST' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-[var(--color-primary-base)]" />
              Fornecedores Bookinfo (Compras)
            </h1>
            <p className="text-slate-500 text-sm mt-1 dark:text-slate-400">
              Gerencie as integrações e faturamentos de fornecedores pela plataforma Bookinfo.
            </p>
          </div>

          <div className="border-b border-slate-200 dark:border-slate-800 flex gap-6">
            <button
              onClick={() => setActiveMainTab('suppliers')}
              className={`pb-4 px-1 text-sm font-semibold border-b-2 transition-all ${
                activeMainTab === 'suppliers'
                  ? 'border-[var(--color-primary-base)] text-[var(--color-primary-base)]'
                  : 'border-transparent text-slate-400 hover:text-slate-650 dark:hover:text-slate-300'
              }`}
            >
              Fornecedores
            </button>
            <button
              onClick={() => setActiveMainTab('global_orders')}
              className={`pb-4 px-1 text-sm font-semibold border-b-2 transition-all ${
                activeMainTab === 'global_orders'
                  ? 'border-[var(--color-primary-base)] text-[var(--color-primary-base)]'
                  : 'border-transparent text-slate-400 hover:text-slate-650 dark:hover:text-slate-300'
              }`}
            >
              Pedidos Sincronizados (Global)
            </button>
          </div>

          {activeMainTab === 'suppliers' && (
            <>
              <div className="flex flex-col md:flex-row items-start md:items-center justify-end w-full">
                <button 
                   onClick={() => handleOpenModal()} 
                   className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-semibold py-2.5 px-5 rounded-xl transition-all shadow-lg shadow-[var(--color-primary-base)]/20 hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Adicionar Fornecedor
                </button>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:bg-slate-900/40 dark:border-slate-800 w-full">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Fornecedor</th>
                        <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">CNPJ Emissor</th>
                        <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">CNPJ Destino</th>
                        <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Integrador</th>
                        <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Última Busca</th>
                        <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Data de Início</th>
                        <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
                      {loading && (
                        <tr>
                          <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[var(--color-primary-base)]" />
                            Carregando fornecedores...
                          </td>
                        </tr>
                      )}
                      
                      {!loading && suppliers.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                            Nenhum fornecedor cadastrado ainda.
                          </td>
                        </tr>
                      )}

                      {!loading && suppliers.map((spl) => (
                        <tr key={spl.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                          <td className="px-6 py-4 font-medium text-slate-900 dark:text-white flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-[var(--color-primary-base)]/10 text-[var(--color-primary-base)] flex items-center justify-center shrink-0">
                              <BookOpen className="h-4 w-4" />
                            </div>
                            {spl.supplier_name || '-'}
                          </td>
                          <td className="px-6 py-4 text-slate-600 dark:text-slate-400 font-mono text-sm">
                            {spl.document_origin ? formatCNPJ(spl.document_origin) : '-'}
                          </td>
                          <td className="px-6 py-4 text-slate-600 dark:text-slate-400 font-mono text-sm">
                            {spl.document_destination ? formatCNPJ(spl.document_destination) : '-'}
                          </td>
                          <td className="px-6 py-4 text-slate-600 dark:text-slate-400 font-mono text-sm">
                            <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold">
                              {spl.integrador_compra || 'HORUS'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-slate-600 dark:text-slate-400 text-sm font-mono">
                            {spl.last_sync_at ? new Date(spl.last_sync_at).toLocaleString() : '-'}
                          </td>
                          <td className="px-6 py-4 text-slate-600 dark:text-slate-400 text-sm">
                            {spl.start_date ? new Date(spl.start_date).toLocaleDateString() : '-'}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-1">
                               <button 
                                  onClick={() => handleSelectSupplier(spl)} 
                                  className="p-2 text-slate-400 hover:text-teal-500 hover:bg-teal-500/10 rounded-lg transition-colors" 
                                  title="Consultar Pedidos Horus"
                               >
                                 <Search className="h-4 w-4" />
                               </button>
                               <button onClick={() => handleOpenModal(spl)} className="p-2 text-slate-400 hover:text-[var(--color-primary-base)] hover:bg-[var(--color-primary-base)]/10 rounded-lg transition-colors" title="Editar">
                                 <Edit2 className="h-4 w-4" />
                               </button>
                               <button onClick={() => handleDelete(spl.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-55 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Deletar">
                                 <Trash2 className="h-4 w-4" />
                               </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {activeMainTab === 'global_orders' && (
            <>
              <div className="bg-slate-50 dark:bg-slate-900/20 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl flex flex-wrap gap-4 items-end animate-in fade-in duration-150">
                <div className="flex-1 min-w-[200px] space-y-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block">Buscar Pedido ou Fornecedor</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Código do pedido, ID Bookinfo ou nome do fornecedor..." 
                      className="w-full bg-white border border-slate-200 dark:border-slate-700 dark:bg-slate-900/50 dark:text-white rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)]"
                      value={globalFilters.search}
                      onChange={(e) => setGlobalFilters({ ...globalFilters, search: e.target.value })}
                    />
                  </div>
                </div>
                
                <div className="w-[180px] space-y-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block">Status Integração</label>
                  <select
                    className="w-full bg-white border border-slate-200 dark:border-slate-700 dark:bg-slate-900/50 dark:text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)]"
                    value={globalFilters.status}
                    onChange={(e) => setGlobalFilters({ ...globalFilters, status: e.target.value })}
                  >
                    <option value="ALL">Todos os status</option>
                    <option value="SENT">SENT - Enviado</option>
                    <option value="SYNCED">SYNCED - Sincronizado</option>
                    <option value="ERROR">ERROR - Erro</option>
                  </select>
                </div>

                <button
                  onClick={fetchAllTransmissions}
                  disabled={loadingAllTransmissions}
                  className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-semibold py-2 px-5 rounded-xl transition-all disabled:opacity-50 flex items-center gap-2 h-[38px] shrink-0 shadow-md shadow-[var(--color-primary-base)]/15"
                >
                  <RefreshCw className={`h-4 w-4 ${loadingAllTransmissions ? 'animate-spin' : ''}`} />
                  {loadingAllTransmissions ? 'Atualizando...' : 'Atualizar'}
                </button>
              </div>

              <div className="space-y-4">
                {loadingAllTransmissions && (
                  <div className="py-20 text-center text-slate-500">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-[var(--color-primary-base)]" />
                    Carregando todos os pedidos sincronizados...
                  </div>
                )}

                {!loadingAllTransmissions && getFilteredAllTransmissions().length === 0 && (
                  <div className="py-20 text-center text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900/20">
                    Nenhum pedido sincronizado encontrado.
                  </div>
                )}

                {!loadingAllTransmissions && getFilteredAllTransmissions().map((t: any, idx: number) => (
                  <div key={t.id || idx} className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900/40 hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-200 p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 shadow-sm">
                    <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Pedido Horus</p>
                        <p className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">#{t.cod_pedido}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Fornecedor</p>
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mt-0.5">{t.supplier_name}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Bookinfo ID</p>
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 font-mono mt-0.5">{t.bookinfo_pedido_id || '-'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Status Integração</p>
                        <div className="mt-0.5">{getTransmissionStatusBadge(t.status)}</div>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Enviado em</p>
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mt-0.5">
                          {t.sent_at ? new Date(t.sent_at).toLocaleDateString() : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Última Sincronização</p>
                        <p className="text-sm font-semibold text-slate-650 dark:text-slate-400 mt-0.5">
                          {t.last_sync_at ? new Date(t.last_sync_at).toLocaleDateString() : '-'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto shrink-0 justify-end border-t border-slate-100 dark:border-slate-800 md:border-transparent pt-4 md:pt-0">
                      <button
                        onClick={() => {
                          const supplier = suppliers.find(s => s.id === t.supplier_id);
                          setSelectedSupplier(supplier || { id: t.supplier_id, supplier_name: t.supplier_name });
                          setSelectedOrder({
                            horusOrder: undefined,
                            transmission: t
                          });
                          setOrderDetailBackView('GLOBAL');
                          setViewMode('ORDER_DETAIL');
                        }}
                        className="flex-1 md:flex-none px-4 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-all text-center"
                      >
                        Detalhar
                      </button>

                      {!isTransmissionFinalized(t) ? (
                        <button
                          onClick={() => handleSyncTransmission(t.id, t.supplier_id)}
                          disabled={syncingTransmissionId === t.id}
                          className="flex-1 md:flex-none px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 shadow-sm shadow-teal-600/10"
                        >
                          {syncingTransmissionId === t.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                          )}
                          Sincronizar
                        </button>
                      ) : (
                        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-450 text-xs font-semibold px-2 py-1">
                          <CheckCircle2 className="h-4 w-4" />
                          Finalizado
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* 2. VIEW MODE: SUPPLIER_DETAIL */}
      {viewMode === 'SUPPLIER_DETAIL' && selectedSupplier && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <button 
              onClick={() => setViewMode('LIST')} 
              className="flex items-center gap-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Voltar para fornecedores</span>
            </button>
          </div>

          <div className="bg-white border border-slate-200 dark:bg-slate-900/40 dark:border-slate-800 p-6 rounded-2xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-2xl bg-[var(--color-primary-base)]/10 text-[var(--color-primary-base)] flex items-center justify-center shrink-0">
                <BookOpen className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">{selectedSupplier.supplier_name}</h2>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono">
                  <span>Emissor: {selectedSupplier.document_origin ? formatCNPJ(selectedSupplier.document_origin) : '-'}</span>
                  <span className="hidden md:inline">•</span>
                  <span>Destino: {selectedSupplier.document_destination ? formatCNPJ(selectedSupplier.document_destination) : '-'}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 text-xs font-medium">
              <div className="bg-slate-50 dark:bg-slate-850 px-4 py-2.5 rounded-xl border border-slate-100 dark:border-slate-800/40">
                <p className="text-slate-450 uppercase tracking-widest text-[9px]">Pedidos Horus</p>
                <p className="text-base font-bold text-slate-850 dark:text-slate-200 mt-0.5">{horusOrders.length}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-850 px-4 py-2.5 rounded-xl border border-slate-100 dark:border-slate-800/40">
                <p className="text-slate-455 uppercase tracking-widest text-[9px]">Integrados (Total)</p>
                <p className="text-base font-bold text-slate-850 dark:text-slate-200 mt-0.5">{transmissions.length}</p>
              </div>
              <div className="bg-slate-50 dark:bg-slate-850 px-4 py-2.5 rounded-xl border border-slate-100 dark:border-slate-800/40">
                <p className="text-slate-450 uppercase tracking-widest text-[9px]">Sincronizados (OK)</p>
                <p className="text-base font-bold text-emerald-600 dark:text-emerald-450 mt-0.5">
                  {transmissions.filter(t => t.status === 'SYNCED').length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-900/20 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[150px] space-y-1">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block">Data Inicial</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input 
                  type="date" 
                  className="w-full bg-white border border-slate-200 dark:border-slate-700 dark:bg-slate-900/50 dark:text-white rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)]"
                  value={horusFilters.data_ini}
                  onChange={(e) => setHorusFilters({...horusFilters, data_ini: e.target.value})}
                />
              </div>
            </div>
            
            <div className="flex-1 min-w-[150px] space-y-1">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block">Data Final</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input 
                  type="date" 
                  className="w-full bg-white border border-slate-200 dark:border-slate-700 dark:bg-slate-900/50 dark:text-white rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)]"
                  value={horusFilters.data_fim}
                  onChange={(e) => setHorusFilters({...horusFilters, data_fim: e.target.value})}
                />
              </div>
            </div>

            <div className="w-[180px] space-y-1">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block">Status Pedido</label>
              <select
                className="w-full bg-white border border-slate-200 dark:border-slate-700 dark:bg-slate-900/50 dark:text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)]"
                value={horusFilters.status}
                onChange={(e) => setHorusFilters({...horusFilters, status: e.target.value})}
              >
                <option value="AE">AE - Aguardando Entrega</option>
                <option value="AB">AB - Aberto</option>
                <option value="CA">CA - Cancelado</option>
                <option value="AP">AP - Aprovado</option>
                <option value="EE">EE - Em Elaboração</option>
                <option value="AC">AC - Acordo</option>
                <option value="FE">FE - Fechado</option>
              </select>
            </div>

            <button
              onClick={handleSearchClick}
              disabled={searchingHorus}
              className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-semibold py-2 px-5 rounded-xl transition-all disabled:opacity-50 flex items-center gap-2 h-[38px] shrink-0 shadow-md shadow-[var(--color-primary-base)]/15"
            >
              <RefreshCw className={`h-4 w-4 ${searchingHorus ? 'animate-spin' : ''}`} />
              {searchingHorus ? 'Pesquisando...' : 'Pesquisar'}
            </button>
          </div>

          <div className="border-b border-slate-200 dark:border-slate-800 flex gap-6">
            <button
              onClick={() => handleTabChange('pending')}
              className={`pb-4 px-1 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
                activeTab === 'pending'
                  ? 'border-[var(--color-primary-base)] text-[var(--color-primary-base)]'
                  : 'border-transparent text-slate-400 hover:text-slate-655 dark:hover:text-slate-300'
              }`}
            >
              <span>Pedidos Horus (Não Transmitidos)</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === 'pending' ? 'bg-[var(--color-primary-base)]/10 text-[var(--color-primary-base)]' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
              }`}>
                {horusOrders.filter(o => o.TRANSMITIDO !== 'S').length}
              </span>
            </button>

            <button
              onClick={() => handleTabChange('integrated')}
              className={`pb-4 px-1 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
                activeTab === 'integrated'
                  ? 'border-[var(--color-primary-base)] text-[var(--color-primary-base)]'
                  : 'border-transparent text-slate-400 hover:text-slate-655 dark:hover:text-slate-300'
              }`}
            >
              <span>Pedidos Integrados</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === 'integrated' ? 'bg-[var(--color-primary-base)]/10 text-[var(--color-primary-base)]' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
              }`}>
                {getFilteredTransmissions().length}
              </span>
            </button>
          </div>

          <div className="space-y-4">
            {activeTab === 'pending' && (
              <>
                {searchingHorus && (
                  <div className="py-20 text-center text-slate-500">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-[var(--color-primary-base)]" />
                    Buscando pedidos de compra no ERP Horus...
                  </div>
                )}

                {!searchingHorus && horusOrders.filter(o => o.TRANSMITIDO !== 'S').length === 0 && (
                  <div className="py-20 text-center text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900/20">
                    Nenhum pedido de compra localizado para transmissão.
                  </div>
                )}

                {!searchingHorus && horusOrders.filter(o => o.TRANSMITIDO !== 'S').map((order: any, idx: number) => {
                  const t = transmissions.find((tx: any) => tx.cod_pedido === order.COD_PEDIDO);
                  
                  const getStatusBadge = (status: string) => {
                    const statusMap: Record<string, { label: string; class: string }> = {
                      AE: { label: 'Aguardando Entrega', class: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-350' },
                      AB: { label: 'Aberto', class: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-350' },
                      CA: { label: 'Cancelado', class: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-350' },
                      AP: { label: 'Aprovado', class: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-350' },
                      EE: { label: 'Em Elaboração', class: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-350' },
                      AC: { label: 'Acordo', class: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-355' },
                      FE: { label: 'Fechado', class: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-350' }
                    };
                    const config = statusMap[status] || { label: status, class: 'bg-slate-100 text-slate-800' };
                    return (
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${config.class}`}>
                        {config.label}
                      </span>
                    );
                  };

                  const isConsigValid = order.COMPRA_CONSIG === 'N' || order.COMPRA_CONSIG === 'S';
                  return (
                    <div key={order.COD_PEDIDO || idx} className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900/40 hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-200 p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 shadow-sm">
                      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
                        <div>
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Código</p>
                          <p className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">#{order.COD_PEDIDO}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Data Pedido</p>
                          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mt-0.5">{order.DAT_PEDIDO}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Status Horus</p>
                          <p className="mt-0.5">{getStatusBadge(order.STATUS_PEDIDO_COMPRA)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Consignado (Horus)</p>
                          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mt-0.5">
                            {order.COMPRA_CONSIG === 'S' ? 'Sim' : order.COMPRA_CONSIG === 'N' ? 'Não' : `Inválido (${order.COMPRA_CONSIG || 'Nulo'})`}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Qtd Itens</p>
                          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mt-0.5">{order.QTD_ITENS}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Valor Total</p>
                          <p className="text-sm font-bold text-[var(--color-primary-base)] mt-0.5 font-mono">R$ {order.VLR_TOTAL_PEDIDO}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 w-full md:w-auto shrink-0 justify-end border-t border-slate-100 dark:border-slate-800 md:border-transparent pt-4 md:pt-0">
                        <button
                          onClick={() => handleDetailOrderFromHorus(order)}
                          className="flex-1 md:flex-none px-4 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-all text-center"
                        >
                          Detalhar
                        </button>
                        
                        {t ? (
                          getTransmissionStatusBadge(t.status)
                        ) : !isConsigValid ? (
                          <div className="flex items-center gap-1.5 text-red-500 text-xs font-semibold bg-red-500/10 px-3 py-2 rounded-xl border border-red-500/20" title={`Valor de COMPRA_CONSIG (${order.COMPRA_CONSIG || 'Vazio'}) não é N ou S`}>
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                            Não é Compra/Consig
                          </div>
                        ) : (
                          <button
                            onClick={() => handleSendToBookinfo(order)}
                            disabled={sendingOrderId === order.COD_PEDIDO}
                            className="flex-1 md:flex-none px-4 py-2 bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                          >
                            {sendingOrderId === order.COD_PEDIDO ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5 rotate-45" />
                            )}
                            Enviar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {activeTab === 'integrated' && (
              <>
                {loadingTransmissions && (
                  <div className="py-20 text-center text-slate-500">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-[var(--color-primary-base)]" />
                    Carregando pedidos integrados...
                  </div>
                )}

                {!loadingTransmissions && getFilteredTransmissions().length === 0 && (
                  <div className="py-20 text-center text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900/20">
                    Nenhum pedido integrado encontrado para o período selecionado.
                  </div>
                )}

                {!loadingTransmissions && getFilteredTransmissions().map((t: any, idx: number) => {
                  const hOrder = horusOrders.find((o: any) => o.COD_PEDIDO === t.cod_pedido);
                  
                  return (
                    <div key={t.id || idx} className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900/40 hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-200 p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 shadow-sm">
                      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
                        <div>
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Pedido Horus</p>
                          <p className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">#{t.cod_pedido}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Bookinfo ID</p>
                          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 font-mono mt-0.5">{t.bookinfo_pedido_id || '-'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Status Integração</p>
                          <div className="mt-0.5">{getTransmissionStatusBadge(t.status)}</div>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Enviado em</p>
                          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mt-0.5">
                            {t.sent_at ? new Date(t.sent_at).toLocaleDateString() : '-'}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Última Sincronização</p>
                          <p className="text-sm font-semibold text-slate-650 dark:text-slate-400 mt-0.5">
                            {t.last_sync_at ? new Date(t.last_sync_at).toLocaleDateString() : '-'}
                          </p>
                        </div>
                        {hOrder && (
                          <div>
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Valor Total</p>
                            <p className="text-sm font-bold text-[var(--color-primary-base)] mt-0.5 font-mono">R$ {hOrder.VLR_TOTAL_PEDIDO}</p>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-3 w-full md:w-auto shrink-0 justify-end border-t border-slate-100 dark:border-slate-800 md:border-transparent pt-4 md:pt-0">
                        <button
                          onClick={() => handleDetailOrderFromTransmission(t)}
                          className="flex-1 md:flex-none px-4 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-all text-center"
                        >
                          Detalhar
                        </button>

                        {!isTransmissionFinalized(t) ? (
                          <button
                            onClick={() => handleSyncTransmission(t.id)}
                            disabled={syncingTransmissionId === t.id}
                            className="flex-1 md:flex-none px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 shadow-sm shadow-teal-600/10"
                          >
                            {syncingTransmissionId === t.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5" />
                            )}
                            Sincronizar
                          </button>
                        ) : (
                          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-450 text-xs font-semibold px-2 py-1">
                            <CheckCircle2 className="h-4 w-4" />
                            Finalizado
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}

      {/* 3. VIEW MODE: ORDER_DETAIL */}
      {viewMode === 'ORDER_DETAIL' && selectedOrder && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <button 
              onClick={() => {
                if (orderDetailBackView === 'GLOBAL') {
                  setViewMode('LIST');
                } else {
                  setViewMode('SUPPLIER_DETAIL');
                }
              }} 
              className="flex items-center gap-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Voltar para {orderDetailBackView === 'GLOBAL' ? 'sincronizados' : selectedSupplier?.supplier_name}</span>
            </button>
            
            <div className="flex items-center gap-3">
              {selectedOrder.transmission && (
                <>
                  {getTransmissionStatusBadge(selectedOrder.transmission.status)}
                  {isTransmissionFinalized(selectedOrder.transmission) && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-500/20">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Pedido Finalizado
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Title Card */}
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 dark:from-slate-950 dark:to-slate-900 p-6 rounded-2xl text-white shadow-xl border border-slate-800">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Pedido de Compra</span>
                <h2 className="text-2xl font-black tracking-tight font-mono mt-0.5">
                  #{selectedOrder.horusOrder?.COD_PEDIDO || selectedOrder.transmission?.cod_pedido}
                </h2>
                <p className="text-slate-300 text-sm mt-1">
                  Data Pedido: {selectedOrder.horusOrder?.DAT_PEDIDO || (selectedOrder.transmission?.sent_at ? new Date(selectedOrder.transmission.sent_at).toLocaleDateString() : '-')}
                </p>
              </div>
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider">Valor Total</p>
                  <p className="text-2xl font-bold text-[var(--color-primary-base)] font-mono">
                    R$ {selectedOrder.horusOrder?.VLR_TOTAL_PEDIDO || '0,00'}
                  </p>
                </div>
                <div className="border-l border-slate-700 h-10 hidden md:block"></div>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wider">Qtd. Itens</p>
                  <p className="text-2xl font-bold text-slate-200">
                    {selectedOrder.horusOrder?.QTD_ITENS || selectedOrder.transmission?.items?.length || 0}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
            {/* Col 1: Metadados */}
            <div className="bg-white border border-slate-200 dark:bg-slate-900/40 dark:border-slate-800 p-5 rounded-2xl shadow-sm space-y-4">
              <h3 className="font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2 flex items-center gap-2">
                <Info className="h-4 w-4 text-[var(--color-primary-base)]" />
                Metadados do Pedido
              </h3>
              {selectedOrder.horusOrder ? (
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-50 dark:border-slate-800/40">
                    <span className="text-slate-550">Desconto Total:</span>
                    <span className="font-semibold text-slate-850 dark:text-slate-200">R$ {selectedOrder.horusOrder.VLR_TOTAL_DESCONTO || '0,00'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50 dark:border-slate-800/40">
                    <span className="text-slate-550">Consignado:</span>
                    <span className="font-semibold text-slate-850 dark:text-slate-200">{selectedOrder.horusOrder.COMPRA_CONSIG === 'S' ? 'Sim' : 'Não'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50 dark:border-slate-800/40">
                    <span className="text-slate-555">Gerar Pendência:</span>
                    <span className="font-semibold text-slate-855 dark:text-slate-200">{selectedOrder.horusOrder.GERAR_PEND === 'S' ? 'Sim' : 'Não'}</span>
                  </div>
                  <div className="pt-2">
                    <span className="text-slate-500 block font-semibold mb-1">Observações:</span>
                    <p className="text-slate-600 dark:text-slate-400 italic bg-slate-50 dark:bg-slate-800/30 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/50">
                      {selectedOrder.horusOrder.OBS || '(nenhuma)'}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 p-3 rounded-xl text-xs space-y-1.5">
                    <p className="font-bold flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      Dados do Horus Ausentes
                    </p>
                    <p>Os dados completos de faturamento e observações não foram carregados localmente para este período.</p>
                  </div>
                  {selectedOrder.transmission?.sent_at && (
                    <button
                      onClick={() => handleSearchSingleOrderHorus(selectedOrder.transmission.cod_pedido, selectedOrder.transmission.sent_at)}
                      disabled={searchingHorus}
                      className="w-full py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-850 dark:text-slate-250 font-semibold rounded-xl text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                    >
                      {searchingHorus ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      Carregar Dados do Horus
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Col 2: Filiais */}
            <div className="bg-white border border-slate-200 dark:bg-slate-900/40 dark:border-slate-800 p-5 rounded-2xl shadow-sm space-y-4">
              <h3 className="font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2 flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-[var(--color-primary-base)]" />
                Filiais Origem / Destino
              </h3>
              {selectedOrder.horusOrder ? (
                <div className="space-y-4 text-xs">
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-400 uppercase tracking-widest text-[9px]">Origem (Horus)</p>
                    {selectedOrder.horusOrder.DADOS_CADASTRAIS_ORIGEM?.[0] ? (
                      <div>
                        <p className="font-bold text-slate-850 dark:text-slate-200">{selectedOrder.horusOrder.DADOS_CADASTRAIS_ORIGEM[0].NOM_FILIAL}</p>
                        <p className="text-slate-500 font-mono text-[10px] mt-0.5">CNPJ: {formatCNPJ(selectedOrder.horusOrder.DADOS_CADASTRAIS_ORIGEM[0].CNPJ)}</p>
                        <p className="text-slate-500 mt-1 text-[11px]">{selectedOrder.horusOrder.DADOS_CADASTRAIS_ORIGEM[0].END_FILIAL}, {selectedOrder.horusOrder.DADOS_CADASTRAIS_ORIGEM[0].NUM_END}</p>
                        <p className="text-slate-500 text-[11px]">{selectedOrder.horusOrder.DADOS_CADASTRAIS_ORIGEM[0].MUNICIPIO} - {selectedOrder.horusOrder.DADOS_CADASTRAIS_ORIGEM[0].UF}</p>
                      </div>
                    ) : (
                      <p className="text-slate-400 italic">Sem dados de origem.</p>
                    )}
                  </div>
                  <div className="border-t border-slate-100 dark:border-slate-800/60 pt-3 space-y-1">
                    <p className="font-semibold text-slate-400 uppercase tracking-widest text-[9px]">Fornecedor Destino</p>
                    {selectedOrder.horusOrder.DADOS_CADASTRAIS_DESTINO?.[0] ? (
                      <div>
                        <p className="font-bold text-slate-850 dark:text-slate-200">{selectedOrder.horusOrder.DADOS_CADASTRAIS_DESTINO[0].NOM_FORNECEDOR}</p>
                        <p className="text-slate-500 font-mono text-[10px] mt-0.5">CNPJ: {formatCNPJ(selectedOrder.horusOrder.DADOS_CADASTRAIS_DESTINO[0].CNPJ)}</p>
                        <p className="text-slate-500 mt-1 text-[11px]">{selectedOrder.horusOrder.DADOS_CADASTRAIS_DESTINO[0].END_FORNECEDOR}, {selectedOrder.horusOrder.DADOS_CADASTRAIS_DESTINO[0].NUM_END}</p>
                        <p className="text-slate-500 text-[11px]">{selectedOrder.horusOrder.DADOS_CADASTRAIS_DESTINO[0].MUNICIPIO} - {selectedOrder.horusOrder.DADOS_CADASTRAIS_DESTINO[0].UF}</p>
                      </div>
                    ) : (
                      <p className="text-slate-400 italic">Sem dados de destino.</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-450 italic py-4 text-center">Origem/Destino indisponíveis sem dados do Horus.</p>
              )}
            </div>

            {/* Col 3: Bookinfo Integration */}
            <div className="bg-white border border-slate-200 dark:bg-slate-900/40 dark:border-slate-800 p-5 rounded-2xl shadow-sm space-y-4">
              <h3 className="font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2 flex items-center gap-2">
                <ExternalLink className="h-4 w-4 text-[var(--color-primary-base)]" />
                Integração Bookinfo
              </h3>
              {selectedOrder.transmission ? (
                <div className="space-y-4 text-xs">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-slate-400 font-semibold uppercase tracking-wider text-[9px]">ID Pedido Bookinfo</p>
                      <p className="font-mono text-sm font-bold text-slate-800 dark:text-slate-200 mt-0.5">{selectedOrder.transmission.bookinfo_pedido_id || '-'}</p>
                    </div>
                    <div>
                      <p className="text-slate-400 font-semibold uppercase tracking-wider text-[9px]">Transmissão ID</p>
                      <p className="font-mono text-sm font-bold text-slate-800 dark:text-slate-200 mt-0.5">#{selectedOrder.transmission.id}</p>
                    </div>
                    <div className="col-span-2 border-t border-slate-100 dark:border-slate-800/40 pt-2 grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-slate-455 text-[10px]">Enviado em:</p>
                        <p className="font-medium text-slate-800 dark:text-slate-350 mt-0.5">
                          {selectedOrder.transmission.sent_at ? new Date(selectedOrder.transmission.sent_at).toLocaleString() : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-455 text-[10px]">Última Sincronização:</p>
                        <p className="font-medium text-slate-800 dark:text-slate-350 mt-0.5">
                          {selectedOrder.transmission.last_sync_at ? new Date(selectedOrder.transmission.last_sync_at).toLocaleString() : '-'}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  {selectedOrder.transmission.status === 'ERROR' && selectedOrder.transmission.error_message && (
                    <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-xl text-red-655 dark:text-red-400 font-mono text-[10px] break-words">
                      <span className="font-bold flex items-center gap-1 mb-1">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Mensagem de Erro:
                      </span>
                      {selectedOrder.transmission.error_message}
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800/40 flex flex-col gap-2">
                    {!isTransmissionFinalized(selectedOrder.transmission) ? (
                      <button
                        onClick={() => handleSyncTransmission(selectedOrder.transmission.id)}
                        disabled={syncingTransmissionId === selectedOrder.transmission.id}
                        className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-md shadow-teal-600/10"
                      >
                        {syncingTransmissionId === selectedOrder.transmission.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                        Sincronizar Retorno
                      </button>
                    ) : (
                      <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 p-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2">
                        <CheckCircle2 className="h-4 w-4" />
                        Integração Finalizada
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4 text-xs py-2">
                  <div className="bg-slate-50 border border-slate-100 dark:bg-slate-800/20 dark:border-slate-800 p-4 rounded-xl text-center text-slate-500 dark:text-slate-400 space-y-2">
                    <Clock className="h-6 w-6 mx-auto text-slate-400" />
                    <p>Este pedido ainda não foi enviado para a Bookinfo.</p>
                  </div>
                  
                  {selectedOrder.horusOrder && (
                    (() => {
                      const isConsigValid = selectedOrder.horusOrder.COMPRA_CONSIG === 'N' || selectedOrder.horusOrder.COMPRA_CONSIG === 'S';
                      return !isConsigValid ? (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 p-3 rounded-xl text-xs space-y-1.5 font-semibold">
                          <p className="flex items-center gap-1.5 font-bold text-red-700 dark:text-red-300">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            Pedido Não Enviável
                          </p>
                          <p className="font-normal text-slate-600 dark:text-slate-450">
                            O campo COMPRA_CONSIG deste pedido é "{selectedOrder.horusOrder.COMPRA_CONSIG || 'vazio'}". Apenas pedidos de compra normal (N) ou consignação (S) podem ser integrados à Bookinfo.
                          </p>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleSendToBookinfo(selectedOrder.horusOrder)}
                          disabled={sendingOrderId === selectedOrder.horusOrder.COD_PEDIDO}
                          className="w-full py-2.5 bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-lg shadow-[var(--color-primary-base)]/25"
                        >
                          {sendingOrderId === selectedOrder.horusOrder.COD_PEDIDO ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5 rotate-45" />
                          )}
                          Enviar para Bookinfo
                        </button>
                      );
                    })()
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Items Table */}
          <div className="bg-white border border-slate-200 dark:bg-slate-900/40 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2 text-sm">
                <BookOpen className="h-4.5 w-4.5 text-[var(--color-primary-base)]" />
                Itens do Pedido
              </h3>
              <span className="text-xs text-slate-500 dark:text-slate-450 font-medium">
                Total de {selectedOrder.horusOrder?.ITENS?.length || selectedOrder.transmission?.items?.length || 0} itens
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left min-w-[700px]">
                <thead className="bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-6 py-3 font-semibold text-slate-700 dark:text-slate-300">Item / Editora</th>
                    <th className="px-6 py-3 font-semibold text-slate-700 dark:text-slate-300">Código / ISBN</th>
                    <th className="px-6 py-3 text-right font-semibold text-slate-700 dark:text-slate-300">Qtd Pedida</th>
                    <th className="px-6 py-3 text-right font-semibold text-slate-700 dark:text-slate-300">Preço Unit</th>
                    <th className="px-6 py-3 text-right font-semibold text-slate-700 dark:text-slate-300">Desconto</th>
                    <th className="px-6 py-3 text-right font-semibold text-slate-700 dark:text-slate-300">Valor Líquido</th>
                    <th className="px-6 py-3 font-semibold text-slate-700 dark:text-slate-300">Situação Bookinfo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/40">
                  {selectedOrder.horusOrder ? (
                    selectedOrder.horusOrder.ITENS?.map((item: any, idx: number) => {
                      const transItem = selectedOrder.transmission?.items?.find((ti: any) => ti.cod_item === item.COD_ITEM);
                      return (
                        <tr key={item.COD_ITEM || idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors">
                          <td className="px-6 py-4">
                            <p className="font-bold text-slate-900 dark:text-white text-sm">{item.NOM_ITEM}</p>
                            <p className="text-slate-400 dark:text-slate-500 text-[10px] mt-0.5">{item.NOM_EDITORA}</p>
                          </td>
                          <td className="px-6 py-4 font-mono text-[10px] text-slate-650 dark:text-slate-400">
                            <p>{item.COD_ITEM}</p>
                            <p className="text-slate-400 mt-0.5">{item.COD_BARRA_ITEM || item.COD_ISBN_ITEM}</p>
                          </td>
                          <td className="px-6 py-4 text-right font-bold text-slate-800 dark:text-slate-200 text-sm">{item.QT_PEDIDA}</td>
                          <td className="px-6 py-4 text-right font-mono text-slate-500">R$ {item.VLR_PRECO}</td>
                          <td className="px-6 py-4 text-right font-mono text-slate-500">{item.PERC_DESCONTO}%</td>
                          <td className="px-6 py-4 text-right font-bold text-slate-900 dark:text-white font-mono text-sm">R$ {item.VLR_LIQUIDO}</td>
                          <td className="px-6 py-4">
                            {getReturnSituationBadge(transItem?.situacao_retorno || (selectedOrder.transmission ? 'SENT' : null))}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    selectedOrder.transmission?.items?.map((item: any, idx: number) => (
                      <tr key={item.id || idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors">
                        <td className="px-6 py-4">
                          <p className="font-bold text-slate-900 dark:text-white text-sm">{item.nom_item}</p>
                        </td>
                        <td className="px-6 py-4 font-mono text-[10px] text-slate-650 dark:text-slate-400">
                          <p>{item.cod_item}</p>
                          <p className="text-slate-400 mt-0.5">{item.cod_barra}</p>
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-slate-800 dark:text-slate-200 text-sm">{item.qt_pedida}</td>
                        <td className="px-6 py-4 text-right font-mono text-slate-400 italic" colSpan={3}>Indisponível (Sem dados do Horus)</td>
                        <td className="px-6 py-4">
                          {getReturnSituationBadge(item.situacao_retorno || 'SENT')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Supplier form modal (stays simple and shared) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800/60">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                {editingId ? 'Editar Fornecedor' : 'Adicionar Fornecedor'}
              </h3>
              <button 
                onClick={handleCloseModal}
                className="text-slate-400 hover:text-slate-500 dark:hover:text-slate-300 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Nome do Fornecedor</label>
                <input 
                  type="text"
                  required
                  autoFocus
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all font-medium text-sm placeholder:text-slate-400 dark:bg-slate-900/50 dark:border-slate-700 dark:text-white"
                  value={formData.supplier_name}
                  onChange={(e) => setFormData({...formData, supplier_name: e.target.value})}
                  placeholder="Ex: Editora X" 
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">CNPJ Emissor (Fabricante)</label>
                <input 
                  type="text"
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all font-mono text-sm placeholder:text-slate-400 dark:bg-slate-900/50 dark:border-slate-700 dark:text-white"
                  value={formData.document_origin}
                  onChange={(e) => setFormData({...formData, document_origin: formatCNPJ(e.target.value)})}
                  placeholder="00.000.000/0000-00" 
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">CNPJ Destino (Seu Vínculo)</label>
                <input 
                  type="text"
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all font-mono text-sm placeholder:text-slate-400 dark:bg-slate-900/50 dark:border-slate-700 dark:text-white"
                  value={formData.document_destination}
                  onChange={(e) => setFormData({...formData, document_destination: formatCNPJ(e.target.value)})}
                  placeholder="00.000.000/0000-00" 
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Data de Início</label>
                <input 
                  type="date"
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all text-sm dark:bg-slate-900/50 dark:border-slate-700 dark:text-white"
                  value={formData.start_date}
                  onChange={(e) => setFormData({...formData, start_date: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Integrador Compra</label>
                  <select
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all text-sm dark:bg-slate-900/50 dark:border-slate-700 dark:text-white"
                    value={formData.integrador_compra}
                    onChange={(e) => setFormData({...formData, integrador_compra: e.target.value})}
                  >
                    <option value="BOOKINFO">BOOKINFO</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Status Busca</label>
                  <select
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all text-sm dark:bg-slate-900/50 dark:border-slate-700 dark:text-white"
                    value={formData.status_pedido_compra}
                    onChange={(e) => setFormData({...formData, status_pedido_compra: e.target.value})}
                  >
                    <option value="AE">AE - Aguardando Entrega</option>
                    <option value="AB">AB - Aberto</option>
                    <option value="CA">CA - Cancelado</option>
                    <option value="AP">AP - Aprovado</option>
                    <option value="EE">EE - Em Elaboração</option>
                    <option value="AC">AC - Acordo</option>
                    <option value="FE">FE - Fechado</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800/60 mt-6 pt-6">
                <button 
                  type="button" 
                  onClick={handleCloseModal}
                  className="px-5 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-700"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={submitting}
                  className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-semibold py-2.5 px-6 rounded-xl transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {submitting ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
