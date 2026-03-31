'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Loader2, Globe, FileText, Image as ImageIcon, Save, CheckCircle2, XCircle, Calendar, AlertTriangle, DollarSign, ChevronDown } from 'lucide-react';
import { getToken, getUser } from '@/lib/auth';
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
    tenant_id: 'cronuz',
    zip_code: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    logo: '',
    login_background_url: '',
    favicon_url: '',
    seo_title: '',
    seo_description: '',
    operation_start_date: '',
    trial_days: 0,
    is_contract_signed: false,
    monthly_fee: '',
    business_model: 'B2B_CRONUZ'
  });

  const [uploadingBg, setUploadingBg] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);

  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    setUser(getUser());
    if (companyId) {
      const token = getToken();
      fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/settings`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(r => r.json())
      .then(data => {
        setFormData(prev => ({...prev, business_model: data.business_model || 'B2B_CRONUZ'}));
      })
      .catch(console.error);
    }
  }, [companyId]);

  const isGlobalMaster = user?.type === 'MASTER' && (!user?.tenant_id || user?.tenant_id === 'cronuz');
  const isHorusMaster = user?.type === 'MASTER' && user?.tenant_id === 'horus';
  const canViewContracts = isGlobalMaster || isHorusMaster;

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
      setFormData(prev => ({
        ...prev,
        name: company.name || '',
        document: maskCNPJ(company.document || ''),
        domain: company.domain || '',
        custom_domain: company.custom_domain || '',
        tenant_id: company.tenant_id || 'cronuz',
        zip_code: company.zip_code || '',
        street: company.street || '',
        number: company.number || '',
        complement: company.complement || '',
        neighborhood: company.neighborhood || '',
        city: company.city || '',
        state: company.state || '',
        logo: company.logo || '',
        login_background_url: company.login_background_url || '',
        favicon_url: company.favicon_url || '',
        seo_title: company.seo_title || '',
        seo_description: company.seo_description || '',
        operation_start_date: company.operation_start_date ? company.operation_start_date.split('T')[0] : '',
        trial_days: company.trial_days || 0,
        is_contract_signed: company.is_contract_signed || false,
        monthly_fee: company.monthly_fee || ''
      }));
    }
  }, [company]);

  const handleBackgroundUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    
    if (file.size > 4 * 1024 * 1024) {
        toast.error('A imagem excede o limite máximo de 4MB.');
        e.target.value = '';
        return;
    }
    
    setUploadingBg(true);
    
    try {
      const data = new FormData();
      data.append('file', file);
      if (companyId) data.append('company_id', companyId);
      
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/upload/image`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: data
      });
      
      if (!res.ok) throw new Error('Falha no upload');
      const responseData = await res.json();
      setFormData(prev => ({ ...prev, login_background_url: responseData.url }));
      toast.success('Imagem enviada! Lembre-se de clicar em Salvar Alterações.');
    } catch (err) {
      toast.error('Erro ao fazer upload da imagem.');
    } finally {
      setUploadingBg(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    
    if (file.size > 4 * 1024 * 1024) {
        toast.error('A logo excede o limite máximo de 4MB.');
        e.target.value = '';
        return;
    }
    
    setUploadingLogo(true);
    
    try {
      const data = new FormData();
      data.append('file', file);
      if (companyId) data.append('company_id', companyId);
      
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/upload/image`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: data
      });
      
      if (!res.ok) throw new Error('Falha no upload');
      const responseData = await res.json();
      setFormData(prev => ({ ...prev, logo: responseData.url }));
      toast.success('Logo enviada! Lembre-se de clicar em Salvar Alterações.');
    } catch (err) {
      toast.error('Erro ao fazer upload da logo.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleFaviconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    
    if (file.size > 4 * 1024 * 1024) {
        toast.error('O ícone excede o limite máximo de 4MB.');
        e.target.value = '';
        return;
    }
    
    setUploadingFavicon(true);
    
    try {
      const data = new FormData();
      data.append('file', file);
      if (companyId) data.append('company_id', companyId);
      
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/upload/image`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: data
      });
      
      if (!res.ok) throw new Error('Falha no upload');
      const responseData = await res.json();
      setFormData(prev => ({ ...prev, favicon_url: responseData.url }));
      toast.success('Favicon (Ícone) enviado! Lembre-se de clicar em Salvar Alterações.');
    } catch (err) {
      toast.error('Erro ao fazer upload do Favicon.');
    } finally {
      setUploadingFavicon(false);
    }
  };

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
    } else if (name === 'is_contract_signed') {
      setFormData(prev => ({ ...prev, [name]: e.target.checked }));
    } else if (name === 'monthly_fee') {
      // Basic monetary mask
      let v = value.replace(/\D/g, '');
      v = (Number(v) / 100).toFixed(2).replace('.', ',');
      if(v === '0,00' && value === '') v = '';
      else v = 'R$ ' + v.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
      setFormData(prev => ({ ...prev, [name]: v }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  async function handleSaveProfile() {
    if (!company) return;

    if (!formData.name?.trim()) {
      toast.error('A Razão Social é obrigatória.');
      return;
    }
    if (!formData.document?.trim()) {
      toast.error('O Documento (CNPJ) é obrigatório.');
      return;
    }
    if (!formData.domain?.trim()) {
      toast.error('O Domínio Interno é obrigatório para o Tenant.');
      return;
    }

    setSavingGlobal(true);
    try {
      const payload = { ...formData };
      if ((payload as any).operation_start_date === '') (payload as any).operation_start_date = null;
      if ((payload as any).trial_days === '' || payload.trial_days === null) payload.trial_days = 0;
      else payload.trial_days = Number(payload.trial_days);
      
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Falha ao salvar dados');

      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ business_model: formData.business_model })
      });

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
              
              <div className="space-y-1.5 md:col-span-4 mt-4 md:mt-0">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Modelo de Negócio / Plataforma</label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <select
                    name="business_model"
                    value={formData.business_model}
                    onChange={(e) => {
                      const bm = e.target.value;
                      let tenant = 'cronuz';
                      if (bm === 'B2B_HORUS') tenant = 'horus';
                      setFormData({...formData, business_model: bm, tenant_id: tenant});
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-10 text-sm text-slate-900 font-medium appearance-none focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200"
                  >
                    <option value="B2B_CRONUZ">B2B Cronuz (Padrão)</option>
                    <option value="B2B_HORUS">B2B Horus Emissor (ERP)</option>
                    <option value="CRONUZ_COMMERCE">Cronuz Commerce (Virtual Store)</option>
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
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

        <hr className="border-slate-200 dark:border-slate-800" />

        {/* Branding & White-Label Section */}
        <section className="space-y-4">
           <h3 className="text-sm font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Personalização (Storefront)</h3>
           <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6 rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800/60 dark:bg-slate-900/40">
              
              <div className="space-y-3">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Logo do Lojista (Fundo Transparente)</label>
                <div className="relative group rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-[var(--color-primary-base)] transition-colors bg-slate-50 dark:bg-slate-900/50 flex flex-col items-center justify-center overflow-hidden" style={{ minHeight: '200px' }}>
                  {formData.logo ? (
                    <>
                      <img src={formData.logo} alt="Logo Lojista" className="p-4 w-auto h-full max-h-[160px] object-contain group-hover:opacity-40 transition-opacity" />
                      <div className="absolute inset-0 z-10 p-4 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-sm font-medium text-white shadow-sm bg-black/60 px-3 py-1 rounded-full">Clique para alterar</span>
                      </div>
                    </>
                  ) : (
                    <div className="p-6 text-center flex flex-col items-center">
                      {uploadingLogo ? <Loader2 className="h-8 w-8 text-[var(--color-primary-base)] animate-spin mb-3" /> : <ImageIcon className="h-10 w-10 text-slate-400 mb-3 group-hover:text-[var(--color-primary-base)] transition-colors" />}
                      <span className="text-sm font-medium text-slate-600 dark:text-slate-400">{uploadingLogo ? 'Enviando logo...' : 'Clique para fazer upload da Logo'}</span>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    disabled={uploadingLogo}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                  />
                </div>
                {formData.logo && (
                  <div className="flex justify-end mt-1">
                    <button type="button" onClick={() => setFormData(p => ({...p, logo: ''}))} className="text-[11px] text-rose-500 hover:text-rose-600 font-medium">
                      Remover Logo
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Fundo da Tela de Login B2B (Mínimo 1080p recomendado)</label>
                <div className="relative group rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-[var(--color-primary-base)] transition-colors bg-slate-50 dark:bg-slate-900/50 flex flex-col items-center justify-center overflow-hidden" style={{ minHeight: '200px' }}>
                  {formData.login_background_url ? (
                    <>
                      <img src={formData.login_background_url} alt="Fundo Login" className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-40 transition-opacity" />
                      <div className="relative z-10 p-4 flex flex-col items-center">
                        <ImageIcon className="h-8 w-8 text-white drop-shadow-md mb-2" />
                        <span className="text-sm font-medium text-white drop-shadow-md bg-black/30 px-3 py-1 rounded-full">Clique para alterar a imagem</span>
                      </div>
                    </>
                  ) : (
                    <div className="p-6 text-center flex flex-col items-center">
                      {uploadingBg ? <Loader2 className="h-8 w-8 text-[var(--color-primary-base)] animate-spin mb-3" /> : <ImageIcon className="h-10 w-10 text-slate-400 mb-3 group-hover:text-[var(--color-primary-base)] transition-colors" />}
                      <span className="text-sm font-medium text-slate-600 dark:text-slate-400">{uploadingBg ? 'Enviando imagem...' : 'Clique para fazer upload do Fundo'}</span>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleBackgroundUpload}
                    disabled={uploadingBg}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                  />
                </div>
                {formData.login_background_url && (
                  <div className="flex justify-end mt-1">
                    <button type="button" onClick={() => setFormData(p => ({...p, login_background_url: ''}))} className="text-[11px] text-rose-500 hover:text-rose-600 font-medium">
                      Remover Fundo
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Favicon (Ícone do Navegador - 32x32)</label>
                <div className="relative group rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-[var(--color-primary-base)] transition-colors bg-slate-50 dark:bg-slate-900/50 flex flex-col items-center justify-center overflow-hidden" style={{ minHeight: '200px' }}>
                  {formData.favicon_url ? (
                    <>
                      <img src={formData.favicon_url} alt="Favicon Lojista" className="object-contain w-16 h-16 group-hover:opacity-40 transition-opacity drop-shadow-sm" />
                      <div className="absolute inset-0 z-10 p-4 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[11px] font-medium text-white shadow-sm bg-black/60 px-3 py-1 rounded-full">Trocar Ícone</span>
                      </div>
                    </>
                  ) : (
                    <div className="p-6 text-center flex flex-col items-center">
                      {uploadingFavicon ? <Loader2 className="h-6 w-6 text-[var(--color-primary-base)] animate-spin mb-3" /> : <Globe className="h-10 w-10 text-slate-400 mb-3 group-hover:text-[var(--color-primary-base)] transition-colors" />}
                      <span className="text-[13px] font-medium text-slate-600 dark:text-slate-400">{uploadingFavicon ? 'Enviando ícone...' : 'Upload (.png, .ico)'}</span>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/png, image/x-icon, image/jpeg"
                    onChange={handleFaviconUpload}
                    disabled={uploadingFavicon}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                  />
                </div>
                {formData.favicon_url && (
                  <div className="flex justify-end mt-1">
                    <button type="button" onClick={() => setFormData(p => ({...p, favicon_url: ''}))} className="text-[11px] text-rose-500 hover:text-rose-600 font-medium">
                      Remover Ícone
                    </button>
                  </div>
                )}
              </div>
              
           </div>
        </section>

        <hr className="border-slate-200 dark:border-slate-800" />

        {/* SEO Section */}
        <section className="space-y-4">
           <h3 className="text-sm font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">SEO & Busca (Google)</h3>
           <div className="grid grid-cols-1 gap-6 p-6 rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800/60 dark:bg-slate-900/40">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Título SEO (Recomendado: 50~60 caracteres)</label>
                <div className="relative">
                  <input
                    type="text"
                    name="seo_title"
                    placeholder="Ex: Minha Empresa | Distribuidora Oficial"
                    value={formData.seo_title}
                    onChange={handleInputChange}
                    className="w-full rounded-xl border border-slate-200 bg-white py-3 px-4 text-sm text-slate-900 font-medium focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Descrição SEO (Meta Description - Máx 160 caracteres)</label>
                <div className="relative">
                  <textarea
                    name="seo_description"
                    placeholder="Escreva uma breve descrição que aparecerá nos resultados de busca do Google..."
                    rows={3}
                    value={formData.seo_description}
                    onChange={(e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-white py-3 px-4 text-sm text-slate-900 font-medium focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200 resize-none"
                  ></textarea>
                </div>
              </div>
           </div>
        </section>

        {/* Gestão Administrativa & Contratos (Restricted to Master) */}
        {canViewContracts && (
          <>
            <hr className="border-slate-200 dark:border-slate-800" />
            <section className="space-y-4">
               <div className="flex items-center justify-between">
                 <h3 className="text-sm font-bold uppercase tracking-widest text-[var(--color-primary-base)] flex items-center gap-2">
                   <AlertTriangle className="w-4 h-4" /> Gestão Administrativa & Faturamento (Acesso Restrito)
                 </h3>
               </div>
               
               {/* Visual Alert Logic */}
               {formData.operation_start_date && formData.trial_days > 0 && !formData.is_contract_signed && (
                 (() => {
                   const start = new Date(formData.operation_start_date);
                   const deadline = new Date(start);
                   deadline.setDate(deadline.getDate() + Number(formData.trial_days));
                   const isExpired = new Date() > deadline;
                   
                   return isExpired ? (
                     <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-xl flex items-start gap-3 dark:bg-rose-500/10 dark:border-rose-500/20 dark:text-rose-400 shadow-sm animate-pulse">
                        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-bold text-sm">Atenção! Período de Teste Expirado</h4>
                          <p className="text-xs mt-1">
                            A etapa de testes terminou em {deadline.toLocaleDateString('pt-BR')}. O contrato ainda não foi marcado como assinado. Considere suspender a operação do lojista na raiz da página.
                          </p>
                        </div>
                     </div>
                   ) : (
                     <div className="bg-amber-50 border border-amber-200 text-amber-700 p-4 rounded-xl flex items-start gap-3 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-400 shadow-sm">
                        <Calendar className="w-5 h-5 shrink-0 mt-0.5" />
                        <div>
                          <h4 className="font-bold text-sm">Lojista em Período de Teste</h4>
                          <p className="text-xs mt-1">
                            A fase de degustação encerra em {deadline.toLocaleDateString('pt-BR')}. O contrato ainda não consta como assinado.
                          </p>
                        </div>
                     </div>
                   );
                 })()
               )}
               {formData.is_contract_signed && (
                 <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-4 rounded-xl flex items-center gap-3 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400 shadow-sm">
                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                    <div>
                      <h4 className="font-bold text-sm">Contrato Vigente e Assinado!</h4>
                    </div>
                 </div>
               )}

               <div className="grid grid-cols-1 md:grid-cols-4 gap-6 p-6 rounded-2xl border border-rose-100 bg-rose-50/30 shadow-sm dark:border-rose-900/30 dark:bg-rose-950/10">
                  <div className="space-y-1.5 md:col-span-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Data de Início da Operação</label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input
                        type="date"
                        name="operation_start_date"
                        value={formData.operation_start_date}
                        onChange={handleInputChange}
                        className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 font-medium focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5 md:col-span-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Dias de Teste (Trial)</label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        name="trial_days"
                        value={formData.trial_days}
                        onChange={handleInputChange}
                        className="w-full rounded-xl border border-slate-200 bg-white py-3 px-4 text-sm text-slate-900 font-medium focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5 md:col-span-1">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">Mensalidade</label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        name="monthly_fee"
                        placeholder="R$ 0,00"
                        value={formData.monthly_fee}
                        onChange={handleInputChange}
                        className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 font-medium focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5 md:col-span-1 flex flex-col justify-center mt-2 md:mt-0">
                    <label className="relative inline-flex items-center cursor-pointer mt-4 group">
                      <input 
                        type="checkbox" 
                        name="is_contract_signed"
                        checked={formData.is_contract_signed} 
                        onChange={handleInputChange}
                        className="sr-only peer" 
                      />
                      <div className="relative w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-[120%] peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-emerald-500 group-hover:shadow-sm transition-all"></div>
                      <span className="ml-3 text-sm font-bold text-slate-700 dark:text-slate-300">Contrato Assinado?</span>
                    </label>
                  </div>
               </div>
            </section>
          </>
        )}

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
