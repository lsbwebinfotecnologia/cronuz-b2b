'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Building2, ArrowLeft, Loader2, Globe, ShieldAlert, CheckCircle2, XCircle, Users, Save, Key } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';

interface Company {
  id: number;
  name: string;
  document: string;
  domain: string;
  logo: string | null;
  active: boolean;
}

interface User {
  id: number;
  name: string;
  email: string;
  type: string;
  active: boolean;
}

export default function CompanyDetailsPage() {
  const params = useParams();
  const companyId = params.id as string;
  
  const [company, setCompany] = useState<Company | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [activeTab, setActiveTab] = useState<'users' | 'integrations'>('users');
  const [settings, setSettings] = useState<any>({
    horus_enabled: false,
    horus_url: '',
    horus_port: '',
    horus_username: '',
    horus_password: '',
    horus_company: '',
    horus_branch: '',
    bookinfo_api_key: '',
    metabooks_api_key: '',
    cover_image_base_url: '',
    allow_backorder: false,
    max_backorder_qty: 0
  });
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    fetchData();
  }, [companyId]);

  async function fetchData() {
    setLoading(true);
    try {
      const token = getToken();
      if (!token) return;

      const [companyRes, usersRes, settingsRes] = await Promise.all([
        fetch(`http://localhost:8000/companies/${companyId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`http://localhost:8000/companies/${companyId}/users`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`http://localhost:8000/companies/${companyId}/settings`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      if (companyRes.ok) {
        setCompany(await companyRes.json());
      }
      if (usersRes.ok) {
        setUsers(await usersRes.json());
      }
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        setSettings({
          horus_enabled: data.horus_enabled || false,
          horus_url: data.horus_url || '',
          horus_port: data.horus_port || '',
          horus_username: data.horus_username || '',
          horus_password: data.horus_password || '',
          horus_company: data.horus_company || '',
          horus_branch: data.horus_branch || '',
          bookinfo_api_key: data.bookinfo_api_key || '',
          metabooks_api_key: data.metabooks_api_key || '',
          cover_image_base_url: data.cover_image_base_url || '',
          allow_backorder: data.allow_backorder || false,
          max_backorder_qty: data.max_backorder_qty || 0
        });
      }
    } catch (error) {
      toast.error('Erro ao carregar os dados da empresa.');
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleUserStatus(user: User) {
    try {
      const token = getToken();
      const res = await fetch(`http://localhost:8000/users/${user.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
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
    if (!newPassword) return; // Cancelled or empty
    if (newPassword.length < 6) return toast.error("A senha deve ter no mínimo 6 caracteres.");

    try {
      const token = getToken();
      const res = await fetch(`http://localhost:8000/users/${userId}/password`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ password: newPassword })
      });

      if (!res.ok) throw new Error('Falha ao redefinir a senha');
      
      toast.success('Senha do usuário redefinida com sucesso!');
    } catch (error) {
      toast.error('Erro ao redefinir a senha.');
    }
  }

  async function handleDeleteUser(userId: number) {
    if (!window.confirm("Tem certeza que deseja EXCLUIR este usuário permanentemente? Esta ação não pode ser desfeita.")) return;

    try {
      const token = getToken();
      const res = await fetch(`http://localhost:8000/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
         const data = await res.json();
         throw new Error(data.detail || 'Falha ao excluir o usuário');
      }
      
      setUsers(users.filter(u => u.id !== userId));
      toast.success('Usuário excluído com sucesso!');
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  async function handleChangeUserEmail(user: User) {
    const newEmail = window.prompt("Digite o novo e-mail para este usuário:", user.email);
    if (!newEmail || newEmail === user.email) return;

    // basic validation
    if (!newEmail.includes('@')) return toast.error("E-mail inválido.");

    try {
      const token = getToken();
      const res = await fetch(`http://localhost:8000/users/${user.id}/email`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ email: newEmail })
      });

      if (!res.ok) {
         const data = await res.json();
         throw new Error(data.detail || 'Falha ao atualizar o e-mail');
      }
      
      setUsers(users.map(u => u.id === user.id ? { ...u, email: newEmail } : u));
      toast.success('E-mail atualizado com sucesso!');
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  async function handleToggleStatus() {
    if (!company) return;
    setToggling(true);
    try {
      const token = getToken();
      const res = await fetch(`http://localhost:8000/companies/${companyId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ active: !company.active })
      });

      if (!res.ok) throw new Error('Falha ao atualizar status');
      
      const updated = await res.json();
      setCompany(updated);
      toast.success(`Empresa ${updated.active ? 'ativada' : 'inativada'} com sucesso!`);
    } catch (error) {
      toast.error('Erro ao mudar o status da empresa.');
    } finally {
      setToggling(false);
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const token = getToken();
      const res = await fetch(`http://localhost:8000/companies/${companyId}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(settings)
      });
      if (!res.ok) throw new Error('Falha ao salvar integrações');
      toast.success('Configurações de integração atualizadas com sucesso!');
    } catch (error) {
      toast.error('Erro ao salvar as configurações.');
    } finally {
      setSavingSettings(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-400">Empresa não encontrada.</p>
        <Link href="/companies" className="text-indigo-400 hover:underline mt-4 inline-block">Voltar</Link>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
        <div className="flex items-center gap-5">
          <Link 
            href="/companies"
            className="p-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors text-slate-500 hover:text-slate-900 dark:bg-slate-800/50 dark:border-transparent dark:hover:bg-slate-800 dark:text-slate-400 dark:hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          
          <div className="flex items-center gap-4">
            {company.logo ? (
              <img src={company.logo} alt={company.name} className="h-16 w-16 rounded-2xl object-contain bg-slate-50 p-2 border border-slate-200 dark:bg-white/5 dark:border-slate-700/50" />
            ) : (
              <div className="h-16 w-16 rounded-2xl bg-white flex items-center justify-center border border-slate-200 dark:bg-slate-800 dark:border-slate-700/50">
                <Building2 className="h-8 w-8 text-slate-400" />
              </div>
            )}
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{company.name}</h1>
                {company.active ? (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Ativa
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20">
                    <XCircle className="h-3.5 w-3.5" /> Inativa
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                <div className="flex items-center flex-wrap gap-2 md:gap-4 w-full">
                  <span className="font-mono bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 dark:bg-slate-900 dark:border-slate-800">
                    {company.document}
                  </span>
                  <div className="hidden md:block h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-600" />
                  <div className="flex items-center gap-1.5">
                    <Globe className="h-4 w-4" />
                    <a href={`https://${company.domain}`} target="_blank" rel="noreferrer" className="hover:text-[var(--color-primary-base)] transition-colors">
                      {company.domain}
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleToggleStatus}
            disabled={toggling}
            className={`px-4 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-all ${
              company.active 
                ? 'bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/20 dark:border-rose-500/20'
                : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/20 dark:border-emerald-500/20'
            }`}
          >
            {toggling ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {!toggling && (company.active ? <XCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />)}
            {company.active ? 'Suspender Operação' : 'Ativar Empresa'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveTab('users')}
          className={`pb-4 px-2 font-medium transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'users' ? 'border-[var(--color-primary-base)] text-[var(--color-primary-base)] dark:text-white' : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-300'}`}
        >
          <Users className="h-4 w-4" />
          Usuários Sellers
        </button>
        <button
          onClick={() => setActiveTab('integrations')}
          className={`pb-4 px-2 font-medium transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'integrations' ? 'border-[var(--color-primary-base)] text-[var(--color-primary-base)] dark:text-white' : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-300'}`}
        >
          <Key className="h-4 w-4" />
          Integrações & ERP
        </button>
      </div>

      {/* Users Section */}
      {activeTab === 'users' ? (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-slate-800 dark:bg-slate-900/40 dark:backdrop-blur-xl"
      >
        <div className="p-6 border-b border-slate-200 flex items-center justify-between dark:border-slate-800/60">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="h-5 w-5 text-indigo-500 dark:text-indigo-400" />
              Usuários Administrativos (Sellers)
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Pessoas conectadas à organização que possuem acesso ao catálogo e vendas.
            </p>
          </div>
          <Link 
            href={`/companies/${companyId}/users/new`}
            className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-medium py-2 px-4 rounded-xl flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-sm shadow-[var(--color-primary-base)]/20"
          >
            <ShieldAlert className="h-4 w-4" />
            Adicionar Acesso
          </Link>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 font-medium dark:bg-slate-950/50 dark:text-slate-400">
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
                    Nenhum usuário cadastrado nesta empresa ainda.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50 transition-colors dark:hover:bg-slate-800/20">
                    <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-200">
                      {user.name}
                    </td>
                    <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{user.email}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {user.active ? (
                          <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                        ) : (
                          <span className="h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]"></span>
                        )}
                        <span className="px-2.5 py-1 text-xs font-semibold rounded-md bg-indigo-50 text-indigo-600 border border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20">
                          {user.type}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => handleToggleUserStatus(user)}
                          className={`text-xs font-medium hover:underline transition-colors ${user.active ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}
                        >
                          {user.active ? 'Bloquear' : 'Ativar'}
                        </button>
                        <button
                          onClick={() => handleResetUserPassword(user.id)}
                          className="text-xs font-medium text-[var(--color-primary-base)] hover:text-[var(--color-primary-hover)] hover:underline transition-colors block dark:text-indigo-400 dark:hover:text-indigo-300"
                        >
                          Senha
                        </button>
                        <div className="h-3 w-px bg-slate-200 dark:bg-slate-700"></div>
                        <button
                          onClick={() => handleChangeUserEmail(user)}
                          className="text-xs font-medium text-amber-600 hover:text-amber-700 hover:underline transition-colors block dark:text-amber-400 dark:hover:text-amber-300"
                        >
                          E-mail
                        </button>
                        <div className="h-3 w-px bg-slate-200 dark:bg-slate-700"></div>
                        <button
                          onClick={() => handleDeleteUser(user.id)}
                          className="text-xs font-medium text-rose-600 hover:text-rose-700 hover:underline transition-colors flex items-center gap-1 dark:text-rose-400 dark:hover:text-rose-300"
                        >
                          Excluir
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
      ) : (
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden p-6 dark:border-slate-800 dark:bg-slate-900/40 dark:backdrop-blur-xl"
      >
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Globe className="h-5 w-5 text-indigo-500 dark:text-indigo-400" />
            Configurações de API & Webhooks
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Preencha as chaves de acesso fornecidas pelos fornecedores de dados e ERPs para iniciar a sincronização para esta organização.
          </p>
        </div>

        <form onSubmit={handleSaveSettings} className="space-y-6">
          <div className="flex flex-col gap-6 p-5 border border-slate-200 rounded-xl bg-slate-50 dark:border-slate-800/60 dark:bg-slate-900/50">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                  Integração: Horus ERP
                </h3>
                <p className="text-xs text-slate-500 mt-1">Habilite para pesquisar produtos e gerar faturamento de pedidos B2B diretamente pelo ERP Horus.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={settings.horus_enabled} onChange={e => setSettings({ ...settings, horus_enabled: e.target.checked })} />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 peer-checked:after:bg-white"></div>
              </label>
            </div>
            
            {settings.horus_enabled && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">URL API</label>
                  <input
                    type="url"
                    required
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all text-sm placeholder:text-slate-400 focus:border-[var(--color-primary-base)] dark:bg-slate-950/50 dark:border-slate-800 dark:text-white dark:focus:ring-indigo-500/50 dark:placeholder:text-slate-600 dark:focus:border-indigo-500/50"
                    placeholder="http://189.79.25.41"
                    value={settings.horus_url}
                    onChange={e => setSettings({ ...settings, horus_url: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Porta</label>
                  <input
                    type="text"
                    required
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all font-mono text-sm placeholder:text-slate-400 focus:border-[var(--color-primary-base)] dark:bg-slate-950/50 dark:border-slate-800 dark:text-white dark:focus:ring-indigo-500/50 dark:placeholder:text-slate-600 dark:focus:border-indigo-500/50"
                    placeholder="8065"
                    value={settings.horus_port}
                    onChange={e => setSettings({ ...settings, horus_port: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Usuário</label>
                  <input
                    type="text"
                    required
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all font-mono text-sm placeholder:text-slate-400 focus:border-[var(--color-primary-base)] dark:bg-slate-950/50 dark:border-slate-800 dark:text-white dark:focus:ring-indigo-500/50 dark:placeholder:text-slate-600 dark:focus:border-indigo-500/50"
                    placeholder="mythos"
                    value={settings.horus_username}
                    onChange={e => setSettings({ ...settings, horus_username: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Senha</label>
                  <input
                    type="password"
                    required
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all font-mono text-sm placeholder:text-slate-400 focus:border-[var(--color-primary-base)] dark:bg-slate-950/50 dark:border-slate-800 dark:text-white dark:focus:ring-indigo-500/50 dark:placeholder:text-slate-600 dark:focus:border-indigo-500/50"
                    placeholder="••••••"
                    value={settings.horus_password}
                    onChange={e => setSettings({ ...settings, horus_password: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Empresa</label>
                  <input
                    type="number"
                    required
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all font-mono text-sm placeholder:text-slate-400 focus:border-[var(--color-primary-base)] dark:bg-slate-950/50 dark:border-slate-800 dark:text-white dark:focus:ring-indigo-500/50 dark:placeholder:text-slate-600 dark:focus:border-indigo-500/50"
                    placeholder="2"
                    value={settings.horus_company}
                    onChange={e => setSettings({ ...settings, horus_company: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Filial</label>
                  <input
                    type="number"
                    required
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all font-mono text-sm placeholder:text-slate-400 focus:border-[var(--color-primary-base)] dark:bg-slate-950/50 dark:border-slate-800 dark:text-white dark:focus:ring-indigo-500/50 dark:placeholder:text-slate-600 dark:focus:border-indigo-500/50"
                    placeholder="2"
                    value={settings.horus_branch}
                    onChange={e => setSettings({ ...settings, horus_branch: e.target.value })}
                  />
                </div>
              </motion.div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-5 border border-slate-200 rounded-xl bg-slate-50 dark:border-slate-800/60 dark:bg-slate-900/50">
             <div className="md:col-span-2 space-y-2">
              <h3 className="text-sm font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-widest flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">Configurações de Estoque B2B</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <span className="mr-3 text-xs font-medium text-slate-700 dark:text-slate-300 normal-case">Trabalhar com Encomenda</span>
                  <input type="checkbox" className="sr-only peer" checked={settings.allow_backorder} onChange={e => setSettings({ ...settings, allow_backorder: e.target.checked })} />
                  <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                </label>
              </h3>
              <p className="text-xs text-slate-500 flex flex-col gap-0.5">
                <span>Regras de negócio para produtos sem saldo disponível no ERP.</span>
                <span className="text-slate-400 italic">Pré-vendas (IP no Horus) estão sempre habilitadas.</span>
              </p>
            </div>
            {settings.allow_backorder && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-1.5 md:col-span-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">
                  Qtd. Máxima para Encomendar 
                  <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded ml-2 dark:bg-slate-800 dark:text-slate-400">Por Item</span>
                </label>
                <input
                  type="number"
                  min="0"
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all text-sm placeholder:text-slate-400 dark:bg-slate-950/50 dark:border-slate-800 dark:text-white dark:focus:ring-amber-500/50 dark:placeholder:text-slate-600"
                  placeholder="Ex: 50 ou 0 para ilimitado"
                  value={settings.max_backorder_qty === 0 ? '' : settings.max_backorder_qty}
                  onChange={e => setSettings({ ...settings, max_backorder_qty: parseInt(e.target.value) || 0 })}
                />
                <p className="text-xs text-slate-500 mt-1">
                  Se configurado como 0, o cliente poderá encomendar quantidades ilimitadas de itens sem estoque (Apenas se Encomenda estiver ativa).
                </p>
              </motion.div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-5 border border-slate-200 rounded-xl bg-slate-50 dark:border-slate-800/60 dark:bg-slate-900/50">
             <div className="md:col-span-2 space-y-2">
              <h3 className="text-sm font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-widest flex items-center gap-2">
                Configurações Gerais
              </h3>
              <p className="text-xs text-slate-500">Configurações globais de exibição e integração de catálogo.</p>
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Servidor Local de Capas (Base URL)</label>
              <input
                type="url"
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all font-mono text-sm placeholder:text-slate-400 dark:bg-slate-950/50 dark:border-slate-800 dark:text-white dark:focus:ring-indigo-500/50 dark:placeholder:text-slate-600"
                placeholder="https://capas.cronuz.com.br"
                value={settings.cover_image_base_url}
                onChange={e => setSettings({ ...settings, cover_image_base_url: e.target.value })}
              />
              <p className="text-xs text-slate-500 mt-1">
                Deixe em branco para forçar o uso de imagens cadastradas individualmente em cada produto. A imagem procurada será {"<base_url>/<isbn>.jpg"}.
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button
              type="submit"
              disabled={savingSettings}
              className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-semibold py-3 px-6 rounded-xl transition-all shadow-lg shadow-[var(--color-primary-base)]/20 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2"
            >
              {savingSettings ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
              Salvar Configurações
            </button>
          </div>
        </form>
      </motion.div>
      )}
    </div>
  );
}
