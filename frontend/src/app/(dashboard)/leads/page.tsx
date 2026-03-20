'use client';

import { useState, useEffect } from 'react';
import { MessageSquare, Calendar, Mail, Phone, ExternalLink, CheckCircle, Search, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/auth';

type Lead = {
  id: string;
  name: string;
  email: string;
  whatsapp: string | null;
  company_name: string | null;
  role: string | null;
  source: string | null;
  need_type: string;
  description: string | null;
  status: string;
  created_at: string;
  company_id: number | null;
};

export default function LeadsDashboard() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [convertingLead, setConvertingLead] = useState<Lead | null>(null);
  const [linkingLead, setLinkingLead] = useState<Lead | null>(null);
  const [companiesList, setCompaniesList] = useState<any[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [filter, setFilter] = useState<'all' | 'new' | 'contacted'>('all');
  const [customSources, setCustomSources] = useState<string[]>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    whatsapp: '',
    company_name: '',
    role: '',
    source: 'Manual',
    need_type: 'Geral',
    description: '',
    status: 'new'
  });

  const fetchLeads = async () => {
    try {
      setLoading(true);
      const token = getToken() || '';
      const url = new URL(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/leads/`);
      if (filter !== 'all') {
        url.searchParams.append('status', filter);
      }
      
      const res = await fetch(url.toString(), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setLeads(data);
      }
    } catch (e) {
      console.error("Failed to fetch leads");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, [filter]);

  const markAsRead = async (leadId: string) => {
    try {
      const token = getToken() || '';
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/leads/${leadId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'contacted' })
      });
      if (res.ok) {
         fetchLeads();
         window.dispatchEvent(new Event('lead_status_updated'));
      }
    } catch (e) {}
  };

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const token = getToken() || '';
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/leads/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setIsModalOpen(false);
        setFormData({
          name: '', email: '', whatsapp: '', company_name: '', role: '', source: 'Manual', need_type: 'Geral', description: '', status: 'new'
        });
        fetchLeads();
        window.dispatchEvent(new Event('lead_status_updated'));
      }
    } catch (error) {
       console.error("Failed to create lead", error);
    } finally {
       setSubmitting(false);
    }
  };

  const handleOpenLinkModal = async (lead: Lead) => {
    setLinkingLead(lead);
    setSelectedCompanyId('');
    try {
      const token = getToken() || '';
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setCompaniesList(await res.json());
      } else {
        import('sonner').then(({ toast }) => toast.error(`Erro ao carregar empresas: ${res.status}`));
      }
    } catch (e: any) {
      import('sonner').then(({ toast }) => toast.error(`Falha de rede: ${e.message}`));
    }
  };

  const submitLinkCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkingLead || !selectedCompanyId) return;
    setSubmitting(true);
    try {
      const token = getToken() || '';
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/leads/${linkingLead.id}/company`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ company_id: parseInt(selectedCompanyId) })
      });
      if (res.ok) {
        setLinkingLead(null);
        fetchLeads();
      }
    } catch (e) {
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-brand-teal" />
            Leads Comerciais
          </h1>
          <p className="text-slate-500 mt-1 dark:text-slate-400">
            Gerencie contatos captados pela Landing Page ou adicione manualmente.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button 
              onClick={() => setFilter('all')}
              className={cn("px-4 py-1.5 text-sm font-medium rounded-lg transition-all", filter === 'all' ? "bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white" : "text-slate-500 hover:text-slate-700")}
            >
              Todos
            </button>
            <button 
              onClick={() => setFilter('new')}
              className={cn("px-4 py-1.5 text-sm font-medium rounded-lg transition-all", filter === 'new' ? "bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white" : "text-slate-500 hover:text-slate-700")}
            >
              Novos
            </button>
            <button 
              onClick={() => setFilter('contacted')}
              className={cn("px-4 py-1.5 text-sm font-medium rounded-lg transition-all", filter === 'contacted' ? "bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white" : "text-slate-500 hover:text-slate-700")}
            >
              Contatados
            </button>
          </div>
          <button 
             onClick={() => setIsModalOpen(true)}
             className="px-4 py-2 bg-[var(--color-primary-base)] text-white font-medium rounded-xl hover:opacity-90 shadow-md transition-colors flex items-center gap-2 justify-center"
          >
             Novo Lead
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden min-h-[400px]">
        {loading ? (
           <div className="flex items-center justify-center h-64">
             <div className="w-8 h-8 rounded-full border-4 border-brand-teal border-t-transparent animate-spin"></div>
           </div>
        ) : leads.length === 0 ? (
           <div className="flex flex-col items-center justify-center p-16 text-center">
             <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                <Search className="h-8 w-8 text-slate-400" />
             </div>
             <p className="text-slate-500 font-medium">Nenhum lead encontrado.</p>
           </div>
        ) : (
           <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {leads.map(lead => (
                 <div key={lead.id} className={cn(
                   "p-6 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 flex flex-col md:flex-row gap-6",
                   lead.status === 'new' ? "bg-brand-teal/5 dark:bg-brand-teal/10" : ""
                 )}>
                    <div className="flex-1 space-y-4">
                       <div className="flex items-start justify-between">
                          <div>
                             <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                               {lead.name}
                               {lead.status === 'new' && (
                                 <span className="bg-rose-500 text-white text-[10px] uppercase font-black px-2 py-0.5 rounded-full inline-flex items-center">
                                   NOVO
                                 </span>
                               )}
                             </h3>
                             <div className="flex flex-wrap items-center gap-2 mt-2 font-medium">
                               <p className="text-slate-600 dark:text-slate-400 text-xs flex items-center gap-1 ring-1 ring-slate-200 bg-white dark:bg-slate-800 dark:ring-slate-700 px-2 py-1 rounded-md w-fit">
                                  <FileText className="w-3.5 h-3.5 text-brand-orange" />
                                  {lead.need_type}
                               </p>
                               {lead.source && (
                                 <p className="text-slate-600 dark:text-slate-400 text-xs ring-1 ring-slate-200 bg-white dark:bg-slate-800 dark:ring-slate-700 px-2 py-1 rounded-md w-fit">
                                   Fonte: <span className="text-slate-800 dark:text-slate-200">{lead.source}</span>
                                 </p>
                               )}
                               {lead.company_name && (
                                 <p className="text-slate-600 dark:text-slate-400 text-xs ring-1 ring-slate-200 bg-white dark:bg-slate-800 dark:ring-slate-700 px-2 py-1 rounded-md w-fit">
                                   Empresa: <span className="text-slate-800 dark:text-slate-200">{lead.company_name}</span>
                                 </p>
                               )}
                               {lead.role && (
                                 <p className="text-slate-600 dark:text-slate-400 text-xs ring-1 ring-slate-200 bg-white dark:bg-slate-800 dark:ring-slate-700 px-2 py-1 rounded-md w-fit">
                                   Cargo: <span className="text-slate-800 dark:text-slate-200">{lead.role}</span>
                                 </p>
                               )}
                             </div>
                          </div>
                          
                          <div className="text-xs text-slate-400 flex items-center gap-1 shrink-0 ml-4">
                             <Calendar className="w-3.5 h-3.5" />
                             {new Date(lead.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </div>
                       </div>

                       <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-slate-600 dark:text-slate-300">
                          <a href={`mailto:${lead.email}`} className="flex items-center gap-2 hover:text-brand-teal transition-colors break-all">
                             <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                             {lead.email}
                          </a>
                          {lead.whatsapp && (
                             <a href={`https://wa.me/55${lead.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-green-500 transition-colors">
                                <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                                {lead.whatsapp}
                                <ExternalLink className="w-3 h-3 opacity-50" />
                             </a>
                          )}
                       </div>

                       {lead.description && (
                          <div className="bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-800 p-4 rounded-xl text-sm text-slate-600 dark:text-slate-400 relative">
                             <div className="absolute top-0 left-4 -mt-2 bg-white dark:bg-slate-950 px-2 text-[10px] uppercase font-bold text-slate-400">Briefing / Observações</div>
                             <p className="whitespace-pre-wrap mt-1">{lead.description}</p>
                          </div>
                       )}
                    </div>

                    <div className="flex items-center justify-end md:w-48 shrink-0">
                       {lead.company_id ? (
                          <div className="flex flex-col gap-2 w-full">
                            <div className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold text-sm rounded-xl border border-slate-200 dark:border-slate-700">
                              <CheckCircle className="w-4 h-4 text-emerald-500" />
                              Empresa Vinculada
                            </div>
                            <button
                              onClick={() => router.push(`/companies/${lead.company_id}/profile`)}
                              className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-[var(--color-primary-base)] text-white font-bold text-sm rounded-xl shadow-md transition-all hover:opacity-90"
                            >
                              Ver Empresa
                            </button>
                          </div>
                       ) : lead.status === 'new' ? (
                          <button 
                            onClick={() => markAsRead(lead.id)}
                            className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-[var(--color-primary-base)] text-white font-bold text-sm rounded-xl hover:opacity-90 shadow-md shadow-brand-teal/20 transition-all hover:-translate-y-0.5"
                          >
                            <CheckCircle className="w-4 h-4" />
                            Confirmar Contato
                          </button>
                       ) : (
                          <div className="flex flex-col gap-2 w-full">
                            <div className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold text-sm rounded-xl border border-slate-200 dark:border-slate-700">
                              <CheckCircle className="w-4 h-4 text-green-500" />
                              Já Contatado
                            </div>
                            <button
                              onClick={() => setConvertingLead(lead)}
                              className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-transparent text-[var(--color-primary-base)] hover:bg-[var(--color-primary-base)] hover:text-white font-bold text-sm rounded-xl transition-all border-2 border-[var(--color-primary-base)]"
                            >
                              Transformar em Empresa
                            </button>
                            <button
                              onClick={() => handleOpenLinkModal(lead)}
                              className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-sm rounded-xl transition-all border border-slate-200 dark:border-slate-700"
                            >
                              <CheckCircle className="w-4 h-4 opacity-70" />
                              Vincular Empresa
                            </button>
                          </div>
                       )}
                    </div>
                 </div>
              ))}
           </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[999] overflow-y-auto">
           <div className="flex min-h-screen items-start justify-center p-4 pt-24 pb-10">
              <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
                 <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                 <h2 className="text-lg font-bold text-slate-900 dark:text-white">Adicionar Novo Lead</h2>
                 <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
              </div>
              <form onSubmit={handleCreateLead} className="p-6 space-y-4">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                       <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nome do Contato *</label>
                       <input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-4 py-2.5 outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent dark:text-white transition-all shadow-sm" />
                    </div>
                    <div>
                       <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">E-mail *</label>
                       <input type="email" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-4 py-2.5 outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent dark:text-white transition-all shadow-sm" />
                    </div>

                    <div>
                       <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Celular / WhatsApp</label>
                       <input type="text" value={formData.whatsapp} onChange={e => setFormData({...formData, whatsapp: e.target.value})} placeholder="(11) 99999-9999" className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-4 py-2.5 outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent dark:text-white transition-all shadow-sm" />
                    </div>
                    <div>
                       <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Status</label>
                       <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-4 py-2.5 outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent dark:text-white transition-all shadow-sm">
                          <option value="new">Novo (Pendente)</option>
                          <option value="contacted">Já Contatado / Prospectado</option>
                       </select>
                    </div>

                    <div className="md:col-span-2 border-t border-slate-100 dark:border-slate-800 pt-4 mt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                       <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nome da Empresa</label>
                          <input type="text" value={formData.company_name} onChange={e => setFormData({...formData, company_name: e.target.value})} className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-4 py-2.5 outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent dark:text-white transition-all shadow-sm" />
                       </div>
                       <div>
                          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Cargo / Posição</label>
                          <input type="text" value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} placeholder="Gerente, Diretor..." className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-4 py-2.5 outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent dark:text-white transition-all shadow-sm" />
                       </div>
                    </div>

                    <div className="md:col-span-2">
                       <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Fonte da Captação</label>
                       <div className="flex gap-2">
                          <select 
                             value={formData.source} 
                             onChange={e => setFormData({...formData, source: e.target.value})} 
                             className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-4 py-2.5 outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent dark:text-white transition-all shadow-sm"
                          >
                             {Array.from(new Set([
                                "Manual", "Indicação", "Prospecção Ativa", "Evento / Feira", 
                                ...leads.map(l => l.source).filter(Boolean), 
                                ...customSources
                             ])).map((s) => (
                                <option key={s as string} value={s as string}>{s as string}</option>
                             ))}
                          </select>
                          <button 
                               type="button"
                               onClick={() => {
                                  const newSrc = window.prompt("Digite o nome da nova fonte:");
                                  if (newSrc && newSrc.trim()) {
                                     setCustomSources(prev => [...prev, newSrc.trim()]);
                                     setFormData(prev => ({...prev, source: newSrc.trim()}));
                                  }
                               }}
                               className="px-4 bg-slate-100 hover:bg-slate-200 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 font-bold text-lg rounded-xl transition-colors shadow-sm flex items-center justify-center"
                               title="Criar nova Fonte de Captação"
                          >
                               +
                          </button>
                       </div>
                    </div>
                 
                    <div className="md:col-span-2">
                       <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Observações / Histórico Inicial</label>
                       <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} rows={3} className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-4 py-2.5 outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent dark:text-white transition-all resize-none shadow-sm"></textarea>
                    </div>
                 </div>

                 <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
                    <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-slate-500 font-medium hover:text-slate-700 dark:hover:text-slate-300 transition-colors">Cancelar</button>
                    <button type="submit" disabled={submitting} className="px-6 py-2.5 bg-[var(--color-primary-base)] text-white font-medium rounded-xl hover:opacity-90 shadow-lg transition-all disabled:opacity-50">
                       {submitting ? 'Salvando...' : 'Criar Lead'}
                    </button>
                 </div>
              </form>
           </div>
          </div>
        </div>
      )}

      {convertingLead && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[999] overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md p-6 border border-slate-200 dark:border-slate-800">
               <h3 className="text-xl font-bold mb-2 text-slate-900 dark:text-white">Transformar em Empresa</h3>
               <p className="text-slate-600 dark:text-slate-400 text-sm mb-6">
                 Por favor, informe o CNPJ ou CPF do lead <strong>{convertingLead.company_name || convertingLead.name}</strong> para prosseguir com o cadastro da nova Conta Master / Empresa.
               </p>
               <div>
                 <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Documento (CNPJ/CPF)</label>
                 <input 
                   type="text" 
                   id="convert-document-input" 
                   placeholder="Somente números" 
                   className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-4 py-3 outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] text-slate-900 dark:text-white"
                   autoFocus
                    onKeyDown={(e) => {
                       if (e.key === 'Enter') {
                          const doc = (document.getElementById('convert-document-input') as HTMLInputElement).value;
                          router.push(`/companies/new?name=${encodeURIComponent(convertingLead.company_name || convertingLead.name)}&email=${encodeURIComponent(convertingLead.email || '')}&document=${encodeURIComponent(doc)}&lead_id=${convertingLead.id}`);
                       }
                    }}
                 />
               </div>
               <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <button onClick={() => setConvertingLead(null)} className="px-5 py-2.5 text-slate-500 font-medium hover:text-slate-700 dark:hover:text-slate-300">Cancelar</button>
                  <button 
                    onClick={() => {
                       const doc = (document.getElementById('convert-document-input') as HTMLInputElement).value;
                       router.push(`/companies/new?name=${encodeURIComponent(convertingLead.company_name || convertingLead.name)}&email=${encodeURIComponent(convertingLead.email || '')}&document=${encodeURIComponent(doc)}&lead_id=${convertingLead.id}`);
                    }}
                    className="px-6 py-2.5 bg-[var(--color-primary-base)] hover:opacity-90 text-white font-medium rounded-xl shadow-md transition-all"
                  >
                     Continuar
                  </button>
               </div>
            </div>
          </div>
        </div>
      )}

      {linkingLead && (
         <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[999] overflow-y-auto">
           <div className="flex min-h-screen items-center justify-center p-4">
             <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-800">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                   <h2 className="text-lg font-bold text-slate-900 dark:text-white">Vincular Cliente Existent</h2>
                   <button onClick={() => setLinkingLead(null)} className="text-slate-400 hover:text-slate-600">✕</button>
                </div>
                <form onSubmit={submitLinkCompany} className="p-6">
                   <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                      Selecione uma empresa já existente para vincular este lead. Ao fazer isso, o lead ficará como "Empresa Vinculada".
                   </p>
                   <div className="space-y-4">
                      <div>
                         <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Empresa Cliente *</label>
                         <select
                           required
                           value={selectedCompanyId}
                           onChange={e => setSelectedCompanyId(e.target.value)}
                           className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-4 py-3 outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] text-slate-900 dark:text-white"
                         >
                           <option value="">Selecione uma empresa...</option>
                           {companiesList.map(comp => (
                              <option key={comp.id} value={comp.id}>{comp.name} ({comp.document})</option>
                           ))}
                         </select>
                      </div>
                   </div>
                   <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                      <button type="button" onClick={() => setLinkingLead(null)} className="px-6 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium rounded-xl transition-colors">Cancelar</button>
                      <button
                        type="submit"
                        disabled={!selectedCompanyId || submitting}
                        className="px-6 py-2.5 bg-[var(--color-primary-base)] hover:opacity-90 text-white font-medium rounded-xl shadow-md transition-all disabled:opacity-50"
                      >
                         {submitting ? 'Vinculando...' : 'Confirmar Vínculo'}
                      </button>
                   </div>
                </form>
             </div>
           </div>
         </div>
      )}
    </div>
  );
}
