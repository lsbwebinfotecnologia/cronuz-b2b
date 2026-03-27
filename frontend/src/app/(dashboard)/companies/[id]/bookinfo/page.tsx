'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Database, ShieldCheck, Play, Loader2, Save, BookOpen } from 'lucide-react';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';
import { useCompany } from '../layout';

export default function CompanyBookinfoPage() {
  const { company } = useCompany();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const [integratorId, setIntegratorId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    active: false,
    environment: 'HOMOL',
    token: ''
  });




  useEffect(() => {
    async function fetchIntegration() {
      if (!company) return;
      try {
        const authToken = getToken();
        if (!authToken) return;
        
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/integrators/${company.id}`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (res.ok) {
          const data = await res.json();
          const bookinfo = data.find((i: any) => i.platform === 'BOOKINFO');
          
          if (bookinfo) {
            setIntegratorId(bookinfo.id);
            let creds = {};
            if (typeof bookinfo.credentials === 'string') {
                try {
                    creds = JSON.parse(bookinfo.credentials);
                } catch(e){}
            } else if (bookinfo.credentials) {
                creds = bookinfo.credentials;
            }
            
            setFormData({
              active: bookinfo.active,
              environment: (creds as any).Ambiente || 'HOMOL',
              token: (creds as any).Token || ''
            });
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    
    fetchIntegration();
  }, [company]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
        const checked = (e.target as HTMLInputElement).checked;
        setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
        setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!company) return;
    setSaving(true);
    
    const payload = {
        company_id: Number(company.id),
        platform: 'BOOKINFO',
        active: formData.active,
        credentials: JSON.stringify({
            Ambiente: formData.environment,
            Token: formData.token
        })
    };
    
    try {
      const authToken = getToken();
      
      const method = integratorId ? 'PUT' : 'POST';
      const endpoint = integratorId ? `/integrators/${integratorId}` : `/integrators/`;
      
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}${endpoint}`, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) throw new Error('Falha ao salvar configurações da Bookinfo');
      
      const savedData = await res.json();
      if (!integratorId && savedData.id) {
          setIntegratorId(savedData.id);
      }
      
      toast.success('Integração armazenada com sucesso!');
    } catch (error) {
      toast.error('Erro ao salvar ou atualizar integração.');
    } finally {
      setSaving(false);
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
      <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md sticky top-0 z-10">
         <h2 className="text-xl font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
           <BookOpen className="w-6 h-6" /> Integração B2B Bookinfo
         </h2>
         <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
           Ative as credenciais exclusivas fornecidas pela Bookinfo para aprovar avaliações e receber pedidos via Hub.
         </p>
      </div>

      <div className="p-6 space-y-8">
        <form onSubmit={handleSaveSettings} className="space-y-6">
           
           <div className="space-y-6 bg-slate-50/50 dark:bg-slate-900/20 p-6 rounded-2xl border border-slate-200 dark:border-slate-800/60 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800/60 pb-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Automação Bookinfo</h3>
                  <p className="text-xs text-slate-500">Determine se a loja deverá baixar os novos pedidos da Bookinfo.</p>
                </div>
                <label className="relative flex items-center cursor-pointer shrink-0">
                  <span className="mr-3 text-sm font-bold text-emerald-600 dark:text-emerald-400">Ativa</span>
                  <div className="relative">
                    <input 
                      type="checkbox" 
                      name="active"
                      className="sr-only peer" 
                      checked={formData.active} 
                      onChange={handleInputChange} 
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 dark:bg-slate-700 dark:border-slate-600"></div>
                  </div>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="space-y-1.5">
                   <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Ambiente API</label>
                   <select
                     name="environment"
                     value={formData.environment}
                     onChange={handleInputChange}
                     className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-900 font-medium focus:ring-2 focus:ring-emerald-500 focus:border-transparent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                   >
                     <option value="HOMOL">Homologação (Testes)</option>
                     <option value="PROD">Produção Real</option>
                   </select>
                 </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Token Bearer</label>
                <textarea
                  name="token"
                  rows={4}
                  value={formData.token}
                  onChange={(e: any) => handleInputChange(e)}
                  placeholder="Cole aqui o Token da Parceira..."
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 px-4 text-sm font-mono text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:border-transparent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 resize-none break-all"
                />
              </div>
           </div>

           <div className="flex justify-end pt-4 mb-8">
             <button
               type="submit"
               disabled={saving}
               className="px-8 py-3 text-[15px] rounded-xl font-bold flex items-center gap-2 transition-all bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-600/25 active:scale-[0.98] transform hover:scale-[1.02]"
             >
               {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
               {saving ? 'Gravando...' : 'Gravar Integração'}
             </button>
           </div>
        </form>


      </div>
    </motion.div>
  );
}
