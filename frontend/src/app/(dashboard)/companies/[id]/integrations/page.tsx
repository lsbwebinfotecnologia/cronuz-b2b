'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Plug, Loader2, Plus, Trash2, Edit2, Settings } from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';

interface Integrator {
  id: number;
  company_id: number;
  platform: string;
  credentials: string | null;
  active: boolean;
  created_at: string;
}

export default function CompanyIntegrationsPage() {
  const params = useParams();
  const companyId = params.id as string;
  const [integrators, setIntegrators] = useState<Integrator[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({ platform: 'TRAY', credentials: '', active: true });

  useEffect(() => {
    fetchIntegrators();
  }, [companyId]);

  async function fetchIntegrators() {
    setLoading(true);
    try {
      const token = getToken();
      if (!token) return;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/integrators/${companyId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setIntegrators(await res.json());
      }
    } catch (error) {
       toast.error('Erro ao carregar os integradores.');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddIntegrator(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.platform.trim()) return;
    
    setSubmitting(true);
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/integrators/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ ...formData, company_id: parseInt(companyId) })
      });
      
      if (!res.ok) {
          const err = await res.json();
          throw new Error(err.detail || 'Falha ao adicionar integração');
      }
      
      const newIntegrator = await res.json();
      setIntegrators([...integrators, newIntegrator]);
      toast.success('Integração adicionada!');
      setFormData({ platform: 'TRAY', credentials: '', active: true });
      setShowModal(false);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleIntegrator(integrator: Integrator) {
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/integrators/${integrator.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ active: !integrator.active })
      });
      if (!res.ok) throw new Error('Falha ao atualizar integração');
      
      const updated = await res.json();
      setIntegrators(integrators.map(i => i.id === integrator.id ? updated : i));
      toast.success(`Integração ${updated.active ? 'ativada' : 'inativada'} com sucesso!`);
    } catch (error) {
      toast.error('Erro ao mudar o status.');
    }
  }

  async function handleDeleteIntegrator(integratorId: number) {
    if (!window.confirm("Certeza que deseja EXCLUIR esta integração?")) return;
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/integrators/${integratorId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Falha ao excluir');
      setIntegrators(integrators.filter(i => i.id !== integratorId));
      toast.success('Integração excluída!');
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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full">
      <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
         <div className="flex items-center gap-3">
           <Plug className="h-6 w-6 text-slate-500" />
           <div>
             <h2 className="text-xl font-bold text-slate-900 dark:text-white">Central de Integrações</h2>
             <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
               Gerencie conectores para ERPs e Plataformas (Ex: Tray).
             </p>
           </div>
         </div>
         <button 
           onClick={() => setShowModal(true)}
           className="bg-indigo-500 hover:bg-indigo-600 text-white font-medium py-2 px-4 rounded-xl flex items-center gap-2 transition-all shadow-sm"
         >
           <Plus className="h-4 w-4" />
           Novo Integrador
         </button>
      </div>

      <div className="flex-1 overflow-x-auto">
         <table className="w-full text-left text-sm whitespace-nowrap">
           <thead className="bg-slate-50 dark:bg-slate-950/50 text-slate-500 font-medium border-b border-slate-200 dark:border-slate-800">
             <tr>
               <th className="px-6 py-4">ID</th>
               <th className="px-6 py-4">Plataforma</th>
               <th className="px-6 py-4">Status</th>
               <th className="px-6 py-4">Data de Criação</th>
               <th className="px-6 py-4 text-center">Ações</th>
             </tr>
           </thead>
           <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60 leading-relaxed">
             {integrators.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center text-slate-500 dark:text-slate-400">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <Settings className="h-10 w-10 text-slate-300 dark:text-slate-700" />
                      <p>Nenhum integrador cadastrado.</p>
                    </div>
                  </td>
                </tr>
             ) : (
                integrators.map(int => (
                   <tr key={int.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20">
                     <td className="px-6 py-4 text-slate-500">{int.id}</td>
                     <td className="px-6 py-4 font-bold text-slate-900 dark:text-slate-200">{int.platform}</td>
                     <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                           <span className={`h-2 w-2 rounded-full ${int.active ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                           <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                              {int.active ? 'Ativo' : 'Inativo'}
                           </span>
                        </div>
                     </td>
                     <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                       {new Date(int.created_at).toLocaleString('pt-BR')}
                     </td>
                     <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                           <button onClick={() => handleToggleIntegrator(int)} className={`text-xs font-medium hover:underline transition-colors ${int.active ? 'text-rose-600' : 'text-emerald-600'}`}>
                             {int.active ? 'Desativar' : 'Ativar'}
                           </button>
                           <span className="text-slate-300">|</span>
                           <button onClick={() => handleDeleteIntegrator(int.id)} className="text-xs font-medium text-rose-600 hover:underline">
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

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
            >
              <form onSubmit={handleAddIntegrator}>
                <div className="p-6 border-b border-slate-200 dark:border-slate-800">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Adicionar Integrador</h3>
                </div>
                <div className="p-6 space-y-4 bg-slate-50 dark:bg-slate-900/50">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Plataforma</label>
                    <select
                      value={formData.platform}
                      onChange={(e) => setFormData({...formData, platform: e.target.value})}
                      className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="TRAY">Tray Commerce</option>
                      <option value="NUVEMSHOP">Nuvemshop</option>
                      <option value="HORUS_V2">Horus ERP (V2)</option>
                    </select>
                  </div>
                </div>
                <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3 bg-white dark:bg-slate-900">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 font-medium text-slate-500 hover:bg-slate-100 rounded-xl"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-6 py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-medium rounded-xl flex items-center gap-2"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Adicionar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
