'use client';

import { useState, useEffect } from 'react';
import { Layers, Plus, Edit2, Trash2, X, Plug, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { getToken } from '@/lib/auth';

type Integrator = {
  id: number;
  name: string;
  code: string;
  description: string;
  active: boolean;
};

export default function SystemIntegratorsPage() {
  const [integrators, setIntegrators] = useState<Integrator[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  // Form State
  const [formData, setFormData] = useState({ name: '', code: '', description: '', active: true });

  const fetchIntegrators = async () => {
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/system-integrators/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setIntegrators(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIntegrators();
  }, []);

  const openModal = (integrator?: Integrator) => {
    if (integrator) {
      setEditingId(integrator.id);
      setFormData({
        name: integrator.name,
        code: integrator.code,
        description: integrator.description || '',
        active: integrator.active,
      });
    } else {
      setEditingId(null);
      setFormData({ name: '', code: '', description: '', active: true });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = getToken();
    const url = editingId 
      ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/system-integrators/${editingId}`
      : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/system-integrators/`;
      
    try {
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });
      
      if (res.ok) {
        closeModal();
        fetchIntegrators();
      } else {
        const err = await res.json();
        alert(err.detail || 'Erro ao salvar');
      }
    } catch(e) {
      alert('Network error');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja remover este integrador?')) return;
    const token = getToken();
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/system-integrators/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        fetchIntegrators();
      }
    } catch(e) {}
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
            <div className="p-2.5 bg-[var(--color-primary-base)]/10 text-[var(--color-primary-base)] rounded-xl">
              <Layers className="h-6 w-6" />
            </div>
            Catálogo de Integradores
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm max-w-2xl">
            Gerencie as integrações globais disponíveis para as empresas conectarem. 
            Estes integradores serão listados como opções nos painéis das empresas.
          </p>
        </div>
        
        <button 
          onClick={() => openModal()}
          className="flex items-center gap-2 bg-[var(--color-primary-base)] text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-[var(--color-primary-hover)] transition-all shadow-sm shadow-[var(--color-primary-base)]/20 active:scale-95"
        >
          <Plus className="h-4 w-4" />
          Novo Integrador
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 flex justify-center text-slate-400">Carregando...</div>
        ) : integrators.length === 0 ? (
          <div className="p-16 text-center">
            <Plug className="h-12 w-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 dark:text-white">Nenhum integrador</h3>
            <p className="text-slate-500 mt-1 max-w-sm mx-auto">Cadastre o primeiro integrador para disponibilizar novas integrações B2B.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-400 border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4 font-semibold">Integrador</th>
                  <th className="px-6 py-4 font-semibold">Código</th>
                  <th className="px-6 py-4 font-semibold">Descrição</th>
                  <th className="px-6 py-4 font-semibold text-center">Status</th>
                  <th className="px-6 py-4 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80">
                {integrators.map(int => (
                  <tr key={int.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 flex shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 font-bold">
                           {int.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-semibold text-slate-900 dark:text-white">{int.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4"><span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg font-mono text-xs">{int.code}</span></td>
                    <td className="px-6 py-4 max-w-xs truncate text-xs" title={int.description}>{int.description || '--'}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${int.active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                        {int.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                       <div className="flex items-center justify-end gap-2">
                         <Link href={`/system-integrators/${int.id}`} className="p-2 text-[var(--color-primary-base)] hover:bg-[var(--color-primary-base)]/10 rounded-lg transition-colors flex items-center gap-1 text-xs font-semibold">
                            <Settings className="h-4 w-4" /> Configurar
                         </Link>
                         <button onClick={() => openModal(int)} className="p-2 text-slate-400 hover:text-[var(--color-primary-base)] hover:bg-[var(--color-primary-base)]/10 rounded-lg transition-colors">
                            <Edit2 className="h-4 w-4" />
                         </button>
                         <button onClick={() => handleDelete(int.id)} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors dark:hover:bg-rose-500/10">
                            <Trash2 className="h-4 w-4" />
                         </button>
                       </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0 }} 
               animate={{ opacity: 1 }} 
               exit={{ opacity: 0 }} 
               onClick={closeModal} 
               className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
               initial={{ opacity: 0, scale: 0.95, y: 10 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.95, y: 10 }}
               className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
               <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    {editingId ? 'Editar Integrador' : 'Novo Integrador'}
                  </h3>
                  <button onClick={closeModal} className="text-slate-400 hover:text-slate-500 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 p-1.5 rounded-full transition-colors">
                    <X className="h-4 w-4" />
                  </button>
               </div>
               
               <form onSubmit={handleSave} className="p-6 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Nome de Exibição</label>
                    <input 
                      required
                      type="text"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent outline-none dark:bg-slate-950 dark:border-slate-800 dark:text-white transition-all text-sm"
                      placeholder="Ex: Horus ERP"
                      value={formData.name}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Código Único (Ref API)</label>
                    <input 
                      required
                      type="text"
                      className="w-full px-4 py-2.5 font-mono text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent outline-none dark:bg-slate-950 dark:border-slate-800 dark:text-white transition-all"
                      placeholder="Ex: HORUS"
                      value={formData.code}
                      onChange={e => setFormData({...formData, code: e.target.value.toUpperCase()})}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Descrição Curta</label>
                    <textarea 
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent outline-none dark:bg-slate-950 dark:border-slate-800 dark:text-white transition-all text-sm min-h-[80px]"
                      placeholder="Integração para faturamento B2B..."
                      value={formData.description}
                      onChange={e => setFormData({...formData, description: e.target.value})}
                    />
                  </div>
                  <div className="pt-2 flex items-center gap-3">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer"
                        checked={formData.active}
                        onChange={e => setFormData({...formData, active: e.target.checked})}
                      />
                      <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-[var(--color-primary-base)]"></div>
                    </label>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Integrador Ativo</span>
                  </div>

                  <div className="pt-4 flex justify-end gap-3 mt-4 border-t border-slate-100 dark:border-slate-800">
                     <button type="button" onClick={closeModal} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors">
                       Cancelar
                     </button>
                     <button type="submit" className="px-5 py-2 bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white text-sm font-semibold rounded-xl shadow-sm shadow-[var(--color-primary-base)]/20 transition-all active:scale-95">
                       Salvar
                     </button>
                  </div>
               </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
