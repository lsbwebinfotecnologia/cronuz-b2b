'use client';

import { useState, useEffect, use } from 'react';
import { getToken } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { Layers, ArrowLeft, CheckCircle2, Play, Save, Info, AlertTriangle, AlertCircle, ShoppingCart, DollarSign, Wallet, CreditCard, Package, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

export default function BookinfoOrderDetailPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const router = useRouter();
  
  const [orderData, setOrderData] = useState<any>(null);
  const [evaluation, setEvaluation] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAcknowledging, setIsAcknowledging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [activeTab, setActiveTab] = useState<'BOOKINFO' | 'HORUS'>('BOOKINFO');

  useEffect(() => {
    fetchOrderDetails();
  }, [params.id]);

  const fetchOrderDetails = async () => {
    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/bookinfo/orders/${params.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Falha ao buscar detalhes do pedido');
      
      const data = await res.json();
      setOrderData(data);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao comunicar com a parceira');
    } finally {
      setLoading(false);
    }
  };

  const acknowledgeOrder = async () => {
    setIsAcknowledging(true);
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/bookinfo/orders/${params.id}/acknowledge`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Não foi possível registrar o recebimento');
      
      toast.success('Pedido marcado como Recebido com sucesso!');
      await fetchOrderDetails();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
       setIsAcknowledging(false);
    }
  };

  const runEvaluation = async () => {
    setIsProcessing(true);
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/bookinfo/orders/${params.id}/evaluate-preview`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Erro ao processar as regras De/Para do Horus');
      
      const data = await res.json();
      
      const localEvals = data.map((d: any) => ({
         ...d,
         selected_status: d.analysis.status,
         effective_qty: d.analysis.allowed_qty >= d.analysis.requested_qty ? d.analysis.requested_qty : d.analysis.allowed_qty
      }));
      
      setEvaluation(localEvals);
      setActiveTab('HORUS');
      toast.success('Régua De/Para calculada com sucesso!');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
       setIsProcessing(false);
    }
  };

  const submitEvaluation = async () => {
    setIsSubmitting(true);
    try {
      const token = getToken();
      const payload = evaluation.map(ev => ({
         isbn13: ev.isbn13,
         quantidadeEfetiva: ev.selected_status === 'esgotado' || ev.selected_status === 'fora_catalogo' || ev.selected_status === 'item_nao_comercializado' ? 0 : ev.effective_qty,
         status: ev.selected_status.toUpperCase(),
         descontoEfetivo: ev.analysis.requested_discount,
         precoCapa: ev.horus_item?.VLR_CAPA || ev.bookinfo_item?.precoCapa || 0
      }));
      
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/bookinfo/orders/${params.id}/evaluate-submit`, {
        method: 'POST',
        headers: { 
           'Authorization': `Bearer ${token}`,
           'Content-Type': 'application/json'
        },
        body: JSON.stringify({ items: payload })
      });
      
      if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.detail || 'Erro ao enviar avaliação final');
      }
      
      toast.success('Avaliação enviada à Bookinfo.');
      fetchOrderDetails();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
       setIsSubmitting(false);
    }
  };
  
  const updateStatus = (index: number, newStatus: string) => {
      const evs = [...evaluation];
      evs[index].selected_status = newStatus;
      setEvaluation(evs);
  };

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

  const order = orderData.bookinfo_api || {};
  const orderInternal = orderData.order_internal || {};
  const customer = orderData.customer || {};
  const company = orderData.company || {};
  const bookinfoItems = order.itens || [];

  const limitUsed = customer.credit_limit && customer.credit_limit > 0 ? (customer.open_debts || 0) / customer.credit_limit * 100 : 0;
  const limitUsedPercent = Math.min(100, Math.max(0, limitUsed));

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
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
            </div>
          </div>
        </div>
        {/* Adicionei botão de recusar pedido futuramente */}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        
        {/* LEFT PANEL: Order Summary */}
        <div className="xl:col-span-1 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
             
             <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2 mb-2 text-slate-600 dark:text-slate-300 font-medium">
                  <Info className="w-4 h-4" /> 
                  Pedido B2B: {orderInternal.id} | Código Horus: {orderInternal.horus_pedido_venda || 'Pendente'}
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
                     <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Data de Criação</span>
                     <p className="font-medium text-slate-800 dark:text-slate-200 text-sm">
                        {order.dataCriacao ? new Date(order.dataCriacao).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : order.dataPedido ? new Date(order.dataPedido).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : orderInternal.created_at ? new Date(orderInternal.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'ND'}
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
                      <p className="font-bold text-slate-900 dark:text-white text-sm leading-tight">
                         {company.name || 'Não informado'}
                      </p>
                      <p className="text-[11px] font-mono text-slate-500 mt-1">{company.document}</p>
                   </div>
                </div>

                {order.observacao && (
                   <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30 p-4 rounded-xl">
                      <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block mb-2 flex items-center gap-1">
                         <Info className="w-3 h-3" /> Observações
                      </span>
                      <p className="text-sm text-blue-900 dark:text-blue-200 leading-relaxed">
                        {order.observacao}
                      </p>
                   </div>
                )}
                
                <hr className="border-slate-200 dark:border-slate-800/60" />
                
                {/* PREMIUM FINANCIAL TABLE */}
                <div className="bg-white dark:bg-slate-900 rounded-xl p-5 shadow-[0_0_40px_-10px_rgba(0,0,0,0.05)] border border-slate-100 dark:border-slate-800">
                  <h3 className="text-xs font-bold uppercase tracking-widest mb-4 text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-indigo-500" /> Resumo Financeiro
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-3 mb-5">
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-100 dark:border-slate-700/50 hover:shadow-md transition-shadow">
                      <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        <CreditCard className="w-3 h-3" /> Limite Total
                      </span>
                      <strong className="text-sm text-slate-800 dark:text-slate-200 font-bold block">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(customer.credit_limit || 0)}
                      </strong>
                    </div>
                    
                    <div className="bg-rose-50/50 dark:bg-rose-900/10 p-3 rounded-lg border border-rose-100 dark:border-rose-800/30 hover:shadow-md transition-shadow">
                      <span className="flex items-center gap-1.5 text-[10px] font-bold text-rose-500 uppercase tracking-wider mb-1">
                        <DollarSign className="w-3 h-3" /> Débitos
                      </span>
                      <strong className="text-sm text-rose-700 dark:text-rose-400 font-bold block">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(customer.open_debts || 0)}
                      </strong>
                    </div>
                    
                    <div className="bg-emerald-50/50 dark:bg-emerald-900/10 p-3 rounded-lg border border-emerald-100 dark:border-emerald-800/30 hover:shadow-md transition-shadow">
                      <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1">
                        <CheckCircle2 className="w-3 h-3" /> Disponível
                      </span>
                      <strong className="text-sm text-emerald-700 dark:text-emerald-400 font-bold block">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((customer.credit_limit || 0) - (customer.open_debts || 0))}
                      </strong>
                    </div>
                    
                    <div className="bg-amber-50/50 dark:bg-amber-900/10 p-3 rounded-lg border border-amber-100 dark:border-amber-800/30 hover:shadow-md transition-shadow">
                      <span className="flex items-center gap-1.5 text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">
                        <Package className="w-3 h-3" /> Consignado
                      </span>
                      <strong className="text-sm text-amber-700 dark:text-amber-400 font-bold block">
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

             </div>
             
             {/* ACTIONS */}
             <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 space-y-3">
                 {order.status === 'NOVO' && (
                     <button 
                       onClick={acknowledgeOrder}
                       disabled={isAcknowledging}
                       className="w-full flex justify-center items-center gap-2 bg-slate-900 text-white dark:bg-white dark:text-slate-900 px-4 py-3 rounded-xl text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
                     >
                        <CheckCircle2 className="w-4 h-4" /> Registrar como Recebido
                     </button>
                 )}
                 {(order.status === 'RECEBIDO' || order.status === 'NOVO') && (
                     <button 
                       onClick={runEvaluation}
                       disabled={isProcessing}
                       className="w-full flex justify-center items-center gap-2 bg-indigo-600 text-white px-4 py-3 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition disabled:opacity-50 shadow-sm shadow-indigo-500/20"
                     >
                        <Play className="w-4 h-4" /> Processar Análise (Horus)
                     </button>
                 )}
             </div>
          </div>
        </div>

        {/* RIGHT PANEL: Items Evaluation */}
        <div className="xl:col-span-3">
           <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden flex flex-col h-[calc(100vh-180px)]">
              
              <div className="px-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/20">
                 
                 <div className="flex gap-4">
                    <button 
                      onClick={() => setActiveTab('HORUS')}
                      className={`py-4 font-semibold text-sm border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'HORUS' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                    >
                      <Layers className="w-4 h-4" /> Análise B2B Horus ({evaluation.length})
                    </button>
                    <button 
                      onClick={() => setActiveTab('BOOKINFO')}
                      className={`py-4 font-semibold text-sm border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'BOOKINFO' ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                    >
                      <ShoppingCart className="w-4 h-4" /> Bookinfo Original ({bookinfoItems.length})
                    </button>
                 </div>

                 {activeTab === 'HORUS' && evaluation.length > 0 && (
                     <button 
                       onClick={submitEvaluation}
                       disabled={isSubmitting}
                       className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 my-2 rounded-lg text-sm font-semibold transition disabled:opacity-50 shadow-sm"
                     >
                        <Save className="w-4 h-4" /> Salvar Avaliação
                     </button>
                 )}
              </div>

              <div className="flex-1 overflow-auto p-0">
                  {activeTab === 'BOOKINFO' ? (
                      <table className="w-full text-left text-sm">
                          <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm z-10">
                              <tr>
                                  <th className="px-5 py-3 font-semibold text-slate-600 dark:text-slate-300">ISBN</th>
                                  <th className="px-5 py-3 font-semibold text-slate-600 dark:text-slate-300 text-center">Quantidade</th>
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
                                     <td className="px-5 py-4 text-center font-medium">
                                        {item.quantidade}
                                     </td>
                                     <td className="px-5 py-4 text-right font-medium text-slate-700 dark:text-slate-300">
                                        {Number(item.descontoProposto || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                                     </td>
                                 </tr>
                             ))}
                             {bookinfoItems.length === 0 && (
                                <tr>
                                  <td colSpan={3} className="text-center p-8 text-slate-400">Nenhum item encontrado no pedido original.</td>
                                </tr>
                             )}
                          </tbody>
                      </table>
                  ) : (
                    evaluation.length === 0 ? (
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
                                 Clique no botão <strong>"Processar Análise (Horus)"</strong> na barra lateral para gerar o De/Para e avaliar descontos e estoques automaticamente.
                               </p>
                            </div>
                        </div>
                    ) : (
                        <table className="w-full text-left text-sm">
                            <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm z-10">
                                <tr>
                                    <th className="px-5 py-3 font-semibold text-slate-600 dark:text-slate-300">Item (ISBN)</th>
                                    <th className="px-5 py-3 font-semibold text-slate-600 dark:text-slate-300">Quantidade</th>
                                    <th className="px-5 py-3 font-semibold text-slate-600 dark:text-slate-300">Desconto</th>
                                    <th className="px-5 py-3 font-semibold text-slate-600 dark:text-slate-300">Detalhe Auto.</th>
                                    <th className="px-5 py-3 font-semibold text-slate-600 dark:text-slate-300 bg-indigo-50/50 dark:bg-indigo-900/10">Situação Final</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                               {evaluation.map((ev, idx) => (
                                   <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                       <td className="px-5 py-4">
                                           <p className="font-semibold text-slate-800 dark:text-white max-w-xs truncate" title={ev.horus_item?.NOM_ITEM || 'ND'}>
                                               {ev.horus_item?.NOM_ITEM || 'Item não encontrado no Horus'}
                                           </p>
                                           <p className="font-mono text-xs text-slate-500 mt-1">{ev.isbn13}</p>
                                       </td>
                                       <td className="px-5 py-4">
                                           <div className="space-y-1 text-xs">
                                               <div className="flex justify-between w-24">
                                                   <span className="text-slate-400">Pedida:</span>
                                                   <span className="font-bold">{ev.analysis.requested_qty}</span>
                                               </div>
                                               <div className="flex justify-between w-24">
                                                   <span className="text-slate-400">Disp. ERP:</span>
                                                   <span className={ev.analysis.allowed_qty >= ev.analysis.requested_qty ? 'text-emerald-600' : 'text-rose-600 font-bold'}>
                                                       {ev.analysis.allowed_qty}
                                                   </span>
                                               </div>
                                           </div>
                                       </td>
                                       <td className="px-5 py-4">
                                           <div className="space-y-1 text-xs">
                                               <div className="flex justify-between w-28">
                                                   <span className="text-slate-400">Proposto:</span>
                                                   <span className="font-bold">{ev.analysis.requested_discount}%</span>
                                               </div>
                                               <div className="flex justify-between w-28">
                                                   <span className="text-slate-400">Auto. ERP:</span>
                                                   <span className={ev.analysis.requested_discount > ev.analysis.allowed_discount ? 'text-rose-600 font-bold' : 'text-emerald-600'}>
                                                       {ev.analysis.allowed_discount}%
                                                   </span>
                                               </div>
                                           </div>
                                       </td>
                                       <td className="px-5 py-4">
                                           {ev.analysis.details.includes('Divergência') ? (
                                                <span className="inline-flex items-center gap-1 text-rose-600 text-xs font-medium bg-rose-50 px-2 py-1 rounded dark:bg-rose-500/10 dark:text-rose-400">
                                                    <AlertTriangle className="w-3 h-3" /> {ev.analysis.details}
                                                </span>
                                           ) : ev.analysis.status === 'item_nao_comercializado' ? (
                                                <span className="inline-flex items-center gap-1 text-slate-500 text-xs font-medium bg-slate-100 px-2 py-1 rounded dark:bg-slate-800 dark:text-slate-400">
                                                    <AlertCircle className="w-3 h-3" /> Não Cadastrado
                                                </span>
                                           ) : (
                                                <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium">
                                                    <CheckCircle2 className="w-3 h-3" /> {ev.analysis.details || 'OK'}
                                                </span>
                                           )}
                                       </td>
                                       <td className="px-5 py-4 bg-indigo-50/30 dark:bg-indigo-900/10">
                                            <select 
                                                value={ev.selected_status}
                                                onChange={(e) => updateStatus(idx, e.target.value)}
                                                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-semibold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500/50"
                                            >
                                                <option value="item_nao_comercializado">Item ñ Comercializado</option>
                                                <option value="esgotado">Esgotado</option>
                                                <option value="fora_catalogo">Fora de Catálogo</option>
                                                <option value="reservado_total">Atender Total (Reservado)</option>
                                                <option value="atendimento_parcial_sem_reserva">Atendimento Parcial</option>
                                                <option value="sem_estoque">Sem Estoque</option>
                                                <option value="item_rejeitado">Rejeitar Item (Manual)</option>
                                            </select>
                                            {ev.selected_status !== ev.analysis.status && (
                                                <p className="text-[10px] text-amber-600 mt-1 font-medium"> Alterado Manualmente </p>
                                            )}
                                       </td>
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
