'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  UserPlus,
  Loader2,
  Settings,
  X,
  Save,
  Search,
  Trash2,
  Compass,
  ShieldCheck,
  Lock,
  Power
} from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';
import { useCompany } from '../context';
import { INITIAL_PAGE_OPTIONS, MODULE_PERMISSIONS_LIST } from './userPermissionsConfig';
import { UserAccessForm, UserAccessFormValues } from './UserAccessForm';

interface UserItem {
  id: number;
  name: string;
  email: string;
  document?: string;
  type: string;
  active: boolean;
  initial_page?: string;
  allowed_modules?: string[];
}

export default function CompanyUsersPage() {
  const params = useParams();
  const companyId = params.id as string;
  const { company } = useCompany();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination
  const [page, setPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const pageSize = 50;

  // Modal State (Create or Edit)
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [savingForm, setSavingForm] = useState(false);
  const [formValues, setFormValues] = useState<UserAccessFormValues>({
    name: '',
    email: '',
    document: '',
    password: '',
    initialPage: 'DEFAULT',
    grantFullAccess: true,
    allowedModules: [],
  });

  useEffect(() => {
    fetchUsers();
  }, [companyId, page]);

  async function fetchUsers() {
    setLoading(true);
    try {
      const token = getToken();
      if (!token) return;
      const skip = (page - 1) * pageSize;
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/users?role=SELLER&skip=${skip}&limit=${pageSize}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
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

  const handleOpenCreateModal = () => {
    setEditingUser(null);
    setFormValues({
      name: '',
      email: '',
      document: '',
      password: '',
      initialPage: 'DEFAULT',
      grantFullAccess: true,
      allowedModules: [],
    });
    setModalMode('create');
  };

  const handleOpenEditModal = (user: UserItem) => {
    const modules = user.allowed_modules;
    const isFull = !modules || !Array.isArray(modules) || modules.length === 0;
    setEditingUser(user);
    setFormValues({
      name: user.name || '',
      email: user.email || '',
      document: user.document || '',
      password: '',
      initialPage: user.initial_page || 'DEFAULT',
      grantFullAccess: isFull,
      allowedModules: isFull ? [] : modules,
    });
    setModalMode('edit');
  };

  const handleSaveUserForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValues.name.trim() || !formValues.email.trim()) {
      return toast.error('Preencha nome e e-mail do operador.');
    }
    if (modalMode === 'create' && formValues.password.trim().length < 6) {
      return toast.error('A senha inicial deve ter no mínimo 6 caracteres.');
    }
    if (modalMode === 'edit' && formValues.password.trim() && formValues.password.trim().length < 6) {
      return toast.error('A nova senha deve ter no mínimo 6 caracteres.');
    }

    setSavingForm(true);
    try {
      const token = getToken();
      if (modalMode === 'create') {
        const payload = {
          name: formValues.name.trim(),
          email: formValues.email.trim(),
          document: formValues.document.trim() || null,
          password: formValues.password,
          type: 'SELLER',
          company_id: parseInt(companyId, 10),
          initial_page: formValues.initialPage === 'DEFAULT' ? null : formValues.initialPage,
          allowed_modules: formValues.grantFullAccess ? null : formValues.allowedModules,
        };

        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/users`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.detail || 'Erro ao criar login de acesso');
        }

        const created = await res.json();
        setUsers([created, ...users]);
        setTotalUsers((prev) => prev + 1);
        toast.success('Novo login de acesso criado com sucesso!');
        setModalMode(null);
      } else if (modalMode === 'edit' && editingUser) {
        const payload: Record<string, any> = {
          name: formValues.name.trim(),
          email: formValues.email.trim(),
          document: formValues.document.trim() || null,
          initial_page: formValues.initialPage === 'DEFAULT' ? null : formValues.initialPage,
          allowed_modules: formValues.grantFullAccess ? null : formValues.allowedModules,
        };
        if (formValues.password.trim()) {
          payload.password = formValues.password.trim();
        }

        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/users/${editingUser.id}`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
          }
        );

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.detail || 'Falha ao salvar configurações do usuário');
        }

        const updated = await res.json();
        setUsers(users.map((u) => (u.id === editingUser.id ? updated : u)));
        toast.success('Configurações e permissões do usuário atualizadas!');
        setModalMode(null);
        setEditingUser(null);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingForm(false);
    }
  };

  async function handleToggleUserStatus(user: UserItem) {
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/users/${user.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ active: !user.active }),
      });
      if (!res.ok) throw new Error('Falha ao atualizar status do usuário');
      const updatedUser = await res.json();
      setUsers(users.map((u) => (u.id === user.id ? updatedUser : u)));
      toast.success(`Login ${updatedUser.active ? 'ativado' : 'bloqueado'} com sucesso!`);
    } catch (error) {
      toast.error('Erro ao mudar o status do usuário.');
    }
  }

  async function handleDeleteUser(userId: number) {
    if (!window.confirm('Certeza que deseja EXCLUIR este login de acesso?')) return;
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Falha ao excluir o usuário');
      setUsers(users.filter((u) => u.id !== userId));
      setTotalUsers((prev) => Math.max(0, prev - 1));
      toast.success('Usuário excluído com sucesso!');
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  const filteredUsers = users.filter((u) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.document?.toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary-base)]" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full relative">
      {/* Header da Página (Único botão primário no topo) */}
      <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Acessos e Logins (Seller)</h2>
            <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {totalUsers} {totalUsers === 1 ? 'usuário' : 'usuários'}
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gerencie credenciais, tela inicial de login e liberação de módulos por operador.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {users.length > 1 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar operador ou e-mail..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500 w-48 sm:w-56"
              />
            </div>
          )}

          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="bg-[var(--color-primary-base)] hover:opacity-90 text-white font-bold py-2.5 px-4 rounded-xl flex items-center gap-2 transition-all shadow-sm shadow-[var(--color-primary-base)]/20 text-sm cursor-pointer shrink-0"
          >
            <UserPlus className="h-4 w-4" />
            Novo Acesso
          </button>
        </div>
      </div>

      {/* Lista de Usuários Distribuída em Cards/Linhas Responsivas (Sem cortar na direita) */}
      <div className="p-6 space-y-3 flex-1">
        {filteredUsers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-12 text-center space-y-2">
            <Users className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
              Nenhum usuário de acesso encontrado.
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Utilize o botão &ldquo;Novo Acesso&rdquo; no topo direito para cadastrar operadores e definir seus módulos.
            </p>
          </div>
        ) : (
          filteredUsers.map((user) => {
            const initialPageObj =
              INITIAL_PAGE_OPTIONS.find((o) => o.value === (user.initial_page || 'DEFAULT')) ||
              INITIAL_PAGE_OPTIONS[0];
            const hasRestrictions =
              user.allowed_modules && Array.isArray(user.allowed_modules) && user.allowed_modules.length > 0;

            // Preview dos nomes dos primeiros módulos liberados
            const previewModuleLabels = hasRestrictions
              ? user.allowed_modules!
                  .map((id) => MODULE_PERMISSIONS_LIST.find((m) => m.id === id)?.label || id)
                  .slice(0, 4)
              : [];
            const remainingModulesCount = hasRestrictions
              ? Math.max(0, user.allowed_modules!.length - previewModuleLabels.length)
              : 0;

            const initials = (user.name || user.email || 'U')
              .split(' ')
              .filter(Boolean)
              .slice(0, 2)
              .map((n) => n[0]?.toUpperCase())
              .join('');

            return (
              <div
                key={user.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-slate-300 dark:hover:border-slate-700 p-4 sm:p-5 transition-all shadow-2xs"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Bloco 1: Identificação do Usuário */}
                  <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                    <div
                      className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0 border ${
                        user.active
                          ? 'bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-500/20'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {initials}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {user.name}
                        </h3>
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            user.active
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20'
                              : 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              user.active ? 'bg-emerald-500' : 'bg-rose-500'
                            }`}
                          />
                          {user.active ? 'Ativo' : 'Bloqueado'}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        <span className="truncate">{user.email}</span>
                        {user.document && (
                          <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                            • Doc: {user.document}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Bloco 2: Redirecionamento & Escopo de Módulos */}
                  <div className="flex flex-wrap items-center gap-2 lg:justify-center">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/70 text-xs">
                      <Compass className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                      <span className="text-slate-500 dark:text-slate-400">Início:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {initialPageObj.label}
                      </span>
                    </div>

                    {hasRestrictions ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-xl bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20">
                          <Lock className="w-3 h-3" />
                          {user.allowed_modules?.length} módulo(s)
                        </span>
                        <div className="hidden xl:flex items-center gap-1">
                          {previewModuleLabels.map((lbl) => (
                            <span
                              key={lbl}
                              className="px-2 py-1 text-[10px] font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                            >
                              {lbl}
                            </span>
                          ))}
                          {remainingModulesCount > 0 && (
                            <span className="px-2 py-1 text-[10px] font-bold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500">
                              +{remainingModulesCount}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Acesso Total (Sem restrições)
                      </span>
                    )}
                  </div>

                  {/* Bloco 3: Botões de Ação Bem Distribuídos */}
                  <div className="flex items-center justify-end gap-2 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-100 dark:border-slate-800/60 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(user)}
                      className="px-3.5 py-2 rounded-xl bg-teal-50 hover:bg-teal-100 dark:bg-teal-500/10 dark:hover:bg-teal-500/20 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-500/20 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      Gerenciar Acesso & Módulos
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleUserStatus(user)}
                      title={user.active ? 'Bloquear login temporariamente' : 'Reativar login'}
                      className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                        user.active
                          ? 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200 dark:hover:bg-amber-950/30'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                      }`}
                    >
                      <Power className="w-3.5 h-3.5" />
                      {user.active ? 'Bloquear' : 'Ativar'}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteUser(user.id)}
                      title="Excluir usuário permanentemente"
                      className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-200 dark:hover:bg-rose-950/30 transition-all cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Amplo de 2 Colunas (Criar ou Editar Acesso, Senha, E-mail e Módulos Classificados) */}
      <AnimatePresence>
        {modalMode && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-xs">
            <motion.form
              onSubmit={handleSaveUserForm}
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-6xl w-full shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
            >
              {/* Header Fixo */}
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-4 shrink-0 bg-slate-50/70 dark:bg-slate-900">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    {modalMode === 'create' ? (
                      <>
                        <UserPlus className="w-5 h-5 text-teal-600" />
                        Cadastrar Novo Login do Seller
                      </>
                    ) : (
                      <>
                        <Settings className="w-5 h-5 text-teal-600" />
                        Gerenciar Login & Módulos: {editingUser?.name}
                      </>
                    )}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {modalMode === 'create'
                      ? 'Defina os dados de login na esquerda e os módulos liberados por categoria na direita.'
                      : 'Atualize dados cadastrais, e-mail, senha, tela inicial ou os módulos liberados para este operador.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setModalMode(null);
                    setEditingUser(null);
                  }}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Corpo Rolável em 2 Colunas */}
              <div className="p-5 sm:p-6 overflow-y-auto flex-1">
                <UserAccessForm
                  mode={modalMode}
                  values={formValues}
                  onChange={setFormValues}
                  company={company}
                />
              </div>

              {/* Rodapé Fixo */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-800 shrink-0 bg-slate-50/80 dark:bg-slate-800/40">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {formValues.grantFullAccess ? (
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                      ✓ Escopo atual: Acesso Total (todos os módulos contratados pela empresa)
                    </span>
                  ) : (
                    <span className="font-semibold text-teal-700 dark:text-teal-400">
                      ✓ Escopo atual: {formValues.allowedModules.length} módulo(s) liberado(s) individualmente
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setModalMode(null);
                      setEditingUser(null);
                    }}
                    className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={savingForm}
                    className="px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-bold shadow-md shadow-teal-600/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {savingForm ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {modalMode === 'create' ? 'Criar Login e Liberar Acesso' : 'Salvar Alterações'}
                  </button>
                </div>
              </div>
            </motion.form>
          </div>
        )}
      </AnimatePresence>

      {/* Pagination Controls */}
      {totalUsers > pageSize && (
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center">
          <span className="text-sm text-slate-500">
            Mostrando {(page - 1) * pageSize + 1} até {Math.min(page * pageSize, totalUsers)} de {totalUsers} usuários
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
