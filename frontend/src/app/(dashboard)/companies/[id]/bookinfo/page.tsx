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

  const currentUser = getUser();
  const [migrationLoading, setMigrationLoading] = useState(false);
  const [migrationStats, setMigrationStats] = useState<any>(null);
  const [migrationData, setMigrationData] = useState({
    host: '',
    port: '3306',
    user: '',
    password: '',
    database: '',
    legacy_company_id: ''
  });

  const handleMigrationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMigrationData({ ...migrationData, [e.target.name]: e.target.value });
  };

  const handleMigration = async (mode: 'customers' | 'orders') => {
    if (!migrationData.host || !migrationData.user || !migrationData.database || !migrationData.legacy_company_id || !company) {
      toast.error('Preencha os campos de host, user, banco e id da empresa legada.');
      return;
    }

    setMigrationLoading(true);
    setMigrationStats(null);
    const token = getToken();

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/settings/migration/mysql`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          db_host: migrationData.host,
          db_port: parseInt(migrationData.port) || 3306,
          db_user: migrationData.user,
          db_pass: migrationData.password,
          db_name: migrationData.database,
          legacy_company_id: parseInt(migrationData.legacy_company_id),
          target_company_id: Number(company.id),
          mode: mode
        })
      });

      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'Sincronização iniciada com sucesso!');
        setMigrationStats(data.stats);
      } else {
        toast.error(data.detail || 'Erro na migração log');
      }
    } catch (err) {
      toast.error('Erro de conexão com o painel.');
    } finally {
      setMigrationLoading(false);
    }
  };


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

        {currentUser?.type === 'MASTER' && (
          <div className="mt-12 pt-10 border-t border-slate-200 dark:border-slate-800">
            <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900 dark:text-white mb-2">
              <Database className="h-6 w-6 text-indigo-500" />
              Migração de Histórico Legado (MySQL)
            </h2>
            <p className="text-sm text-slate-500 mb-6">
              Esta ferramenta copia a numeração de Pedidos ERP (Horus) e de Clientes (ID_GUID) que já foram sincronizados em bancos antigos. Recomendável rodar apenas 1 vez.
            </p>
            
            <div className="bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
              <div className="p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-white">Conexão do Banco de Dados Origem</h3>
                    <p className="text-xs text-slate-500">Credenciais diretas para a máquina legada da Livraria.</p>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Servidor MySQL (IP ou Domínio)</label>
                    <input
                      type="text"
                      name="host"
                      value={migrationData.host}
                      onChange={handleMigrationChange}
                      placeholder="Ex: 53.112.5.12"
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:text-white transition-all shadow-sm"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Porta</label>
                    <input
                      type="number"
                      name="port"
                      value={migrationData.port}
                      onChange={handleMigrationChange}
                      placeholder="3306"
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:text-white transition-all shadow-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Usuário do Banco</label>
                    <input
                      type="text"
                      name="user"
                      value={migrationData.user}
                      onChange={handleMigrationChange}
                      placeholder="Ex: root"
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:text-white transition-all shadow-sm"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Senha</label>
                    <input
                      type="password"
                      name="password"
                      value={migrationData.password}
                      onChange={handleMigrationChange}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:text-white transition-all shadow-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Nome do Database</label>
                    <input
                      type="text"
                      name="database"
                      value={migrationData.database}
                      onChange={handleMigrationChange}
                      placeholder="Ex: cronuz_b2b"
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:text-white transition-all shadow-sm"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">ID da Empresa (No Banco MySQL)</label>
                    <input
                      type="number"
                      name="legacy_company_id"
                      value={migrationData.legacy_company_id}
                      onChange={handleMigrationChange}
                      placeholder="Id da empresa dessa livraria no DB antigo"
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:text-white transition-all shadow-sm"
                      required
                    />
                  </div>
                </div>
                
                <div className="pt-4 flex justify-end gap-4">
                  <button
                    type="button"
                    onClick={() => handleMigration('customers')}
                    disabled={migrationLoading}
                    className="inline-flex items-center gap-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium py-3 px-6 rounded-xl transition-all disabled:opacity-50 border border-slate-200 dark:border-slate-700"
                  >
                    {migrationLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                    Sincronizar Clientes
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMigration('orders')}
                    disabled={migrationLoading}
                    className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-6 rounded-xl transition-all disabled:opacity-50"
                  >
                    {migrationLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                    Sincronizar Pedidos
                  </button>
                </div>
              </div>
            </div>

            {migrationStats && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mt-6 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-2xl p-6"
              >
                <h3 className="text-lg font-bold text-emerald-800 dark:text-emerald-400 mb-4 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5" />
                  Relatório de Execução
                </h3>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm border border-emerald-100 dark:border-emerald-500/10">
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Clientes Atualizados</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">{migrationStats.customers_updated}</p>
                  </div>
                  <div className="bg-white dark:bg-slate-900 rounded-xl p-4 shadow-sm border border-emerald-100 dark:border-emerald-500/10">
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Pedidos Atualizados</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">{migrationStats.orders_updated}</p>
                  </div>
                </div>
                {migrationStats.errors && migrationStats.errors.length > 0 && (
                   <div className="mt-4 p-4 rounded-xl bg-orange-50 border border-orange-200 text-sm text-orange-800 break-words dark:bg-orange-500/10 dark:border-orange-500/20 dark:text-orange-400 bg-opacity-80">
                     <p className="font-semibold mb-2">Avisos e Exceções:</p>
                     <ul className="list-disc pl-5 space-y-1">
                       {migrationStats.errors.map((e: string, idx: number) => (
                         <li key={idx}>{e}</li>
                       ))}
                     </ul>
                   </div>
                )}
              </motion.div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
