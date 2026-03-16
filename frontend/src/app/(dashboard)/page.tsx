'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, TrendingUp, Users, Package, ShoppingCart, RefreshCw } from 'lucide-react';

const defaultStats = [
  { id: 'revenue', name: 'Faturamento Total', value: 'R$ 0,00', change: '+0%', icon: TrendingUp },
  { id: 'orders', name: 'Pedidos Ativos', value: '0', change: '0', icon: ShoppingCart },
  { id: 'customers', name: 'Empresas Clientes', value: '0', change: '0', icon: Users },
  { id: 'products', name: 'Produtos Ativos', value: '0', change: '0', icon: Package },
];

export default function DashboardPage() {
  const [horusStatus, setHorusStatus] = useState<any>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMetrics, setLoadingMetrics] = useState(true);

  const fetchHorusStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:8000/inventory/horus/status');
      const data = await res.json();
      setHorusStatus(data);
    } catch (error) {
      console.error("Failed to fetch Horus status", error);
    } finally {
      setLoading(false);
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
    fetchHorusStatus();
    fetchMetrics();
  }, []);

  const displayStats = defaultStats.map(stat => {
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

      <div className="grid gap-6 md:grid-cols-2">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 min-h-[300px] dark:border-slate-800 dark:bg-slate-900/40"
        >
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Pedidos Recentes</h3>
          <div className="flex h-full items-center justify-center text-slate-500 text-sm">
            Nenhum pedido recente.
          </div>
        </motion.div>
        
        <motion.div 
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ delay: 0.5 }}
          className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 min-h-[300px] dark:border-slate-800 dark:bg-slate-900/40"
        >
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Integração Horus</h3>
          {loading ? (
            <div className="flex h-full items-center justify-center text-[var(--color-primary-base)]">
              <RefreshCw className="h-6 w-6 animate-spin" />
            </div>
          ) : horusStatus ? (
            <div className="flex flex-col h-full justify-center space-y-4">
               <div className="flex items-center gap-3">
                  <div className={`h-3 w-3 rounded-full ${horusStatus.status === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {horusStatus.status === 'connected' ? 'Conectado e Operacional' : 'Falha na Conexão'}
                  </span>
               </div>
               <div className="text-sm text-slate-500">
                 <p>Última sincronização: {new Date(horusStatus.last_sync).toLocaleString()}</p>
                 <p>Itens sincronizados: {horusStatus.items_synced}</p>
                 <p className="mt-2 text-xs text-slate-600">{horusStatus.message}</p>
               </div>
               <button 
                 onClick={fetchHorusStatus}
                 className="self-start mt-4 flex items-center gap-2 text-xs bg-[var(--color-primary-base)]/10 text-[var(--color-primary-base)] px-3 py-1.5 rounded-lg font-medium hover:bg-[var(--color-primary-base)]/20 transition-colors"
               >
                 <RefreshCw className="h-3 w-3" />
                 Sincronizar Agora
               </button>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-rose-500 text-sm">
              Erro ao carregar status do Horus.
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
