'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Users, ShieldAlert, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';
import { useCompany } from '../layout';

interface User {
  id: number;
  name: string;
  email: string;
  type: string;
  active: boolean;
}

export default function CompanyUsersPage() {
  const params = useParams();
  const companyId = params.id as string;
  const { company } = useCompany();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsers();
  }, [companyId]);

  async function fetchUsers() {
    setLoading(true);
    try {
      const token = getToken();
      if (!token) return;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setUsers(await res.json());
      }
    } catch (error) {
       toast.error('Erro ao carregar usuários.');
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleUserStatus(user: User) {
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/users/${user.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ active: !user.active })
      });
      if (!res.ok) throw new Error('Falha ao atualizar status do usuário');
      const updatedUser = await res.json();
      setUsers(users.map(u => u.id === user.id ? updatedUser : u));
      toast.success(`Usuário ${updatedUser.active ? 'ativado' : 'inativado'} com sucesso!`);
    } catch (error) {
      toast.error('Erro ao mudar o status do usuário.');
    }
  }

  async function handleResetUserPassword(userId: number) {
    const newPassword = window.prompt("Digite a nova senha para este usuário:");
    if (!newPassword) return;
    if (newPassword.length < 6) return toast.error("A senha deve ter no mínimo 6 caracteres.");

    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/users/${userId}/password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ password: newPassword })
      });
      if (!res.ok) throw new Error('Falha ao redefinir a senha');
      toast.success('Senha redefinida com sucesso!');
    } catch (error) {
      toast.error('Erro ao redefinir a senha.');
    }
  }

  async function handleDeleteUser(userId: number) {
    if (!window.confirm("Certeza que deseja EXCLUIR este usuário?")) return;
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Falha ao excluir o usuário');
      setUsers(users.filter(u => u.id !== userId));
      toast.success('Usuário excluído!');
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  async function handleChangeUserEmail(user: User) {
    const newEmail = window.prompt("Novo e-mail para este usuário:", user.email);
    if (!newEmail || newEmail === user.email) return;
    if (!newEmail.includes('@')) return toast.error("E-mail inválido.");

    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/users/${user.id}/email`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ email: newEmail })
      });
      if (!res.ok) throw new Error('Falha ao atualizar e-mail');
      setUsers(users.map(u => u.id === user.id ? { ...u, email: newEmail } : u));
      toast.success('E-mail atualizado!');
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  if (loading) {
    return (
       <div className="flex h-64 items-center justify-center">
         <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary-base)]" />
       </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full">
      <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
         <div>
           <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
             Acessos e Logins
           </h2>
           <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
             Gerencie os usuários e vendedores ligados a esta empresa.
           </p>
         </div>
         <Link 
           href={`/companies/${companyId}/users/new`}
           className="bg-[var(--color-primary-base)] hover:opacity-90 text-white font-medium py-2 px-4 rounded-xl flex items-center gap-2 transition-all shadow-sm shadow-[var(--color-primary-base)]/20"
         >
           <ShieldAlert className="h-4 w-4" />
           Novo Acesso
         </Link>
      </div>

      <div className="flex-1 overflow-x-auto">
         <table className="w-full text-left text-sm whitespace-nowrap">
           <thead className="bg-slate-50 dark:bg-slate-950/50 text-slate-500 font-medium">
             <tr>
               <th className="px-6 py-4">Nome</th>
               <th className="px-6 py-4">E-mail</th>
               <th className="px-6 py-4">Status & Tipo</th>
               <th className="px-6 py-4 text-right">Ações</th>
             </tr>
           </thead>
           <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
             {users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                    Nenhum usuário cadastrado.
                  </td>
                </tr>
             ) : (
                users.map(user => (
                   <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20">
                     <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-200">{user.name}</td>
                     <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{user.email}</td>
                     <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                           <span className={`h-2 w-2 rounded-full ${user.active ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]'}`}></span>
                           <span className="px-2.5 py-1 text-[10px] uppercase font-bold rounded-md bg-indigo-50 text-indigo-600 border border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20">
                              {user.type}
                           </span>
                        </div>
                     </td>
                     <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-3">
                           <button onClick={() => handleToggleUserStatus(user)} className={`text-xs font-medium hover:underline transition-colors ${user.active ? 'text-rose-600' : 'text-emerald-600'}`}>
                             {user.active ? 'Bloquear' : 'Ativar'}
                           </button>
                           <button onClick={() => handleResetUserPassword(user.id)} className="text-xs font-medium text-indigo-600 hover:underline">Senha</button>
                           <button onClick={() => handleChangeUserEmail(user)} className="text-xs font-medium text-amber-600 hover:underline">E-mail</button>
                           <button onClick={() => handleDeleteUser(user.id)} className="text-xs font-medium text-rose-600 hover:underline">Excluir</button>
                        </div>
                     </td>
                   </tr>
                ))
             )}
           </tbody>
         </table>
      </div>
    </motion.div>
  );
}
