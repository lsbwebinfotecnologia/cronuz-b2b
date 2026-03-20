'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Loader2, Globe, Save } from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';
import { useCompany } from '../layout';

export default function CompanySettingsPage() {
  const params = useParams();
  const companyId = params.id as string;
  const { company } = useCompany();
  
  const [loading, setLoading] = useState(true);
  const [savingGeral, setSavingGeral] = useState(false);

  const [settings, setSettings] = useState({
    cover_image_base_url: ''
  });

  useEffect(() => {
    async function fetchSettings() {
      try {
        const token = getToken();
        if (!token) return;
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/settings`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setSettings({
            cover_image_base_url: data.cover_image_base_url || ''
          });
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    
    if (company) {
      fetchSettings();
    }
  }, [company, companyId]);

  async function handleSaveSettings() {
    setSavingGeral(true);
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(settings)
      });
      if (!res.ok) throw new Error('Falha ao salvar');
      toast.success('Configurações gerais atualizadas!');
    } catch (error) {
      toast.error('Erro ao salvar as configurações.');
    } finally {
      setSavingGeral(false);
    }
  }

  if (loading || !company) {
    return (
       <div className="flex h-64 items-center justify-center">
         <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary-base)]" />
       </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full overflow-y-auto">
      <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md sticky top-0 z-10 flex items-center justify-between">
         <div>
           <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
             Configurações Gerais
           </h2>
           <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
             Configurações globais de exibição e integração de catálogo.
           </p>
         </div>
         <button
            onClick={handleSaveSettings}
            disabled={savingGeral}
            className="px-6 py-2.5 text-sm rounded-xl font-bold flex items-center gap-2 bg-[var(--color-primary-base)] text-white hover:bg-[var(--color-primary-hover)] shadow-lg shadow-[var(--color-primary-base)]/25 transition-all active:scale-[0.98]"
         >
            {savingGeral ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {savingGeral ? 'Salvando...' : 'Salvar Alterações'}
         </button>
      </div>

      <div className="p-6 space-y-8">
        <section className="space-y-4">
           <div className="rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden shadow-sm p-6 dark:border-slate-800/60 dark:bg-slate-900/20">
              <h3 className="text-sm font-bold text-blue-600 tracking-wide uppercase mb-1">CONFIGURAÇÕES GERAIS</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">Configurações globais de exibição e integração de catálogo.</p>
              
              <div className="space-y-3">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Servidor Local de Capas (Base URL)</label>
                <input
                  type="text"
                  value={settings.cover_image_base_url}
                  onChange={(e) => setSettings(prev => ({ ...prev, cover_image_base_url: e.target.value }))}
                  placeholder="https://capas.cronuz.com.br"
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 px-4 text-sm font-mono text-slate-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Deixe em branco para forçar o uso de imagens cadastradas individualmente em cada produto. A imagem procurada será {"<base_url>/<isbn>.jpg"}.
                </p>
              </div>
           </div>
        </section>
      </div>
    </motion.div>
  );
}
