'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Loader2, Globe, FileText, Image as ImageIcon, Save, CheckCircle2, XCircle } from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';
import { useCompany } from '../layout';

export default function CompanyProfilePage() {
  const params = useParams();
  const companyId = params.id as string;
  const { company, refreshCompany } = useCompany();
  
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    document: '',
    domain: '',
    custom_domain: '',
    zip_code: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: ''
  });

  const maskCNPJ = (val: string) => {
    if (!val) return '';
    return val
      .replace(/\D/g, '')
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2')
      .slice(0, 18);
  };

  useEffect(() => {
    if (company) {
      setFormData({
        name: company.name || '',
        document: maskCNPJ(company.document || ''),
        domain: company.domain || '',
        custom_domain: company.custom_domain || '',
        zip_code: company.zip_code || '',
        street: company.street || '',
        number: company.number || '',
        complement: company.complement || '',
        neighborhood: company.neighborhood || '',
        city: company.city || '',
        state: company.state || ''
      });
    }
  }, [company]);

  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    if (name === 'document') {
      const masked = maskCNPJ(value);
      setFormData(prev => ({ ...prev, [name]: masked }));
      
      const cleanCnpj = masked.replace(/\D/g, '');
      
      // Auto-fetch if 14 digits reached and the user just typed the last one
      if (cleanCnpj.length === 14 && cleanCnpj !== formData.document.replace(/\D/g, '')) {
        try {
          toast.loading('Buscando CNPJ na Receita...', { id: 'cnpj-search' });
          const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
          if (res.ok) {
            const data = await res.json();
            setFormData(prev => ({
              ...prev,
              name: prev.name || data.razao_social || '',
              zip_code: data.cep || prev.zip_code || '',
              street: data.logradouro ? `${data.descricao_tipo_de_logradouro || ''} ${data.logradouro}`.trim() : prev.street || '',
              number: data.numero || prev.number || '',
              complement: data.complemento || prev.complement || '',
              neighborhood: data.bairro || prev.neighborhood || '',
              city: data.municipio || prev.city || '',
              state: data.uf || prev.state || ''
            }));
            toast.success('Dados atualizados com a Receita Federal!', { id: 'cnpj-search' });
          } else {
            toast.error('CNPJ não encontrado na base de dados.', { id: 'cnpj-search' });
          }
        } catch (err) {
          toast.error('Erro na integração com a API da Receita.', { id: 'cnpj-search' });
        }
      }
    } else if (name === 'zip_code') {
      const maskedCep = value.replace(/\D/g, '').replace(/^(\d{5})(\d)/, '$1-$2').slice(0, 9);
      setFormData(prev => ({ ...prev, [name]: maskedCep }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  async function handleSaveProfile() {
    if (!company) return;
    setSavingGlobal(true);
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(formData)
      });
      if (!res.ok) throw new Error('Falha ao salvar dados');
      toast.success('Perfil atualizado com sucesso!');
      refreshCompany();
    } catch (error) {
      toast.error('Erro ao salvar informações do perfil.');
    } finally {
      setSavingGlobal(false);
    }
  }

  // We actually don't have a specific `PUT /companies/{id}` for name/document/domain natively without overriding others,
  // but let's assume we can add it later if needed. For now we will allow toggling modules and status.

  async function handleToggleStatus() {
    if (!company) return;
    setTogglingStatus(true);
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ active: !company.active })
      });
      if (!res.ok) throw new Error('Falha ao atualizar status');
      toast.success(`Empresa ${!company.active ? 'ativada' : 'inativada'} com sucesso!`);
      refreshCompany();
    } catch (error) {
      toast.error('Erro ao mudar o status da empresa.');
    } finally {
      setTogglingStatus(false);
    }
  }

  if (!company) {
    return (
       <div className="flex h-64 items-center justify-center">
         <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary-base)]" />
       </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full overflow-y-auto">
      <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md sticky top-0 z-10">
         <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center justify-between">
           Detalhes do Cliente (Perfil)
           
           <button
             onClick={handleToggleStatus}
             disabled={togglingStatus}
             className={`px-4 py-2 text-sm rounded-xl font-medium flex items-center gap-2 transition-all ${
               company.active 
                 ? 'bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400'
                 : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400'
             }`}
           >
             {togglingStatus ? <Loader2 className="h-4 w-4 animate-spin" /> : (company.active ? <XCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />)}
             {company.active ? 'Suspender Operação' : 'Ativar Empresa'}
           </button>
         </h2>
         <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
           Informações principais da conta master.
         </p>
      </div>

      <div className="p-6 space-y-8">
        {/* Identificação Section */}
        <section className="space-y-4">
           <h3 className="text-sm font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Identificação</h3>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800/60 dark:bg-slate-900/40">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Empresa / Razão Social</label>
                <div className="relative">
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    className="w-full rounded-xl border border-slate-200 bg-white py-3 px-4 text-sm text-slate-900 font-medium focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">CNPJ / Documento</label>
                <div className="relative">
                  <input
                    type="text"
                    name="document"
                    value={formData.document}
                    onChange={handleInputChange}
                    className="w-full rounded-xl border border-slate-200 bg-white py-3 px-4 font-mono text-sm text-slate-900 font-medium focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200"
                  />
                </div>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Domínio B2B (Interno)</label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    name="domain"
                    value={formData.domain}
                    onChange={handleInputChange}
                    className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 font-medium focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200"
                  />
                </div>
              </div>
              <div className="space-y-1.5 md:col-span-2 mt-4 md:mt-0">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Domínio Customizado</label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    name="custom_domain"
                    placeholder="www.suaempresa.com.br"
                    value={formData.custom_domain}
                    onChange={handleInputChange}
                    className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 font-medium focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200"
                  />
                </div>
              </div>
           </div>
        </section>

        <hr className="border-slate-200 dark:border-slate-800" />

        {/* Endereço Section */}
        <section className="space-y-4">
           <h3 className="text-sm font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Endereço</h3>
           <div className="grid grid-cols-1 md:grid-cols-12 gap-6 p-6 rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800/60 dark:bg-slate-900/40">
              <div className="space-y-1.5 md:col-span-3">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">CEP</label>
                <input
                  type="text"
                  name="zip_code"
                  value={formData.zip_code}
                  onChange={handleInputChange}
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 px-4 text-sm text-slate-900 font-medium focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200"
                />
              </div>
              <div className="space-y-1.5 md:col-span-7">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Logradouro / Rua</label>
                <input
                  type="text"
                  name="street"
                  value={formData.street}
                  onChange={handleInputChange}
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 px-4 text-sm text-slate-900 font-medium focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200"
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Número</label>
                <input
                  type="text"
                  name="number"
                  value={formData.number}
                  onChange={handleInputChange}
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 px-4 text-sm text-slate-900 font-medium focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200"
                />
              </div>
              
              <div className="space-y-1.5 md:col-span-4">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Complemento</label>
                <input
                  type="text"
                  name="complement"
                  value={formData.complement}
                  onChange={handleInputChange}
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 px-4 text-sm text-slate-900 font-medium focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200"
                />
              </div>
              <div className="space-y-1.5 md:col-span-4">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Bairro</label>
                <input
                  type="text"
                  name="neighborhood"
                  value={formData.neighborhood}
                  onChange={handleInputChange}
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 px-4 text-sm text-slate-900 font-medium focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200"
                />
              </div>
              <div className="space-y-1.5 md:col-span-3">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Cidade</label>
                <input
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleInputChange}
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 px-4 text-sm text-slate-900 font-medium focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200"
                />
              </div>
              <div className="space-y-1.5 md:col-span-1">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">UF</label>
                <input
                  type="text"
                  name="state"
                  maxLength={2}
                  value={formData.state}
                  onChange={handleInputChange}
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 px-4 text-sm text-slate-900 font-medium focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200 uppercase"
                />
              </div>

           </div>
        </section>

         {/* Actions Section */}
         <div className="flex justify-end pt-6 mb-8 border-t border-slate-200 dark:border-slate-800/60">
           <button
             onClick={handleSaveProfile}
             disabled={savingGlobal}
             className="px-8 py-3 text-[15px] rounded-xl font-bold flex items-center gap-2 transition-all bg-[var(--color-primary-base)] text-white hover:bg-[var(--color-primary-hover)] shadow-lg shadow-[var(--color-primary-base)]/25 active:scale-[0.98] transform hover:scale-[1.02]"
           >
             {savingGlobal ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
             {savingGlobal ? 'Salvando...' : 'Salvar Alterações'}
           </button>
         </div>
      </div>
    </motion.div>
  );
}
