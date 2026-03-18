'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Users, Plus, Loader2, ShieldAlert, CheckCircle2, XCircle, Key } from 'lucide-react';
import Link from 'next/link';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';

interface User {
  id: number;
  name: string;
  email: string;
  type: string;
  active: boolean;
  company_id: number;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const userStr = getUser();
  const currentUser = typeof userStr === 'string' ? JSON.parse(userStr) : userStr;

  useEffect(() => {
    fetchAgents();
  }, []);

  async function fetchAgents() {
    setLoading(true);
    try {
      const token = getToken();
      if (!token || !currentUser?.company_id) return;

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${currentUser.company_id}/agents`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Falha ao buscar vendedores');
      
      const data = await res.json();
      setAgents(data);
    } catch (error) {
      toast.error('Erro ao carregar a lista de vendedores.');
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleStatus(agent: User) {
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/users/${agent.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ active: !agent.active })
      });

      if (!res.ok) throw new Error('Falha ao atualizar status');
      
      const updatedAgent = await res.json();
      setAgents(agents.map(a => a.id === agent.id ? updatedAgent : a));
      toast.success(`Vendedor ${updatedAgent.active ? 'ativado' : 'inativado'} com sucesso!`);
    } catch (error) {
      toast.error('Erro ao mudar o status do vendedor.');
    }
  }

  async function handleResetPassword(agentId: number) {
    const newPassword = window.prompt("Digite a nova senha para este vendedor:");
    if (!newPassword) return;
    if (newPassword.length < 6) return toast.error("A senha deve ter no mínimo 6 caracteres.");

    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/users/${agentId}/password`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ password: newPassword })
      });

      if (!res.ok) throw new Error('Falha ao redefinir a senha');
      toast.success('Senha do vendedor redefinida com sucesso!');
    } catch (error) {
      toast.error('Erro ao redefinir a senha.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="h-6 w-6 text-[var(--color-primary-base)]" />
            Vendedores (PDV)
          </h1>
          <p className="text-slate-500 text-sm mt-1 dark:text-slate-400">
            Gerencie as contas dos vendedores que utilizarão o PDV.
          </p>
        </div>
        <Link 
          href="/agents/new"
          className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-medium py-2 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          Novo Vendedor
        </Link>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:bg-slate-900/40 dark:border-slate-800"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 font-medium dark:bg-slate-950/50 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800/60">
              <tr>
                <th className="px-6 py-4">Nome</th>
                <th className="px-6 py-4">E-mail</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
                  </td>
                </tr>
              ) : agents.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                    Nenhum vendedor cadastrado. Clique em Novo Vendedor para começar.
                  </td>
                </tr>
              ) : (
                agents.map((agent) => (
                  <tr key={agent.id} className="hover:bg-slate-50 transition-colors dark:hover:bg-slate-800/20">
                    <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-200">
                      {agent.name}
                    </td>
                    <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{agent.email}</td>
                    <td className="px-6 py-4">
                      {agent.active ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
                          <CheckCircle2 className="h-3 w-3" /> Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20">
                          <XCircle className="h-3 w-3" /> Bloqueado
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-3 text-sm font-medium">
                        <button
                          onClick={() => handleToggleStatus(agent)}
                          className={agent.active ? "text-rose-600 hover:text-rose-700 dark:text-rose-400" : "text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"}
                        >
                          {agent.active ? 'Bloquear' : 'Ativar'}
                        </button>
                        <div className="h-3 w-px bg-slate-200 dark:bg-slate-700"></div>
                        <button
                          onClick={() => handleResetPassword(agent.id)}
                          className="text-[var(--color-primary-base)] hover:text-[var(--color-primary-hover)] flex items-center gap-1.5"
                        >
                          <Key className="h-3.5 w-3.5" />
                          Nova Senha
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
