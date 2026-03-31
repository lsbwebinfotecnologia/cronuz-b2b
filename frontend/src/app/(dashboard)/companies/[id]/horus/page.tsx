'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Save, Database, Key, Activity } from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';
import { useCompany } from '../layout';

export default function CompanyHorusPage() {
  const { company, refreshCompany } = useCompany();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [togglingModule, setTogglingModule] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);

  const [formData, setFormData] = useState({
    horus_company: '',
    horus_branch: '',
    horus_default_b2b_guid: '',
    horus_api_mode: 'B2B',
    horus_url: '',
    horus_port: '',
    horus_username: '',
    horus_password: '',
    horus_enabled: false,
    allow_backorder: false,
    horus_legacy_pagination: false,
    horus_stock_local: '',
    horus_hide_zero_balance: false,
    bookinfo_api_key: ''
  });

  useEffect(() => {
    async function fetchSettings() {
      if (!company) return;
      try {
        const token = getToken();
        if (!token) return;
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${company.id}/settings`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setFormData(prev => ({
             ...prev,
             horus_company: data.horus_company || '',
             horus_branch: data.horus_branch || '',
             horus_default_b2b_guid: data.horus_default_b2b_guid || '',
             horus_api_mode: data.horus_api_mode || 'B2B',
             horus_url: data.horus_url || '',
             horus_port: data.horus_port || '',
             horus_username: data.horus_username || '',
             horus_password: data.horus_password || '',
             horus_enabled: data.horus_enabled || false,
             horus_legacy_pagination: data.horus_legacy_pagination || false,
             horus_stock_local: data.horus_stock_local || '',
             horus_hide_zero_balance: data.horus_hide_zero_balance || false,
             allow_backorder: data.allow_backorder || false,
             bookinfo_api_key: data.bookinfo_api_key || ''
          }));
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    
    fetchSettings();
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

  async function handleToggleModule() {
    if (!company) return;
    setTogglingModule(true);
    
    const currentValue = company.module_horus_erp;
    const updates: Record<string, boolean> = {
      module_b2b_native: company.module_b2b_native,
      module_horus_erp: !currentValue,
      module_products: company.module_products,
      module_customers: company.module_customers,
      module_marketing: company.module_marketing,
      module_subscriptions: company.module_subscriptions,
      module_pdv: company.module_pdv,
      module_agents: company.module_agents
    };

    if (!currentValue === true) {
       updates.module_b2b_native = false;
       updates.module_products = false;
    } else {
       updates.module_b2b_native = true;
       updates.module_products = true;
    }

    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${company.id}/modules`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(updates)
      });
      if (!res.ok) throw new Error('Falha ao atualizar módulo');
      toast.success('Módulo atualizado com sucesso!');
      refreshCompany();
    } catch (error) {
      toast.error('Erro ao mudar status do módulo.');
    } finally {
      setTogglingModule(false);
    }
  }

  async function handleTestConnection() {
    if (!company) return;
    if (!formData.horus_url) {
       toast.error("Informe a URL do servidor antes de testar.");
       return;
    }
    
    setTestingConnection(true);
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${company.id}/settings/test-horus`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
           url: formData.horus_url,
           port: formData.horus_port,
           username: formData.horus_username,
           password: formData.horus_password,
        })
      });
      
      const data = await res.json();
      if (res.ok && data.success) {
         toast.success(data.message);
      } else {
         toast.error(data.detail || 'Falha ao conectar no Horus. Verifique URL e porta.');
      }
    } catch (error) {
       toast.error('Erro local ou de rede ao tentar testar a conexão.');
    } finally {
       setTestingConnection(false);
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!company) return;
    setSaving(true);
    
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${company.id}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(formData)
      });
      
      if (!res.ok) throw new Error('Falha ao salvar configurações do Horus');
      toast.success('Configurações armazenadas com sucesso!');
    } catch (error) {
      toast.error('Erro ao salvar as credenciais.');
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
         <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
           <Database className="w-6 h-6 text-emerald-600" /> Integração Horus ERP
         </h2>
         <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
           Preencha exatamente as credenciais de banco de dados e APIs do ERP para habilitar a rotina de pedidos.
         </p>
      </div>

      <div className="p-6 space-y-8">
        {/* Toggle Module Section */}
        <section>
           <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm dark:border-slate-800/60 dark:bg-slate-900/40">
              <div className="p-6 flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-bold text-emerald-600 tracking-wide">MÓDULO: INTEGRAÇÃO ERP HORUS</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Habilite para pesquisar produtos e gerar faturamento de pedidos B2B diretamente via XML API.</p>
                </div>
                <button 
                  onClick={handleToggleModule}
                  disabled={togglingModule}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] focus:ring-offset-2 ${company.module_horus_erp ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'} ${togglingModule ? 'opacity-50' : ''}`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${company.module_horus_erp ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
           </div>
        </section>

        {company.module_horus_erp && (
          <form onSubmit={handleSaveSettings} className="space-y-6">
             
             {/* API Configurations */}
             <div className="space-y-6 bg-slate-50/50 dark:bg-slate-900/20 p-6 rounded-2xl border border-slate-200 dark:border-slate-800/60 shadow-sm">
                
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800/60 pb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Ativar Processamento via ERP</h3>
                    <p className="text-xs text-slate-500">Determine se a loja deverá utilizar essas credenciais para faturamento no carrinho e consultas de preço estáticas.</p>
                  </div>
                  <label className="relative flex items-center cursor-pointer shrink-0">
                    <span className="mr-3 text-sm font-bold text-emerald-600 dark:text-emerald-400">Integração Ativa</span>
                    <div className="relative">
                      <input 
                        type="checkbox" 
                        name="horus_enabled"
                        className="sr-only peer" 
                        checked={formData.horus_enabled} 
                        onChange={handleInputChange} 
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 dark:bg-slate-700 dark:border-slate-600"></div>
                    </div>
                  </label>
                </div>

                <div className="space-y-3">
                   <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Modo de Operação (Catálogo e Preços)</label>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      
                      <label className={`relative flex cursor-pointer rounded-xl border p-4 focus:outline-none ${formData.horus_api_mode === 'B2B' ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/40'} hover:border-indigo-200`}>
                        <input
                          type="radio"
                          name="horus_api_mode"
                          value="B2B"
                          checked={formData.horus_api_mode === 'B2B'}
                          onChange={handleInputChange}
                          className="sr-only"
                        />
                        <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${formData.horus_api_mode === 'B2B' ? 'border-indigo-600' : 'border-slate-300'}`}>
                          {formData.horus_api_mode === 'B2B' && (
                            <span className="h-2 w-2 rounded-full bg-indigo-600" />
                          )}
                        </span>
                        <span className="ml-3 flex flex-col">
                          <span className={`block text-sm font-medium ${formData.horus_api_mode === 'B2B' ? 'text-slate-900 dark:text-white' : 'text-slate-900 dark:text-slate-200'}`}>Modo B2B Horus</span>
                          <span className="block text-xs text-slate-500 mt-1">Exige cliente logado e respeita limites.</span>
                        </span>
                      </label>

                      <label className={`relative flex cursor-pointer rounded-xl border p-4 focus:outline-none ${formData.horus_api_mode === 'STANDARD' ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/40'} hover:border-indigo-200`}>
                        <input
                          type="radio"
                          name="horus_api_mode"
                          value="STANDARD"
                          checked={formData.horus_api_mode === 'STANDARD'}
                          onChange={handleInputChange}
                          className="sr-only"
                        />
                        <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${formData.horus_api_mode === 'STANDARD' ? 'border-indigo-600' : 'border-slate-300'}`}>
                          {formData.horus_api_mode === 'STANDARD' && (
                            <span className="h-2 w-2 rounded-full bg-indigo-600" />
                          )}
                        </span>
                        <span className="ml-3 flex flex-col">
                          <span className={`block text-sm font-medium ${formData.horus_api_mode === 'STANDARD' ? 'text-slate-900 dark:text-white' : 'text-slate-900 dark:text-slate-200'}`}>API Padrão (Livros)</span>
                          <span className="block text-xs text-slate-500 mt-1">Pesquisa catálogo da filial s/ cliente.</span>
                        </span>
                      </label>
                      
                   </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">URL API</label>
                  <input
                    type="text"
                    name="horus_url"
                    value={formData.horus_url}
                    onChange={handleInputChange}
                    placeholder="http://189.79.25.41"
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-900 font-medium focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Porta</label>
                  <input
                    type="text"
                    name="horus_port"
                    value={formData.horus_port}
                    onChange={handleInputChange}
                    placeholder="8065"
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm text-slate-900 font-medium focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="space-y-1.5">
                     <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Usuário</label>
                     <input
                       type="text"
                       name="horus_username"
                       value={formData.horus_username}
                       onChange={handleInputChange}
                       placeholder="mythos"
                       className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm font-mono text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                     />
                   </div>
                   <div className="space-y-1.5">
                     <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Senha</label>
                     <input
                       type="password"
                       name="horus_password"
                       value={formData.horus_password}
                       onChange={handleInputChange}
                       placeholder="•••••••"
                       className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm font-mono text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                     />
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                   <div className="space-y-1.5">
                     <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Empresa</label>
                     <input
                       type="text"
                       name="horus_company"
                       value={formData.horus_company}
                       onChange={handleInputChange}
                       placeholder="1"
                       className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm font-mono text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                     />
                   </div>
                   <div className="space-y-1.5">
                     <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Filial</label>
                     <input
                       type="text"
                       name="horus_branch"
                       value={formData.horus_branch}
                       onChange={handleInputChange}
                       placeholder="1"
                       className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm font-mono text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                     />
                   </div>
                   <div className="space-y-1.5">
                     <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Local (Estoque)</label>
                     <input
                       type="text"
                       name="horus_stock_local"
                       value={formData.horus_stock_local}
                       onChange={handleInputChange}
                       placeholder="1"
                       className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm font-mono text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                     />
                   </div>
                </div>
             </div>

             <div className="bg-slate-50/50 dark:bg-slate-900/20 border border-slate-200 dark:border-slate-800/60 rounded-2xl p-6 shadow-sm flex items-center justify-between">
                <div className="space-y-1">
                   <h3 className="text-sm font-bold text-orange-600 tracking-widest uppercase">CONFIGURAÇÕES DE ESTOQUE B2B</h3>
                   <p className="text-xs text-slate-500">Regras de negócio para produtos sem saldo disponível no ERP.</p>
                </div>
                
                <div className="flex items-center gap-3">
                   <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Trabalhar com Encomenda</span>
                   <button 
                     type="button"
                     onClick={() => setFormData(prev => ({ ...prev, allow_backorder: !prev.allow_backorder }))}
                     className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${formData.allow_backorder ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'}`}
                   >
                     <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${formData.allow_backorder ? 'translate-x-5' : 'translate-x-0'}`} />
                   </button>
                </div>
              </div>
                <div className="bg-slate-50/50 dark:bg-slate-900/20 border border-slate-200 dark:border-slate-800/60 rounded-2xl p-6 shadow-sm flex items-center justify-between">
                <div className="space-y-1">
                   <h3 className="text-sm font-bold text-amber-600 tracking-widest uppercase">PAGINAÇÃO LEGADA (OFFSET/LIMIT)</h3>
                   <p className="text-xs text-slate-500">Marque caso o banco de dados do Oracle deste parceiro seja antigo e não suporte limites na consulta.</p>
                </div>
                
                <div className="flex items-center gap-3">
                   <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Modo Legado</span>
                   <button 
                     type="button"
                     onClick={() => setFormData(prev => ({ ...prev, horus_legacy_pagination: !prev.horus_legacy_pagination }))}
                     className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 ${formData.horus_legacy_pagination ? 'bg-amber-500' : 'bg-slate-200 dark:bg-slate-700'}`}
                   >
                     <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${formData.horus_legacy_pagination ? 'translate-x-5' : 'translate-x-0'}`} />
                   </button>
                </div>
              </div>

              <div className="bg-slate-50/50 dark:bg-slate-900/20 border border-slate-200 dark:border-slate-800/60 rounded-2xl p-6 shadow-sm flex items-center justify-between mt-6">
                <div className="space-y-1">
                   <h3 className="text-sm font-bold text-red-600 tracking-widest uppercase">OCULTAR ESTOQUE ZERADO NO ERP</h3>
                   <p className="text-xs text-slate-500">Marque se deseja que livros sem saldo parametrizado pela Filial/Local fiquem inteiramente invisíveis aos clientes.</p>
                </div>
                
                <div className="flex items-center gap-3">
                   <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Ocultar Sem Saldo</span>
                   <button 
                     type="button"
                     onClick={() => setFormData(prev => ({ ...prev, horus_hide_zero_balance: !prev.horus_hide_zero_balance }))}
                     className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 ${formData.horus_hide_zero_balance ? 'bg-red-500' : 'bg-slate-200 dark:bg-slate-700'}`}
                   >
                     <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${formData.horus_hide_zero_balance ? 'translate-x-5' : 'translate-x-0'}`} />
                   </button>
                </div>
              </div>



             <div className="flex justify-end gap-3 pt-4 mb-8">
               <button
                 type="button"
                 onClick={handleTestConnection}
                 disabled={testingConnection || saving}
                 className="px-6 py-3 text-[15px] rounded-xl font-bold flex items-center gap-2 transition-all bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 active:scale-[0.98] transform"
               >
                 {testingConnection ? <Loader2 className="h-5 w-5 animate-spin" /> : <Activity className="h-5 w-5" />}
                 {testingConnection ? 'Testando...' : 'Testar Conexão'}
               </button>

               <button
                 type="submit"
                 disabled={saving || testingConnection}
                 className="px-8 py-3 text-[15px] rounded-xl font-bold flex items-center gap-2 transition-all bg-[var(--color-primary-base)] text-white hover:bg-[var(--color-primary-hover)] shadow-lg shadow-[var(--color-primary-base)]/25 active:scale-[0.98] transform hover:scale-[1.02]"
               >
                 {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                 {saving ? 'Gravando...' : 'Gravar Integrações'}
               </button>
             </div>
          </form>
        )}
      </div>
    </motion.div>
  );
}
