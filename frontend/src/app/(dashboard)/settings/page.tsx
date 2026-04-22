'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings2, Loader2, Save, Store, MonitorSmartphone, Receipt, Mail, Database, Building2, CreditCard, Truck, ChevronRight, FileText, Key, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';
import { PrintPointsTab } from './PrintPointsTab';

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingCert, setUploadingCert] = useState(false);
  const currentUser = getUser();
  const companyId = currentUser?.company_id;

  const [activeTab, setActiveTab] = useState('geral');

  const [fiscalCep, setFiscalCep] = useState('');
  const [fiscalSettings, setFiscalSettings] = useState({
    nfse_enabled: false,
    nfse_environment: 'HOMOLOGACAO',
    nfse_next_number: 1,
    nfse_default_print_point_id: '',
    nfse_async_mode: true,
    razao_social: '',
    inscricao_municipal: '',
    codigo_municipio_ibge: '',
    regime_tributario: '',
    optante_simples_nacional: false,
    nfse_sit_simples_nacional: '3',
    cert_path: '',
    cert_password: ''
  });

  const [printPoints, setPrintPoints] = useState<any[]>([]);

  const [interCertFile, setInterCertFile] = useState<File | null>(null);
  const [interKeyFile, setInterKeyFile] = useState<File | null>(null);

  const handleInterCertUpload = async () => {
    if (!interCertFile || !interKeyFile) {
        toast.error('Selecione ambos os arquivos (.crt e .key)');
        return;
    }
    const freshUser = getUser();
    const cid = freshUser?.company_id;
    if (!cid) return;

    const fd = new FormData();
    fd.append('cert_file', interCertFile);
    fd.append('key_file', interKeyFile);
    fd.append('company_id', cid.toString());

    try {
        const loadingId = toast.loading('Enviando certificados MTLS...');
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/upload/inter-certificates`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getToken()}` },
            body: fd
        });

        if (res.ok) {
            toast.success('Certificados validados e importados com sucesso!', { id: loadingId });
            setInterCertFile(null);
            setInterKeyFile(null);
        } else {
            const err = await res.json();
            toast.error(err.detail || 'Falha ao importar certificados.', { id: loadingId });
        }
    } catch(e: any) {
        toast.error('Erro de conexão ao enviar os certificados.');
    }
  };
  const [settings, setSettings] = useState({
    pdv_type: 'NON_FISCAL',
    horus_api_mode: 'B2B',
    allow_backorder: false,
    max_backorder_qty: 0,
    pdv_allow_out_of_stock: false,
    cover_image_base_url: '',
    efi_sandbox: true,
    efi_client_id: '',
    efi_client_secret: '',
    efi_payee_code: '',
    efi_certificate_path: '',
    smtp_host: '',
    smtp_port: 587,
    smtp_username: '',
    smtp_password: '',
    smtp_from_email: '',
    payment_gateway_active: 'EFI',
    cielo_client_id: '',
    cielo_client_secret: '',
    cielo_merchant_id: '',
    rede_pv: '',
    rede_token: '',
    vindi_api_key: '',
    freight_gateway_active: 'CORREIOS',
    origin_zip_code: '',
    correios_user: '',
    correios_password: '',
    frenet_token: '',
    jadlog_token: '',
    tray_envios_token: '',
    b2b_show_stock_quantity: true,
    inter_enabled: false,
    inter_sandbox: true,
    inter_api_version: 'V2',
    inter_client_id: '',
    inter_client_secret: '',
    inter_cert_path: '',
    inter_key_path: '',
    inter_account_number: '',
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    const freshUser = getUser();
    const cid = freshUser?.company_id;
    if (!cid) {
      setLoading(false);
      toast.error('O ID da Empresa não foi encontrado no seu usuário.');
      return;
    }
    setLoading(true);
    try {
      const token = getToken();
      const filterRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${cid}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (filterRes.ok) {
        const filterData = await filterRes.json();
        setFiscalSettings({
          nfse_enabled: filterData.nfse_enabled || false,
          nfse_environment: filterData.nfse_environment || 'HOMOLOGACAO',
          nfse_next_number: filterData.nfse_next_number || 1,
          nfse_default_print_point_id: filterData.nfse_default_print_point_id || '',
          nfse_async_mode: filterData.nfse_async_mode ?? true,
          razao_social: filterData.razao_social || '',
          inscricao_municipal: filterData.inscricao_municipal || '',
          codigo_municipio_ibge: filterData.codigo_municipio_ibge || '',
          regime_tributario: filterData.regime_tributario || '',
          optante_simples_nacional: filterData.optante_simples_nacional || false,
          nfse_sit_simples_nacional: filterData.nfse_sit_simples_nacional || '3',
          cert_path: filterData.cert_path || '',
          cert_password: filterData.cert_password || ''
        });
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${cid}/settings`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Falha ao buscar configurações');
      const data = await res.json();
      setSettings(prev => ({
        ...prev,
        pdv_type: data.pdv_type || 'NON_FISCAL',
        horus_api_mode: data.horus_api_mode || 'B2B',
        allow_backorder: data.allow_backorder || false,
        max_backorder_qty: data.max_backorder_qty || 0,
        pdv_allow_out_of_stock: data.pdv_allow_out_of_stock || false,
        cover_image_base_url: data.cover_image_base_url || '',
        efi_sandbox: data.efi_sandbox ?? true,
        efi_client_id: data.efi_client_id || '',
        efi_client_secret: data.efi_client_secret || '',
        efi_payee_code: data.efi_payee_code || '',
        efi_certificate_path: data.efi_certificate_path || '',
        smtp_host: data.smtp_host || '',
        smtp_port: data.smtp_port || 587,
        smtp_username: data.smtp_username || '',
        smtp_password: data.smtp_password || '',
        smtp_from_email: data.smtp_from_email || '',
        payment_gateway_active: data.payment_gateway_active || 'EFI',
        cielo_client_id: data.cielo_client_id || '',
        cielo_client_secret: data.cielo_client_secret || '',
        cielo_merchant_id: data.cielo_merchant_id || '',
        rede_pv: data.rede_pv || '',
        rede_token: data.rede_token || '',
        vindi_api_key: data.vindi_api_key || '',
        freight_gateway_active: data.freight_gateway_active || 'CORREIOS',
        origin_zip_code: data.origin_zip_code || '',
        correios_user: data.correios_user || '',
        correios_password: data.correios_password || '',
        frenet_token: data.frenet_token || '',
        jadlog_token: data.jadlog_token || '',
        tray_envios_token: data.tray_envios_token || '',
        b2b_show_stock_quantity: data.b2b_show_stock_quantity !== undefined ? data.b2b_show_stock_quantity : true,
        inter_enabled: data.inter_enabled || false,
        inter_sandbox: data.inter_sandbox ?? true,
        inter_api_version: data.inter_api_version || 'V2',
        inter_client_id: data.inter_client_id || '',
        inter_client_secret: data.inter_client_secret || '',
        inter_cert_path: data.inter_cert_path || '',
        inter_key_path: data.inter_key_path || '',
        inter_account_number: data.inter_account_number || '',
      }));
      const resPoints = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/print-points`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (resPoints.ok) {
        const points = await resPoints.json();
        setPrintPoints(points.filter((p: any) => p.is_active));
      }
    } catch (error) {
      toast.error('Erro ao carregar as configurações.');
    } finally {
      setLoading(false);
    }
  }

  async function handleViaCep(cep: string) {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length === 8) {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        const data = await res.json();
        if (!data.erro && data.ibge) {
          setFiscalSettings(prev => ({ ...prev, codigo_municipio_ibge: data.ibge }));
          toast.success(`IBGE do município ${data.localidade} preenchido.`);
        }
      } catch (e) {
        console.error('Erro ao buscar CEP', e);
      }
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId) return;
    setSaving(true);
    try {
      const token = getToken();


      const fiscalPayload = {
        ...fiscalSettings,
        nfse_default_print_point_id: fiscalSettings.nfse_default_print_point_id ? parseInt(fiscalSettings.nfse_default_print_point_id as any) : null
      };
      
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(fiscalPayload)
      });

      const payloadSettings: any = { ...settings };
      delete payloadSettings.inter_cert_path;
      delete payloadSettings.inter_key_path;
      delete payloadSettings.efi_certificate_path;

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payloadSettings)
      });

      if (!res.ok) throw new Error('Falha ao salvar configurações');
      toast.success('Configurações atualizadas com sucesso!');
    } catch (error) {
      toast.error('Erro ao salvar configurações.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCertificateUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !companyId) return;
    
    setUploadingCert(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('company_id', companyId.toString());
      
      const token = getToken();
      const filterRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (filterRes.ok) {
        const filterData = await filterRes.json();
        setFiscalSettings({
          nfse_enabled: filterData.nfse_enabled || false,
          nfse_environment: filterData.nfse_environment || 'HOMOLOGACAO',
          nfse_next_number: filterData.nfse_next_number || 1,
          nfse_default_print_point_id: filterData.nfse_default_print_point_id || '',
          nfse_async_mode: filterData.nfse_async_mode ?? true,
          razao_social: filterData.razao_social || '',
          inscricao_municipal: filterData.inscricao_municipal || '',
          codigo_municipio_ibge: filterData.codigo_municipio_ibge || '',
          regime_tributario: filterData.regime_tributario || '',
          optante_simples_nacional: filterData.optante_simples_nacional || false,
          nfse_sit_simples_nacional: filterData.nfse_sit_simples_nacional || '3',
          cert_path: filterData.cert_path || '',
          cert_password: filterData.cert_password || ''
        });
      }

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/upload/certificate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Falha ao enviar certificado.');
      }
      
      const data = await res.json();
      setSettings(prev => ({ ...prev, efi_certificate_path: data.path }));
      toast.success('Certificado enviado e salvo com sucesso!');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setUploadingCert(false);
      if (e.target) e.target.value = '';
    }
  }

  async function handleNfseCertificateUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !companyId) return;
    
    setUploadingCert(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('company_id', companyId.toString());
      
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/upload/nfse-certificate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Falha ao enviar certificado.');
      }
      
      const data = await res.json();
      setFiscalSettings(prev => ({ ...prev, cert_path: data.path }));
      toast.success(data.message);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setUploadingCert(false);
      if (e.target) e.target.value = '';
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary-base)]" />
      </div>
    );
  }

  const tabs = [
    { id: 'geral', label: 'Dados Gerais', icon: Settings2 },
    { id: 'fiscal', label: 'Fiscal (NFS-e)', icon: Building2 },
    { id: 'print_points', label: 'Séries e Pontos', icon: FileText },
    { id: 'pdv', label: 'Frente de Caixa (PDV)', icon: Store },
    { id: 'pagamentos', label: 'Pagamentos', icon: CreditCard },
    { id: 'frete', label: 'Frete e Logística', icon: Truck },
    { id: 'email', label: 'E-mails (SMTP)', icon: Mail },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <Settings2 className="h-6 w-6 text-[var(--color-primary-base)]" />
          Configurações da Loja
        </h1>
        <p className="text-slate-500 text-sm mt-1 dark:text-slate-400">
          Gerencie as preferências e parâmetros operacionais do seu negócio.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-6 items-start">
        {/* Sidebar Menu */}
        <div className="w-full md:w-64 shrink-0 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:bg-slate-900/40 dark:border-slate-800">
          <nav className="space-y-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center justify-between px-3 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-[var(--color-primary-base)]/10 text-[var(--color-primary-base)] dark:bg-[var(--color-primary-base)]/20 shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3 relative">
                  <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? 'text-[var(--color-primary-base)]' : 'text-slate-400 group-hover:text-slate-500 dark:text-slate-500 dark:group-hover:text-slate-400'} transition-colors`} />
                  {tab.label}
                </div>
                {activeTab === tab.id && <ChevronRight className="w-4 h-4 text-[var(--color-primary-base)] opacity-70" />}
              </button>
            ))}
          </nav>
        </div>

        {/* Content Area */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          key={activeTab}
          className="flex-1 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:bg-slate-900/40 dark:border-slate-800 w-full"
        >
          <form onSubmit={handleSaveSettings}>
            <div className="p-6 md:p-8 space-y-8">
              

              {/* Tab: FISCAL */}
              {activeTab === 'fiscal' && (
                <div className="space-y-8 animate-in fade-in" id="fiscal-content">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800/60 pb-3">
                      <div className="p-2 bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-lg">
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center justify-between">
                          NFS-e Padrão Nacional
                          <label className="relative flex items-center cursor-pointer shrink-0">
                            <span className="mr-3 text-sm font-medium text-slate-700 dark:text-slate-300">Ativar Emissão</span>
                            <div className="relative">
                              <input type="checkbox" className="sr-only peer" checked={fiscalSettings.nfse_enabled} onChange={e => setFiscalSettings({ ...fiscalSettings, nfse_enabled: e.target.checked })} />
                              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500 dark:bg-slate-700 dark:border-slate-600"></div>
                            </div>
                          </label>
                        </h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Configuração de emissão direta com a Receita Federal (mTLS).</p>
                      </div>
                    </div>

                    {fiscalSettings.nfse_enabled && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
                        <div className="space-y-1.5 md:col-span-2">
                          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Ambiente</label>
                          <select
                            value={fiscalSettings.nfse_environment}
                            onChange={e => setFiscalSettings({ ...fiscalSettings, nfse_environment: e.target.value })}
                            className={`w-full border rounded-xl px-4 py-2.5 outline-none font-medium text-sm transition-all ${fiscalSettings.nfse_environment === 'PRODUCAO' ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400' : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400'}`}
                          >
                            <option value="HOMOLOGACAO">HOMOLOGAÇÃO (Sandbox Nacional)</option>
                            <option value="PRODUCAO">PRODUÇÃO (Real com Valor Fiscal)</option>
                          </select>
                        </div>

                        <div className="space-y-1.5 md:col-span-2 flex items-center justify-between p-4 border border-slate-200 rounded-xl bg-white dark:bg-slate-900/50 dark:border-slate-800">
                          <div>
                             <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 block">Modo de Emissão</label>
                             <span className="text-xs text-slate-500">Filas garantem que a tela não trave caso o governo demore a responder. Emissão Direta enviará instantaneamente e aguardará resposta (Timeout maior).</span>
                          </div>
                          <div className="flex items-center gap-3">
                              <span className={`text-xs font-bold ${!fiscalSettings.nfse_async_mode ? 'text-[var(--color-primary-base)]' : 'text-slate-400'}`}>Direta Síncrona</span>
                              <button 
                                type="button"
                                onClick={() => setFiscalSettings({...fiscalSettings, nfse_async_mode: !fiscalSettings.nfse_async_mode})}
                                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${fiscalSettings.nfse_async_mode ? 'bg-[var(--color-primary-base)]' : 'bg-slate-300 dark:bg-slate-700'}`}
                              >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${fiscalSettings.nfse_async_mode ? 'translate-x-6' : 'translate-x-1'}`} />
                              </button>
                              <span className={`text-xs font-bold ${fiscalSettings.nfse_async_mode ? 'text-[var(--color-primary-base)]' : 'text-slate-400'}`}>Fila Assíncrona</span>
                          </div>
                        </div>
                        
                        <div className="space-y-1.5 md:col-span-2">
                          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Razão Social</label>
                          <input type="text" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 dark:bg-slate-900/50 dark:border-slate-700 dark:text-white" value={fiscalSettings.razao_social} onChange={e => setFiscalSettings({...fiscalSettings, razao_social: e.target.value})} />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Inscrição Municipal (IM)</label>
                          <input type="text" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 dark:bg-slate-900/50 dark:border-slate-700 dark:text-white" value={fiscalSettings.inscricao_municipal} onChange={e => setFiscalSettings({...fiscalSettings, inscricao_municipal: e.target.value})} />
                        </div>
                        
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">CEP (Busca Automática do IBGE)</label>
                          <input type="text" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 dark:bg-slate-900/50 dark:border-slate-700 dark:text-white" value={fiscalCep} onChange={e => setFiscalCep(e.target.value)} onBlur={() => handleViaCep(fiscalCep)} placeholder="00000-000" />
                        </div>
                        
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Código IBGE do Município</label>
                          <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 dark:bg-slate-900/50 dark:border-slate-700 dark:text-white" value={fiscalSettings.codigo_municipio_ibge} onChange={e => setFiscalSettings({...fiscalSettings, codigo_municipio_ibge: e.target.value})} placeholder="Ex: 3504107" />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Regime Tributário</label>
                          <select className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 dark:bg-slate-900/50 dark:border-slate-700 dark:text-white" value={fiscalSettings.regime_tributario} onChange={e => setFiscalSettings({...fiscalSettings, regime_tributario: e.target.value})}>
                            <option value="">Selecione...</option>
                            <option value="1">1 - Simples Nacional</option>
                            <option value="2">2 - Simples Nacional (Excesso de Sublimite)</option>
                            <option value="3">3 - Regime Normal (Lucro Presumido/Real)</option>
                            <option value="4">4 - Solidário</option>
                            <option value="5">5 - Microempreendedor Individual (MEI)</option>
                            <option value="6">6 - Microempresário e Empresa de Pequeno Porte (ME EPP)</option>
                          </select>
                        </div>

                        <div className="space-y-1.5 pt-7">
                          <label className="relative flex items-center cursor-pointer shrink-0">
                            <span className="mr-3 text-sm font-medium text-slate-700 dark:text-slate-300">Optante Simples Nacional</span>
                            <div className="relative">
                              <input type="checkbox" className="sr-only peer" checked={fiscalSettings.optante_simples_nacional} onChange={e => setFiscalSettings({ ...fiscalSettings, optante_simples_nacional: e.target.checked })} />
                              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500 dark:bg-slate-700 dark:border-slate-600"></div>
                            </div>
                          </label>
                        </div>
                        
                        {fiscalSettings.optante_simples_nacional && (
                          <div className="space-y-1.5 md:col-span-2 pt-2 animate-in fade-in">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Situação no Simples Nacional (RFB)</label>
                            <select className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 dark:bg-slate-900/50 dark:border-slate-700 dark:text-white" value={fiscalSettings.nfse_sit_simples_nacional || "3"} onChange={e => setFiscalSettings({...fiscalSettings, nfse_sit_simples_nacional: e.target.value})}>
                              <option value="3">3 - Optante - ME (Microempresa) ou EPP</option>
                              <option value="2">2 - Optante - Microempreendedor Individual (MEI)</option>
                            </select>
                            <p className="text-xs text-slate-500 mt-1 max-w-xl">
                              Obrigatório para o Sefin Nacional. Selecione o exato perfil registrado na Receita Federal.
                            </p>
                          </div>
                        )}
                        
                        <div className="space-y-1.5 md:col-span-2 border-t border-slate-100 dark:border-slate-800/60 pt-4 mt-2">
                          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">
                            
                        <div className="space-y-1.5 md:col-span-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/60">
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Ponto de Impressão Padrão</h3>
                          <p className="text-xs text-slate-500 mb-3">Defina qual Série de Impressão será utilizada automaticamente nas rotinas do sistema.</p>
                          <div className="w-full md:w-1/2">
                            <select 
                              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 font-medium dark:bg-slate-900/50 dark:border-slate-700 dark:text-white" 
                              value={fiscalSettings.nfse_default_print_point_id} 
                              onChange={e => setFiscalSettings({...fiscalSettings, nfse_default_print_point_id: e.target.value})}
                            >
                              <option value="">Nenhum Ponto Padrão (Selecionar na Emissão)</option>
                              {printPoints.map(point => (
                                <option key={point.id} value={point.id}>
                                  {point.name} (Próx N° {point.current_number})
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                          </label>
                          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block mt-4">
                            Certificado Digital A1 (.pfx)
                          </label>
                          <div className="flex items-center gap-3 w-full">
                            <input
                              type="file"
                              accept=".pfx"
                              onChange={handleNfseCertificateUpload}
                              className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100 dark:file:bg-purple-900/30 dark:file:text-purple-400"
                            />
                            <div className="w-48">
                              <input type="password" placeholder="Senha do Certificado" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 text-sm dark:bg-slate-900/50 dark:border-slate-700 dark:text-white" value={fiscalSettings.cert_password || ''} onChange={e => setFiscalSettings({...fiscalSettings, cert_password: e.target.value})} />
                            </div>
                          </div>
                          {fiscalSettings.cert_path && (
                            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">✔ Certificado físico atual hospedado.</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab: GERAL */}
              {activeTab === 'geral' && (
                <div className="space-y-4 animate-in fade-in">
                  <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800/60 pb-3">
                    <div className="p-2 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg">
                      <Settings2 className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Configurações Gerais</h2>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Configurações estáticas de exibição e integração de catálogo.</p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Servidor Local de Capas (Base URL)</label>
                    <input
                      type="url"
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all font-mono text-sm placeholder:text-slate-400 dark:bg-slate-900/50 dark:border-slate-700 dark:text-white dark:focus:ring-[var(--color-primary-base)]/50 dark:placeholder:text-slate-600"
                      placeholder="https://capas.cronuz.com.br"
                      value={settings.cover_image_base_url}
                      onChange={e => setSettings({ ...settings, cover_image_base_url: e.target.value })}
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Caminho do diretório base que contém as imagens dos produtos, que serão consultadas via <b>ISBN.jpg</b> (ex: https://capas.site.com.br/978...jpg).
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 dark:border-slate-800/60 dark:bg-slate-900/40 mt-6 md:w-3/4 lg:w-2/3">
                    <h3 className="text-sm font-bold text-blue-600 tracking-wide uppercase mb-1">Visibilidade da Loja B2B / Storefront</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">Controle o nível de detalhes do seu estoque voltado para os clientes.</p>
                    
                    <label className="flex items-center gap-4 cursor-pointer">
                        <div className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${settings.b2b_show_stock_quantity ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'}`}>
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.b2b_show_stock_quantity ? 'translate-x-6' : 'translate-x-1'}`} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-800 dark:text-slate-200">Exibir quantidade exata em estoque</span>
                            <span className="text-xs text-slate-500">Se ativo, mostra "Disponível: X un". Se inativo, exibe apenas se o produto está ou não disponível.</span>
                        </div>
                        <input
                            type="checkbox"
                            className="sr-only"
                            checked={settings.b2b_show_stock_quantity}
                            onChange={(e) => setSettings(prev => ({ ...prev, b2b_show_stock_quantity: e.target.checked }))}
                        />
                    </label>
                  </div>
                </div>
              )}

              {/* Tab: PDV */}
              {activeTab === 'pdv' && (
                <div className="space-y-8 animate-in fade-in">
                  {/* Tipo de PDV */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800/60 pb-3">
                      <div className="p-2 bg-amber-500/10 text-amber-600 dark:text-ember-400 rounded-lg">
                        <MonitorSmartphone className="h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Ponto de Venda (PDV)</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Configure o comportamento da sua frente de caixa.</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                      <label className={`relative flex cursor-pointer rounded-xl border p-4 transition-all hover:bg-slate-50 dark:hover:bg-slate-800/50 ${settings.pdv_type === 'NON_FISCAL' ? 'border-[var(--color-primary-base)] bg-[var(--color-primary-base)]/5 ring-1 ring-[var(--color-primary-base)]' : 'border-slate-200 dark:border-slate-700'}`}>
                        <input
                          type="radio"
                          name="pdv_type"
                          value="NON_FISCAL"
                          className="sr-only"
                          checked={settings.pdv_type === 'NON_FISCAL'}
                          onChange={() => setSettings({ ...settings, pdv_type: 'NON_FISCAL' })}
                        />
                        <div className="flex w-full items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`flex h-10 w-10 items-center justify-center rounded-full ${settings.pdv_type === 'NON_FISCAL' ? 'bg-[var(--color-primary-base)]/20 text-[var(--color-primary-base)]' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                              <Store className="h-5 w-5" />
                            </div>
                            <div className="text-sm">
                              <p className={`font-medium ${settings.pdv_type === 'NON_FISCAL' ? 'text-[var(--color-primary-base)]' : 'text-slate-900 dark:text-white'}`}>PDV Não-Fiscal</p>
                              <p className="text-slate-500 dark:text-slate-400 mt-0.5 whitespace-normal break-words pr-4">Gerencie vendas como pedidos internos.</p>
                            </div>
                          </div>
                          <div className={`flex h-5 w-5 items-center justify-center rounded-full border shrink-0 ${settings.pdv_type === 'NON_FISCAL' ? 'border-[var(--color-primary-base)] bg-[var(--color-primary-base)]' : 'border-slate-300 dark:border-slate-600'}`}>
                            {settings.pdv_type === 'NON_FISCAL' && <div className="h-2 w-2 rounded-full bg-white" />}
                          </div>
                        </div>
                      </label>

                      <label className={`relative flex cursor-pointer rounded-xl border p-4 transition-all hover:bg-slate-50 dark:hover:bg-slate-800/50 opacity-60`}>
                        <input
                          type="radio"
                          name="pdv_type"
                          value="FISCAL"
                          disabled
                          className="sr-only"
                          checked={settings.pdv_type === 'FISCAL'}
                          onChange={() => setSettings({ ...settings, pdv_type: 'FISCAL' })}
                        />
                        <div className="flex w-full items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                              <Receipt className="h-5 w-5" />
                            </div>
                            <div className="text-sm relative">
                              <p className="font-medium text-slate-900 dark:text-white flex items-center gap-2">
                                PDV Fiscal
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800">EM BREVE</span>
                              </p>
                              <p className="text-slate-500 dark:text-slate-400 mt-0.5">Emissão automática de NFC-e.</p>
                            </div>
                          </div>
                          <div className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 dark:border-slate-600 shrink-0" />
                        </div>
                      </label>
                    </div>
                  </div>
                  
                  {/* Estoque e Backorder */}
                  <div className="space-y-4 pt-2">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800/60 pb-3">
                      <div className="flex items-center gap-2">
                        <div className="p-2 bg-slate-500/10 text-slate-600 dark:text-slate-400 rounded-lg">
                          <Store className="h-5 w-5" />
                        </div>
                        <div>
                          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Configurações de Estoque</h2>
                          <p className="text-sm text-slate-500 dark:text-slate-400">Regras para produtos sem saldo disponível no ERP (Encomendas).</p>
                        </div>
                      </div>
                      <label className="relative flex items-center cursor-pointer shrink-0">
                        <span className="mr-3 text-sm font-medium text-slate-700 dark:text-slate-300">Aceitar Encomendas</span>
                        <div className="relative">
                          <input type="checkbox" className="sr-only peer" checked={settings.allow_backorder} onChange={e => setSettings({ ...settings, allow_backorder: e.target.checked })} />
                          <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500 dark:bg-slate-700 dark:border-slate-600"></div>
                        </div>
                      </label>
                    </div>

                    {settings.allow_backorder && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-1.5 pt-2">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">
                          Qtd. Máxima para Encomendar no Portal B2B / B2C
                          <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded ml-2 dark:bg-slate-800 dark:text-slate-400">Por Item</span>
                        </label>
                        <input
                          type="number"
                          min="0"
                          className="w-full max-w-sm bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-all text-sm placeholder:text-slate-400 dark:bg-slate-900/50 dark:border-slate-700 dark:text-white dark:focus:ring-amber-500/50 dark:placeholder:text-slate-600"
                          placeholder="Ex: 50 ou 0 para ilimitado"
                          value={settings.max_backorder_qty === 0 ? '' : settings.max_backorder_qty}
                          onChange={e => setSettings({ ...settings, max_backorder_qty: parseInt(e.target.value) || 0 })}
                        />
                        <p className="text-xs text-slate-500 mt-1 max-w-sm">
                          Se configurado como 0, o cliente poderá encomendar quantidades ilimitadas de itens sem estoque.
                        </p>
                      </motion.div>
                    )}
                    
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-t border-slate-100 dark:border-slate-800/60 pt-4 mt-2">
                      <div className="flex items-center gap-2">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">Exclusivo: Caixa Local</h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Permite adicionar livros sem saldo no carrinho do sistema de PDV Local.</p>
                        </div>
                      </div>
                      <label className="relative flex items-center cursor-pointer shrink-0">
                        <span className="mr-3 text-sm font-medium text-indigo-600 dark:text-indigo-400">Vender sem Saldo no PDV</span>
                        <div className="relative">
                          <input type="checkbox" className="sr-only peer" checked={settings.pdv_allow_out_of_stock} onChange={e => setSettings({ ...settings, pdv_allow_out_of_stock: e.target.checked })} />
                          <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500 dark:bg-slate-700 dark:border-slate-600"></div>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab: PAGAMENTOS */}
              {activeTab === 'pagamentos' && (
                <div className="space-y-8 animate-in fade-in">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800/60 pb-3">
                      <div className="p-2 bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-lg">
                        <CreditCard className="h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Opções de Checkout</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Adquirentes e processadores de pagamento da Loja Virtual.</p>
                      </div>
                    </div>

                    <div className="space-y-1.5 md:w-1/2">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Provedor Principal (Ativo)</label>
                      <select
                        value={settings.payment_gateway_active}
                        onChange={e => setSettings({ ...settings, payment_gateway_active: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500 transition-all font-medium text-sm dark:bg-slate-900/50 dark:border-slate-700 dark:text-white dark:focus:ring-rose-500/50"
                      >
                        <option value="EFI">Efí Pay (Boleto/Pix)</option>
                        <option value="CIELO">Cielo E-commerce</option>
                        <option value="REDE">Rede / Itaú</option>
                        <option value="VINDI">Vindi Pagamentos</option>
                      </select>
                    </div>

                    {settings.payment_gateway_active === 'CIELO' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 animate-in fade-in slide-in-from-top-2">
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Merchant ID</label>
                          <input type="text" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:ring-2 focus:ring-rose-500 font-mono text-sm dark:bg-slate-900/50 dark:border-slate-700 dark:text-white" value={settings.cielo_merchant_id} onChange={e => setSettings({...settings, cielo_merchant_id: e.target.value})} />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Client ID</label>
                          <input type="text" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:ring-2 focus:ring-rose-500 font-mono text-sm dark:bg-slate-900/50 dark:border-slate-700 dark:text-white" value={settings.cielo_client_id} onChange={e => setSettings({...settings, cielo_client_id: e.target.value})} />
                        </div>
                        <div className="space-y-1.5 md:col-span-2">
                          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Client Secret</label>
                          <input type="password" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:ring-2 focus:ring-rose-500 font-mono text-sm dark:bg-slate-900/50 dark:border-slate-700 dark:text-white" value={settings.cielo_client_secret} onChange={e => setSettings({...settings, cielo_client_secret: e.target.value})} />
                        </div>
                      </div>
                    )}

                    {settings.payment_gateway_active === 'REDE' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 animate-in fade-in slide-in-from-top-2">
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">PV (Ponto de Venda)</label>
                          <input type="text" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:ring-2 focus:ring-rose-500 font-mono text-sm dark:bg-slate-900/50 dark:border-slate-700 dark:text-white" value={settings.rede_pv} onChange={e => setSettings({...settings, rede_pv: e.target.value})} />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Token</label>
                          <input type="password" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:ring-2 focus:ring-rose-500 font-mono text-sm dark:bg-slate-900/50 dark:border-slate-700 dark:text-white" value={settings.rede_token} onChange={e => setSettings({...settings, rede_token: e.target.value})} />
                        </div>
                      </div>
                    )}

                    {settings.payment_gateway_active === 'VINDI' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 animate-in fade-in slide-in-from-top-2">
                        <div className="space-y-1.5 md:col-span-2">
                          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">API Key (Chave Privada)</label>
                          <input type="password" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:ring-2 focus:ring-rose-500 font-mono text-sm dark:bg-slate-900/50 dark:border-slate-700 dark:text-white" value={settings.vindi_api_key} onChange={e => setSettings({...settings, vindi_api_key: e.target.value})} />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4 pt-6 border-t border-slate-100 dark:border-slate-800/60">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60 pb-3">
                      <div className="flex items-center gap-2">
                        <div className="p-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg">
                          <Receipt className="h-5 w-5" />
                        </div>
                        <div>
                          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Efí Bank (Boleto/Pix)</h2>
                          <p className="text-sm text-slate-500 dark:text-slate-400">Credenciais para emissão de Pix e Boletos.</p>
                        </div>
                      </div>
                      <label className="relative flex items-center cursor-pointer shrink-0">
                        <span className="mr-3 text-sm font-bold text-emerald-600 dark:text-emerald-400 uppercase">Sandbox</span>
                        <div className="relative">
                          <input type="checkbox" className="sr-only peer" checked={settings.efi_sandbox} onChange={e => setSettings({ ...settings, efi_sandbox: e.target.checked })} />
                          <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 dark:bg-slate-700 dark:border-slate-600"></div>
                        </div>
                      </label>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Client ID</label>
                        <input
                          type="text"
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-mono text-sm placeholder:text-slate-400 dark:bg-slate-900/50 dark:border-slate-700 dark:text-white dark:focus:ring-emerald-500/50"
                          placeholder="Client_Id_..."
                          value={settings.efi_client_id}
                          onChange={e => setSettings({ ...settings, efi_client_id: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Client Secret</label>
                        <input
                          type="password"
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-mono text-sm placeholder:text-slate-400 dark:bg-slate-900/50 dark:border-slate-700 dark:text-white dark:focus:ring-emerald-500/50"
                          placeholder="Client_Secret_..."
                          value={settings.efi_client_secret}
                          onChange={e => setSettings({ ...settings, efi_client_secret: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">
                          Identificador de Conta (Payee Code)
                        </label>
                        <input
                          type="text"
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-mono text-sm placeholder:text-slate-400 dark:bg-slate-900/50 dark:border-slate-700 dark:text-white dark:focus:ring-emerald-500/50"
                          placeholder="Ex: 57C2..."
                          value={settings.efi_payee_code}
                          onChange={e => setSettings({ ...settings, efi_payee_code: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center justify-between">
                          <span>Certificado (.p12 / .pem)</span>
                          {uploadingCert && <Loader2 className="h-3 w-3 animate-spin text-emerald-500" />}
                        </label>
                        <div className="flex flex-col gap-2">
                          <input
                            type="file"
                            accept=".p12,.pem"
                            onChange={handleCertificateUpload}
                            disabled={uploadingCert}
                            className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 dark:file:bg-emerald-900/30 dark:file:text-emerald-400 dark:hover:file:bg-emerald-900/50 disabled:opacity-50"
                          />
                          {settings.efi_certificate_path && (
                            <p className="text-xs text-slate-500 font-mono truncate" title={settings.efi_certificate_path}>
                              Salvo em: {settings.efi_certificate_path}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* BANCO INTER INTEGRATION */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 dark:bg-slate-800/50 dark:border-slate-700 mt-6">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center dark:bg-orange-900/40">
                        <Building2 className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-slate-800 dark:text-white">Banco Inter (Boletos)</h3>
                        <p className="text-sm text-slate-500 font-medium">Emissão e conciliação automática de boletos bancários</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" checked={settings.inter_enabled} onChange={e => setSettings({ ...settings, inter_enabled: e.target.checked })} />
                        <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-300 rounded-full peer dark:bg-slate-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                      </label>
                    </div>

                    {settings.inter_enabled && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-top-4 relative">
                        <div className="absolute -left-6 top-0 bottom-0 w-1 bg-orange-500 rounded-r-md"></div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Conta Corrente (Opcional)</label>
                            <input type="text" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all font-mono text-sm placeholder:text-slate-400 dark:bg-slate-900/50 dark:border-slate-700 dark:text-white dark:focus:ring-orange-500/50" placeholder="Ex: 1234567-8" value={settings.inter_account_number} onChange={e => setSettings({ ...settings, inter_account_number: e.target.value })} />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium text-slate-700 block">Ambiente</label>
                            <div className="flex bg-slate-200 p-1 rounded-xl">
                              <button type="button" onClick={() => setSettings({...settings, inter_sandbox: true})} className={`flex-1 py-1.5 text-sm font-bold rounded-lg transition-all ${settings.inter_sandbox ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Sandbox (Homol)</button>
                              <button type="button" onClick={() => setSettings({...settings, inter_sandbox: false})} className={`flex-1 py-1.5 text-sm font-bold rounded-lg transition-all ${!settings.inter_sandbox ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Produção REAL</button>
                            </div>
                          </div>
                          <div className="space-y-1.5 md:col-span-2">
                            <label className="text-sm font-medium text-slate-700 block">Motor de Emissão (API)</label>
                            <div className="flex bg-slate-200 p-1 rounded-xl">
                              <button type="button" onClick={() => setSettings({...settings, inter_api_version: 'V2'})} className={`flex-1 py-1.5 text-sm font-bold rounded-lg transition-all ${settings.inter_api_version === 'V2' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>V2 Clássica (Síncrono)</button>
                              <button type="button" onClick={() => setSettings({...settings, inter_api_version: 'V3'})} className={`flex-1 py-1.5 text-sm font-bold rounded-lg transition-all ${settings.inter_api_version === 'V3' ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>V3 BolePix (Assíncrono)</button>
                            </div>
                          </div>
                          
                          <div className="space-y-1.5 md:col-span-2">
                            <label className="text-sm font-medium text-slate-700 block">Client ID</label>
                            <input type="text" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 font-mono text-sm" placeholder="Client_Id" value={settings.inter_client_id} onChange={e => setSettings({ ...settings, inter_client_id: e.target.value })} />
                          </div>
                          <div className="space-y-1.5 md:col-span-2">
                            <label className="text-sm font-medium text-slate-700 block">Client Secret</label>
                            <input type="password" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 font-mono text-sm" placeholder="Client_Secret" value={settings.inter_client_secret} onChange={e => setSettings({ ...settings, inter_client_secret: e.target.value })} />
                          </div>
                        </div>

                        <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
                          <h4 className="text-sm font-bold text-orange-900 flex items-center mb-2"><Key className="w-4 h-4 mr-2" /> Certificados de Aplicação (MTLS)</h4>
                          <p className="text-xs text-orange-800 mb-4">Você precisa fazer upload do arquivo <b>.crt</b> e da chave privada <b>.key</b> gerados no portal do Banco Inter.</p>
                          
                          <div className="flex flex-col gap-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="border-2 border-dashed border-orange-300 rounded-xl p-4 bg-white relative hover:bg-orange-50 transition-colors">
                                <input type="file" accept=".crt,.pem" onChange={e => setInterCertFile(e.target.files?.[0] || null)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                                <div className="flex items-center gap-3">
                                  <FileText className="w-8 h-8 text-orange-500" />
                                  <div>
                                    <p className="font-bold text-sm text-slate-700">{interCertFile ? interCertFile.name : 'Clique para enviar .CRT'}</p>
                                  </div>
                                </div>
                              </div>
                              <div className="border-2 border-dashed border-orange-300 rounded-xl p-4 bg-white relative hover:bg-orange-50 transition-colors">
                                <input type="file" accept=".key" onChange={e => setInterKeyFile(e.target.files?.[0] || null)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                                <div className="flex items-center gap-3">
                                  <Key className="w-8 h-8 text-slate-500" />
                                  <div>
                                    <p className="font-bold text-sm text-slate-700">{interKeyFile ? interKeyFile.name : 'Clique para enviar .KEY'}</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <button type="button" onClick={handleInterCertUpload} disabled={!interCertFile || !interKeyFile} className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 font-bold rounded-lg text-sm w-full md:w-auto">Enviar e Validar Certificados</button>
                          </div>
                          
                          {settings.inter_cert_path && (
                            <div className="mt-4 flex items-center gap-2 text-xs font-bold text-emerald-600 bg-emerald-50 py-1.5 px-3 rounded-lg w-fit border border-emerald-200">
                              <CheckCircle className="w-4 h-4" /> Certificados ativos e salvos no servidor
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab: FRETE */}
              {activeTab === 'frete' && (
                <div className="space-y-4 animate-in fade-in">
                  <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800/60 pb-3">
                    <div className="p-2 bg-teal-500/10 text-teal-600 dark:text-teal-400 rounded-lg">
                      <Truck className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Gateway de Fretes</h2>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Integrações de cálculo logístico e transportadoras.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Provedor Principal</label>
                      <select
                        value={settings.freight_gateway_active}
                        onChange={e => setSettings({ ...settings, freight_gateway_active: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all font-medium text-sm dark:bg-slate-900/50 dark:border-slate-700 dark:text-white dark:focus:ring-teal-500/50"
                      >
                        <option value="CORREIOS">Correios (Web Services)</option>
                        <option value="FRENET">Frenet</option>
                        <option value="JADLOG">Jadlog Interativo</option>
                        <option value="TRAY">Tray Envios</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">CEP de Origem</label>
                      <input type="text" maxLength={9} placeholder="00000-000" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:ring-2 focus:ring-teal-500 font-mono text-sm dark:bg-slate-900/50 dark:border-slate-700 dark:text-white" value={settings.origin_zip_code} onChange={e => setSettings({...settings, origin_zip_code: e.target.value})} />
                    </div>
                  </div>

                  {settings.freight_gateway_active === 'CORREIOS' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 animate-in fade-in slide-in-from-top-2">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Usuário Correios (Opcional)</label>
                        <input type="text" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:ring-2 focus:ring-teal-500 font-mono text-sm dark:bg-slate-900/50 dark:border-slate-700 dark:text-white" value={settings.correios_user} onChange={e => setSettings({...settings, correios_user: e.target.value})} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Senha Correios / Token</label>
                        <input type="password" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:ring-2 focus:ring-teal-500 font-mono text-sm dark:bg-slate-900/50 dark:border-slate-700 dark:text-white" value={settings.correios_password} onChange={e => setSettings({...settings, correios_password: e.target.value})} />
                      </div>
                    </div>
                  )}

                  {settings.freight_gateway_active === 'FRENET' && (
                    <div className="grid grid-cols-1 gap-4 mt-4 animate-in fade-in slide-in-from-top-2">
                      <div className="space-y-1.5 md:w-1/2">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Token API Frenet</label>
                        <input type="password" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:ring-2 focus:ring-teal-500 font-mono text-sm dark:bg-slate-900/50 dark:border-slate-700 dark:text-white" value={settings.frenet_token} onChange={e => setSettings({...settings, frenet_token: e.target.value})} />
                      </div>
                    </div>
                  )}

                  {settings.freight_gateway_active === 'JADLOG' && (
                    <div className="grid grid-cols-1 gap-4 mt-4 animate-in fade-in slide-in-from-top-2">
                      <div className="space-y-1.5 md:w-1/2">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Token Integração Jadlog</label>
                        <input type="password" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:ring-2 focus:ring-teal-500 font-mono text-sm dark:bg-slate-900/50 dark:border-slate-700 dark:text-white" value={settings.jadlog_token} onChange={e => setSettings({...settings, jadlog_token: e.target.value})} />
                      </div>
                    </div>
                  )}

                  {settings.freight_gateway_active === 'TRAY' && (
                    <div className="grid grid-cols-1 gap-4 mt-4 animate-in fade-in slide-in-from-top-2">
                      <div className="space-y-1.5 md:w-1/2">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Token Tray Envios</label>
                        <input type="password" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:ring-2 focus:ring-teal-500 font-mono text-sm dark:bg-slate-900/50 dark:border-slate-700 dark:text-white" value={settings.tray_envios_token} onChange={e => setSettings({...settings, tray_envios_token: e.target.value})} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab: EMAIL */}
              {activeTab === 'print_points' && (
                  <PrintPointsTab />
              )}

              {activeTab === 'email' && (
                <div className="space-y-4 animate-in fade-in">
                  <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800/60 pb-3">
                    <div className="p-2 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-lg">
                      <Mail className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">E-mails Transacionais (SMTP)</h2>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Credenciais para envio de comprovantes, resets de senha e notificações de clientes.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div className="space-y-1.5 md:col-span-2 lg:col-span-1">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Host SMTP</label>
                      <input
                        type="text"
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono text-sm placeholder:text-slate-400 dark:bg-slate-900/50 dark:border-slate-700 dark:text-white dark:focus:ring-indigo-500/50"
                        placeholder="smtp.seudominio.com.br"
                        value={settings.smtp_host}
                        onChange={e => setSettings({ ...settings, smtp_host: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Porta</label>
                      <input
                        type="number"
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono text-sm placeholder:text-slate-400 dark:bg-slate-900/50 dark:border-slate-700 dark:text-white dark:focus:ring-indigo-500/50"
                        placeholder="587 ou 465"
                        value={settings.smtp_port}
                        onChange={e => setSettings({ ...settings, smtp_port: parseInt(e.target.value) || 587 })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">E-mail Remetente (De/From)</label>
                      <input
                        type="email"
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono text-sm placeholder:text-slate-400 dark:bg-slate-900/50 dark:border-slate-700 dark:text-white dark:focus:ring-indigo-500/50"
                        placeholder="contato@seudominio.com.br"
                        value={settings.smtp_from_email}
                        onChange={e => setSettings({ ...settings, smtp_from_email: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Usuário SMTP</label>
                      <input
                        type="text"
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono text-sm placeholder:text-slate-400 dark:bg-slate-900/50 dark:border-slate-700 dark:text-white dark:focus:ring-indigo-500/50"
                        placeholder="seu_usuario"
                        value={settings.smtp_username}
                        onChange={e => setSettings({ ...settings, smtp_username: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Senha SMTP</label>
                      <input
                        type="password"
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono text-sm placeholder:text-slate-400 dark:bg-slate-900/50 dark:border-slate-700 dark:text-white dark:focus:ring-indigo-500/50"
                        placeholder="********"
                        value={settings.smtp_password}
                        onChange={e => setSettings({ ...settings, smtp_password: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              )}

            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-200 dark:bg-slate-900/60 dark:border-slate-800/60 flex items-center justify-end">
              <button
                type="submit"
                disabled={saving}
                className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-semibold py-3 px-8 rounded-xl transition-all shadow-lg shadow-[var(--color-primary-base)]/20 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2"
              >
                {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                Salvar Configurações ({tabs.find(t => t.id === activeTab)?.label})
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
