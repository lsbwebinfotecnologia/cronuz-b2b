'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, ShieldAlert, Loader2, Settings, X, Save, CheckSquare, Square, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';
import { useCompany } from '../layout';

interface User {
  id: number;
  name: string;
  email: string;
  document?: string;
  type: string;
  active: boolean;
  initial_page?: string;
  allowed_modules?: string[];
}

const INITIAL_PAGE_OPTIONS = [
  { value: 'DEFAULT', label: 'Padrão (Dashboard / Catálogo)' },
  { value: '/pdv', label: 'Ponto de Venda (PDV)' },
  { value: '/product-search', label: 'Busca Preço' },
  { value: '/orders', label: 'Gestão de Pedidos' },
  { value: '/products', label: 'Catálogo de Produtos' },
  { value: '/customers', label: 'Empresas & Clientes' },
  { value: '/services', label: 'Serviços' },
  { value: '/financial', label: 'Financeiro' },
  { value: '/logistics/conference', label: 'Logística / Conferência' },
  { value: '/bookinfo/orders', label: 'Bookinfo Pedidos' },
  { value: '/orders/dropship', label: 'Dropship (Erdos)' },
  { value: '/horus-direct/pedidos', label: 'Horus Direct (SQL)' },
  { value: '/subscriptions', label: 'Assinaturas' },
  { value: '/notifications', label: 'Notificações' },
  { value: '/authors', label: 'Autores' },
  { value: '/inventory', label: 'Inventário' },
  { value: '/agents', label: 'Vendedores / Rep' },
  { value: '/commercial-policies', label: 'Políticas Comerciais' },
  { value: '/settings', label: 'Configurações da Loja' },
];

const MODULE_PERMISSIONS_LIST = [
  { id: 'pdv', label: 'Ponto de Venda (PDV)', description: 'Acesso à tela de vendas e caixa mobile/desktop' },
  { id: 'busca_preco', label: 'Busca Preço', description: 'Consulta instantânea de ISBNs, saldos e capa' },
  { id: 'products', label: 'Produtos & Catálogo', description: 'Listagem, marcas e categorias' },
  { id: 'orders', label: 'Pedidos & Vendas', description: 'Visualização e gestão de pedidos' },
  { id: 'customers', label: 'Empresas & Clientes', description: 'Cadastro e gestão de carteiras de clientes' },
  { id: 'services', label: 'Serviços', description: 'Catálogo de serviços e ordens de serviço' },
  { id: 'financial', label: 'Financeiro', description: 'Lançamentos, boletos, contas e extratos' },
  { id: 'logistics', label: 'Logística Hórus / WMS', description: 'Conferência de expedição e filiais' },
  { id: 'bookinfo', label: 'Bookinfo Hub', description: 'Automação de pedidos de venda e compra' },
  { id: 'promotions', label: 'Marketing & Promoções', description: 'Vitrines, banners e cupons de desconto' },
  { id: 'proposals', label: 'Propostas Comerciais', description: 'Geração e acompanhamento de orçamentos' },
  { id: 'dropship', label: 'Dropship (Erdos)', description: 'Pedidos Erdos, tabelas de preço e estoque' },
  { id: 'horus_sql', label: 'Horus Direct (SQL)', description: 'Pedidos diretos no SQL do Horus e financeiro Vindi' },
  { id: 'subscriptions', label: 'Assinaturas', description: 'Gestão de planos e assinantes recorrentes' },
  { id: 'notifications', label: 'Central de Notificações', description: 'Alertas e avisos do sistema' },
  { id: 'authors', label: 'Gestão de Autores', description: 'Cadastro de autores e portais' },
  { id: 'inventory', label: 'Inventário & Balanço', description: 'Contagem de estoque e ajustes' },
  { id: 'agents', label: 'Vendedores / Rep', description: 'Gestão da equipe de vendas' },
  { id: 'commercial', label: 'Políticas Comerciais', description: 'Regras de desconto e preços' },
  { id: 'settings', label: 'Configurações da Loja', description: 'Parâmetros fiscais, integrações e dados' },
];

