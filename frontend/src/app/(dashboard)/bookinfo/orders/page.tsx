'use client';

import { useState, useEffect } from 'react';
import { getToken } from '@/lib/auth';
import { Layers, Search,  Eye, Calendar, Filter, ArchiveX, CloudDownload, Loader2, DollarSign, Users, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

export default function BookinfoOrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingCnpj, setSyncingCnpj] = useState<string | null>(null);
  const [ackingOrderId, setAckingOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const formatCnpj = (cnpj: string) => {
    if (!cnpj) return '';
    const clean = cnpj.replace(/\D/g, '');
    if (clean.length === 14) {
      return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
    }
    return cnpj;
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('AGUARDANDO_PROCESSAMENTO');

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getToken();
      let url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/bookinfo/orders?tamanho=50`;
      if (statusFilter !== 'ALL') {
          url += `&status=${statusFilter}`;
      }
      
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!res.ok) {
        throw new Error('Falha ao buscar pedidos da Bookinfo');
      }
      
      const data = await res.json();
      setOrders(data.itens || []);
    } catch (err: any) {
      setError(err.message || 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncCustomer = async (cnpj: string, fallbackName?: string) => {
    if (!cnpj) return;
    setSyncingCnpj(cnpj);
    
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/bookinfo/customers/sync`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ cnpj, fallback_name: fallbackName })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.detail || 'Erro ao sincronizar cliente');
      }
      
      toast.success(data.message || 'Cliente sincronizado!');
      fetchOrders(); // refresh table
    } catch (err: any) {
      toast.error(err.message || 'Falha na comunicação com o Horus');
    } finally {
      setSyncingCnpj(null);
    }
  };

  const handleAcknowledgeOrder = async (orderId: string) => {
    if (!orderId) return;
    setAckingOrderId(orderId);
    
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/bookinfo/orders/${orderId}/acknowledge`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`
        }
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.detail || 'Erro ao sincronizar pedido');
      }
      
      toast.success(data.message || 'Pedido sincronizado com sucesso!');
      fetchOrders(); // refresh table
    } catch (err: any) {
      toast.error(err.message || 'Falha ao sincronizar pedido');
    } finally {
      setAckingOrderId(null);
    }
  };

  const filteredOrders = orders.filter(order => {
    const matchesSearch = 
      order.pedidoCliente?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      order.nomeComprador?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.cnpjComprador?.includes(searchTerm);
      
    // Server-side handles status now, but we keep this for legacy ALL fallback if needed
    const matchesStatus = statusFilter === 'ALL' || order.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Re-fetch when statusFilter changes
  useEffect(() => {
    fetchOrders();
  }, [statusFilter]);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
            <Layers className="h-6 w-6 text-indigo-500" />
            Integração Bookinfo
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Gestão e Sincronização de Pedidos B2B
          </p>
        </div>
      </div>

      {/* Quick Dashboard */}
      {!loading && !error && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total na Tela</p>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{filteredOrders.length}</h3>
            </div>
          </div>
          
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center text-rose-600 dark:text-rose-400">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Pendentes (Sinc. Cliente)</p>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{filteredOrders.filter(o => !o.enable).length}</h3>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Faturamento (Tela)</p>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                R$ {filteredOrders.reduce((acc, curr) => acc + (curr.valorTotal || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </h3>
            </div>
          </div>
        </div>
      )}

      {error ? (
        <div className="bg-rose-50 border border-rose-200 text-rose-600 rounded-xl p-6 flex flex-col items-center justify-center text-center">
            <ArchiveX className="w-10 h-10 mb-2 opacity-50" />
            <h3 className="font-semibold text-lg">Erro na Integração</h3>
            <p className="text-sm mt-1 mb-4">{error}</p>
            <button 
                onClick={fetchOrders}
                className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 text-sm font-medium transition"
            >
                Tentar Novamente
            </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-220px)]">
          {/* Toolbar */}
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row gap-4 justify-between items-center bg-slate-50/50 dark:bg-slate-800/20">
            <div className="relative w-full sm:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Buscar cliente, pedido ou CNPJ..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all dark:text-white"
              />
            </div>
            
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-none">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <select 
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm appearance-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all dark:text-white"
                >
                  <option value="ALL">Todos os Status</option>
                  <option value="NOVO">Novo</option>
                  <option value="AGUARDANDO_PROCESSAMENTO">Aguardando Avaliação</option>
                  <option value="RECEBIDO">Recebido / Sincronizado</option>
                  <option value="PROCESSADO">Processado</option>
                  <option value="RECUSADO">Recusado</option>
                </select>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto bg-white dark:bg-slate-900">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 z-10 shadow-sm">
                <tr>
                  <th className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-300">Cliente & Pedido</th>
                  <th className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-300">Resumo da Compra</th>
                  <th className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-300">Status da Integração</th>
                  <th className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-300 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="px-6 py-4">
                        <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-48 mb-2"></div>
                        <div className="h-3 bg-slate-100 dark:bg-slate-800/50 rounded w-64"></div>
                      </td>
                      <td className="px-6 py-4">
                         <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-32 mb-2"></div>
                         <div className="h-3 bg-slate-100 dark:bg-slate-800/50 rounded w-24"></div>
                      </td>
                      <td className="px-6 py-4">
                         <div className="h-6 bg-slate-200 dark:bg-slate-800 rounded w-24 mb-2"></div>
                         <div className="h-4 bg-slate-100 dark:bg-slate-800/50 rounded w-32"></div>
                      </td>
                      <td className="px-6 py-4 text-right"><div className="h-8 bg-slate-200 dark:bg-slate-800 rounded-lg w-28 ml-auto"></div></td>
                    </tr>
                  ))
                ) : filteredOrders.length > 0 ? (
                  filteredOrders.map((order, i) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                      {/* COL 1: Cliente & Identificadores */}
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900 dark:text-white text-base">
                            {order.nomeComprador || 'Não informado'}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 mb-2 flex flex-col sm:flex-row sm:items-center gap-2">
                            <span>CNPJ: {formatCnpj(order.cnpjComprador)}</span>
                            {!order.enable && (
                               <button
                                  onClick={() => handleSyncCustomer(order.cnpjComprador, order.nomeComprador)}
                                  disabled={syncingCnpj === order.cnpjComprador}
                                  className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-semibold rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 transition-colors border border-emerald-200 dark:border-emerald-500/20 w-fit"
                               >
                                  {syncingCnpj === order.cnpjComprador ? <Loader2 className="w-3 h-3 animate-spin" /> : <CloudDownload className="w-3 h-3" />}
                                  Sincronizar Cliente do ERP
                               </button>
                            )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500 bg-slate-100 dark:bg-slate-800/50 px-2.5 py-1.5 rounded-md w-fit border border-slate-200/50 dark:border-slate-800">
                            <span className="text-slate-700 dark:text-slate-300 flex items-center gap-1.5">Bookinfo <span className="font-bold">#{order.id}</span></span>
                            
                            {order.enable && ['NOVO', 'AGUARDANDO_PROCESSAMENTO'].includes(order.status) && (
                               <button
                                 onClick={() => handleAcknowledgeOrder(order.id)}
                                 disabled={ackingOrderId === order.id}
                                 className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-400 transition-colors ml-1 border border-indigo-200 dark:border-indigo-500/20"
                               >
                                 {ackingOrderId === order.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArchiveX className="w-3 h-3" />}
                                 Receber Pedido
                               </button>
                            )}
                            
                            <span className="text-slate-300 dark:text-slate-600">|</span>
                            <span className="text-indigo-600 dark:text-indigo-400">ERP <span className="font-bold">#{order.numeroPedidoERP || order.nroPedido || 'Pendente'}</span></span>
                            {order.pedidoCliente && (
                                <>
                                    <span className="text-slate-300 dark:text-slate-600">|</span>
                                    <span>Ref: <span className="font-bold">{order.pedidoCliente}</span></span>
                                </>
                            )}
                        </div>
                      </td>
                      
                      {/* COL 2: Resumo Financeiro & Data */}
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-900 dark:text-white flex items-baseline gap-1.5">
                            R$ {(order.valorTotal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </div>
                        <div className="text-xs text-slate-500 mt-1 flex flex-col gap-1">
                            <span className="inline-flex items-center gap-1"><Layers className="w-3.5 h-3.5" /> {(order.itens || []).length} itens solicitados</span>
                            <span className="inline-flex items-center gap-1 text-slate-400"><Calendar className="w-3.5 h-3.5" /> {new Date(order.dataCriacao).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </td>

                      {/* COL 3: Status da Integração */}
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-2 items-start">
                            {/* Badges Bookinfo */}
                            <div className="flex items-center gap-2">
                                {order.badge ? (
                                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-${order.badge.slug}-100 text-${order.badge.slug}-700 dark:bg-${order.badge.slug}-500/10 dark:text-${order.badge.slug}-400 ring-1 ring-inset ring-${order.badge.slug}-500/20`}>
                                    {order.badge.label}
                                  </span>
                                ) : (
                                   <span className="text-slate-500 text-xs">{order.status}</span>
                                )}
                                {order.compraConsignacao === 'S' ? (
                                     <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-500">
                                       Consignado
                                     </span>
                                ) : (
                                     <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-400">
                                       Venda
                                     </span>
                                )}
                            </div>
                            
                            {/* Customer Sync Status */}
                            {order.enable ? (
                              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-xs font-medium bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 rounded-md border border-emerald-100 dark:border-emerald-500/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                Cliente Vinculado (Horus)
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 text-rose-500 dark:text-rose-400 text-xs font-medium bg-rose-50 dark:bg-rose-500/10 px-2 py-1 rounded-md border border-rose-100 dark:border-rose-500/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                Cliente Pendente
                              </div>
                            )}
                        </div>
                      </td>

                      {/* COL 4: Ações */}
                      <td className="px-6 py-4 text-right">
                          <Link 
                            href={`/bookinfo/orders/${order.id}`}
                            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-indigo-600 hover:border-indigo-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:text-indigo-400 dark:hover:border-indigo-500/50"
                          >
                            <Eye className="w-4 h-4" />
                            Detalhar
                          </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                      Nenhum pedido encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
