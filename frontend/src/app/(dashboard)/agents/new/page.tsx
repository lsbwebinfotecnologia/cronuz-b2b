'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, Loader2, Save, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';

export default function NewAgentPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const userStr = getUser();
  const currentUser = typeof userStr === 'string' ? JSON.parse(userStr) : userStr;
  const companyId = currentUser?.company_id;

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    document: '',
    password: '',
    confirmPassword: ''
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (formData.password !== formData.confirmPassword) {
      toast.error('As senhas não coincidem!');
      return;
    }

    if (!companyId) {
      toast.error('Você não está vinculado a nenhuma empresa.');
      return;
    }

    setLoading(true);
    try {
      const token = getToken();
      
      const payload = {
        name: formData.name,
        email: formData.email,
        document: formData.document,
        password: formData.password,
        type: 'AGENT',
        company_id: companyId
      };

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || 'Falha ao criar vendedor');
      }

      toast.success('Vendedor criado com sucesso!');
      router.push(`/agents`);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link 
          href={`/agents`}
          className="p-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors text-slate-500 hover:text-slate-900 dark:bg-slate-800/50 dark:border-transparent dark:hover:bg-slate-800 dark:text-slate-400 dark:hover:text-white"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <UserPlus className="h-6 w-6 text-[var(--color-primary-base)]" />
            Adicionar Novo Vendedor (PDV)
          </h1>
          <p className="text-slate-500 text-sm mt-1 dark:text-slate-400">
            Cadastre um novo usuário com acesso restrito apenas ao PDV da sua empresa.
          </p>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:bg-slate-900/40 dark:border-slate-800"
      >
        <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Nome Completo <span className="text-rose-500">*</span>
              </label>
              <input
                id="name"
                type="text"
                required
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all placeholder:text-slate-400 dark:bg-slate-950/50 dark:border-slate-800 dark:text-white dark:focus:ring-indigo-500/50"
                placeholder="Ex: João da Silva"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                E-mail de Acesso <span className="text-rose-500">*</span>
              </label>
              <input
                id="email"
                type="email"
                required
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all placeholder:text-slate-400 dark:bg-slate-950/50 dark:border-slate-800 dark:text-white dark:focus:ring-indigo-500/50"
                placeholder="joao@empresa.com.br"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="document" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                CPF do Vendedor <span className="text-rose-500">*</span>
              </label>
              <input
                id="document"
                type="text"
                required
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all font-mono placeholder:text-slate-400 dark:bg-slate-950/50 dark:border-slate-800 dark:text-white dark:focus:ring-indigo-500/50"
                placeholder="123.456.789-00"
                value={formData.document}
                onChange={(e) => setFormData({ ...formData, document: e.target.value })}
              />
            </div>

            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-200 dark:border-slate-800/60">
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Senha <span className="text-rose-500">*</span>
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all placeholder:text-slate-400 dark:bg-slate-950/50 dark:border-slate-800 dark:text-white dark:focus:ring-indigo-500/50"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="confirmPassword" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Confirmar Senha <span className="text-rose-500">*</span>
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  required
                  minLength={6}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all placeholder:text-slate-400 dark:bg-slate-950/50 dark:border-slate-800 dark:text-white dark:focus:ring-indigo-500/50"
                  placeholder="••••••••"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-200 dark:border-slate-800/60 flex items-center justify-end gap-4">
            <Link
              href={`/agents`}
              className="px-6 py-3 font-medium text-slate-600 hover:text-slate-900 transition-colors dark:text-slate-400 dark:hover:text-white"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={loading}
              className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-semibold py-3 px-8 rounded-xl transition-all shadow-lg shadow-[var(--color-primary-base)]/20 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
              Cadastrar Vendedor
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
