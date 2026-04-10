'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Plus, Trash2, ArrowLeft, Loader2, Save, LayoutTemplate, Layers } from 'lucide-react';
import Link from 'next/link';
import { getToken } from '@/lib/auth';

export default function SystemIntegratorEditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [integrator, setIntegrator] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Group Form State
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  // Field Form State
  const [addingFieldToGroupId, setAddingFieldToGroupId] = useState<number | null>(null);
  const [newFieldData, setNewFieldData] = useState({ name: '', label: '', type: 'TEXT', is_required: true });

  useEffect(() => {
    fetchIntegrator();
  }, [id]);

  const fetchIntegrator = async () => {
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/system-integrators/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setIntegrator(await res.json());
      } else {
        router.push('/system-integrators');
      }
    } catch(e) {
    } finally {
      setLoading(false);
    }
  };

  const createGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/system-integrators/${id}/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newGroupName, order_index: integrator.groups?.length || 0 })
      });
      if (res.ok) {
        setNewGroupName('');
        setAddingGroup(false);
        fetchIntegrator();
      }
    } catch(e) {}
  };

  const deleteGroup = async (groupId: number) => {
    if (!confirm('Excluir este grupo e todos os seus campos?')) return;
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/system-integrators/groups/${groupId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) fetchIntegrator();
    } catch(e) {}
  };

  const createField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addingFieldToGroupId || !newFieldData.name.trim() || !newFieldData.label.trim()) return;

    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/system-integrators/groups/${addingFieldToGroupId}/fields`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...newFieldData })
      });
      if (res.ok) {
        setAddingFieldToGroupId(null);
        setNewFieldData({ name: '', label: '', type: 'TEXT', is_required: true });
        fetchIntegrator();
      }
    } catch(e) {}
  };

  const deleteField = async (fieldId: number) => {
    if (!confirm('Remover campo?')) return;
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/system-integrators/fields/${fieldId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) fetchIntegrator();
    } catch(e) {}
  };

  if (loading) {
    return <div className="p-8"><Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary-base)]" /></div>;
  }

  if (!integrator) return null;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <Link href="/system-integrators" className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800 text-slate-500 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
           <div className="flex items-center gap-3">
             <div className="h-8 w-8 bg-slate-100 rounded-lg flex items-center justify-center font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {integrator.name.charAt(0)}
             </div>
             <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Construtor de Configuração: {integrator.name}</h1>
           </div>
           <p className="text-slate-500 text-sm mt-1">Crie os grupos e campos que as empresas deverão preencher ao ativar este integrador.</p>
        </div>
      </div>

      <div className="space-y-6">
        {integrator.groups?.map((group: any) => (
          <div key={group.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
             <div className="bg-slate-50/80 dark:bg-slate-950/50 p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
               <div className="flex items-center gap-2">
                 <Layers className="w-5 h-5 text-[var(--color-primary-base)]" />
                 <h2 className="font-bold text-slate-800 dark:text-slate-200">{group.name}</h2>
               </div>
               <div className="flex gap-2">
                 <button onClick={() => setAddingFieldToGroupId(group.id)} className="text-xs px-3 py-1.5 bg-[var(--color-primary-base)]/10 text-[var(--color-primary-base)] hover:bg-[var(--color-primary-base)] hover:text-white rounded-lg font-semibold transition-all shadow-sm">
                   + Adicionar Campo
                 </button>
                 <button onClick={() => deleteGroup(group.id)} className="text-xs px-2 py-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors">
                   <Trash2 className="w-4 h-4" />
                 </button>
               </div>
             </div>

             <div className="p-0">
               {group.fields?.length === 0 && addingFieldToGroupId !== group.id ? (
                 <div className="p-6 text-center text-slate-400 text-sm">Nenhum campo neste grupo. Adicione um campo para começar.</div>
               ) : (
                 <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50/40 dark:bg-slate-900 text-slate-500 text-xs uppercase">
                      <tr>
                        <th className="px-5 py-3 border-b border-slate-100 dark:border-slate-800/80">Label (UI)</th>
                        <th className="px-5 py-3 border-b border-slate-100 dark:border-slate-800/80">Chave (JSON)</th>
                        <th className="px-5 py-3 border-b border-slate-100 dark:border-slate-800/80">Tipo</th>
                        <th className="px-5 py-3 border-b border-slate-100 dark:border-slate-800/80">Obrigatório</th>
                        <th className="px-5 py-3 border-b border-slate-100 dark:border-slate-800/80 text-right"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {group.fields?.map((field: any) => (
                        <tr key={field.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20">
                           <td className="px-5 py-3 font-medium text-slate-800 dark:text-slate-200">{field.label}</td>
                           <td className="px-5 py-3"><span className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded font-mono text-xs">{field.name}</span></td>
                           <td className="px-5 py-3 text-slate-500 text-xs">{field.type}</td>
                           <td className="px-5 py-3 text-slate-500">{field.is_required ? 'Sim' : 'Não'}</td>
                           <td className="px-5 py-3 text-right">
                             <button onClick={() => deleteField(field.id)} className="text-slate-400 hover:text-rose-500 p-1">
                               <Trash2 className="w-4 h-4" />
                             </button>
                           </td>
                        </tr>
                      ))}
                    </tbody>
                 </table>
               )}

               {addingFieldToGroupId === group.id && (
                 <div className="p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                    <form onSubmit={createField} className="flex flex-wrap items-end gap-3">
                       <div className="flex-1 min-w-[200px]">
                         <label className="text-xs font-semibold text-slate-500 mb-1 block">Label de Exibição</label>
                         <input required type="text" placeholder="Ex: URL da API" value={newFieldData.label} onChange={e => setNewFieldData({...newFieldData, label: e.target.value})} className="w-full text-sm p-2 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 focus:outline-none focus:border-[var(--color-primary-base)]" />
                       </div>
                       <div className="flex-1 min-w-[150px]">
                         <label className="text-xs font-semibold text-slate-500 mb-1 block">Chave Interna</label>
                         <input required type="text" placeholder="Ex: api_url" value={newFieldData.name} onChange={e => setNewFieldData({...newFieldData, name: e.target.value})} className="w-full text-sm font-mono p-2 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 focus:outline-none focus:border-[var(--color-primary-base)]" />
                       </div>
                       <div className="w-32">
                         <label className="text-xs font-semibold text-slate-500 mb-1 block">Tipo</label>
                         <select value={newFieldData.type} onChange={e => setNewFieldData({...newFieldData, type: e.target.value})} className="w-full text-sm p-2 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 focus:outline-none">
                            <option value="TEXT">Texto</option>
                            <option value="NUMBER">Número</option>
                            <option value="PASSWORD">Senha/Token</option>
                            <option value="BOOLEAN">Toggle (Sim/Não)</option>
                         </select>
                       </div>
                       <div className="flex items-center gap-2 pb-2">
                         <input type="checkbox" checked={newFieldData.is_required} onChange={e => setNewFieldData({...newFieldData, is_required: e.target.checked})} className="rounded text-[var(--color-primary-base)]" />
                         <span className="text-xs text-slate-600 dark:text-slate-400">Obrigatório</span>
                       </div>
                       <div className="flex gap-2">
                         <button type="button" onClick={() => setAddingFieldToGroupId(null)} className="px-3 py-2 text-sm text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg">Cancelar</button>
                         <button type="submit" className="px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 shadow-sm">Salvar Campo</button>
                       </div>
                    </form>
                 </div>
               )}
             </div>
          </div>
        ))}

        {!addingGroup ? (
           <button onClick={() => setAddingGroup(true)} className="flex items-center justify-center gap-2 w-full py-4 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-slate-500 hover:text-[var(--color-primary-base)] hover:border-[var(--color-primary-base)] hover:bg-[var(--color-primary-base)]/5 transition-all font-medium">
              <Plus className="w-5 h-5" /> Adicionar Grupo de Configurações
           </button>
        ) : (
           <form onSubmit={createGroup} className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-5 rounded-2xl shadow-sm">
             <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-3">Novo Grupo</h3>
             <div className="flex flex-col sm:flex-row gap-3">
                <input autoFocus required type="text" placeholder="Nome do grupo (Ex: Gerais)" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} className="flex-1 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 dark:bg-slate-950 focus:outline-none focus:border-[var(--color-primary-base)]" />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setAddingGroup(false)} className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl font-medium">Cancelar</button>
                  <button type="submit" className="px-5 py-2 bg-[var(--color-primary-base)] text-white shadow-sm rounded-xl font-medium hover:bg-opacity-90">Salvar Grupo</button>
                </div>
             </div>
           </form>
        )}
      </div>
    </div>
  );
}
