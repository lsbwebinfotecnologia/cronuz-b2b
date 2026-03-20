'use client';

import { useState, useEffect } from 'react';
import { MessageSquare, Calendar, Mail, Phone, ExternalLink, CheckCircle, Search, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

type Lead = {
  id: string;
  name: string;
  email: string;
  whatsapp: string | null;
  need_type: string;
  description: string | null;
  status: string;
  created_at: string;
};

export default function LeadsDashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'new' | 'contacted'>('all');

  const fetchLeads = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('cronuz_b2b_token') || '';
      const url = new URL(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/leads/`);
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
      const token = localStorage.getItem('cronuz_b2b_token') || '';
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/leads/${leadId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'contacted' })
      });
      if (res.ok) {
         fetchLeads();
         // Fire custom event to update sidebar badge globally if needed
         window.dispatchEvent(new Event('lead_status_updated'));
      }
    } catch (e) {}
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
            Gerencie os contatos captados pela Landing Page.
          </p>
        </div>

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
             <p className="text-slate-500 font-medium">Nenhum lead encontrado nessa categoria.</p>
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
                             <p className="text-slate-600 dark:text-slate-400 text-sm mt-1 flex items-center gap-1 font-medium ring-1 ring-slate-200 bg-white dark:bg-slate-800 dark:ring-slate-700 px-3 py-1 rounded-md w-fit">
                                <FileText className="w-4 h-4 text-brand-orange" />
                                {lead.need_type}
                             </p>
                          </div>
                          
                          <div className="text-xs text-slate-400 flex items-center gap-1">
                             <Calendar className="w-3.5 h-3.5" />
                             {new Date(lead.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </div>
                       </div>

                       <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-slate-600 dark:text-slate-300">
                          <a href={`mailto:${lead.email}`} className="flex items-center gap-2 hover:text-brand-teal transition-colors">
                             <Mail className="w-4 h-4 text-slate-400" />
                             {lead.email}
                          </a>
                          {lead.whatsapp && (
                             <a href={`https://wa.me/55${lead.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-green-500 transition-colors">
                                <Phone className="w-4 h-4 text-slate-400" />
                                {lead.whatsapp}
                                <ExternalLink className="w-3 h-3 opacity-50" />
                             </a>
                          )}
                       </div>

                       {lead.description && (
                          <div className="bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-800 p-4 rounded-xl text-sm text-slate-600 dark:text-slate-400 relative">
                             <div className="absolute top-0 left-4 -mt-2 bg-white dark:bg-slate-950 px-2 text-[10px] uppercase font-bold text-slate-400">Briefing</div>
                             <p className="whitespace-pre-wrap mt-1">{lead.description}</p>
                          </div>
                       )}
                    </div>

                    <div className="flex items-center justify-end md:w-48 shrink-0">
                       {lead.status === 'new' ? (
                          <button 
                            onClick={() => markAsRead(lead.id)}
                            className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-[var(--color-primary-base)] text-white font-bold text-sm rounded-xl hover:bg-[var(--color-primary-dark)] shadow-md shadow-brand-teal/20 transition-all hover:-translate-y-0.5"
                          >
                            <CheckCircle className="w-4 h-4" />
                            Baixar Contato
                          </button>
                       ) : (
                          <div className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold text-sm rounded-xl border border-slate-200 dark:border-slate-700">
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            Já Contatado
                          </div>
                       )}
                    </div>
                 </div>
              ))}
           </div>
        )}
      </div>
    </div>
  );
}
