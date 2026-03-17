'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, TrendingUp, Users, Package, ShoppingCart, RefreshCw, Clock } from 'lucide-react';
import Link from 'next/link';

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
  const [loading, setLoading] = useState(true);
  const [loadingMetrics, setLoadingMetrics] = useState(true);

  const fetchRecentOrders = async () => {
    try {
      const token = localStorage.getItem('cronuz_b2b_token') || document.cookie.split('cronuz_b2b_token=')[1]?.split(';')[0];
      const res = await fetch('http://localhost:8000/orders', {
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
      const token = localStorage.getItem('cronuz_b2b_token') || document.cookie.split('cronuz_b2b_token=')[1]?.split(';')[0];
      const res = await fetch('http://localhost:8000/dashboard/metrics', {
         headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
         setMetrics(await res.json());
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
  }, []);

  const displayStats = defaultStats.filter(stat => {
     if (metrics?.uses_horus && stat.id === 'products') return false;
     return true;
  }).map(stat => {
     if (!metrics) return stat;
     
     if (stat.id === 'products') return { ...stat, value: metrics.active_products.toString() };
     if (stat.id === 'customers') return { ...stat, value: metrics.total_customers.toString() };
     if (stat.id === 'orders') return { ...stat, value: metrics.active_orders.toString() };
     if (stat.id === 'revenue') return { ...stat, value: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(metrics.total_revenue) };
     
     return stat;
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-2">Visão Geral</h1>
        <p className="text-slate-500 dark:text-slate-400">Bem-vindo ao Cronuz. Acompanhe os indicadores da sua multi-empresa.</p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {displayStats.map((stat, i) => (
          <motion.div
            key={stat.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1, duration: 0.4 }}
            className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 hover:bg-slate-50 shadow-sm transition-colors dark:border-slate-800 dark:bg-slate-900/40 dark:hover:bg-slate-900/60"
          >
            <div className="flex items-center justify-between mb-4">
              <stat.icon className="h-5 w-5 text-[var(--color-primary-base)]" />
              <span className="flex items-center text-xs font-medium text-[var(--color-secondary-base)] bg-[var(--color-secondary-base)]/10 px-2 py-1 rounded-full opacity-50">
                {stat.change}
                <ArrowUpRight className="ml-1 h-3 w-3" />
              </span>
            </div>
            <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{stat.name}</h3>
            {loadingMetrics ? (
                <div className="h-8 w-24 bg-slate-200 dark:bg-slate-800 rounded animate-pulse mt-1"></div>
            ) : (
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{stat.value}</p>
            )}
            
            <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <stat.icon className="h-24 w-24 text-[var(--color-primary-base)]" />
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-1">
        <motion.div 
           initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
           className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[300px]"
        >
           <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Clock className="w-5 h-5 opacity-70" /> Pedidos Recentes
              </h2>
              <Link href="/orders" className="text-sm font-semibold text-[var(--color-primary-base)] hover:underline">
                Ver todos os pedidos
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
                            order.status === "SENT_TO_HORUS" ? "Aprovado / ERP" :
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
      </div>
    </div>
  );
}
