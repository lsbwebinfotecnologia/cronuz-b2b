'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, TrendingUp, Users, Package, ShoppingCart, RefreshCw, Clock, Target, Calendar } from 'lucide-react';
import Link from 'next/link';
import { getToken } from '@/lib/auth';

const defaultStats = [
  { id: 'revenue', name: 'Faturamento Total', value: 'R$ 0,00', change: '+0%', icon: TrendingUp },
  { id: 'orders', name: 'Pedidos Ativos', value: '0', change: '0', icon: ShoppingCart },
  { id: 'customers', name: 'Empresas Clientes', value: '0', change: '0', icon: Users },
  { id: 'products', name: 'Produtos Ativos', value: '0', change: '0', icon: Package },
];

export default function DashboardPage() {
  const [horusStatus, setHorusStatus] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [crmTasks, setCrmTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [filterMonth, setFilterMonth] = useState(() => {
     const d = new Date();
     return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const fetchRecentOrders = async () => {
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/orders`, {
         headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
         const data = await res.json();
         // Sort descending by created_at and take top 5
         const orders = data.items || [];
         const sorted = orders.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
         setRecentOrders(sorted.slice(0, 5));
      }
    } catch (error) {
      console.error("Failed to fetch recent orders", error);
    }
  };

  const fetchMetrics = async () => {
    setLoadingMetrics(true);
    try {
      const token = getToken();
      if (!token) return; // Prevent fetch if no token
      
      const [year, month] = filterMonth.split('-');
      const lastDay = new Date(Number(year), Number(month), 0).getDate();
      const startDate = `${filterMonth}-01`;
      const endDate = `${filterMonth}-${lastDay}`;
      
      const [resMetrics, resTasks] = await Promise.all([
         fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/dashboard/metrics?start_date=${startDate}&end_date=${endDate}&t=${new Date().getTime()}`, { headers: { 'Authorization': `Bearer ${token}` } }),
         fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/dashboard/crm-tasks`, { headers: { 'Authorization': `Bearer ${token}` } })
      ]);
      
      if (resMetrics.ok) {
         setMetrics(await resMetrics.json());
      }
      if (resTasks.ok) {
         setCrmTasks(await resTasks.json());
      }
    } catch (error) {
      console.error("Failed to fetch metrics", error);
    } finally {
      setLoadingMetrics(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    fetchRecentOrders();
  }, [filterMonth]);

  const formatBRL = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-2">Visão Geral</h1>
          <p className="text-slate-500 dark:text-slate-400">
             {metrics?.uses_horus ? 'Bem-vindo ao B2B Horus. ' : 'Bem-vindo ao Cronuz. '}
             Acompanhe os indicadores da sua multi-empresa.
          </p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Período de Análise</label>
          <input 
            type="month" 
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
          />
        </div>
      </div>

      {/* Basic Stats Row (Customers & Products) */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.4 }}
            className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 hover:bg-slate-50 shadow-sm transition-colors dark:border-slate-800 dark:bg-slate-900/40 dark:hover:bg-slate-900/60"
          >
            <div className="flex items-center justify-between mb-4">
              <Users className="h-5 w-5 text-indigo-600" />
            </div>
            <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Empresas Clientes</h3>
            {loadingMetrics ? <div className="h-8 w-24 bg-slate-200 dark:bg-slate-800 rounded animate-pulse mt-1"></div> : (
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{metrics?.total_customers?.toString() || '0'}</p>
            )}
          </motion.div>
          
          {metrics && metrics.module_products && (
             <motion.div
               initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.4 }}
               className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 hover:bg-slate-50 shadow-sm transition-colors dark:border-slate-800 dark:bg-slate-900/40 dark:hover:bg-slate-900/60"
             >
               <div className="flex items-center justify-between mb-4">
                 <Package className="h-5 w-5 text-indigo-400" />
               </div>
               <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Produtos Cadastrados</h3>
               {loadingMetrics ? <div className="h-8 w-24 bg-slate-200 dark:bg-slate-800 rounded animate-pulse mt-1"></div> : (
                   <p className="text-2xl font-bold text-slate-900 dark:text-white">{metrics?.active_products?.toString() || '0'}</p>
               )}
             </motion.div>
          )}
      </div>

      {/* Orders Modulo */}
      {metrics && metrics.module_orders && (
         <div className="mt-8">
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2"><ShoppingCart className="w-5 h-5 text-[var(--color-primary-base)]" /> B2B e Pedidos</h2>
            <div className="grid gap-6 sm:grid-cols-2">
               {/* Effectivo */}
               <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900/40">
                  <h3 className="text-sm font-medium text-slate-500 mb-1 uppercase">Efetivado (Faturados)</h3>
                  {loadingMetrics ? <div className="h-10 w-32 bg-slate-200 dark:bg-slate-800 rounded animate-pulse"></div> : (
                     <div className="flex items-center justify-between">
                         <p className="text-3xl font-bold text-emerald-600">{formatBRL(metrics.orders_revenue?.invoiced || 0)}</p>
                     </div>
                  )}
               </motion.div>

               {/* Previsao */}
               <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900/40">
                  <h3 className="text-sm font-medium text-slate-500 mb-1 uppercase">Previsão (Pendentes / Aguard. Faturamento)</h3>
                  {loadingMetrics ? <div className="h-10 w-32 bg-slate-200 dark:bg-slate-800 rounded animate-pulse"></div> : (
                     <div className="flex items-center justify-between">
                         <p className="text-3xl font-bold text-blue-500">{formatBRL(metrics.orders_revenue?.pending || 0)}</p>
                         <p className="text-sm text-slate-500">{metrics.active_orders || 0} pedidos</p>
                     </div>
                  )}
               </motion.div>
            </div>
         </div>
      )}

      {/* Services Modulo */}
      {metrics && metrics.module_services && (
         <div className="mt-8">
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2"><Target className="w-5 h-5 text-indigo-500" /> Ordens de Serviço</h2>
            <div className="grid gap-6 sm:grid-cols-2">
               {/* Effectivo */}
               <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900/40">
                  <h3 className="text-sm font-medium text-slate-500 mb-1 uppercase">Efetivado (Concluídas)</h3>
                  {loadingMetrics ? <div className="h-10 w-32 bg-slate-200 dark:bg-slate-800 rounded animate-pulse"></div> : (
                     <div className="flex items-center justify-between">
                         <p className="text-3xl font-bold text-emerald-600">{formatBRL(metrics.service_metrics?.completed?.value || 0)}</p>
                         <p className="text-sm text-slate-500">{metrics.service_metrics?.completed?.count || 0} OS</p>
                     </div>
                  )}
               </motion.div>

               {/* Previsao */}
               <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900/40">
                  <h3 className="text-sm font-medium text-slate-500 mb-1 uppercase">Previsão (Pendentes / Em Execução)</h3>
                  {loadingMetrics ? <div className="h-10 w-32 bg-slate-200 dark:bg-slate-800 rounded animate-pulse"></div> : (
                     <div className="flex items-center justify-between">
                         <p className="text-3xl font-bold text-amber-500">{formatBRL(metrics.service_metrics?.pending?.value || 0)}</p>
                         <p className="text-sm text-slate-500">{metrics.service_metrics?.pending?.count || 0} OS</p>
                     </div>
                  )}
               </motion.div>
            </div>
         </div>
      )}

       {/* Financial Modulo */}
      {metrics && metrics.module_financial && (
         <div className="mt-8">
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-green-500" /> Financeiro e Caixa</h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
               {/* Receitas */}
               <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900/40 shadow-sm flex flex-col gap-4">
                  <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
                     <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase">Entradas (Receitas)</h3>
                     <ArrowUpRight className="w-4 h-4 text-green-500" />
                  </div>
                  {loadingMetrics ? <div className="h-16 bg-slate-200 dark:bg-slate-800 rounded animate-pulse"></div> : (
                     <>
                        <div className="flex justify-between items-end">
                           <span className="text-xs text-slate-500">Realizado (Recebido)</span>
                           <span className="font-bold text-green-600 text-lg">{formatBRL(metrics.financial_metrics?.receivable?.paid || 0)}</span>
                        </div>
                        <div className="flex justify-between items-end">
                           <span className="text-xs text-slate-500">Previsto (A Receber)</span>
                           <span className="font-semibold text-slate-700 dark:text-slate-300">{formatBRL(metrics.financial_metrics?.receivable?.pending || 0)}</span>
                        </div>
                     </>
                  )}
               </motion.div>

               {/* Despesas */}
               <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900/40 shadow-sm flex flex-col gap-4">
                  <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
                     <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase">Saídas (Despesas)</h3>
                     <ArrowUpRight className="w-4 h-4 text-red-500 rotate-90" />
                  </div>
                  {loadingMetrics ? <div className="h-16 bg-slate-200 dark:bg-slate-800 rounded animate-pulse"></div> : (
                     <>
                        <div className="flex justify-between items-end">
                           <span className="text-xs text-slate-500">Realizado (Pago)</span>
                           <span className="font-bold text-red-500 text-lg">{formatBRL(metrics.financial_metrics?.payable?.paid || 0)}</span>
                        </div>
                        <div className="flex justify-between items-end">
                           <span className="text-xs text-slate-500">Previsto (A Pagar)</span>
                           <span className="font-semibold text-slate-700 dark:text-slate-300">{formatBRL(metrics.financial_metrics?.payable?.pending || 0)}</span>
                        </div>
                     </>
                  )}
               </motion.div>

               {/* Saldo Líquido */}
               <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900/40 shadow-sm flex flex-col gap-4">
                  <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
                     <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase">Balanço Líquido</h3>
                     <div className="w-4 h-4 rounded-full bg-slate-200 flex items-center justify-center font-bold text-[10px] text-slate-600">Σ</div>
                  </div>
                  {loadingMetrics ? <div className="h-16 bg-slate-200 dark:bg-slate-800 rounded animate-pulse"></div> : (() => {
                      const netRealizado = (metrics.financial_metrics?.receivable?.paid || 0) - (metrics.financial_metrics?.payable?.paid || 0);
                      const netPrevisto = (metrics.financial_metrics?.receivable?.pending || 0) - (metrics.financial_metrics?.payable?.pending || 0);
                      return (
                     <>
                        <div className="flex justify-between items-end">
                           <span className="text-xs text-slate-500">Saldo Atual (Efetivado)</span>
                           <span className={`font-black text-xl ${netRealizado >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatBRL(netRealizado)}</span>
                        </div>
                        <div className="flex justify-between items-end">
                           <span className="text-xs text-slate-500">Saldo Futuro (Previsto)</span>
                           <span className={`font-bold ${netPrevisto >= 0 ? 'text-green-600' : 'text-red-500'}`}>{formatBRL(netPrevisto)}</span>
                        </div>
                     </>
                     )
                  })()}
               </motion.div>
            </div>
         </div>
      )}

      <div className={`grid gap-6 ${(!metrics || metrics.module_orders) ? 'lg:grid-cols-2' : 'lg:grid-cols-1'}`}>
        {(!metrics || metrics.module_orders) && (
        <motion.div 
           initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
           className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[300px]"
        >
           <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Clock className="w-5 h-5 opacity-70" /> Pedidos Recentes
              </h2>
              <Link href="/orders" className="text-sm font-semibold text-[var(--color-primary-base)] hover:underline">
                Ver todos
              </Link>
           </div>
           
           <div className="p-0 flex-1 flex flex-col">
              {recentOrders.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 text-sm p-8">
                  <Package className="w-12 h-12 mb-3 text-slate-300 dark:text-slate-700" />
                  Nenhum pedido recente registrado.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {recentOrders.map(order => (
                    <Link 
                      key={order.id} 
                      href={`/orders/${order.id}`}
                      className="flex items-center justify-between p-4 sm:p-6 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group cursor-pointer"
                    >
                       <div>
                          <p className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-[var(--color-primary-base)] transition-colors">
                            Pedido #{order.id} {order.origin === 'store' && <span className="ml-2 text-[10px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-500">B2B Store</span>}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            {new Date(order.created_at).toLocaleString('pt-BR')} • {order.customer?.fantasy_name || 'Cliente B2B'}
                          </p>
                       </div>
                       <div className="text-right">
                         <p className="text-sm font-black text-[var(--color-primary-base)] mb-1">
                           R$ {order.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                         </p>
                         <span className={`inline-block px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                            order.status === 'CANCELLED' ? 'bg-red-100 text-red-700' : 
                            order.status === 'INVOICED' ? 'bg-emerald-100 text-emerald-700' :
                            'bg-indigo-100 text-indigo-700'
                         }`}>
                           {order.status === "NEW" ? "Novo" : 
                            order.status === "PROCESSING" ? "Processando" :
                            order.status === "SENT_TO_HORUS" ? "Em Processamento" :
                            order.status === "DISPATCH" ? "Em Separação" :
                            order.status === "INVOICED" ? "Faturado" :
                            order.status === "CANCELLED" ? "Cancelado" : order.status}
                         </span>
                       </div>
                    </Link>
                  ))}
                </div>
              )}
           </div>
        </motion.div>
        )}

        <motion.div 
           initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
           className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[300px]"
        >
           <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Target className="w-5 h-5 text-amber-500" /> Minhas Tarefas (CRM)
              </h2>
           </div>
           
           <div className="p-0 flex-1 flex flex-col">
              {loadingMetrics ? (
                  <div className="flex-1 flex items-center justify-center p-8"><RefreshCw className="w-6 h-6 animate-spin text-slate-300" /></div>
              ) : crmTasks.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 text-sm p-8">
                  <Calendar className="w-12 h-12 mb-3 text-slate-200 dark:text-slate-800" />
                  Nenhuma tarefa pendente no CRM!
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {crmTasks.map(task => (
                    <Link 
                      key={task.id} 
                      href={`/customers/${task.customer_id}/crm`}
                      className="flex items-center justify-between p-4 sm:p-5 hover:bg-amber-50 dark:hover:bg-amber-900/10 transition-colors group cursor-pointer"
                    >
                       <div>
                          <p className="text-sm font-bold text-slate-800 dark:text-slate-200 group-hover:text-amber-600 transition-colors truncate max-w-[200px] sm:max-w-xs">
                            {task.content}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {task.customer_name}
                          </p>
                       </div>
                       <div className="text-right">
                         <span className="inline-block px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 mb-1">
                           Pendente
                         </span>
                         <p className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                           {new Date(task.due_date).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                         </p>
                       </div>
                    </Link>
                  ))}
                </div>
              )}
           </div>
        </motion.div>
      </div>
    </div>
  );
}
