'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Database, ShieldCheck, Play, Loader2, Save, BookOpen, FileUp, Download, CheckCircle2 } from 'lucide-react';
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
    token: '',
    bookinfo_sync_enabled: false,
    bookinfo_notify_processing_early: false,
    bookinfo_analysis_timing: 'BEFORE_CONFERENCE',
    bookinfo_min_stock_buffer: 0,
    bookinfo_block_consign_low_stock: false,
    bookinfo_consign_low_stock_threshold: 5,
    bookinfo_check_existing_consign_balance: false,
    bookinfo_max_consign_client_units: 10,
    bookinfo_allow_partial_fulfill: true,
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
          
          const settingsRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${company.id}/settings`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
          });
          const settings = settingsRes.ok ? await settingsRes.json() : {};

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
              token: (creds as any).Token || '',
              bookinfo_sync_enabled: settings.bookinfo_sync_enabled || false,
              bookinfo_notify_processing_early: settings.bookinfo_notify_processing_early || false,
              bookinfo_analysis_timing: settings.bookinfo_analysis_timing || 'BEFORE_CONFERENCE',
              bookinfo_min_stock_buffer: settings.bookinfo_min_stock_buffer || 0,
              bookinfo_block_consign_low_stock: settings.bookinfo_block_consign_low_stock || false,
              bookinfo_consign_low_stock_threshold: settings.bookinfo_consign_low_stock_threshold ?? 5,
              bookinfo_check_existing_consign_balance: settings.bookinfo_check_existing_consign_balance || false,
              bookinfo_max_consign_client_units: settings.bookinfo_max_consign_client_units ?? 10,
              bookinfo_allow_partial_fulfill: settings.bookinfo_allow_partial_fulfill !== false,
            });
          } else {
            setFormData(prev => ({
              ...prev,
              bookinfo_sync_enabled: settings.bookinfo_sync_enabled || false,
              bookinfo_notify_processing_early: settings.bookinfo_notify_processing_early || false,
              bookinfo_analysis_timing: settings.bookinfo_analysis_timing || 'BEFORE_CONFERENCE',
              bookinfo_min_stock_buffer: settings.bookinfo_min_stock_buffer || 0,
              bookinfo_block_consign_low_stock: settings.bookinfo_block_consign_low_stock || false,
              bookinfo_consign_low_stock_threshold: settings.bookinfo_consign_low_stock_threshold ?? 5,
              bookinfo_check_existing_consign_balance: settings.bookinfo_check_existing_consign_balance || false,
              bookinfo_max_consign_client_units: settings.bookinfo_max_consign_client_units ?? 10,
              bookinfo_allow_partial_fulfill: settings.bookinfo_allow_partial_fulfill !== false,
            }));
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

  const [importing, setImporting] = useState(false);
  
  const handleDownloadTemplate = () => {
    const csvContent = "Numero Pedido Bookinfo,Referencia,Numero Pedido Horus\n";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'modelo_importacao_bookinfo.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
       toast.error('O arquivo precisa ser um CSV.');
       return;
    }

    setImporting(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        // Split by newline and remove empty lines
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l);
        if (lines.length <= 1) {
            toast.error('O arquivo parece vazio ou inválido.');
            setImporting(false);
            return;
        }

        const separator = lines[0].includes(';') ? ';' : ',';
        const mappings: { bookinfo_id: string, reference: string, horus_id: string }[] = [];

        // line 0 is header
        for (let i = 1; i < lines.length; i++) {
           const cols = lines[i].split(separator).map(c => c.trim().replace(/^"|"$/g, ''));
           if (cols.length >= 3) {
               const b_id = cols[0];
               const ref = cols[1];
               const h_id = cols[2];
               
               if (b_id && h_id) {
                   mappings.push({ bookinfo_id: b_id, reference: ref, horus_id: h_id });
               }
           } else if (cols.length === 2 && separator === ',') {
               // Fallback just in case they ignored Reference col
               const b_id = cols[0];
               const h_id = cols[1];
               if (b_id && h_id) {
                   mappings.push({ bookinfo_id: b_id, reference: '', horus_id: h_id });
               }
           }
        }

        if (mappings.length === 0) {
            toast.error('Nenhum dado válido encontrado para importar.');
            setImporting(false);
            return;
        }

        const authToken = getToken();
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/bookinfo/import-horus-orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ mappings })
        });

        if (res.ok) {
            const result = await res.json();
            toast.success('Processamento Concluído!', {
                description: `Lidos do CSV: ${mappings.length}\nAtualizados com sucesso: ${result.updated}\nNão encontrados no B2B: ${result.not_found}`,
                duration: 10000
            });
        } else {
            const erroData = await res.json();
            toast.error(erroData.detail || 'Falha ao importar planilha.');
        }

      } catch (err) {
          toast.error('Falha ao processar o arquivo.');
      } finally {
          setImporting(false);
          e.target.value = '';
      }
    };
    reader.readAsText(file);
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
      
      const settingsRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${company.id}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({
           bookinfo_sync_enabled: formData.bookinfo_sync_enabled,
           bookinfo_notify_processing_early: formData.bookinfo_notify_processing_early,
           bookinfo_analysis_timing: formData.bookinfo_analysis_timing,
           bookinfo_min_stock_buffer: formData.bookinfo_min_stock_buffer,
           bookinfo_block_consign_low_stock: formData.bookinfo_block_consign_low_stock,
           bookinfo_consign_low_stock_threshold: formData.bookinfo_consign_low_stock_threshold,
           bookinfo_check_existing_consign_balance: formData.bookinfo_check_existing_consign_balance,
           bookinfo_max_consign_client_units: formData.bookinfo_max_consign_client_units,
           bookinfo_allow_partial_fulfill: formData.bookinfo_allow_partial_fulfill,
        })
      });

      if (!res.ok || !settingsRes.ok) throw new Error('Falha ao salvar configurações da Bookinfo');
      
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
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Credenciais Ativas</h3>
                  <p className="text-xs text-slate-500">Permite que a plataforma conecte-se com a API da Bookinfo.</p>
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

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800/60 pb-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Automações em Segundo Plano</h3>
                  <p className="text-xs text-slate-500">Liga/Desliga o processamento automatizado de pedidos em fila (Jobs) a cada X minutos.</p>
                </div>
                <label className="relative flex items-center cursor-pointer shrink-0">
                  <div className="relative">
                    <input 
                      type="checkbox" 
                      name="bookinfo_sync_enabled"
                      className="sr-only peer" 
                      checked={formData.bookinfo_sync_enabled} 
                      onChange={handleInputChange} 
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 dark:bg-slate-700 dark:border-slate-600"></div>
                  </div>
                </label>
              </div>

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800/60 pb-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Notificar Bookinfo (Processando) antecipadamente</h3>
                  <p className="text-xs text-slate-500">Muda o status na Bookinfo antes do faturamento final assim que inserido no Horus ERP.</p>
                </div>
                <label className="relative flex items-center cursor-pointer shrink-0">
                  <div className="relative">
                    <input 
                      type="checkbox" 
                      name="bookinfo_notify_processing_early"
                      className="sr-only peer" 
                      checked={formData.bookinfo_notify_processing_early} 
                      onChange={handleInputChange} 
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 dark:bg-slate-700 dark:border-slate-600"></div>
                  </div>
                </label>
              </div>

              {/* Seletor: Momento da Análise de Itens */}
              <div className="flex flex-col gap-3 border-b border-slate-100 dark:border-slate-800/60 pb-5">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Momento da Análise de Itens
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Define o fluxo operacional de análise e comunicação de situação de itens com a Bookinfo.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-1">
                  <label className={`cursor-pointer rounded-xl border p-3.5 transition-all flex flex-col gap-1.5 ${
                    formData.bookinfo_analysis_timing === 'BEFORE_CONFERENCE'
                      ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 ring-1 ring-emerald-500'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">Antes da Conferência (Padrão)</span>
                      <input
                        type="radio"
                        name="bookinfo_analysis_timing"
                        value="BEFORE_CONFERENCE"
                        checked={formData.bookinfo_analysis_timing === 'BEFORE_CONFERENCE'}
                        onChange={handleInputChange}
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Analisa o saldo do estoque no Hórus, envia a avaliação à Bookinfo e aguarda para gerar o pedido no ERP.
                    </p>
                  </label>

                  <label className={`cursor-pointer rounded-xl border p-3.5 transition-all flex flex-col gap-1.5 ${
                    formData.bookinfo_analysis_timing === 'AFTER_CONFERENCE'
                      ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 ring-1 ring-emerald-500'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">Pós-Conferência / Faturamento</span>
                      <input
                        type="radio"
                        name="bookinfo_analysis_timing"
                        value="AFTER_CONFERENCE"
                        checked={formData.bookinfo_analysis_timing === 'AFTER_CONFERENCE'}
                        onChange={handleInputChange}
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Envia o pedido direto ao Hórus para conferência e emissão da NF-e; analisa e envia a situação real após o faturamento.
                    </p>
                  </label>
                </div>
              </div>

              {/* Bloco: Regras Comerciais por Seller */}
              <div className="space-y-4 border-b border-slate-100 dark:border-slate-800/60 pb-5">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" /> Regras Comerciais de Atendimento
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Parâmetros flexíveis aplicados automaticamente ao analisar o estoque e pedidos.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
                  <div className="space-y-1.5 bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Buffer de Estoque Mínimo</label>
                    <input
                      type="number"
                      name="bookinfo_min_stock_buffer"
                      min="0"
                      value={formData.bookinfo_min_stock_buffer}
                      onChange={handleInputChange}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-1.5 px-3 text-sm text-slate-900 dark:text-white font-medium"
                    />
                    <p className="text-[11px] text-slate-400">Unidades retidas como reserva de segurança.</p>
                  </div>

                  <div className="space-y-1.5 bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Estoque Crítico Consignação</label>
                    <input
                      type="number"
                      name="bookinfo_consign_low_stock_threshold"
                      min="0"
                      value={formData.bookinfo_consign_low_stock_threshold}
                      onChange={handleInputChange}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-1.5 px-3 text-sm text-slate-900 dark:text-white font-medium"
                    />
                    <p className="text-[11px] text-slate-400">Gatilho de estoque baixo para travar consignação.</p>
                  </div>

                  <div className="space-y-1.5 bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Teto Consignado por Cliente</label>
                    <input
                      type="number"
                      name="bookinfo_max_consign_client_units"
                      min="1"
                      value={formData.bookinfo_max_consign_client_units}
                      onChange={handleInputChange}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-1.5 px-3 text-sm text-slate-900 dark:text-white font-medium"
                    />
                    <p className="text-[11px] text-slate-400">Máximo de exemplares consignados permitidos por título.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                  <label className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer">
                    <div className="pr-2">
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">Bloquear Consignação em Estoque Baixo</span>
                      <span className="text-[11px] text-slate-400">Prioriza venda direta faturada</span>
                    </div>
                    <input
                      type="checkbox"
                      name="bookinfo_block_consign_low_stock"
                      checked={formData.bookinfo_block_consign_low_stock}
                      onChange={handleInputChange}
                      className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer">
                    <div className="pr-2">
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">Checar Saldo Já Consignado</span>
                      <span className="text-[11px] text-slate-400">Evita sobre-estoque no cliente</span>
                    </div>
                    <input
                      type="checkbox"
                      name="bookinfo_check_existing_consign_balance"
                      checked={formData.bookinfo_check_existing_consign_balance}
                      onChange={handleInputChange}
                      className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer">
                    <div className="pr-2">
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">Permitir Atendimento Parcial</span>
                      <span className="text-[11px] text-slate-400">Atende quantidade disponível</span>
                    </div>
                    <input
                      type="checkbox"
                      name="bookinfo_allow_partial_fulfill"
                      checked={formData.bookinfo_allow_partial_fulfill}
                      onChange={handleInputChange}
                      className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                    />
                  </label>
                </div>
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

        <hr className="border-slate-200 dark:border-slate-800 my-8" />
        
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 dark:bg-slate-900/40 dark:border-slate-800/60 shadow-sm">
           <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-2">
             <Database className="w-5 h-5 text-indigo-500" /> Migrador de Pedidos (Legado) para o ERP
           </h3>
           <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 max-w-2xl">
             Utilize esta ferramenta para importar uma planilha relacionando o pedido na Bookinfo com o seu equivalente no Horus ERP. 
             Isso serve para retroalimentar os IDs dos pedidos já recebidos no sistema antigo, para que não fiquem órfãos agora.
           </p>

           <div className="flex flex-col sm:flex-row gap-4 items-center">
              <button 
                onClick={handleDownloadTemplate}
                type="button"
                className="w-full sm:w-auto px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition flex items-center justify-center gap-2"
              >
                  <Download className="w-4 h-4" /> Baixar Modelo
              </button>

              <div className="relative w-full sm:w-auto">
                 <button 
                   disabled={importing}
                   type="button"
                   className="w-full sm:w-auto px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition flex items-center justify-center gap-2 disabled:opacity-70"
                 >
                     {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
                     {importing ? 'Importando...' : 'Fazer Upload CSV'}
                 </button>
                 <input 
                   disabled={importing}
                   title="Enviar arquivo CSV"
                   type="file" 
                   accept=".csv"
                   onChange={handleFileUpload}
                   className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed" 
                 />
              </div>
           </div>
        </div>

      </div>
    </motion.div>
  );
}
