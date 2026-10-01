'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, TrendingUp, Users, Package, ShoppingCart, RefreshCw, Clock, Target, Calendar, Building2, User, BarChart3, Layers, CheckCircle, ArrowDownRight, ShieldCheck, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { getToken, getUser } from '@/lib/auth';

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
  const [includePersonal, setIncludePersonal] = useState(false);
  const [activeTooltipMonth, setActiveTooltipMonth] = useState<string | null>(null);
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
         fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/dashboard/metrics?start_date=${startDate}&end_date=${endDate}&include_personal=${includePersonal}&history_months=6&t=${new Date().getTime()}`, { headers: { 'Authorization': `Bearer ${token}` } }),
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
    const user = getUser();
    if (user?.initial_page && user.initial_page !== 'DEFAULT' && user.initial_page !== '/') {
      const target = user.initial_page.startsWith('/') ? user.initial_page : `/${user.initial_page}`;
      window.location.href = target;
      return;
    }
    fetchMetrics();
    fetchRecentOrders();
  }, [filterMonth, includePersonal]);

  const formatBRL = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-2">Visão Geral</h1>
          <p className="text-slate-500 dark:text-slate-400">
             {metrics?.uses_horus ? 'Bem-vindo ao B2B Horus. ' : 'Bem-vindo ao Cronuz. '}
             Acompanhe a performance financeira e operacional da sua empresa.
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
          {/* Seletor de Escopo Gerencial vs Global */}
          <div className="bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl flex items-center border border-slate-200 dark:border-slate-700/60 shadow-inner">
            <button
              type="button"
              onClick={() => setIncludePersonal(false)}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                !includePersonal 
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
              title="Exibe apenas a movimentação real da empresa (ignora contas pessoais e despesas fora do relatório)"
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Visão Gerencial</span>
            </button>
            <button
              type="button"
              onClick={() => setIncludePersonal(true)}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                includePersonal 
                  ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
              title="Exibe todas as contas e transações, incluindo contas físicas/pessoais"
            >
              <User className="w-3.5 h-3.5" />
              <span>Visão Global (PF+PJ)</span>
            </button>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Período de Análise</label>
            <input 
              type="month" 
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="w-full sm:w-auto border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
        </div>
      </div>

      {!includePersonal && (
        <div className="bg-indigo-50/70 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 rounded-xl px-4 py-2.5 flex items-center justify-between text-xs text-indigo-800 dark:text-indigo-300">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span><strong>Filtro Gerencial Ativo:</strong> As análises refletem estritamente a saúde empresarial (contas físicas e lançamentos marcados fora da análise são desconsiderados).</span>
          </div>
          <button type="button" onClick={() => setIncludePersonal(true)} className="underline hover:text-indigo-950 dark:hover:text-white font-medium ml-2 shrink-0">
            Alternar para Global
          </button>
        </div>
      )}

      {/* SEÇÃO CONSOLIDADA DE FATURAMENTO (PEDIDOS + SERVIÇOS) */}
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              Análise de Faturamento
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Consolidação de Pedidos de Venda Faturados e Ordens de Serviço Concluídas
            </p>
          </div>
        </div>

        {/* CARDS DE DESTAQUE DE FATURAMENTO */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Card Total Consolidado */}
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
            className="rounded-2xl border border-indigo-200/80 dark:border-indigo-800/60 bg-gradient-to-br from-indigo-50/50 via-white to-white dark:from-indigo-950/30 dark:via-slate-900 dark:to-slate-900 p-5 shadow-sm"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider">Faturamento Consolidado</span>
              <div className="p-2 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 rounded-xl">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            {loadingMetrics ? (
              <div className="h-8 w-32 bg-slate-200 dark:bg-slate-800 rounded animate-pulse my-1"></div>
            ) : (
              <div>
                <p className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  {formatBRL(metrics?.consolidated_revenue?.total || 0)}
                </p>
                {(() => {
                  const hist = metrics?.revenue_history || [];
                  const curIdx = hist.findIndex((h: any) => (h.month || h.year_month) === filterMonth);
                  const prevItem = curIdx > 0 ? hist[curIdx - 1] : (hist.length > 1 ? hist[hist.length - 2] : null);
                  const curItem = curIdx >= 0 ? hist[curIdx] : hist[hist.length - 1];
                  const curTotal = Number(curItem?.total ?? curItem?.total_revenue ?? 0);
                  const prevTotal = Number(prevItem?.total ?? prevItem?.total_revenue ?? 0);
                  if (prevTotal > 0 && curItem) {
                    const diff = curTotal - prevTotal;
                    const pct = Math.round((diff / prevTotal) * 100);
                    const isPos = pct >= 0;
                    return (
                      <div className="flex items-center gap-1 text-[11px] font-bold mt-1.5">
                        <span className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-md ${isPos ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'}`}>
                          {isPos ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                          {isPos ? `+${pct}%` : `${pct}%`}
                        </span>
                        <span className="text-slate-400 font-normal">vs mês anterior</span>
                      </div>
                    );
                  }
                  return <p className="text-[11px] text-slate-400 mt-1">Período selecionado</p>;
                })()}
              </div>
            )}
          </motion.div>

          {/* Card Pedidos Faturados */}
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05, duration: 0.3 }}
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-5 shadow-sm"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Pedidos Faturados</span>
              <div className="p-2 bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 rounded-xl">
                <ShoppingCart className="w-4 h-4" />
              </div>
            </div>
            {loadingMetrics ? (
              <div className="h-8 w-32 bg-slate-200 dark:bg-slate-800 rounded animate-pulse my-1"></div>
            ) : (
              <div>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 tracking-tight">
                  {formatBRL(metrics?.consolidated_revenue?.orders || 0)}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">Vendas de produtos no período</p>
              </div>
            )}
          </motion.div>

          {/* Card Serviços Concluídos */}
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.3 }}
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-5 shadow-sm"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Serviços (OS)</span>
              <div className="p-2 bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 rounded-xl">
                <Target className="w-4 h-4" />
              </div>
            </div>
            {loadingMetrics ? (
              <div className="h-8 w-32 bg-slate-200 dark:bg-slate-800 rounded animate-pulse my-1"></div>
            ) : (
              <div>
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400 tracking-tight">
                  {formatBRL(metrics?.consolidated_revenue?.services || 0)}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">{metrics?.service_metrics?.completed?.count || 0} ordens concluídas</p>
              </div>
            )}
          </motion.div>

          {/* Card Balanço Financeiro Líquido */}
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.3 }}
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-5 shadow-sm"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Resultado Caixa</span>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-xl">
                <Building2 className="w-4 h-4" />
              </div>
            </div>
            {loadingMetrics ? (
              <div className="h-8 w-32 bg-slate-200 dark:bg-slate-800 rounded animate-pulse my-1"></div>
            ) : (() => {
              const recPaid = metrics?.financial_metrics?.receivable?.paid || 0;
              const payPaid = metrics?.financial_metrics?.payable?.paid || 0;
              const net = recPaid - payPaid;
              return (
                <div>
                  <p className={`text-2xl font-bold tracking-tight ${net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {formatBRL(net)}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {includePersonal ? 'Todas as contas' : 'Apenas contas da empresa'}
                  </p>
                </div>
              );
            })()}
          </motion.div>
        </div>

        {/* GRÁFICO HISTÓRICO DE FATURAMENTO MÊS A MÊS */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                Evolução do Faturamento Mensal
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Histórico comparativo dos meses anteriores até o período filtrado
              </p>
            </div>

            {/* Legenda do Gráfico */}
            <div className="flex items-center gap-4 text-xs font-semibold">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-blue-500"></span>
                <span className="text-slate-600 dark:text-slate-300">Pedidos</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-purple-500"></span>
                <span className="text-slate-600 dark:text-slate-300">Serviços / OS</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-indigo-600"></span>
                <span className="text-slate-900 dark:text-white font-bold">Total Faturado</span>
              </div>
            </div>
          </div>

          {/* Área das Barras do Gráfico */}
          {loadingMetrics ? (
            <div className="h-64 flex items-center justify-center">
              <RefreshCw className="w-6 h-6 animate-spin text-slate-300" />
            </div>
          ) : !metrics?.revenue_history || metrics.revenue_history.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-sm">
              <BarChart3 className="w-10 h-10 mb-2 text-slate-300 dark:text-slate-700" />
              Nenhum dado de faturamento encontrado no período.
            </div>
          ) : (() => {
            const history = metrics.revenue_history;
            const maxVal = Math.max(...history.map((h: any) => Number(h.total ?? h.total_revenue ?? 0)), 1);

            return (
              <div className="mt-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 sm:gap-4 items-end min-h-[220px]">
                  {history.map((item: any, idx: number) => {
                    const itemMonth = item.month || item.year_month || '';
                    const itemLabel = item.month_label || item.label || itemMonth;
                    const itemTotal = Number(item.total ?? item.total_revenue ?? 0);
                    const itemOrders = Number(item.orders ?? item.orders_revenue ?? 0);
                    const itemServices = Number(item.services ?? item.services_revenue ?? 0);

                    const isSelected = itemMonth === filterMonth;
                    const totalPct = maxVal > 0 ? Math.min(Math.round((itemTotal / maxVal) * 100), 100) : 0;
                    const ordersHeightPct = itemTotal > 0 ? (itemOrders / itemTotal) * 100 : 0;
                    const servicesHeightPct = itemTotal > 0 ? (itemServices / itemTotal) * 100 : 0;

                    return (
                      <div 
                        key={itemMonth || idx} 
                        onClick={() => setFilterMonth(itemMonth)}
                        className={`group relative flex flex-col items-center cursor-pointer p-2.5 rounded-xl transition-all ${
                          isSelected 
                            ? 'bg-indigo-50/80 dark:bg-indigo-950/40 ring-2 ring-indigo-500/50' 
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        {/* Tooltip flutuante no Hover / Active */}
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none absolute -top-24 z-20 bg-slate-900 text-white text-[11px] p-2.5 rounded-xl shadow-xl border border-slate-700 whitespace-nowrap min-w-[150px]">
                          <p className="font-bold text-slate-200 border-b border-slate-700 pb-1 mb-1">{itemLabel}</p>
                          <div className="flex justify-between gap-3 text-blue-300">
                            <span>📦 Pedidos:</span>
                            <span className="font-mono font-bold">{formatBRL(itemOrders)}</span>
                          </div>
                          <div className="flex justify-between gap-3 text-purple-300">
                            <span>🛠️ Serviços:</span>
                            <span className="font-mono font-bold">{formatBRL(itemServices)}</span>
                          </div>
                          <div className="flex justify-between gap-3 text-white font-bold border-t border-slate-700 pt-1 mt-1">
                            <span>Total:</span>
                            <span className="font-mono text-emerald-400">{formatBRL(itemTotal)}</span>
                          </div>
                        </div>

                        {/* Valor compacto acima da barra */}
                        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-2 truncate max-w-full">
                          {itemTotal >= 1000 ? `R$ ${(itemTotal / 1000).toFixed(1)}k` : formatBRL(itemTotal)}
                        </span>

                        {/* Barra do Gráfico */}
                        <div className="w-full max-w-[48px] h-36 bg-slate-100 dark:bg-slate-800/60 rounded-xl p-1 flex items-end justify-center">
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: `${Math.max(totalPct, 4)}%` }}
                            transition={{ duration: 0.6, delay: idx * 0.08 }}
                            className="w-full rounded-lg overflow-hidden flex flex-col justify-end shadow-sm"
                          >
                            {/* Segmento de Serviços (Topo) */}
                            {servicesHeightPct > 0 && (
                              <div 
                                style={{ height: `${servicesHeightPct}%` }}
                                className="w-full bg-purple-500 hover:bg-purple-400 transition-colors"
                                title={`Serviços: ${formatBRL(itemServices)}`}
                              />
                            )}
                            {/* Segmento de Pedidos (Base) */}
                            {ordersHeightPct > 0 && (
                              <div 
                                style={{ height: `${ordersHeightPct}%` }}
                                className="w-full bg-blue-500 hover:bg-blue-400 transition-colors"
                                title={`Pedidos: ${formatBRL(itemOrders)}`}
                              />
                            )}
                            {itemTotal === 0 && (
                              <div className="w-full h-1 bg-slate-300 dark:bg-slate-700 rounded-full" />
                            )}
                          </motion.div>
                        </div>

                        {/* Rótulo do Mês na Base */}
                        <div className="mt-2.5 text-center">
                          <span className={`text-xs block ${isSelected ? 'font-black text-indigo-600 dark:text-indigo-400' : 'font-medium text-slate-600 dark:text-slate-400'}`}>
                            {itemLabel}
                          </span>
                          {isSelected && (
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400 mt-0.5"></span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1">
                    💡 <em>Clique em qualquer mês para filtrar os detalhes e pedidos daquele período.</em>
                  </span>
                  <span className="font-mono text-[11px] hidden sm:inline">
                    Máx: {formatBRL(maxVal)}
                  </span>
                </div>
              </div>
            );
          })()}
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

      <div className={`grid gap-6 ${((!metrics || metrics.module_orders) && (!metrics || metrics.module_crm)) ? 'lg:grid-cols-2' : 'lg:grid-cols-1'}`}>
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

        {(!metrics || metrics.module_crm) && (
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
        )}
      </div>
    </div>
  );
}
