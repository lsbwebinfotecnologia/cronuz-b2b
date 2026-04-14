'use client';

import { useState, Suspense, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Building2, Save, ArrowLeft, Loader2, Globe, Mail, FileText, Image as ImageIcon, Calendar, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';

export default function NewCompanyPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary-base)]" /></div>}>
      <NewCompanyForm />
    </Suspense>
  );
}

function NewCompanyForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialName = searchParams.get('name') || '';
  const initialDocument = searchParams.get('document') || '';
  const initialLeadId = searchParams.get('lead_id') || '';
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    name: initialName,
    document: initialDocument,
    domain: '',
    logo: '',
    tenant_id: 'cronuz',
    business_model: 'B2B_CRONUZ',
    operation_start_date: new Date().toISOString().split('T')[0],
    zip_code: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    codigo_municipio_ibge: ''
  });
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const u = getUser();
    setUser(u);
    if (u?.type === 'MASTER' && u?.tenant_id === 'horus') {
      setFormData(prev => ({ ...prev, business_model: 'B2B_HORUS', tenant_id: 'horus' }));
    }
  }, []);

  const isGlobalMaster = user?.type === 'MASTER' && (!user?.tenant_id || user?.tenant_id === 'cronuz');

  const maskCNPJ = (val: string) => {
    return val.replace(/\D/g, '').replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5').substring(0, 18);
  };

  const handleDocumentChange = async (value: string) => {
    const masked = maskCNPJ(value);
    setFormData(prev => ({ ...prev, document: masked }));

    const cleanCnpj = masked.replace(/\D/g, '');
    if (cleanCnpj.length === 14) {
      try {
        const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
        if (res.ok) {
           const data = await res.json();
           setFormData(prev => ({
             ...prev,
             name: data.razao_social || data.nome_fantasia || prev.name
           }));
           toast.success("Dados da Receita Federal importados!");
        }
      } catch (e) {
        // Silently fail if API is down
      }
    }
  };

  useEffect(() => {
    if (initialDocument) {
      handleDocumentChange(initialDocument);
    }
  }, [initialDocument]);

  const handleCepChange = async (val: string) => {
    let cleanVal = val.replace(/\D/g, '');
    let formatted = cleanVal;
    if (cleanVal.length > 5) {
      formatted = `${cleanVal.slice(0, 5)}-${cleanVal.slice(5, 8)}`;
    }
    setFormData(prev => ({ ...prev, zip_code: formatted }));

    if (cleanVal.length === 8) {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cleanVal}/json/`);
        if (res.ok) {
          const data = await res.json();
          if (!data.erro) {
            setFormData(prev => ({
              ...prev,
              street: data.logradouro || prev.street,
              neighborhood: data.bairro || prev.neighborhood,
              city: data.localidade || prev.city,
              state: data.uf || prev.state,
              codigo_municipio_ibge: data.ibge || prev.codigo_municipio_ibge
            }));
          }
        }
      } catch (err) {}
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...formData,
          active: true,
          lead_id: initialLeadId || null
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || 'Erro ao cadastrar empresa');
      }
      
      const newCompany = await res.json();
      
      // Update settings with business model
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${newCompany.id}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ business_model: formData.business_model })
      });

      toast.success('Empresa base criada com sucesso!');
      router.push('/companies');
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Link 
          href="/"
          className="p-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors text-slate-500 hover:text-slate-900 dark:bg-slate-800/50 dark:border-transparent dark:hover:bg-slate-800 dark:text-slate-400 dark:hover:text-white"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Building2 className="h-6 w-6 text-[var(--color-primary-base)]" />
            Nova Empresa B2B
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Cadastre um novo portal independente na rede Cronuz.
          </p>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-slate-200 bg-white p-6 md:p-8 shadow-sm transition-colors dark:border-slate-800 dark:bg-slate-900/40 dark:backdrop-blur-xl"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">CNPJ / Documento</label>
              <div className="relative">
                <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 dark:text-slate-500" />
                <input
                  type="text"
                  required
                  value={formData.document}
                  onChange={(e) => handleDocumentChange(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-900 focus:border-[var(--color-primary-base)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all font-medium font-mono dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-200 dark:focus:border-[var(--color-primary-base)]/50 dark:focus:bg-slate-900/80 dark:focus:ring-1 dark:focus:ring-[var(--color-primary-base)]/50"
                  placeholder="00.000.000/0001-00"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Razão Social / Nome</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 dark:text-slate-500" />
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-900 focus:border-[var(--color-primary-base)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all font-medium dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-200 dark:focus:border-[var(--color-primary-base)]/50 dark:focus:bg-slate-900/80 dark:focus:ring-1 dark:focus:ring-[var(--color-primary-base)]/50"
                  placeholder="Nome da corporação"
                />
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Domínio B2B (Interno)</label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 dark:text-slate-500" />
                <input
                  type="text"
                  required
                  value={formData.domain}
                  onChange={(e) => setFormData({...formData, domain: e.target.value})}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-900 focus:border-[var(--color-primary-base)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all font-medium dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-200 dark:focus:border-[var(--color-primary-base)]/50 dark:focus:bg-slate-900/80 dark:focus:ring-1 dark:focus:ring-[var(--color-primary-base)]/50"
                  placeholder="livraria.cronuz.com.br"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Logo URL (Opcional)</label>
              <div className="relative">
                <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 dark:text-slate-500" />
                <input
                  type="url"
                  value={formData.logo}
                  onChange={(e) => setFormData({...formData, logo: e.target.value})}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-900 focus:border-[var(--color-primary-base)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all font-medium dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-200 dark:focus:border-[var(--color-primary-base)]/50 dark:focus:bg-slate-900/80 dark:focus:ring-1 dark:focus:ring-[var(--color-primary-base)]/50"
                  placeholder="https://meusite.com/logo.png"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Início da Operação</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 dark:text-slate-500" />
                <input
                  type="date"
                  required
                  value={formData.operation_start_date}
                  onChange={(e) => setFormData({...formData, operation_start_date: e.target.value})}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-900 focus:border-[var(--color-primary-base)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all font-medium dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-200 dark:focus:border-[var(--color-primary-base)]/50 dark:focus:bg-slate-900/80 dark:focus:ring-1 dark:focus:ring-[var(--color-primary-base)]/50"
                />
              </div>
            </div>

            {isGlobalMaster && (
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Modelo de Negócio / Plataforma</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 dark:text-slate-500" />
                  <select
                    value={formData.business_model}
                    onChange={(e) => {
                      const bm = e.target.value;
                      let tenant = 'cronuz';
                      if (bm === 'B2B_HORUS') tenant = 'horus';
                      setFormData({...formData, business_model: bm, tenant_id: tenant});
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-10 text-sm text-slate-900 focus:border-[var(--color-primary-base)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all font-medium appearance-none dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-200 dark:focus:border-[var(--color-primary-base)]/50 dark:focus:bg-slate-900/80 dark:focus:ring-1 dark:focus:ring-[var(--color-primary-base)]/50"
                  >
                    <option value="B2B_CRONUZ">B2B Cronuz (Padrão)</option>
                    <option value="B2B_HORUS">B2B Horus Emissor (ERP)</option>
                    <option value="CRONUZ_COMMERCE">Cronuz Commerce (Virtual Store)</option>
                    <option value="SUPORTE_HORUS">Suporte Horus</option>
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
            )}
            
            {/* Address Information Section */}
            <div className="md:col-span-2 pt-4 border-t border-slate-200 dark:border-slate-800">
               <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Endereço Sede/Matriz</h3>
               <div className="grid grid-cols-6 gap-4">
                 <div className="col-span-6 md:col-span-2">
                    <label className="text-xs font-medium text-slate-500 uppercase mb-1 block dark:text-slate-400">CEP</label>
                    <input type="text" value={formData.zip_code} onChange={e => handleCepChange(e.target.value)} maxLength={9} required className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 outline-none focus:border-[var(--color-primary-base)] font-mono dark:bg-slate-950 dark:border-slate-800 dark:text-white" />
                 </div>
                 <div className="col-span-6 md:col-span-4">
                    <label className="text-xs font-medium text-slate-500 uppercase mb-1 block dark:text-slate-400">Rua / Logradouro</label>
                    <input type="text" value={formData.street} onChange={e => setFormData({...formData, street: e.target.value})} required className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 outline-none focus:border-[var(--color-primary-base)] dark:bg-slate-950 dark:border-slate-800 dark:text-white" />
                 </div>
                 <div className="col-span-3 md:col-span-2">
                    <label className="text-xs font-medium text-slate-500 uppercase mb-1 block dark:text-slate-400">Número</label>
                    <input type="text" value={formData.number} onChange={e => setFormData({...formData, number: e.target.value})} required className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 outline-none focus:border-[var(--color-primary-base)] dark:bg-slate-950 dark:border-slate-800 dark:text-white" />
                 </div>
                 <div className="col-span-3 md:col-span-4">
                    <label className="text-xs font-medium text-slate-500 uppercase mb-1 block dark:text-slate-400">Complemento (Opcional)</label>
                    <input type="text" value={formData.complement} onChange={e => setFormData({...formData, complement: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 outline-none focus:border-[var(--color-primary-base)] dark:bg-slate-950 dark:border-slate-800 dark:text-white" />
                 </div>
                 <div className="col-span-6 md:col-span-2">
                    <label className="text-xs font-medium text-slate-500 uppercase mb-1 block dark:text-slate-400">Bairro</label>
                    <input type="text" value={formData.neighborhood} onChange={e => setFormData({...formData, neighborhood: e.target.value})} required className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 outline-none focus:border-[var(--color-primary-base)] dark:bg-slate-950 dark:border-slate-800 dark:text-white" />
                 </div>
                 <div className="col-span-6 md:col-span-2">
                    <label className="text-xs font-medium text-slate-500 uppercase mb-1 block dark:text-slate-400">Cidade</label>
                    <input type="text" value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} required className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 outline-none focus:border-[var(--color-primary-base)] dark:bg-slate-950 dark:border-slate-800 dark:text-white" />
                 </div>
                 <div className="col-span-3 md:col-span-1">
                    <label className="text-xs font-medium text-slate-500 uppercase mb-1 block dark:text-slate-400">UF</label>
                    <input type="text" value={formData.state} onChange={e => setFormData({...formData, state: e.target.value})} maxLength={2} required className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-900 outline-none focus:border-[var(--color-primary-base)] uppercase dark:bg-slate-950 dark:border-slate-800 dark:text-white" />
                 </div>
                 <div className="col-span-3 md:col-span-1">
                    <label className="text-xs font-medium text-slate-500 uppercase mb-1 block dark:text-slate-400" title="Código IBGE Obrigatório">IBGE (Req.)</label>
                    <input type="text" value={formData.codigo_municipio_ibge} onChange={e => setFormData({...formData, codigo_municipio_ibge: e.target.value})} required className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-2.5 text-slate-900 outline-none focus:border-[var(--color-primary-base)] font-mono text-center dark:bg-slate-950 dark:border-slate-800 dark:text-white" />
                 </div>
               </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-slate-800/60">
            <button
              type="submit"
              disabled={loading}
              className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-medium py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:hover:scale-100 disabled:shadow-none"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
              {loading ? 'Salvando...' : 'Cadastrar Empresa'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