export default function CompanyUsersPage() {
  const params = useParams();
  const companyId = params.id as string;
  const { company } = useCompany();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Pagination
  const [page, setPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const pageSize = 50;

  // Edit Modal State
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editInitialPage, setEditInitialPage] = useState('DEFAULT');
  const [editAllowedModules, setEditAllowedModules] = useState<string[]>([]);
  const [grantFullAccess, setGrantFullAccess] = useState(true);

  useEffect(() => {
    fetchUsers();
  }, [companyId, page]);

  async function fetchUsers() {
    setLoading(true);
    try {
      const token = getToken();
      if (!token) return;
      const skip = (page - 1) * pageSize;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/users?role=SELLER&skip=${skip}&limit=${pageSize}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.items || []);
        setTotalUsers(data.total || 0);
      }
    } catch (error) {
       toast.error('Erro ao carregar usuários.');
    } finally {
      setLoading(false);
    }
  }

  const handleOpenEditModal = (user: User) => {
    setEditingUser(user);
    setEditInitialPage(user.initial_page || 'DEFAULT');
    const modules = user.allowed_modules;
    if (!modules || !Array.isArray(modules) || modules.length === 0) {
      setGrantFullAccess(true);
      setEditAllowedModules([]);
    } else {
      setGrantFullAccess(false);
      setEditAllowedModules(modules);
    }
  };

  const handleSaveUserConfig = async () => {
    if (!editingUser) return;
    setSavingEdit(true);
    try {
      const token = getToken();
      const payload = {
        name: editingUser.name,
        email: editingUser.email,
        initial_page: editInitialPage === 'DEFAULT' ? null : editInitialPage,
        allowed_modules: grantFullAccess ? null : editAllowedModules,
      };

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/users/${editingUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Falha ao salvar configurações do usuário');
      }

      const updated = await res.json();
      setUsers(users.map(u => u.id === editingUser.id ? updated : u));
      toast.success('Configurações de acesso salvas com sucesso!');
      setEditingUser(null);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const toggleModulePermission = (modId: string) => {
    if (editAllowedModules.includes(modId)) {
      setEditAllowedModules(editAllowedModules.filter(m => m !== modId));
    } else {
      setEditAllowedModules([...editAllowedModules, modId]);
    }
  };

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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full relative">
      <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
         <div>
           <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
             Acessos e Logins
           </h2>
           <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
             Gerencie os usuários, redirecionamentos e permissões ligadas a esta empresa.
           </p>
         </div>
         <Link 
           href={`/companies/${companyId}/users/new`}
           className="bg-[var(--color-primary-base)] hover:opacity-90 text-white font-medium py-2.5 px-4 rounded-xl flex items-center gap-2 transition-all shadow-sm shadow-[var(--color-primary-base)]/20 text-sm"
         >
           <ShieldAlert className="h-4 w-4" />
           Novo Acesso
         </Link>
      </div>

      <div className="flex-1 overflow-x-auto">
         <table className="w-full text-left text-sm whitespace-nowrap">
           <thead className="bg-slate-50 dark:bg-slate-950/50 text-slate-500 font-medium">
             <tr>
               <th className="px-6 py-4">Nome & E-mail</th>
               <th className="px-6 py-4">Tela Inicial</th>
               <th className="px-6 py-4">Escopo de Módulos</th>
               <th className="px-6 py-4">Status</th>
               <th className="px-6 py-4 text-right">Ações</th>
             </tr>
           </thead>
           <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
             {users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                    Nenhum usuário cadastrado.
                  </td>
                </tr>
             ) : (
                users.map(user => {
                  const initialPageObj = INITIAL_PAGE_OPTIONS.find(o => o.value === (user.initial_page || 'DEFAULT')) || INITIAL_PAGE_OPTIONS[0];
                  const hasRestrictions = user.allowed_modules && Array.isArray(user.allowed_modules) && user.allowed_modules.length > 0;
                  
                  return (
                    <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20">
                      <td className="px-6 py-4 font-medium text-slate-900 dark:text-slate-200">
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-white">{user.name}</p>
                          <p className="text-xs text-slate-500 font-normal dark:text-slate-400">{user.email}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-teal-50 text-teal-700 border border-teal-200 dark:bg-teal-500/10 dark:text-teal-400 dark:border-teal-500/20">
                          {initialPageObj.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {hasRestrictions ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20">
                            {user.allowed_modules?.length} módulo(s) liberado(s)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
                            Acesso Total (Sem restrições)
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                           <span className={`h-2 w-2 rounded-full ${user.active ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]'}`}></span>
                           <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{user.active ? 'Ativo' : 'Inativo'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                         <div className="flex items-center justify-end gap-3">
                            <button 
                              onClick={() => handleOpenEditModal(user)}
                              className="text-xs font-bold text-teal-600 hover:text-teal-700 dark:text-teal-400 hover:underline flex items-center gap-1"
                            >
                              <Settings className="w-3.5 h-3.5" />
                              Permissões
                            </button>
                            <button onClick={() => handleToggleUserStatus(user)} className={`text-xs font-medium hover:underline transition-colors ${user.active ? 'text-rose-600' : 'text-emerald-600'}`}>
                              {user.active ? 'Bloquear' : 'Ativar'}
                            </button>
                            <button onClick={() => handleResetUserPassword(user.id)} className="text-xs font-medium text-indigo-600 hover:underline">Senha</button>
                            <button onClick={() => handleChangeUserEmail(user)} className="text-xs font-medium text-amber-600 hover:underline">E-mail</button>
                            <button onClick={() => handleDeleteUser(user.id)} className="text-xs font-medium text-rose-600 hover:underline">Excluir</button>
                         </div>
                      </td>
                    </tr>
                  );
                })
             )}
           </tbody>
         </table>
      </div>

      {/* Modal de Edição de Permissões e Direcionamento */}
      <AnimatePresence>
        {editingUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 md:p-8 max-w-2xl w-full shadow-2xl overflow-y-auto max-h-[90vh] space-y-6"
            >
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Settings className="w-5 h-5 text-teal-600" />
                    Configurar Acesso: {editingUser.name}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{editingUser.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* 1. Direcionamento da Tela Inicial */}
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-800 dark:text-slate-200 block">
                  1. Tela Inicial ao Logar (Direcionamento Padrão)
                </label>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Ao autenticar no sistema, o usuário será levado imediatamente para esta rota.
                </p>
                <select
                  value={editInitialPage}
                  onChange={(e) => setEditInitialPage(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-sm text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  {INITIAL_PAGE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* 2. Escopo de Módulos Liberados */}
              <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-bold text-slate-800 dark:text-slate-200 block">
                      2. Escopo de Módulos Permitidos
                    </label>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Restrinja os menus e rotas visíveis para este usuário individualmente.
                    </p>
                  </div>
                </div>

                <label className="flex items-center gap-3 p-3 rounded-xl border border-teal-200 dark:border-teal-800/40 bg-teal-50/50 dark:bg-teal-950/20 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={grantFullAccess}
                    onChange={(e) => {
                      setGrantFullAccess(e.target.checked);
                      if (e.target.checked) setEditAllowedModules([]);
                    }}
                    className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500"
                  />
                  <div>
                    <span className="text-sm font-bold text-teal-900 dark:text-teal-200 block">Acesso Total (Sem Restrições)</span>
                    <span className="text-xs text-teal-700 dark:text-teal-400 block">O usuário enxergará todos os módulos ativos contratados pelo Seller.</span>
                  </div>
                </label>

                {!grantFullAccess && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 animate-in fade-in">
                    {MODULE_PERMISSIONS_LIST.map(mod => {
                      const isChecked = editAllowedModules.includes(mod.id);
                      return (
                        <div
                          key={mod.id}
                          onClick={() => toggleModulePermission(mod.id)}
                          className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                            isChecked
                              ? 'border-teal-500 bg-teal-50/60 dark:bg-teal-900/30 text-teal-900 dark:text-white'
                              : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          <div className="mt-0.5 shrink-0">
                            {isChecked ? <CheckSquare className="w-4 h-4 text-teal-600 dark:text-teal-400" /> : <Square className="w-4 h-4 text-slate-400" />}
                          </div>
                          <div>
                            <span className="text-xs font-bold block">{mod.label}</span>
                            <span className="text-[11px] opacity-75 block leading-tight">{mod.description}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Ações */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={savingEdit}
                  onClick={handleSaveUserConfig}
                  className="px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-bold shadow-md shadow-teal-600/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Salvar Permissões
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Pagination Controls */}
      {totalUsers > pageSize && (
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center">
            <span className="text-sm text-slate-500">
                Mostrando {(page - 1) * pageSize + 1} até {Math.min(page * pageSize, totalUsers)} de {totalUsers} vendedores
            </span>
            <div className="flex gap-2">
                <button 
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                    className="px-3 py-1.5 text-sm font-medium border border-slate-200 dark:border-slate-700 rounded-lg disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                >
                    Anterior
                </button>
                <button 
                    disabled={page * pageSize >= totalUsers}
                    onClick={() => setPage(page + 1)}
                    className="px-3 py-1.5 text-sm font-medium border border-slate-200 dark:border-slate-700 rounded-lg disabled:opacity-50 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                >
                    Próxima
                </button>
            </div>
        </div>
      )}
    </motion.div>
  );
}
