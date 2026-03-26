'use client';

import { useState, useEffect } from 'react';
import { getToken } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { Layers, ArrowLeft, CheckCircle2, Play, Save, Info, AlertTriangle, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

export default function BookinfoOrderDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  
  const [order, setOrder] = useState<any>(null);
  const [evaluation, setEvaluation] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAcknowledging, setIsAcknowledging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      setOrder(data);
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
      
      // Initialize local state mapping for editing the dropdowns
      const localEvals = data.map((d: any) => ({
         ...d,
         selected_status: d.analysis.status,
         effective_qty: d.analysis.allowed_qty >= d.analysis.requested_qty ? d.analysis.requested_qty : d.analysis.allowed_qty
      }));
      
      setEvaluation(localEvals);
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
         descontoEfetivo: ev.analysis.requested_discount, // Keeping proposed as effective if we are accepting
         precoCapa: ev.horus_item?.VLR_CAPA || ev.bookinfo_item.precoCapa || 0
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

  if (loading || !order) {
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

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/bookinfo/orders" className="p-2 rounded-lg bg-white text-slate-500 hover:bg-slate-50 border border-slate-200 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 transition">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
             Detalhe do Pedido | <span className="text-slate-500 font-mono text-xl">{order.id}</span>
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        
        {/* LEFT PANEL: Order Summary */}
        <div className="xl:col-span-1 space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
             
             <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Status B2B</span>
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                        {order.status}
                    </span>
                </div>
                <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                   Pedido Cliente: <strong className="text-slate-900 dark:text-white">{order.pedidoCliente || 'ND'}</strong>
                   <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                       {order.compraConsignacao === 'S' ? 'CONSIGNAÇÃO' : 'COMPRA'}
                   </span>
                </div>
             </div>
             
             <div className="p-6 space-y-5">
                <div>
                   <span className="text-xs text-slate-400 block mb-1">Cliente Solicitante</span>
                   <p className="font-semibold text-slate-900 dark:text-white text-sm">
                      {order.nomeComprador || 'Não informado'}
                   </p>
                   <p className="text-sm font-mono text-slate-500">{order.cnpjComprador}</p>
                </div>
                
                <div>
                   <span className="text-xs text-slate-400 block mb-1">Data de Criação</span>
                   <p className="font-semibold text-slate-900 dark:text-white text-sm">
                      {new Date(order.dataCriacao).toLocaleString('pt-BR')}
                   </p>
                </div>

                {order.observacao && (
                   <div className="bg-amber-50 dark:bg-amber-500/10 p-3 rounded-lg border border-amber-200 dark:border-amber-500/20">
                      <span className="text-xs font-semibold text-amber-700 dark:text-amber-500 mb-1 flex items-center gap-1">
                         <Info className="w-3 h-3" /> Observações do Pedido
                      </span>
                      <p className="text-sm text-amber-800 dark:text-amber-400 font-medium leading-relaxed">{order.observacao}</p>
                   </div>
                )}
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
              
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/20">
                 <h2 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    Análise De/Para <span className="text-slate-400 font-normal text-sm">({evaluation.length || order.itens?.length || 0} itens)</span>
                 </h2>
                 {evaluation.length > 0 && (
                     <button 
                       onClick={submitEvaluation}
                       disabled={isSubmitting}
                       className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition disabled:opacity-50 shadow-sm"
                     >
                        <Save className="w-4 h-4" /> Salvar Avaliação
                     </button>
                 )}
              </div>

              <div className="flex-1 overflow-auto p-0">
                  {evaluation.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center space-y-4">
                          <Layers className="w-16 h-16 opacity-20" />
                          <p className="max-w-md">Para visualizar as divergências de saldo e desconto com o ERP Horus, clique em <strong>Processar Análise (Horus)</strong>.</p>
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
                  )}
              </div>
           </div>
        </div>

      </div>
    </div>
  );
}
