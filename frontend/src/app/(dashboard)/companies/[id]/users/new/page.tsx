'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Save, ArrowLeft, Loader2, Mail, User, ShieldCheck, Lock } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';

export default function NewSellerPage() {
  const router = useRouter();
  const params = useParams();
  const companyId = params.id as string;
  
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    document: '',
    password: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...formData,
          type: 'SELLER',
          company_id: parseInt(companyId)
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || 'Erro ao cadastrar usuário Vendedor');
      }

      toast.success('Administrador da Empresa criado com sucesso!');
      router.push('/companies'); // Go back to companies list for now
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto p-6 md:p-8">
      <div className="flex items-center gap-4">
        <Link 
          href="/companies"
          className="p-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors text-slate-500 hover:text-slate-900 dark:bg-slate-800/50 dark:border-transparent dark:hover:bg-slate-800 dark:text-slate-400 dark:hover:text-white"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-indigo-500 dark:text-indigo-400" />
            Cadastrar Administrador (Seller)
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Crie o primeiro acesso para gerenciar esta nova empresa.
          </p>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-slate-200 bg-white p-6 md:p-8 shadow-sm transition-colors dark:border-slate-800 dark:bg-slate-900/40 dark:backdrop-blur-xl"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Nome Completo</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 dark:text-slate-500" />
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-900 focus:border-[var(--color-primary-base)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all font-medium dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-200 dark:focus:border-[var(--color-primary-base)]/50 dark:focus:bg-slate-900/80 dark:focus:ring-1 dark:focus:ring-[var(--color-primary-base)]/50"
                  placeholder="Nome do gerente logístico"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">E-mail de Acesso</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 dark:text-slate-500" />
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-900 focus:border-[var(--color-primary-base)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all font-medium dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-200 dark:focus:border-[var(--color-primary-base)]/50 dark:focus:bg-slate-900/80 dark:focus:ring-1 dark:focus:ring-[var(--color-primary-base)]/50"
                  placeholder="admin@empresa.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Documento (Opcional)</label>
              <div className="relative">
                <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 dark:text-slate-500" />
                <input
                  type="text"
                  value={formData.document}
                  onChange={(e) => setFormData({...formData, document: e.target.value})}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-900 focus:border-[var(--color-primary-base)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all font-medium dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-200 dark:focus:border-[var(--color-primary-base)]/50 dark:focus:bg-slate-900/80 dark:focus:ring-1 dark:focus:ring-[var(--color-primary-base)]/50"
                  placeholder="CPF do responsável"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Senha Inicial</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 dark:text-slate-500" />
                <input
                  type="password"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-900 focus:border-[var(--color-primary-base)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all font-medium dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-200 dark:focus:border-[var(--color-primary-base)]/50 dark:focus:bg-slate-900/80 dark:focus:ring-1 dark:focus:ring-[var(--color-primary-base)]/50"
                  placeholder="••••••••"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-slate-800/60">
            <button
              type="submit"
              disabled={loading}
              className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-medium py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm shadow-[var(--color-primary-base)]/20 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:hover:scale-100 disabled:shadow-none"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
              {loading ? 'Cadastrando...' : 'Finalizar e Conceder Acesso'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
