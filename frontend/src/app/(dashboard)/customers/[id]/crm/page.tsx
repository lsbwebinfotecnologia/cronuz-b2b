'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Target, Calendar, CheckSquare, Clock, Plus, BarChart3, TrendingUp, AlertTriangle, Package2, DollarSign, Edit, Check, Link as LinkIcon, Send, Phone, Mail, StickyNote, Trash2, Search, ChevronLeft, ChevronRight, Edit2 } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { getToken, getUser } from '@/lib/auth';

const statusMap: Record<string, { label: string, color: string }> = {
  "LEAD": { label: "Prospecto (Lead)", color: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400" },
  "NEGOTIATION": { label: "Em Negociação", color: "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400" },
  "ACTIVE": { label: "Cliente Ativo", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400" },
  "CHURN_ALERT": { label: "Risco de Evasão", color: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400" },
  "BLOCKED": { label: "Bloqueado / Inadimplente", color: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400" },
};

const actionTypes = [
  { id: 'NOTE', label: 'Anotação Interna' },
  { id: 'CALL', label: 'Ligação Realizada' },
  { id: 'MEETING', label: 'Reunião' },
  { id: 'EMAIL', label: 'E-mail Enviado' },
  { id: 'TASK', label: 'Lembrete / Tarefa' }
];

export default function CRMDashboardPage() {
  const params = useParams();
  const router = useRouter();
  const customerId = params.id;

  const [customer, setCustomer] = useState<any>(null);
  const [insights, setInsights] = useState<any>(null);
  const [interactions, setInteractions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [actionMode, setActionMode] = useState(false);
  const [newAction, setNewAction] = useState({
      type: 'NOTE',
      content: '',
      due_date: '',
      is_future: false
  });
  
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [userSettings, setUserSettings] = useState<any>(null);

  useEffect(() => {
    setUserSettings(getUser());
    if (customerId) {
      fetchCustomerData();
    }
  }, [customerId]);

  const fetchCustomerData = async () => {
    try {
      const token = getToken();
      if (!token) return;

      const [resCustomer, resInsights] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/customers/${customerId}`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/customers/${customerId}/crm-insights`, { headers: { 'Authorization': `Bearer ${token}` } })
      ]);

      if (resCustomer.ok) {
          const data = await resCustomer.json();
          setCustomer(data);
          setInteractions(data.interactions || []);
      } else {
          router.push('/customers');
          return;
      }
      
      if (resInsights.ok) {
          setInsights(await resInsights.json());
      }
    } catch (e) {
      toast.error('Erro ao carregar dados do CRM.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (newStatus: string) => {
      setStatusUpdating(true);
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/customers/${customerId}`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ crm_status: newStatus })
        });
        if (res.ok) {
            setInsights({...insights, status: newStatus});
            toast.success("Status atualizado!");
        }
      } catch(e) {} finally {
          setStatusUpdating(false);
      }
  };

  const handleCreateAction = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        const payload: any = {
            type: newAction.type,
            content: newAction.content,
        };
        if (newAction.is_future && newAction.due_date) {
            payload.due_date = new Date(newAction.due_date).toISOString();
        } else {
            payload.due_date = null;
        }

        if (editingId) {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/customers/${customerId}/interactions/${editingId}`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                toast.success("Ação atualizada com sucesso.");
                setActionMode(false);
                setEditingId(null);
                setNewAction({ type: 'NOTE', content: '', due_date: '', is_future: false });
                fetchCustomerData(); 
            }
        } else {
            payload.status = newAction.is_future ? 'PENDING' : 'COMPLETED';
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/customers/${customerId}/interactions`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                toast.success("Ação registrada no CRM.");
                setActionMode(false);
                setNewAction({ type: 'NOTE', content: '', due_date: '', is_future: false });
                fetchCustomerData();
            }
        }
      } catch(e) {}
  };

  const handleEditInteraction = (int: any) => {
      setActionMode(true);
      setEditingId(int.id);
      
      let formattedDate = "";
      if (int.due_date) {
          const d = new Date(int.due_date);
          // format YYYY-MM-DDTHH:mm to fit datetime-local default HTML5
          formattedDate = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      }
      
      setNewAction({
          type: int.type,
          content: int.content,
          due_date: formattedDate,
          is_future: !!int.due_date || int.status === 'PENDING'
      });
  };

  const handleCompleteTask = async (id: number) => {
      try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/customers/${customerId}/interactions/${id}`, {
              method: 'PATCH',
              headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'COMPLETED' })
          });
          if (res.ok) {
              setInteractions(interactions.map(i => i.id === id ? {...i, status: 'COMPLETED'} : i));
              toast.success("Tarefa concluída!");
          }
      } catch(e) {}
  };

  const handleDeleteInteraction = async (id: number) => {
      if (!confirm('Deseja realmente apagar este registro do histórico?')) return;
      try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/customers/${customerId}/interactions/${id}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${getToken()}` }
          });
          if (res.ok) {
              setInteractions(interactions.map(i => i.id === id ? {...i, status: 'DELETED'} : i));
              toast.success("Registro removido (Soft Delete).");
          } else {
              toast.error("Erro ao remover registro.");
          }
      } catch(e) {}
  };

  const filteredInteractions = interactions.filter(int => {
      if (!showDeleted && int.status === 'DELETED') return false;
      return int.content.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (actionTypes.find(t=>t.id===int.type)?.label || '').toLowerCase().includes(searchQuery.toLowerCase());
  }).sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const itemsPerPage = 5;
  const totalPages = Math.max(1, Math.ceil(filteredInteractions.length / itemsPerPage));
  const paginatedInteractions = filteredInteractions.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  if (loading) return <div className="flex h-[80vh] items-center justify-center"><Loader2 className="w-10 h-10 animate-spin text-[var(--color-primary-base)]" /></div>;

  return (
    <div className="flex flex-col h-full space-y-6">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex gap-4 items-center">
            <Link href={`/customers/${customerId}`} className="bg-slate-100 hover:bg-slate-200 p-2.5 rounded-xl transition-colors dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300">
                <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex bg-[var(--color-primary-base)]/10 p-3 rounded-xl dark:bg-indigo-500/20">
                <Target className="w-6 h-6 text-[var(--color-primary-base)] dark:text-indigo-400" />
            </div>
            <div>
                <h1 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">CRM 360º</h1>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    {customer?.name || customer?.corporate_name} <span className="opacity-50">/</span> {customer?.document}
                </p>
            </div>
        </div>
        <div className="flex items-center gap-3">
             <Link href={`/orders/new?customer_id=${customerId}`} className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-medium py-2.5 px-6 rounded-xl flex items-center gap-2 transition-all shadow-lg hover:scale-[1.02]">
                <Package2 className="w-4 h-4" /> Novo Pedido
             </Link>
        </div>
      </div>

      {/* GRID CRM */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* COLUNA 1: Termômetro Mestre */}
          <div className="lg:col-span-3 space-y-6">
              <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">Status da Conta</h3>
                  <select 
                      value={insights?.status || 'ACTIVE'} 
                      onChange={e => handleUpdateStatus(e.target.value)}
                      disabled={statusUpdating}
                      className={`w-full p-3 font-semibold rounded-xl border outline-none cursor-pointer transition-all ${statusMap[insights?.status || 'ACTIVE'].color} border-current border-opacity-20`}
                  >
                      {Object.keys(statusMap).map(k => (
                          <option key={k} value={k} className="bg-white text-slate-800 my-1">{statusMap[k].label}</option>
                      ))}
                  </select>
                  {insights?.status === 'BLOCKED' && <p className="text-[10px] text-rose-500 mt-2 font-medium bg-rose-50 p-2 rounded-lg dark:bg-rose-950">Aviso: O cadastro do cliente impedirá a criação de novos pedidos em toda a vitrine.</p>}
                  
                  <hr className="my-5 border-slate-100 dark:border-slate-800" />
                  
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4" /> Termômetro (RFM)</h3>
                  
                  <div className="space-y-4">
                      <div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Recência (Dias inativo)</p>
                          <p className={`text-xl font-bold ${insights?.rfm?.recency_days > 45 ? 'text-rose-500' : 'text-emerald-500'}`}>
                              {insights?.rfm?.recency_days} <span className="text-sm font-medium opacity-50">dias</span>
                          </p>
                      </div>
                      <div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Frequência da Conta</p>
                          <p className="text-xl font-bold text-slate-800 dark:text-slate-200">
                              {insights?.rfm?.frequency_total} <span className="text-sm font-medium opacity-50">pedidos</span>
                          </p>
                      </div>
                      <div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Valor Agregado (LTV)</p>
                          <p className="text-xl font-bold text-[var(--color-primary-base)] dark:text-indigo-400">
                              {new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'}).format(insights?.rfm?.monetary_ltv || 0)}
                          </p>
                      </div>
                  </div>
              </div>
          </div>

          {/* COLUNA 2: Central de Ação (Timeline) */}
          <div className="lg:col-span-6 flex flex-col gap-6">
               <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
                   {!actionMode ? (
                       <button onClick={() => setActionMode(true)} className="w-full bg-slate-50 border border-slate-200 border-dashed hover:border-[var(--color-primary-base)] text-slate-500 p-4 rounded-xl flex items-center justify-center gap-2 font-medium transition-colors dark:bg-slate-800/50 dark:border-slate-700 dark:hover:border-indigo-500">
                           <Edit className="w-4 h-4" /> Registrar Interação ou Agendar Lembrete
                       </button>
                   ) : (
                       <form onSubmit={handleCreateAction} className="space-y-4 bg-slate-50 p-4 rounded-xl border border-[var(--color-primary-base)]/30 dark:bg-slate-800/50">
                           <div className="flex gap-4">
                               <div className="w-1/3">
                                   <label className="text-xs font-semibold text-slate-500 uppercase mb-1 block">Tipo de Ação</label>
                                   <select value={newAction.type} onChange={e=>setNewAction({...newAction, type: e.target.value})} className="w-full text-sm p-2 rounded-lg border border-slate-200 outline-none dark:bg-slate-900 dark:border-slate-700">
                                       {actionTypes.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                   </select>
                               </div>
                               <div className="w-2/3 flex items-center gap-3 pt-5">
                                   <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                                       <input type="checkbox" checked={newAction.is_future} onChange={e => setNewAction({...newAction, is_future: e.target.checked})} className="rounded text-[var(--color-primary-base)] focus:ring-[var(--color-primary-base)]" />
                                       É um compromisso/agendamento futuro?
                                   </label>
                               </div>
                           </div>
                           
                           {newAction.is_future && (
                               <div>
                                   <label className="text-xs font-semibold text-slate-500 uppercase mb-1 block">Data do Compromisso (Opcional)</label>
                                   <input type="datetime-local" value={newAction.due_date} onChange={e => setNewAction({...newAction, due_date: e.target.value})} className="w-full text-sm p-2 rounded-lg border border-slate-200 outline-none dark:bg-slate-900 dark:border-slate-700" />
                               </div>
                           )}

                           <div>
                               <textarea value={newAction.content} onChange={e => setNewAction({...newAction, content: e.target.value})} placeholder="Escreva a anotação ou o lembrete..." required rows={3} className="w-full text-sm p-3 rounded-lg border border-slate-200 outline-none resize-none dark:bg-slate-900 dark:border-slate-700" />
                           </div>

                           <div className="flex justify-end gap-2 pt-2">
                               <button type="button" onClick={() => {setActionMode(false); setEditingId(null); setNewAction({type:'NOTE', content: '', due_date: '', is_future: false});}} className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors">Cancelar</button>
                               <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] rounded-lg flex items-center gap-2">
                                  {editingId ? <Check className="w-3 h-3"/> : <Send className="w-3 h-3"/>}
                                  {editingId ? "Salvar Alterações" : "Gravar no CRM"}
                               </button>
                           </div>
                       </form>
                   )}
               </div>

               {/* END CENTRAL ACTION COLUMN */}
          </div>

          {/* COLUNA 3: Insights Cesta */}
          <div className="lg:col-span-3 space-y-6">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                  <div className="p-4 bg-emerald-50 dark:bg-emerald-500/10 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-emerald-600" />
                      <h3 className="text-sm font-bold text-emerald-900 dark:text-emerald-400">Top Comprados (Insight)</h3>
                  </div>
                  <div className="p-0">
                      {insights?.recommendations && insights.recommendations.length > 0 ? (
                          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                              {insights.recommendations.map((prod:any, i:number) => (
                                  <li key={i} className="p-4 hover:bg-slate-50 transition-colors dark:hover:bg-slate-800/50 flex gap-3 items-center">
                                      <div className="w-10 h-10 rounded border border-slate-200 bg-white flex-shrink-0 flex items-center justify-center overflow-hidden">
                                           {prod.image_url ? <img src={prod.image_url} alt="Prod" className="max-h-full max-w-full object-contain" /> : <Package2 className="w-4 h-4 text-slate-300" />}
                                      </div>
                                      <div className="overflow-hidden">
                                          <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate" title={prod.title}>{prod.title}</p>
                                          <p className="text-[10px] text-slate-400 mt-0.5">Comprado {prod.total_bought} vezes</p>
                                      </div>
                                  </li>
                              ))}
                          </ul>
                      ) : (
                          <div className="p-6 text-center text-sm text-slate-500">Sem histórico de compras para sugerir.</div>
                      )}
                  </div>
              </div>
          </div>

      </div>

      {/* TIMELINE FULL WIDTH */}
      <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">Feed de Atividades <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full text-xs dark:bg-slate-800">{filteredInteractions.length}</span></h3>
              <div className="relative flex items-center gap-3">
                  <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input type="text" placeholder="Buscar no histórico..." value={searchQuery} onChange={e => {setSearchQuery(e.target.value); setCurrentPage(1);}} className="pl-9 pr-4 py-2 border border-slate-200 dark:border-slate-800 rounded-lg text-sm bg-white dark:bg-slate-900 outline-none w-full sm:w-64" />
                  </div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 cursor-pointer hover:text-slate-700 transition-colors">
                      <input type="checkbox" checked={showDeleted} onChange={e => {setShowDeleted(e.target.checked); setCurrentPage(1);}} className="rounded cursor-pointer" />
                      Mostrar removidos
                  </label>
              </div>
          </div>
          
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm mt-3">
              <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <tr>
                          <th className="px-4 py-3 font-medium">Data</th>
                          <th className="px-4 py-3 font-medium">Tipo</th>
                          <th className="px-4 py-3 font-medium text-wrap min-w-[250px]">Descrição</th>
                          <th className="px-4 py-3 font-medium">Lembrete</th>
                          <th className="px-4 py-3 font-medium text-right">Ações</th>
                      </tr>
                  </thead>
                  <tbody>
                      {paginatedInteractions.length === 0 ? (
                          <tr>
                              <td colSpan={5} className="py-8 text-center text-slate-500 text-sm">Nenhum histórico encontrado.</td>
                          </tr>
                      ) : (
                          paginatedInteractions.map(int => (
                              <tr key={int.id} className={`border-b last:border-0 border-slate-100 dark:border-slate-800 ${int.status === 'PENDING' ? 'bg-amber-50/50 dark:bg-amber-900/10' : int.status === 'DELETED' ? 'bg-rose-50/10 grayscale opacity-60' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}>
                                  <td className="px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">
                                      {new Date(int.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                                  </td>
                                  <td className="px-4 py-3">
                                      <div className="flex items-center gap-2">
                                          <span className={`font-medium ${int.status === 'DELETED' ? 'text-rose-600 line-through' : 'text-slate-700 dark:text-slate-300'}`}>{actionTypes.find(t=>t.id===int.type)?.label || 'Ação'}</span>
                                          {int.status === 'PENDING' && <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase">Pendente</span>}
                                          {int.status === 'DELETED' && <span className="bg-rose-100 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase border border-rose-200 shadow-sm">Removido</span>}
                                      </div>
                                  </td>
                                  <td className={`px-4 py-3 text-wrap min-w-[250px] ${int.status === 'DELETED' ? 'text-rose-500/80 italic' : 'text-slate-600 dark:text-slate-400'}`}>
                                      {int.content}
                                  </td>
                                  <td className={`px-4 py-3 font-mono text-xs ${int.status === 'DELETED' ? 'text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                      {int.due_date ? new Date(int.due_date).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                      <div className="flex items-center justify-end gap-2">
                                          {int.status === 'PENDING' && (
                                              <button onClick={() => handleCompleteTask(int.id)} title="Marcar como Concluída" className="text-amber-600 hover:text-amber-700 p-1.5 rounded-md hover:bg-amber-100 transition-colors">
                                                  <Check className="w-4 h-4" />
                                              </button>
                                          )}
                                          {int.status !== 'DELETED' && (
                                              <button onClick={() => handleEditInteraction(int)} title="Editar" className="text-slate-400 hover:text-indigo-600 p-1.5 rounded-md hover:bg-indigo-50 transition-colors">
                                                  <Edit2 className="w-4 h-4" />
                                              </button>
                                          )}
                                          {int.status !== 'DELETED' && (
                                              <button onClick={() => handleDeleteInteraction(int.id)} title="Remover Histórico" className="text-slate-400 hover:text-rose-600 p-1.5 rounded-md hover:bg-rose-50 transition-colors">
                                                  <Trash2 className="w-4 h-4" />
                                              </button>
                                          )}
                                      </div>
                                  </td>
                              </tr>
                          ))
                      )}
                  </tbody>
              </table>
              {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
                      <span className="text-xs text-slate-500">Página {currentPage} de {totalPages}</span>
                      <div className="flex items-center gap-1">
                          <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-50"><ChevronLeft className="w-4 h-4 text-slate-600" /></button>
                          <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-50"><ChevronRight className="w-4 h-4 text-slate-600" /></button>
                      </div>
                  </div>
              )}
          </div>
      </div>

    </div>
  );
}
