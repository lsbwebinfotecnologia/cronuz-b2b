'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, RefreshCw, X, Save, ArrowLeft, Edit, Trash2, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { getToken } from '@/lib/auth';
import Link from 'next/link';

export default function CustomerGroupsPage() {
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<any>(null);
  
  const [name, setName] = useState('');
  const [color, setColor] = useState('#64748b'); // Default slate-500
  const [saving, setSaving] = useState(false);

  const fetchGroups = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/customers/groups`, {
        headers: {
          'Authorization': `Bearer ${getToken()}`
        }
      });
      if (res.ok) {
        setGroups(await res.json());
      }
    } catch (e) {
      toast.error('Erro ao buscar grupos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  const handleSave = async () => {
    if (!name.trim()) return toast.error("O nome é obrigatório.");
    setSaving(true);
    try {
      const url = editingGroup 
        ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/customers/groups/${editingGroup.id}` 
        : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/customers/groups`;
      const method = editingGroup ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({ name, color })
      });

      if (res.ok) {
        toast.success(`Grupo ${editingGroup ? 'atualizado' : 'criado'} com sucesso!`);
        handleCloseModal();
        fetchGroups();
      } else {
        const err = await res.json();
        toast.error(err.detail || `Erro ao ${editingGroup ? 'atualizar' : 'criar'} grupo.`);
      }
    } catch (e) {
      toast.error("Erro de conexão.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Tem certeza que deseja remover este grupo? Clientes vinculados perderão esta classificação.")) return;
    try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/customers/groups/${id}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${getToken()}`
            }
        });
        if (res.ok) {
            toast.success("Grupo removido.");
            fetchGroups();
        } else {
            toast.error("Falha ao remover grupo.");
        }
    } catch(e) {
        toast.error("Erro de conexão.");
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setName('');
    setColor('#64748b');
    setEditingGroup(null);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
           <Link 
            href="/customers"
            className="p-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors text-slate-500 hover:text-slate-900 dark:bg-slate-900 dark:border-slate-800 dark:hover:bg-slate-800 dark:text-slate-400 dark:hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Grupos de Clientes</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Classifique e segmente a sua base de empresas.</p>
          </div>
        </div>
        
        <button 
          onClick={() => {
            setEditingGroup(null);
            setName('');
            setColor('#64748b');
            setShowModal(true);
          }}
          className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-medium py-2.5 px-5 rounded-xl flex items-center gap-2 transition-all shadow-lg"
        >
          <Plus className="h-4 w-4" />
          Novo Grupo
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden dark:bg-slate-900/50 dark:border-slate-800">
        <div className="overflow-x-auto min-h-[300px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-100 bg-slate-50/80 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:bg-slate-900/80 dark:text-slate-400 dark:border-slate-800">
                <th className="p-4 whitespace-nowrap w-24">Apresentação</th>
                <th className="p-4 whitespace-nowrap">Nome do Grupo</th>
                <th className="p-4 whitespace-nowrap text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {loading ? (
                <tr>
                   <td colSpan={3} className="p-8 text-center text-slate-500"><RefreshCw className="h-6 w-6 animate-spin mx-auto text-slate-400" /></td>
                </tr>
              ) : groups.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-8 text-center text-slate-500">Nenhum grupo registrado.</td>
                </tr>
              ) : (
                groups.map((g) => (
                  <tr key={g.id} className="hover:bg-slate-50/80 transition-colors dark:hover:bg-slate-800/50">
                    <td className="p-4">
                       <div className="w-6 h-6 rounded-full shadow-inner border border-black/10" style={{ backgroundColor: g.color || '#64748b' }}></div>
                    </td>
                    <td className="p-4 font-medium text-slate-900 dark:text-white">
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-slate-400" />
                        {g.name}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button 
                          onClick={() => {
                            setEditingGroup(g);
                            setName(g.name);
                            setColor(g.color || '#64748b');
                            setShowModal(true);
                          }}
                          className="p-1.5 hover:bg-[var(--color-primary-base)]/10 text-slate-400 hover:text-[var(--color-primary-base)] rounded-lg transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDelete(g.id)}
                          className="p-1.5 hover:bg-rose-500/10 text-slate-400 hover:text-rose-500 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <motion.div 
             initial={{ opacity: 0, scale: 0.95 }}
             animate={{ opacity: 1, scale: 1 }}
             className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh]"
          >
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900 shrink-0">
              <h2 className="font-semibold text-slate-900 dark:text-white">
                {editingGroup ? 'Editar Grupo' : 'Criar Novo Grupo'}
              </h2>
              <button onClick={handleCloseModal} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-5 space-y-5 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Nome do Grupo <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-2 focus:ring-[var(--color-primary-base)]/20 focus:border-[var(--color-primary-base)] block p-3 dark:bg-slate-950 dark:border-slate-800 dark:text-white"
                  placeholder="Ex: VIP, Inadimplente, Revendedor..."
                  autoFocus
                />
              </div>

               <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                   Cor de Destaque
                </label>
                <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="w-12 h-12 p-1 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer dark:bg-slate-950 dark:border-slate-800"
                    />
                    <div className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono text-slate-500 dark:border-slate-800 dark:text-slate-400">
                        {color.toUpperCase()}
                    </div>
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-3 shrink-0">
              <button onClick={handleCloseModal} className="px-5 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300">
                Cancelar
              </button>
              <button 
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2.5 text-sm font-medium text-white bg-[var(--color-primary-base)] rounded-xl hover:bg-[var(--color-primary-hover)] flex items-center gap-2 disabled:opacity-50"
              >
                {saving ? "Salvando..." : <><Save className="w-4 h-4" /> {editingGroup ? 'Atualizar Grupo' : 'Salvar Grupo'}</>}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
