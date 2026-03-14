'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, TrendingUp, Users, Package, ShoppingCart, RefreshCw } from 'lucide-react';

const stats = [
  { name: 'Faturamento Total', value: 'R$ 124.500,00', change: '+12%', icon: TrendingUp },
  { name: 'Pedidos Ativos', value: '45', change: '+4%', icon: ShoppingCart },
  { name: 'Empresas Clientes', value: '12', change: '+2', icon: Users },
  { name: 'Itens em Estoque (Horus)', value: '8.432', change: '-1%', icon: Package },
];

export default function DashboardPage() {
  const [horusStatus, setHorusStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    fetchHorusStatus();
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Visão Geral</h1>
        <p className="text-slate-400">Bem-vindo ao Cronuz B2B. Acompanhe os indicadores da sua multi-empresa.</p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1, duration: 0.4 }}
            className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 p-6 hover:bg-slate-900/60 transition-colors"
          >
            <div className="flex items-center justify-between mb-4">
              <stat.icon className="h-5 w-5 text-[var(--color-primary-base)]" />
              <span className="flex items-center text-xs font-medium text-[var(--color-secondary-base)] bg-[var(--color-secondary-base)]/10 px-2 py-1 rounded-full">
                {stat.change}
                <ArrowUpRight className="ml-1 h-3 w-3" />
              </span>
            </div>
            <h3 className="text-sm font-medium text-slate-400 mb-1">{stat.name}</h3>
            <p className="text-2xl font-bold text-white">{stat.value}</p>
            
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
          className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 min-h-[300px]"
        >
          <h3 className="text-lg font-semibold text-white mb-4">Pedidos Recentes</h3>
          <div className="flex h-full items-center justify-center text-slate-500 text-sm">
            Nenhum pedido recente.
          </div>
        </motion.div>
        
        <motion.div 
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ delay: 0.5 }}
          className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 min-h-[300px]"
        >
          <h3 className="text-lg font-semibold text-white mb-4">Integração Horus</h3>
          {loading ? (
            <div className="flex h-full items-center justify-center text-[var(--color-primary-base)]">
              <RefreshCw className="h-6 w-6 animate-spin" />
            </div>
          ) : horusStatus ? (
            <div className="flex flex-col h-full justify-center space-y-4">
               <div className="flex items-center gap-3">
                  <div className={`h-3 w-3 rounded-full ${horusStatus.status === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                  <span className="text-slate-300 font-medium">
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
