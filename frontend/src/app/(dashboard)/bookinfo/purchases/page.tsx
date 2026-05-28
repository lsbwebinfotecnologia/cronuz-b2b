'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, BookOpen, X, Loader2, Search, Calendar, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
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

export default function BookinfoPurchasesPage() {
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

  // Horus search state
  const [isHorusModalOpen, setIsHorusModalOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [horusOrders, setHorusOrders] = useState<any[]>([]);
  const [searchingHorus, setSearchingHorus] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
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
    } catch (error) {
      console.error('Erro ao buscar transmissões:', error);
    } finally {
      setLoadingTransmissions(false);
    }
  }, []);

  const handleSendToBookinfo = async (order: any) => {
    if (!selectedSupplier) return;
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
      
      // Refresh transmissions and search
      await fetchTransmissions(selectedSupplier.id);
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

  const handleSyncTransmission = async (transmissionId: number) => {
    if (!selectedSupplier) return;
    try {
      setSyncingTransmissionId(transmissionId);
      const token = getToken();
      const res = await fetch(`${API_URL}/bookinfo-purchases/suppliers/${selectedSupplier.id}/transmissions/${transmissionId}/sync`, {
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
      await fetchTransmissions(selectedSupplier.id);
    } catch (error: any) {
      toast.error(error.message || 'Erro ao sincronizar retorno.');
    } finally {
      setSyncingTransmissionId(null);
    }
  };

  const formatDateInput = (dateVal: any) => {
    if (!dateVal) return '';
    return String(dateVal).split('T')[0];
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

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

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
      setExpandedOrderId(null);
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

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-[var(--color-primary-base)]" />
          Fornecedores Bookinfo (Compras)
        </h1>
        <p className="text-slate-500 text-sm mt-1 dark:text-slate-400">
          Gerencie as integrações e faturamentos de fornecedores pela plataforma Bookinfo.
        </p>
      </div>

      <div className="flex flex-col md:flex-row items-start md:items-center justify-end w-full">
        <button 
           onClick={() => handleOpenModal()} 
           className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-semibold py-2.5 px-5 rounded-xl transition-all shadow-lg shadow-[var(--color-primary-base)]/20 hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Adicionar Fornecedor
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:bg-slate-900/40 dark:border-slate-800 w-full animate-in fade-in">
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
                    <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold animate-pulse-slow">
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
                          onClick={() => {
                            setSelectedSupplier(spl);
                            const iniDate = spl.last_sync_at ? formatDateInput(spl.last_sync_at) : (spl.start_date ? formatDateInput(spl.start_date) : formatDateInput(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)));
                            const fimDate = formatDateInput(new Date());
                            const currentFilters = {
                              data_ini: iniDate,
                              data_fim: fimDate,
                              status: spl.status_pedido_compra || 'AE',
                              transmitido: 'N'
                            };
                            setHorusFilters(currentFilters);
                            setHorusOrders([]);
                            setIsHorusModalOpen(true);
                            fetchTransmissions(spl.id);
                            handleSearchHorus(spl.id, currentFilters);
                          }} 
                          className="p-2 text-slate-400 hover:text-teal-500 hover:bg-teal-500/10 rounded-lg transition-colors" 
                          title="Consultar Pedidos Horus"
                       >
                         <Search className="h-4 w-4" />
                       </button>
                       <button onClick={() => handleOpenModal(spl)} className="p-2 text-slate-400 hover:text-[var(--color-primary-base)] hover:bg-[var(--color-primary-base)]/10 rounded-lg transition-colors" title="Editar">
                         <Edit2 className="h-4 w-4" />
                       </button>
                       <button onClick={() => handleDelete(spl.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Deletar">
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

      {isHorusModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-800">
            
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800/60 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Search className="h-5 w-5 text-[var(--color-primary-base)]" />
                  Consulta de Pedidos Horus: <span className="text-[var(--color-primary-base)]">{selectedSupplier?.supplier_name}</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  CNPJ Emissor: {selectedSupplier?.document_origin ? formatCNPJ(selectedSupplier.document_origin) : '-'} | 
                  CNPJ Destino: {selectedSupplier?.document_destination ? formatCNPJ(selectedSupplier.document_destination) : '-'}
                </p>
              </div>
              <button 
                onClick={() => setIsHorusModalOpen(false)}
                className="text-slate-400 hover:text-slate-500 dark:hover:text-slate-300 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/20 border-b border-slate-200 dark:border-slate-800 flex flex-wrap gap-4 items-end shrink-0">
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

              <div className="w-[150px] space-y-1">
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

              <div className="w-[150px] space-y-1">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 block">Transmitido</label>
                <select
                  className="w-full bg-white border border-slate-200 dark:border-slate-700 dark:bg-slate-900/50 dark:text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)]"
                  value={horusFilters.transmitido}
                  onChange={(e) => setHorusFilters({...horusFilters, transmitido: e.target.value})}
                >
                  <option value="N">Não Transmitidos</option>
                  <option value="S">Transmitidos</option>
                  <option value="T">Todos</option>
                </select>
              </div>

              <button
                onClick={() => handleSearchHorus(selectedSupplier.id)}
                disabled={searchingHorus}
                className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-semibold py-2 px-5 rounded-xl transition-all disabled:opacity-50 flex items-center gap-2 h-[38px] shrink-0"
              >
                <RefreshCw className={`h-4 w-4 ${searchingHorus ? 'animate-spin' : ''}`} />
                {searchingHorus ? 'Pesquisando...' : 'Pesquisar'}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {searchingHorus && (
                <div className="py-20 text-center text-slate-500">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-[var(--color-primary-base)]" />
                  Buscando pedidos de compra no ERP Horus...
                </div>
              )}

              {!searchingHorus && horusOrders.length === 0 && (
                <div className="py-20 text-center text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                  Nenhum pedido de compra localizado para os filtros selecionados.
                </div>
              )}

              {!searchingHorus && horusOrders.length > 0 && horusOrders.map((order: any, idx: number) => {
                const isExpanded = expandedOrderId === order.COD_PEDIDO;
                
                const getStatusBadge = (status: string) => {
                  const statusMap: Record<string, { label: string; class: string }> = {
                    AE: { label: 'Aguardando Entrega', class: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
                    AB: { label: 'Aberto', class: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
                    CA: { label: 'Cancelado', class: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
                    AP: { label: 'Aprovado', class: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' },
                    EE: { label: 'Em Elaboração', class: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300' },
                    AC: { label: 'Acordo', class: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' },
                    FE: { label: 'Fechado', class: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300' }
                  };
                  const config = statusMap[status] || { label: status, class: 'bg-slate-100 text-slate-800' };
                  return (
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${config.class}`}>
                      {config.label}
                    </span>
                  );
                };

                return (
                  <div key={order.COD_PEDIDO || idx} className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900/50 hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
                    <div 
                      onClick={() => setExpandedOrderId(isExpanded ? null : order.COD_PEDIDO)}
                      className="p-4 flex flex-wrap items-center justify-between gap-4 cursor-pointer select-none bg-slate-50/50 dark:bg-slate-800/10"
                    >
                      <div className="flex flex-wrap items-center gap-6">
                        <div>
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Código Pedido</p>
                          <p className="text-sm font-bold text-slate-900 dark:text-white font-mono">#{order.COD_PEDIDO}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Data Inclusão</p>
                          <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">{order.DAT_PEDIDO}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</p>
                          <p className="mt-0.5">{getStatusBadge(order.STATUS_PEDIDO_COMPRA)}</p>
                        </div>
                        {order.COMPRA_CONSIG === 'S' && (
                          <div>
                            <span className="px-2 py-0.5 bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 rounded text-[10px] font-semibold">Consignado</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-4 text-right ml-auto flex-wrap sm:flex-nowrap">
                        {(() => {
                          const t = transmissions.find((tx: any) => tx.cod_pedido === order.COD_PEDIDO);
                          if (t) {
                            if (t.status === 'SENT') {
                              return (
                                <span className="px-2.5 py-1 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 text-xs font-semibold">
                                  Enviado
                                </span>
                              );
                            }
                            if (t.status === 'SYNCED') {
                              return (
                                <span className="px-2.5 py-1 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 text-xs font-semibold">
                                  Sincronizado
                                </span>
                              );
                            }
                            if (t.status === 'ERROR') {
                              return (
                                <span className="px-2.5 py-1 rounded bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 text-xs font-semibold" title={t.error_message}>
                                  Erro Envio
                                </span>
                              );
                            }
                          }
                          if (order.TRANSMITIDO === 'S') {
                            return (
                              <span className="px-2.5 py-1 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 text-xs font-semibold">
                                Transmitido (ERP)
                              </span>
                            );
                          }
                          return (
                            <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-350 text-xs font-semibold">
                              Pendente
                            </span>
                          );
                        })()}

                        {(() => {
                          const t = transmissions.find((tx: any) => tx.cod_pedido === order.COD_PEDIDO);
                          const isSentOrSynced = t && (t.status === 'SENT' || t.status === 'SYNCED');
                          
                          if (isSentOrSynced) {
                            return (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSyncTransmission(t.id);
                                }}
                                disabled={syncingTransmissionId === t.id}
                                className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors disabled:opacity-50"
                              >
                                {syncingTransmissionId === t.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3 w-3" />
                                )}
                                Sincronizar
                              </button>
                            );
                          } else {
                            return (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSendToBookinfo(order);
                                }}
                                disabled={sendingOrderId === order.COD_PEDIDO}
                                className="px-3 py-1.5 bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors disabled:opacity-50"
                              >
                                {sendingOrderId === order.COD_PEDIDO ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3 w-3 rotate-45" />
                                )}
                                Enviar
                              </button>
                            );
                          }
                        })()}

                        <div className="text-left border-l border-slate-200 dark:border-slate-850 pl-4 hidden sm:block">
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Valor Total</p>
                          <p className="text-sm font-bold text-[var(--color-primary-base)]">R$ {order.VLR_TOTAL_PEDIDO}</p>
                        </div>
                        <div>
                          {isExpanded ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="p-6 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
                          <div className="bg-slate-50 dark:bg-slate-800/20 p-4 rounded-xl space-y-2">
                            <p className="font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-1">Metadados do Pedido</p>
                            <div className="grid grid-cols-2 gap-y-1 text-xs">
                              <span className="text-slate-400">Total Desconto:</span>
                              <span className="font-medium text-slate-800 dark:text-slate-200">R$ {order.VLR_TOTAL_DESCONTO || '0,00'}</span>
                              <span className="text-slate-400">Qtd. Itens:</span>
                              <span className="font-medium text-slate-800 dark:text-slate-200">{order.QTD_ITENS}</span>
                              <span className="text-slate-400">Compra Consig.:</span>
                              <span className="font-medium text-slate-800 dark:text-slate-200">{order.COMPRA_CONSIG === 'S' ? 'Sim' : 'Não'}</span>
                              <span className="text-slate-400">Gerar Pendência:</span>
                              <span className="font-medium text-slate-800 dark:text-slate-200">{order.GERAR_PEND === 'S' ? 'Sim' : 'Não'}</span>
                              <span className="text-slate-400 col-span-2 mt-1 block">Obs:</span>
                              <span className="col-span-2 text-slate-500 italic mt-0.5">{order.OBS || '(nenhuma)'}</span>
                            </div>
                          </div>

                          <div className="bg-slate-50 dark:bg-slate-800/20 p-4 rounded-xl space-y-2">
                            <p className="font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-1">Filial Origem (Horus)</p>
                            {order.DADOS_CADASTRAIS_ORIGEM?.[0] ? (
                              <div className="text-xs space-y-1">
                                <p className="font-bold text-slate-700 dark:text-slate-300">{order.DADOS_CADASTRAIS_ORIGEM[0].NOM_FILIAL}</p>
                                <p className="text-slate-500">CNPJ: {formatCNPJ(order.DADOS_CADASTRAIS_ORIGEM[0].CNPJ)}</p>
                                <p className="text-slate-500">End: {order.DADOS_CADASTRAIS_ORIGEM[0].END_FILIAL}, {order.DADOS_CADASTRAIS_ORIGEM[0].NUM_END}</p>
                                <p className="text-slate-500">{order.DADOS_CADASTRAIS_ORIGEM[0].MUNICIPIO} - {order.DADOS_CADASTRAIS_ORIGEM[0].UF}</p>
                              </div>
                            ) : (
                              <p className="text-xs text-slate-400">Sem dados cadastrais.</p>
                            )}
                          </div>

                          <div className="bg-slate-50 dark:bg-slate-800/20 p-4 rounded-xl space-y-2">
                            <p className="font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-1">Fornecedor Destino</p>
                            {order.DADOS_CADASTRAIS_DESTINO?.[0] ? (
                              <div className="text-xs space-y-1">
                                <p className="font-bold text-slate-700 dark:text-slate-300">{order.DADOS_CADASTRAIS_DESTINO[0].NOM_FORNECEDOR}</p>
                                <p className="text-slate-500">CNPJ: {formatCNPJ(order.DADOS_CADASTRAIS_DESTINO[0].CNPJ)}</p>
                                <p className="text-slate-500">End: {order.DADOS_CADASTRAIS_DESTINO[0].END_FORNECEDOR}, {order.DADOS_CADASTRAIS_DESTINO[0].NUM_END}</p>
                                <p className="text-slate-500">{order.DADOS_CADASTRAIS_DESTINO[0].MUNICIPIO} - {order.DADOS_CADASTRAIS_DESTINO[0].UF}</p>
                              </div>
                            ) : (
                              <p className="text-xs text-slate-400">Sem dados cadastrais.</p>
                            )}
                          </div>

                          {(() => {
                            const t = transmissions.find((tx: any) => tx.cod_pedido === order.COD_PEDIDO);
                            if (!t) return null;
                            return (
                              <div className="bg-slate-50 dark:bg-slate-800/20 p-4 rounded-xl space-y-2 col-span-1 md:col-span-3">
                                <p className="font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-1.5 flex items-center justify-between">
                                  <span>Integração Bookinfo</span>
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    t.status === 'SYNCED' ? 'bg-emerald-105 text-emerald-800 dark:bg-emerald-900/30' :
                                    t.status === 'SENT' ? 'bg-amber-105 text-amber-800 dark:bg-amber-900/30' : 'bg-red-105 text-red-800 dark:bg-red-900/30'
                                  }`}>
                                    {t.status}
                                  </span>
                                </p>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                                  <div>
                                    <p className="text-slate-450">ID Pedido Bookinfo:</p>
                                    <p className="font-semibold text-slate-800 dark:text-slate-200">{t.bookinfo_pedido_id || '-'}</p>
                                  </div>
                                  <div>
                                    <p className="text-slate-455">Enviado em:</p>
                                    <p className="font-semibold text-slate-800 dark:text-slate-200">
                                      {t.sent_at ? new Date(t.sent_at).toLocaleString() : '-'}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-slate-455">Última Sincronização:</p>
                                    <p className="font-semibold text-slate-800 dark:text-slate-200">
                                      {t.last_sync_at ? new Date(t.last_sync_at).toLocaleString() : '-'}
                                    </p>
                                  </div>
                                  {t.status === 'ERROR' && t.error_message && (
                                    <div className="col-span-2 md:col-span-4 mt-1 bg-red-50 dark:bg-red-950/20 p-2.5 rounded text-red-600 dark:text-red-400 font-mono">
                                      <strong>Mensagem de Erro:</strong> {t.error_message}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </div>

                             <div className="space-y-2">
                          <p className="font-bold text-sm text-slate-900 dark:text-white">Itens do Pedido</p>
                          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden overflow-x-auto">
                            <table className="w-full text-xs text-left min-w-[600px]">
                              <thead className="bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800">
                                <tr>
                                  <th className="px-4 py-2 text-slate-700 dark:text-slate-300">Item / Editora</th>
                                  <th className="px-4 py-2 text-slate-700 dark:text-slate-300">Cód / ISBN</th>
                                  <th className="px-4 py-2 text-right text-slate-700 dark:text-slate-300">Qtd Pedida</th>
                                  <th className="px-4 py-2 text-right text-slate-700 dark:text-slate-300">Preço Unit</th>
                                  <th className="px-4 py-2 text-right text-slate-700 dark:text-slate-300">Desconto</th>
                                  <th className="px-4 py-2 text-right text-slate-700 dark:text-slate-300">Valor Líq</th>
                                  <th className="px-4 py-2 text-slate-700 dark:text-slate-300">Situação Bookinfo</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-150 dark:divide-slate-800/40">
                                {order.ITENS?.map((item: any, itemIdx: number) => {
                                  const t = transmissions.find((tx: any) => tx.cod_pedido === order.COD_PEDIDO);
                                  const transItem = t?.items?.find((ti: any) => ti.cod_item === item.COD_ITEM);
                                  return (
                                    <tr key={item.COD_ITEM || itemIdx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10">
                                      <td className="px-4 py-2">
                                        <p className="font-semibold text-slate-900 dark:text-white">{item.NOM_ITEM}</p>
                                        <p className="text-slate-400 text-[10px]">{item.NOM_EDITORA}</p>
                                      </td>
                                      <td className="px-4 py-2 font-mono text-[10px]">
                                        <p>{item.COD_ITEM}</p>
                                        <p className="text-slate-400">{item.COD_BARRA_ITEM || item.COD_ISBN_ITEM}</p>
                                      </td>
                                      <td className="px-4 py-2 text-right font-medium">{item.QT_PEDIDA}</td>
                                      <td className="px-4 py-2 text-right text-slate-500 font-mono">R$ {item.VLR_PRECO}</td>
                                      <td className="px-4 py-2 text-right text-slate-500 font-mono">{item.PERC_DESCONTO}%</td>
                                      <td className="px-4 py-2 text-right font-bold text-slate-800 dark:text-slate-200 font-mono">R$ {item.VLR_LIQUIDO}</td>
                                      <td className="px-4 py-2 font-semibold">
                                        {transItem ? (
                                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                            transItem.situacao_retorno === 'RESERVADO_TOTAL' || transItem.situacao_retorno === 'ATENDIDO'
                                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                                              : transItem.situacao_retorno === 'SEM_ESTOQUE' || transItem.situacao_retorno === 'CANCELADO'
                                              ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                                              : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                                          }`}>
                                            {transItem.situacao_retorno || 'Enviado'}
                                          </span>
                                        ) : (
                                          <span className="text-slate-400 font-normal">-</span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/20 border-t border-slate-100 dark:border-slate-800/60 flex justify-end shrink-0">
              <button 
                type="button" 
                onClick={() => setIsHorusModalOpen(false)}
                className="px-5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-700"
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
