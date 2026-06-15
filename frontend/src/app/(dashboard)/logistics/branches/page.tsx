'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Plus, Trash2, Edit2, Check, X, Shield, Building, FileText, Activity } from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';

type Branch = {
  id: number;
  nome: string;
  cnpj: string;
  cod_empresa: string;
  cod_filial: string;
  active: boolean;
};

export default function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Form states
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [nome, setNome] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [codEmpresa, setCodEmpresa] = useState('');
  const [codFilial, setCodFilial] = useState('');

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  useEffect(() => {
    fetchBranches();
  }, []);

  async function fetchBranches() {
    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`${apiUrl}/logistics/branches`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Erro ao buscar filiais');
      const data = await res.json();
      setBranches(data);
    } catch (err) {
      toast.error('Não foi possível carregar as filiais.');
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!nome || !codEmpresa || !codFilial) {
      toast.error('Preencha os campos obrigatórios (Nome, Empresa, Filial).');
      return;
    }
    setSubmitting(true);
    try {
      const token = getToken();
      const res = await fetch(`${apiUrl}/logistics/branches`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          nome,
          cnpj: cnpj || null,
          cod_empresa: codEmpresa,
          cod_filial: codFilial,
          active: true
        })
      });
      if (!res.ok) throw new Error();
      toast.success('Filial cadastrada com sucesso!');
      setIsAdding(false);
      resetForm();
      fetchBranches();
    } catch (err) {
      toast.error('Erro ao cadastrar filial.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdate(id: number) {
    if (!nome || !codEmpresa || !codFilial) {
      toast.error('Preencha os campos obrigatórios.');
      return;
    }
    setSubmitting(true);
    try {
      const token = getToken();
      const res = await fetch(`${apiUrl}/logistics/branches/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          nome,
          cnpj: cnpj || null,
          cod_empresa: codEmpresa,
          cod_filial: codFilial
        })
      });
      if (!res.ok) throw new Error();
      toast.success('Filial atualizada!');
      setEditingId(null);
      resetForm();
      fetchBranches();
    } catch (err) {
      toast.error('Erro ao atualizar filial.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      const token = getToken();
      const res = await fetch(`${apiUrl}/logistics/branches/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      toast.success('Filial desativada com sucesso.');
      fetchBranches();
    } catch (err) {
      toast.error('Erro ao desativar filial.');
    } finally {
      setDeletingId(null);
    }
  }

  function startEdit(branch: Branch) {
    setEditingId(branch.id);
    setNome(branch.nome);
    setCnpj(branch.cnpj || '');
    setCodEmpresa(branch.cod_empresa);
    setCodFilial(branch.cod_filial);
  }

  function cancelEdit() {
    setEditingId(null);
    resetForm();
  }

  function resetForm() {
    setNome('');
    setCnpj('');
    setCodEmpresa('');
    setCodFilial('');
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-12 bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md sticky top-0 z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Building className="h-5 w-5 text-indigo-500" /> Filiais do Seller
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Cadastre as filiais físicas para integrar com os códigos correspondentes no ERP Horus.
          </p>
        </div>
        {!isAdding && editingId === null && (
          <button
            onClick={() => { setIsAdding(true); resetForm(); }}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition shadow-sm"
          >
            <Plus className="h-4 w-4" /> Cadastrar Filial
          </button>
        )}
      </div>

      <div className="p-6 max-w-5xl space-y-6">
        {/* Form panel for adding */}
        <AnimatePresence>
          {isAdding && (
            <motion.div
              initial={{ opacity: 0, y: -15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm"
            >
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4">
                Nova Filial
              </h3>
              <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nome Fantasia *</label>
                  <input
                    type="text"
                    value={nome}
                    onChange={e => setNome(e.target.value)}
                    placeholder="Ex: Matriz Porto Alegre"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">CNPJ</label>
                  <input
                    type="text"
                    value={cnpj}
                    onChange={e => setCnpj(e.target.value)}
                    placeholder="00.000.000/0000-00"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Cod. Empresa *</label>
                    <input
                      type="text"
                      value={codEmpresa}
                      onChange={e => setCodEmpresa(e.target.value)}
                      placeholder="Ex: 1"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Cod. Filial *</label>
                    <input
                      type="text"
                      value={codFilial}
                      onChange={e => setCodFilial(e.target.value)}
                      placeholder="Ex: 5"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
                <div className="md:col-span-4 flex justify-end gap-3 mt-2 border-t border-slate-100 dark:border-slate-800 pt-4">
                  <button
                    type="button"
                    onClick={() => { setIsAdding(false); resetForm(); }}
                    className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700 bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl transition flex items-center gap-2"
                  >
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Cadastrar
                  </button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* List Table */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            </div>
          ) : branches.length === 0 ? (
            <div className="p-12 text-center">
              <Building className="h-12 w-12 mx-auto text-slate-300 dark:text-slate-700 mb-3" />
              <p className="text-slate-500 dark:text-slate-400 font-medium">Nenhuma filial cadastrada.</p>
              <p className="text-xs text-slate-400 mt-1">Clique em "Cadastrar Filial" para começar.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 text-slate-500 dark:text-slate-400 font-bold text-xs uppercase">
                  <th className="px-6 py-4">Nome</th>
                  <th className="px-6 py-4">CNPJ</th>
                  <th className="px-6 py-4">Cod. Empresa</th>
                  <th className="px-6 py-4">Cod. Filial</th>
                  <th className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {branches.map(branch => (
                  <tr key={branch.id} className="border-b border-slate-100 dark:border-slate-800/40 hover:bg-slate-50/50 dark:hover:bg-slate-950/10 text-sm">
                    {editingId === branch.id ? (
                      // Editing fields
                      <>
                        <td className="px-6 py-3">
                          <input
                            type="text"
                            value={nome}
                            onChange={e => setNome(e.target.value)}
                            className="px-2 py-1 text-sm rounded-lg border border-indigo-400 bg-white dark:bg-slate-950 text-slate-900 dark:text-white w-full focus:outline-none"
                          />
                        </td>
                        <td className="px-6 py-3">
                          <input
                            type="text"
                            value={cnpj}
                            onChange={e => setCnpj(e.target.value)}
                            className="px-2 py-1 text-sm rounded-lg border border-indigo-400 bg-white dark:bg-slate-950 text-slate-900 dark:text-white w-full focus:outline-none"
                          />
                        </td>
                        <td className="px-6 py-3">
                          <input
                            type="text"
                            value={codEmpresa}
                            onChange={e => setCodEmpresa(e.target.value)}
                            className="px-2 py-1 text-sm rounded-lg border border-indigo-400 bg-white dark:bg-slate-950 text-slate-900 dark:text-white w-24 focus:outline-none"
                          />
                        </td>
                        <td className="px-6 py-3">
                          <input
                            type="text"
                            value={codFilial}
                            onChange={e => setCodFilial(e.target.value)}
                            className="px-2 py-1 text-sm rounded-lg border border-indigo-400 bg-white dark:bg-slate-950 text-slate-900 dark:text-white w-24 focus:outline-none"
                          />
                        </td>
                        <td className="px-6 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => handleUpdate(branch.id)}
                              disabled={submitting}
                              className="p-1.5 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-lg transition"
                              title="Salvar"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition"
                              title="Cancelar"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      // Read-only values
                      <>
                        <td className="px-6 py-4 font-semibold text-slate-800 dark:text-slate-200">
                          {branch.nome}
                        </td>
                        <td className="px-6 py-4 text-slate-600 dark:text-slate-400">
                          {branch.cnpj || '-'}
                        </td>
                        <td className="px-6 py-4 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                          {branch.cod_empresa}
                        </td>
                        <td className="px-6 py-4 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                          {branch.cod_filial}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => startEdit(branch)}
                              disabled={isAdding || editingId !== null}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg transition disabled:opacity-30"
                              title="Editar"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => {
                                if(confirm(`Tem certeza que deseja desativar a filial "${branch.nome}"?`)) {
                                  handleDelete(branch.id);
                                }
                              }}
                              disabled={isAdding || editingId !== null || deletingId === branch.id}
                              className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition disabled:opacity-30"
                              title="Deletar"
                            >
                              {deletingId === branch.id ? (
                                <Loader2 className="h-4 w-4 animate-spin text-rose-500" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
