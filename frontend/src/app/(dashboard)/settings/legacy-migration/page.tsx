'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Database, ShieldCheck, Play, Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { getToken } from '@/lib/auth';

export default function LegacyMigrationPage() {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<{ customers_updated: number; orders_updated: number; errors: string[] } | null>(null);
  
  const [formData, setFormData] = useState({
    host: '',
    port: '3306',
    user: '',
    password: '',
    database: '',
    legacy_company_id: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleMigration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.host || !formData.user || !formData.database || !formData.legacy_company_id) {
      toast.error('Preencha todos os campos obrigatórios.');
      return;
    }

    setLoading(true);
    setStats(null);
    const token = getToken();

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/settings/migration/mysql`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          host: formData.host,
          port: parseInt(formData.port),
          user: formData.user,
          password: formData.password,
          database: formData.database,
          legacy_company_id: parseInt(formData.legacy_company_id)
        })
      });

      const data = await res.json();
      
      if (res.ok) {
        toast.success(data.message || 'Migração concluída com sucesso!');
        setStats(data.stats);
      } else {
        toast.error(data.detail || 'Erro na migração');
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro de conexão com a API.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 p-4">
      {/* Header */}
      <div>
        <Link href="/settings" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" />
          Voltar para Configurações
        </Link>
        <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
          <Database className="h-6 w-6 text-indigo-500" />
          Migração de Dados Legados (MySQL)
        </h1>
        <p className="text-slate-500 mt-2">
          Importe IDs do Horus (Pedidos) e guid de Clientes a partir de um banco de dados MySQL antigo. Esta ação é segura, pois afeta apenas registros com CNPJ/UUID da Bookinfo já existentes.
        </p>
      </div>

      {/* Form */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-white">Credenciais do Banco de Dados</h2>
              <p className="text-sm text-slate-500">Conexão direta segura.</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleMigration} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Host (IP/URL)</label>
              <input
                type="text"
                name="host"
                value={formData.host}
                onChange={handleChange}
                placeholder="Ex: 53.112.5.12"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:text-white transition-all"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Porta</label>
              <input
                type="number"
                name="port"
                value={formData.port}
                onChange={handleChange}
                placeholder="3306"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:text-white transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Usuário do Banco</label>
              <input
                type="text"
                name="user"
                value={formData.user}
                onChange={handleChange}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:text-white transition-all"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Senha</label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:text-white transition-all"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Nome do Banco de Dados</label>
              <input
                type="text"
                name="database"
                value={formData.database}
                onChange={handleChange}
                placeholder="Ex: cronuz_legacy"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:text-white transition-all"
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">ID da Empresa (No Banco Antigo)</label>
              <input
                type="number"
                name="legacy_company_id"
                value={formData.legacy_company_id}
                onChange={handleChange}
                placeholder="Ex: 5"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:text-white transition-all"
                required
              />
            </div>
          </div>
          
          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-6 rounded-xl transition-all disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
              {loading ? 'Executando Migração...' : 'Iniciar Sincronização Lote'}
            </button>
          </div>
        </form>
      </motion.div>

      {/* Migration Stats Result */}
      {stats && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-2xl p-6"
        >
          <h3 className="text-lg font-bold text-emerald-800 dark:text-emerald-400 mb-4 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" />
            Resultados da Sincronização
          </h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm border border-emerald-100 dark:border-emerald-500/10">
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Clientes Atualizados (ID_GUID)</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.customers_updated}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm border border-emerald-100 dark:border-emerald-500/10">
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Pedidos Atualizados (Num ERP)</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.orders_updated}</p>
            </div>
          </div>
          {stats.errors && stats.errors.length > 0 && (
             <div className="mt-4 p-4 rounded-xl bg-orange-50 border border-orange-200 text-sm text-orange-800 break-words dark:bg-orange-500/10 dark:border-orange-500/20 dark:text-orange-400">
               <p className="font-semibold mb-2">Erros / Avisos:</p>
               <ul className="list-disc pl-5 space-y-1">
                 {stats.errors.map((e, idx) => (
                   <li key={idx}>{e}</li>
                 ))}
               </ul>
             </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
