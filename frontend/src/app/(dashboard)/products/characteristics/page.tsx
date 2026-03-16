'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, SlidersHorizontal, RefreshCw, X, Save, ArrowLeft, Edit } from 'lucide-react';
import { toast } from 'sonner';
import { getToken } from '@/lib/auth';
import Link from 'next/link';

export default function CharacteristicsPage() {
  const [chars, setChars] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingChar, setEditingChar] = useState<any>(null);
  const [newCharName, setNewCharName] = useState('');
  const [newCharOptions, setNewCharOptions] = useState<string[]>([]);
  const [optionInput, setOptionInput] = useState('');
  const [parentCatId, setParentCatId] = useState<number | ''>('');
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const authHeader = { 'Authorization': `Bearer ${getToken()}` };
      const [charRes, catRes] = await Promise.all([
        fetch('http://localhost:8000/characteristics', { headers: authHeader }),
        fetch('http://localhost:8000/categories', { headers: authHeader })
      ]);
      
      if (charRes.ok) setChars(await charRes.json());
      if (catRes.ok) setCategories(await catRes.json());
      
    } catch (e) {
      toast.error('Erro ao buscar dados.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSave = async () => {
    if (!newCharName.trim()) return toast.error("O nome é obrigatório.");
    setSaving(true);
    try {
      const url = editingChar ? `http://localhost:8000/characteristics/${editingChar.id}` : 'http://localhost:8000/characteristics';
      const method = editingChar ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({ 
          name: newCharName,
          options: newCharOptions.length > 0 ? newCharOptions.join(', ') : null,
          category_id: parentCatId || null
        })
      });

      if (res.ok) {
        toast.success(`Característica ${editingChar ? 'atualizada' : 'criada'} com sucesso!`);
        handleCloseModal();
        fetchData();
      } else {
        const err = await res.json();
        toast.error(err.detail || `Erro ao ${editingChar ? 'atualizar' : 'criar'} característica.`);
      }
    } catch (e) {
      toast.error("Erro de conexão.");
    } finally {
      setSaving(false);
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setNewCharName('');
    setNewCharOptions([]);
    setOptionInput('');
    setParentCatId('');
    setEditingChar(null);
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
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Características (Grade)</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Dicionário de variações (Cor, Tamanho, Voltagem).</p>
          </div>
        </div>
        
        <button 
          onClick={() => {
            setEditingChar(null);
            setNewCharName('');
            setNewCharOptions([]);
            setOptionInput('');
            setParentCatId('');
            setShowModal(true);
          }}
          className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-medium py-2.5 px-5 rounded-xl flex items-center gap-2 transition-all shadow-lg"
        >
          <Plus className="h-4 w-4" />
          Nova Característica
        </button>
      </div>


      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden dark:bg-slate-900/50 dark:border-slate-800">
        <div className="overflow-x-auto min-h-[300px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-100 bg-slate-50/80 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:bg-slate-900/80 dark:text-slate-400 dark:border-slate-800">
                <th className="p-4 whitespace-nowrap">ID</th>
                <th className="p-4 whitespace-nowrap">Nome da Característica</th>
                <th className="p-4 whitespace-nowrap">Categoria Atrelada</th>
                <th className="p-4 whitespace-nowrap">Opções</th>
                <th className="p-4 whitespace-nowrap text-right">Data Inserção & Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {loading ? (
                <tr>
                   <td colSpan={3} className="p-8 text-center text-slate-500"><RefreshCw className="h-6 w-6 animate-spin mx-auto text-slate-400" /></td>
                </tr>
              ) : chars.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-8 text-center text-slate-500">Nenhuma característica registrada.</td>
                </tr>
              ) : (
                chars.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/80 transition-colors dark:hover:bg-slate-800/50">
                    <td className="p-4 text-sm text-slate-500 dark:text-slate-400">#{c.id}</td>
                    <td className="p-4 font-medium text-slate-900 dark:text-white">
                      <div className="flex items-center gap-2">
                        <SlidersHorizontal className="w-4 h-4 text-slate-400" />
                        {c.name}
                      </div>
                    </td>
                    <td className="p-4 text-sm font-medium text-slate-500 dark:text-slate-400">
                      {c.category_id ? categories.find(cat => cat.id === c.category_id)?.name || `ID ${c.category_id}` : 'Global'}
                    </td>
                    <td className="p-4 text-sm text-slate-500 dark:text-slate-400">
                      <div className="flex flex-wrap gap-1">
                        {c.options ? c.options.split(',').map((opt: string, idx: number) => (
                           <span key={idx} className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 px-2.5 py-1 rounded-md text-xs font-medium border border-slate-200 dark:border-slate-700">
                             {opt.trim()}
                           </span>
                        )) : '-'}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {new Date(c.created_at).toLocaleDateString('pt-BR')}
                        </span>
                        <button 
                          onClick={() => {
                            setEditingChar(c);
                            setNewCharName(c.name);
                            // Parse string to array "P, M, G" -> ['P', 'M', 'G']
                            setNewCharOptions(c.options ? c.options.split(',').map((o: string) => o.trim()).filter(Boolean) : []);
                            setOptionInput('');
                            setParentCatId(c.category_id || '');
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
                {editingChar ? 'Editar Característica' : 'Globalizar Nova Característica'}
              </h2>
              <button onClick={handleCloseModal} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Nome (ex: Capacidade, Voltagem, Cor) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={newCharName}
                  onChange={(e) => setNewCharName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-2 focus:ring-[var(--color-primary-base)]/20 focus:border-[var(--color-primary-base)] block p-3 dark:bg-slate-950 dark:border-slate-800 dark:text-white"
                  placeholder="Ex: Tamanho"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 flex justify-between">
                   <span>Categoria Atrelada</span>
                </label>
                <select
                  value={parentCatId}
                  onChange={(e) => setParentCatId(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-xl focus:ring-2 focus:ring-[var(--color-primary-base)]/20 focus:border-[var(--color-primary-base)] block p-3 dark:bg-slate-950 dark:border-slate-800 dark:text-white"
                >
                    <option value="">Global (Aplicável a todos os produtos)</option>
                    {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
                <p className="text-xs text-slate-500 mt-2">Vincule a característica a uma Categoria específica (ex: Voltagem -{'>'} Eletrônicos) para melhor integração com Mercado Livre.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Opções 
                </label>
                <div className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 dark:bg-slate-950 dark:border-slate-800 flex flex-wrap gap-2 focus-within:ring-2 focus-within:ring-[var(--color-primary-base)]/20 focus-within:border-[var(--color-primary-base)]">
                  {newCharOptions.map((opt, idx) => (
                    <span key={idx} className="bg-[var(--color-primary-base)]/10 text-[var(--color-primary-base)] border border-[var(--color-primary-base)]/20 px-3 py-1 rounded-lg text-sm font-medium flex items-center gap-1.5">
                      {opt}
                      <button 
                        onClick={() => setNewCharOptions(prev => prev.filter((_, i) => i !== idx))}
                        className="hover:bg-[var(--color-primary-base)]/20 rounded-full p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={optionInput}
                    onChange={(e) => setOptionInput(e.target.value)}
                    onKeyDown={(e) => {
                       if (e.key === 'Enter') {
                          e.preventDefault();
                          const val = optionInput.trim();
                          if (val && !newCharOptions.includes(val)) {
                             setNewCharOptions(prev => [...prev, val]);
                             setOptionInput('');
                          }
                       }
                    }}
                    className="flex-1 bg-transparent border-none outline-none text-sm text-slate-900 dark:text-white min-w-[120px] p-1"
                    placeholder={newCharOptions.length === 0 ? "Ex: P, depois aperte Enter" : "Adicionar..."}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-2">Tecle <strong>Enter</strong> para adicionar cada opção.</p>
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
                {saving ? "Salvando..." : <><Save className="w-4 h-4" /> {editingChar ? 'Atualizar' : 'Salvar'}</>}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
