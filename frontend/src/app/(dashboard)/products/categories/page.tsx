'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Tag, RefreshCw, X, Save, ArrowLeft, FolderTree, Edit } from 'lucide-react';
import { toast } from 'sonner';
import { getToken } from '@/lib/auth';
import Link from 'next/link';

export default function CategoriesPage() {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [newCatName, setNewCatName] = useState('');
  const [parentCatId, setParentCatId] = useState<number | ''>('');
  const [saving, setSaving] = useState(false);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/categories`, {
        headers: {
          'Authorization': `Bearer ${getToken()}`
        }
      });
      if (res.ok) {
        setCategories(await res.json());
      }
    } catch (e) {
      toast.error('Erro ao buscar categorias.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleSave = async () => {
    if (!newCatName.trim()) return toast.error("O nome é obrigatório.");
    setSaving(true);
    try {
      const url = editingCategory ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/categories/${editingCategory.id}` : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/categories`;
      const method = editingCategory ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({ 
            name: newCatName,
            parent_id: parentCatId || null
        })
      });

      if (res.ok) {
        toast.success(`Categoria ${editingCategory ? 'atualizada' : 'criada'} com sucesso!`);
        handleCloseModal();
        fetchCategories();
      } else {
        const err = await res.json();
        toast.error(err.detail || `Erro ao ${editingCategory ? 'atualizar' : 'criar'} categoria.`);
      }
    } catch (e) {
      toast.error("Erro de conexão.");
    } finally {
      setSaving(false);
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setNewCatName('');
    setParentCatId('');
    setEditingCategory(null);
  };

  // Build a tree for dropdown logic (simplistic visual representation)
  const renderCatName = (cat: any) => {
    if (cat.parent_id) {
       const parent = categories.find(c => c.id === cat.parent_id);
       if (parent) {
         if (parent.parent_id) {
            const grandParent = categories.find(c => c.id === parent.parent_id);
            if (grandParent) return `${grandParent.name} > ${parent.name} > ${cat.name}`;
         }
         return `${parent.name} > ${cat.name}`;
       }
    }
    return cat.name;
  };

  const getCategoryDepth = (catId: number): number => {
    const cat = categories.find(c => c.id === catId);
    if (!cat) return 0;
    if (!cat.parent_id) return 1;
    const parent = categories.find(c => c.id === cat.parent_id);
    if (!parent) return 1;
    if (!parent.parent_id) return 2;
    return 3;
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
           <Link 
            href="/products"
            className="p-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors text-slate-500 hover:text-slate-900 dark:bg-slate-900 dark:border-slate-800 dark:hover:bg-slate-800 dark:text-slate-400 dark:hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Categorias</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Classifique os produtos da sua empresa.</p>
          </div>
        </div>
        
        <button 
          onClick={() => {
            setEditingCategory(null);
            setNewCatName('');
            setParentCatId('');
            setShowModal(true);
          }}
          className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-medium py-2.5 px-5 rounded-xl flex items-center gap-2 transition-all shadow-lg"
        >
          <Plus className="h-4 w-4" />
          Nova Categoria
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden dark:bg-slate-900/50 dark:border-slate-800">
        <div className="overflow-x-auto min-h-[300px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-100 bg-slate-50/80 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:bg-slate-900/80 dark:text-slate-400 dark:border-slate-800">
                <th className="p-4 whitespace-nowrap">ID</th>
                <th className="p-4 whitespace-nowrap">Árvore / Nome</th>
                <th className="p-4 whitespace-nowrap text-right">Data Inserção & Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {loading ? (
                <tr>
                   <td colSpan={3} className="p-8 text-center text-slate-500"><RefreshCw className="h-6 w-6 animate-spin mx-auto text-slate-400" /></td>
                </tr>
              ) : categories.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-8 text-center text-slate-500">Nenhuma categoria registrada.</td>
                </tr>
              ) : (
                categories.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/80 transition-colors dark:hover:bg-slate-800/50">
                    <td className="p-4 text-sm text-slate-500 dark:text-slate-400">#{c.id}</td>
                    <td className="p-4 font-medium text-slate-900 dark:text-white">
                      <div className="flex items-center gap-2">
                        <FolderTree className="w-4 h-4 text-slate-400" />
                        {renderCatName(c)}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {new Date(c.created_at).toLocaleDateString('pt-BR')}
                        </span>
                        <button 
                          onClick={() => {
                            setEditingCategory(c);
                            setNewCatName(c.name);
                            setParentCatId(c.parent_id || '');
                            setShowModal(true);
                          }}
                          className="p-1.5 hover:bg-[var(--color-primary-base)]/10 text-slate-400 hover:text-[var(--color-primary-base)] rounded-lg transition-colors"
                        >
                          <Edit className="w-4 h-4" />
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
                {editingCategory ? 'Editar Categoria' : 'Criar Nova Categoria'}
              </h2>
              <button onClick={handleCloseModal} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-5 space-y-5 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Nome da Categoria <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-2 focus:ring-[var(--color-primary-base)]/20 focus:border-[var(--color-primary-base)] block p-3 dark:bg-slate-950 dark:border-slate-800 dark:text-white"
                  placeholder="Ex: Tênis"
                  autoFocus
                />
              </div>

               <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 flex justify-between">
                   <span>Categoria Pai (Opcional)</span>
                </label>
                <select
                  value={parentCatId}
                  onChange={(e) => setParentCatId(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-2 focus:ring-[var(--color-primary-base)]/20 focus:border-[var(--color-primary-base)] block p-3 dark:bg-slate-950 dark:border-slate-800 dark:text-white"
                >
                    <option value="">Raiz (Nenhuma)</option>
                    {categories
                      .filter(cat => cat.id !== editingCategory?.id)
                      .map(c => {
                        const depth = getCategoryDepth(c.id);
                        // Disable if the depth is 3 or more because child would be depth 4
                        const disabled = depth >= 3;
                        return <option key={c.id} value={c.id} disabled={disabled}>{renderCatName(c)}{disabled ? ' (Lim. Níveis Atingido)' : ''}</option>;
                      })}
                </select>
                <p className="text-xs text-slate-500 mt-2">Escolha se esta categoria for uma variação menor de outra já existente (ex: Calçados {'>'} Tênis).</p>
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
                {saving ? "Salvando..." : <><Save className="w-4 h-4" /> {editingCategory ? 'Atualizar Categoria' : 'Salvar Categoria'}</>}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
