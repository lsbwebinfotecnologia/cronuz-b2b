'use client';

import { useState, useEffect } from 'react';
import { Plus, Calendar, Percent, CheckCircle2, Clock, XCircle, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { getToken } from '@/lib/auth';

export default function PromotionsListPage() {
  const [promotions, setPromotions] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPromotions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/promotions/`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (res.ok) {
        setPromotions(await res.json());
      }
    } catch (e) {
      toast.error('Erro ao buscar promoções.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPromotions();
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('Deseja realmente remover esta promoção? Isso afetará os preços em tempo real.')) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/promotions/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      if (res.ok) {
        toast.success("Promoção removida com sucesso!");
        fetchPromotions();
      } else {
        toast.error("Erro ao remover promoção.");
      }
    } catch (e) {
      toast.error("Erro de conexão.");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20"><CheckCircle2 className="w-3.5 h-3.5"/> Ativa</span>;
      case 'SCHEDULED':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20"><Clock className="w-3.5 h-3.5"/> Agendada</span>;
      case 'COMPLETED':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"><CheckCircle2 className="w-3.5 h-3.5"/> Concluída</span>;
      default:
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20"><XCircle className="w-3.5 h-3.5"/> Inativa</span>;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Percent className="h-6 w-6 text-[var(--color-primary-base)]" />
            Motor de Promoções
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Gerencie regras globais de desconto com agendamento.</p>
        </div>
        
        <Link 
          href="/promotions/new"
          className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-medium py-2.5 px-5 rounded-xl flex items-center gap-2 transition-all shadow-lg hover:-translate-y-0.5"
        >
          <Plus className="h-4 w-4" />
          Nova Regra
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
           <div className="col-span-full py-20 text-center text-slate-500 dark:text-slate-400">Carregando motores de promoção...</div>
        ) : promotions.length === 0 ? (
           <div className="col-span-full py-20 text-center text-slate-500 bg-white rounded-2xl border border-slate-200 border-dashed dark:bg-slate-900/50 dark:border-slate-800 dark:text-slate-400">
             Não há promoções habilitadas. Crie sua primeira regra.
           </div>
        ) : (
          promotions.map((p: any) => (
             <div key={p.id} className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 hover:shadow-md transition-shadow dark:bg-slate-900 dark:border-slate-800 flex flex-col h-full relative group">
                <button 
                  onClick={() => handleDelete(p.id)}
                  className="absolute top-6 right-6 text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity bg-white dark:bg-slate-900 p-1 rounded-md shadow-sm border border-slate-200 dark:border-slate-800"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <div className="mb-4">
                  {getStatusBadge(p.status)}
                </div>
                
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2 pr-8">{p.name}</h3>
                {p.description && <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 flex-1">{p.description}</p>}
                
                <div className="mt-auto space-y-4">
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 dark:bg-slate-950 dark:border-slate-800/50">
                    <div className="bg-[var(--color-primary-base)] text-white font-bold px-3 py-1.5 rounded-lg">
                      {p.discount_type === 'PERCENTAGE' ? `${p.discount_value}%` : `R$${p.discount_value}`} OFF
                    </div>
                    <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      para {p.targets.length} alvo(s)
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> De: {new Date(p.start_date).toLocaleDateString('pt-BR')}</div>
                    <div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Até: {new Date(p.end_date).toLocaleDateString('pt-BR')}</div>
                  </div>
                </div>
             </div>
          ))
        )}
      </div>
    </div>
  );
}
