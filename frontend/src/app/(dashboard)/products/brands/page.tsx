'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Tag, RefreshCw, X, Save, ArrowLeft, Edit } from 'lucide-react';
import { toast } from 'sonner';
import { getToken } from '@/lib/auth';
import Link from 'next/link';

export default function BrandsPage() {
  const [brands, setBrands] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingBrand, setEditingBrand] = useState<any>(null);
  const [newBrandName, setNewBrandName] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchBrands = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:8000/brands', {
        headers: {
          'Authorization': `Bearer ${getToken()}`
        }
      });
      if (res.ok) {
        setBrands(await res.json());
      }
    } catch (e) {
      toast.error('Erro ao buscar marcas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBrands();
  }, []);

  const handleSave = async () => {
    if (!newBrandName.trim()) return toast.error("O nome é obrigatório.");
    setSaving(true);
    try {
      const url = editingBrand ? `http://localhost:8000/brands/${editingBrand.id}` : 'http://localhost:8000/brands';
      const method = editingBrand ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({ name: newBrandName })
      });

      if (res.ok) {
        toast.success(`Marca ${editingBrand ? 'atualizada' : 'criada'} com sucesso!`);
        handleCloseModal();
        fetchBrands();
      } else {
        const err = await res.json();
        toast.error(err.detail || `Erro ao ${editingBrand ? 'atualizar' : 'criar'} marca.`);
      }
    } catch (e) {
      toast.error("Erro de conexão.");
    } finally {
      setSaving(false);
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setNewBrandName('');
    setEditingBrand(null);
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
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Marcas e Fabricantes</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Gerencie a listagem de mapeamento global de fabricantes.</p>
          </div>
        </div>
        
        <button 
          onClick={() => {
            setEditingBrand(null);
            setNewBrandName('');
            setShowModal(true);
          }}
          className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-medium py-2.5 px-5 rounded-xl flex items-center gap-2 transition-all shadow-lg"
        >
          <Plus className="h-4 w-4" />
          Nova Marca
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden dark:bg-slate-900/50 dark:border-slate-800">
        <div className="overflow-x-auto min-h-[300px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-100 bg-slate-50/80 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:bg-slate-900/80 dark:text-slate-400 dark:border-slate-800">
                <th className="p-4 whitespace-nowrap">ID</th>
                <th className="p-4 whitespace-nowrap">Nome da Marca</th>
                <th className="p-4 whitespace-nowrap text-right">Data Inserção & Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {loading ? (
                <tr>
                   <td colSpan={3} className="p-8 text-center text-slate-500"><RefreshCw className="h-6 w-6 animate-spin mx-auto text-slate-400" /></td>
                </tr>
              ) : brands.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-8 text-center text-slate-500">Nenhuma marca registrada.</td>
                </tr>
              ) : (
                brands.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50/80 transition-colors dark:hover:bg-slate-800/50">
                    <td className="p-4 text-sm text-slate-500 dark:text-slate-400">#{b.id}</td>
                    <td className="p-4 font-medium text-slate-900 dark:text-white">
                      <div className="flex items-center gap-2">
                        <Tag className="w-4 h-4 text-slate-400" />
                        {b.name}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {new Date(b.created_at).toLocaleDateString('pt-BR')}
                        </span>
                        <button 
                          onClick={() => {
                            setEditingBrand(b);
                            setNewBrandName(b.name);
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
            className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
          >
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900">
              <h2 className="font-semibold text-slate-900 dark:text-white">
                {editingBrand ? 'Editar Marca' : 'Criar Nova Marca'}
              </h2>
              <button onClick={handleCloseModal} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Nome da Marca <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={newBrandName}
                  onChange={(e) => setNewBrandName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-2 focus:ring-[var(--color-primary-base)]/20 focus:border-[var(--color-primary-base)] block p-3 dark:bg-slate-950 dark:border-slate-800 dark:text-white"
                  placeholder="Ex: Samsung, Sony"
                  autoFocus
                />
              </div>
            </div>

            <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-3">
              <button onClick={handleCloseModal} className="px-5 py-2.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300">
                Cancelar
              </button>
              <button 
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2.5 text-sm font-medium text-white bg-[var(--color-primary-base)] rounded-xl hover:bg-[var(--color-primary-hover)] flex items-center gap-2 disabled:opacity-50"
              >
                {saving ? "Salvando..." : <><Save className="w-4 h-4" /> {editingBrand ? 'Atualizar Marca' : 'Salvar Marca'}</>}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
