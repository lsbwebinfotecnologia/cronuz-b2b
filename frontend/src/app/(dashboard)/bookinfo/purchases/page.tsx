'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, BookOpen, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getToken } from '@/lib/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function BookinfoPurchasesPage() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    supplier_name: '',
    document_origin: '',
    document_destination: '',
    start_date: ''
  });

  const fetchSuppliers = useCallback(async () => {
    try {
      setLoading(true);
      const token = getToken();
      const res = await fetch(`${API_URL}/bookinfo-purchases/suppliers`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Falha');
      const data = await res.json();
      setSuppliers(data);
    } catch (error) {
      toast.error('Erro ao buscar fornecedores Bookinfo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  const handleOpenModal = (supplier: any = null) => {
    if (supplier) {
      setEditingId(supplier.id);
      setFormData({
        supplier_name: supplier.supplier_name || '',
        document_origin: supplier.document_origin || '',
        document_destination: supplier.document_destination || '',
        start_date: supplier.start_date ? String(supplier.start_date).split('T')[0] : ''
      });
    } else {
      setEditingId(null);
      setFormData({
        supplier_name: '',
        document_origin: '',
        document_destination: '',
        start_date: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const token = getToken();
      
      const payload = {
        ...formData,
        start_date: formData.start_date ? new Date(formData.start_date).toISOString() : null
      };

      if (editingId) {
        const res = await fetch(`${API_URL}/bookinfo-purchases/suppliers/${editingId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Falha ao atualizar');
        toast.success('Fornecedor atualizado com sucesso.');
      } else {
        const res = await fetch(`${API_URL}/bookinfo-purchases/suppliers`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Falha ao criar');
        toast.success('Fornecedor cadastrado com sucesso.');
      }
      
      handleCloseModal();
      fetchSuppliers();
    } catch (err) {
      toast.error('Ocorreu um erro ao salvar o fornecedor.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Deseja realmente deletar este fornecedor?')) return;
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/bookinfo-purchases/suppliers/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Falha ao deletar');
      toast.success('Fornecedor deletado.');
      fetchSuppliers();
    } catch (error) {
      toast.error('Houve um erro ao deletar.');
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-[var(--color-primary-base)]" />
          Fornecedores Bookinfo (Compras)
        </h1>
        <p className="text-slate-500 text-sm mt-1 dark:text-slate-400">
          Gerencie as integrações e faturamentos de fornecedores pela plataforma Bookinfo.
        </p>
      </div>

      <div className="flex flex-col md:flex-row items-start md:items-center justify-end w-full">
        <button 
           onClick={() => handleOpenModal()} 
           className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-semibold py-2.5 px-5 rounded-xl transition-all shadow-lg shadow-[var(--color-primary-base)]/20 hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Adicionar Fornecedor
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:bg-slate-900/40 dark:border-slate-800 w-full animate-in fade-in">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Fornecedor</th>
                <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">CNPJ Emissor</th>
                <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">CNPJ Destino</th>
                <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300">Data de Início</th>
                <th className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
              {loading && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[var(--color-primary-base)]" />
                    Carregando fornecedores...
                  </td>
                </tr>
              )}
              
              {!loading && suppliers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    Nenhum fornecedor cadastrado ainda.
                  </td>
                </tr>
              )}

              {!loading && suppliers.map((spl) => (
                <tr key={spl.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-900 dark:text-white flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-[var(--color-primary-base)]/10 text-[var(--color-primary-base)] flex items-center justify-center shrink-0">
                      <BookOpen className="h-4 w-4" />
                    </div>
                    {spl.supplier_name || '-'}
                  </td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-400 font-mono text-sm">{spl.document_origin || '-'}</td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-400 font-mono text-sm">{spl.document_destination || '-'}</td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-400">
                    {spl.start_date ? new Date(spl.start_date).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                       <button onClick={() => handleOpenModal(spl)} className="p-2 text-slate-400 hover:text-[var(--color-primary-base)] hover:bg-[var(--color-primary-base)]/10 rounded-lg transition-colors" title="Editar">
                         <Edit2 className="h-4 w-4" />
                       </button>
                       <button onClick={() => handleDelete(spl.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Deletar">
                         <Trash2 className="h-4 w-4" />
                       </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800/60">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                {editingId ? 'Editar Fornecedor' : 'Adicionar Fornecedor'}
              </h3>
              <button 
                onClick={handleCloseModal}
                className="text-slate-400 hover:text-slate-500 dark:hover:text-slate-300 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Nome do Fornecedor</label>
                <input 
                  type="text"
                  required
                  autoFocus
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all font-medium text-sm placeholder:text-slate-400 dark:bg-slate-900/50 dark:border-slate-700 dark:text-white"
                  value={formData.supplier_name}
                  onChange={(e) => setFormData({...formData, supplier_name: e.target.value})}
                  placeholder="Ex: Editora X" 
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">CNPJ Emissor (Fabricante)</label>
                <input 
                  type="text"
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all font-mono text-sm placeholder:text-slate-400 dark:bg-slate-900/50 dark:border-slate-700 dark:text-white"
                  value={formData.document_origin}
                  onChange={(e) => setFormData({...formData, document_origin: e.target.value})}
                  placeholder="Apenas números" 
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">CNPJ Destino (Seu Vínculo)</label>
                <input 
                  type="text"
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all font-mono text-sm placeholder:text-slate-400 dark:bg-slate-900/50 dark:border-slate-700 dark:text-white"
                  value={formData.document_destination}
                  onChange={(e) => setFormData({...formData, document_destination: e.target.value})}
                  placeholder="Apenas números" 
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Data de Início</label>
                <input 
                  type="date"
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all text-sm dark:bg-slate-900/50 dark:border-slate-700 dark:text-white"
                  value={formData.start_date}
                  onChange={(e) => setFormData({...formData, start_date: e.target.value})}
                />
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 dark:border-slate-800/60 mt-6 pt-6">
                <button 
                  type="button" 
                  onClick={handleCloseModal}
                  className="px-5 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-700"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={submitting}
                  className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-semibold py-2.5 px-6 rounded-xl transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {submitting ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
