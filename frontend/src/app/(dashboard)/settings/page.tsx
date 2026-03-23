'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Settings2, Loader2, Save, Store, MonitorSmartphone, Receipt, Mail } from 'lucide-react';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingCert, setUploadingCert] = useState(false);
  const currentUser = getUser();
  const companyId = currentUser?.company_id;

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
      }));
    } catch (error) {
      toast.error('Erro ao carregar as configurações.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId) return;
    setSaving(true);
    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(settings)
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

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary-base)]" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <Settings2 className="h-6 w-6 text-[var(--color-primary-base)]" />
          Configurações da Empresa
        </h1>
        <p className="text-slate-500 text-sm mt-1 dark:text-slate-400">
          Gerencie as preferências e parâmetros operacionais do seu negócio.
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:bg-slate-900/40 dark:border-slate-800"
      >
        <form onSubmit={handleSaveSettings}>
          <div className="p-6 md:p-8 space-y-8">
            {/* Seção PDV */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800/60 pb-3">
                <div className="p-2 bg-[var(--color-primary-base)]/10 text-[var(--color-primary-base)] rounded-lg">
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
                        <p className="text-slate-500 dark:text-slate-400 mt-0.5 whitespace-normal break-words pr-4">Gerencie vendas como pedidos internos, sem emissão direta de NFC-e pela plataforma.</p>
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
                          PDV Frente de Caixa Fiscal
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800">EM BREVE</span>
                        </p>
                        <p className="text-slate-500 dark:text-slate-400 mt-0.5">Emissão automática de Cupom Fiscal Eletrônico (NFC-e e SAT).</p>
                      </div>
                    </div>
                    <div className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 dark:border-slate-600 shrink-0" />
                  </div>
                </label>
              </div>
            </div>


            
            {/* Configurações de Estoque B2B */}
            <div className="space-y-4 pt-6 border-t border-slate-100 dark:border-slate-800/60">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800/60 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-lg">
                    <Store className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Configurações de Estoque do PDV</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Regras de negócio para produtos sem saldo disponível no ERP (Encomendas).</p>
                  </div>
                </div>
                <label className="relative flex items-center cursor-pointer shrink-0">
                  <span className="mr-3 text-sm font-medium text-slate-700 dark:text-slate-300">Vender sem Saldo / Encomendar no B2B</span>
                  <div className="relative">
                    <input type="checkbox" className="sr-only peer" checked={settings.allow_backorder} onChange={e => setSettings({ ...settings, allow_backorder: e.target.checked })} />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500 dark:bg-slate-700 dark:border-slate-600"></div>
                  </div>
                </label>
              </div>

              {settings.allow_backorder && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-1.5 pt-2">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">
                    Qtd. Máxima para Encomendar no Portal B2B
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
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">Exclusivo PDV</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Permite adicionar livros sem saldo no carrinho do sistema de PDV local.</p>
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

            {/* Configurações de Pagamento (Efí) */}
            <div className="space-y-4 pt-6 border-t border-slate-100 dark:border-slate-800/60">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg">
                    <Receipt className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Pagamentos & Assinaturas (Efí)</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Credenciais para tokenização e cobrança recorrente.</p>
                  </div>
                </div>
                <label className="relative flex items-center cursor-pointer shrink-0">
                  <span className="mr-3 text-sm font-bold text-emerald-600 dark:text-emerald-400 uppercase">Modo Sandbox</span>
                  <div className="relative">
                    <input type="checkbox" className="sr-only peer" checked={settings.efi_sandbox} onChange={e => setSettings({ ...settings, efi_sandbox: e.target.checked })} />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 dark:bg-slate-700 dark:border-slate-600"></div>
                  </div>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    placeholder="Ex: 57C2... (Utilizado no Javascript)"
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

            {/* Configurações de SMTP (E-mail Transacional) */}
            <div className="space-y-4 pt-6 border-t border-slate-100 dark:border-slate-800/60">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-lg">
                    <Mail className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">E-mails Transacionais (SMTP)</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Credenciais para envio de comprovantes, resets de senha e notificações de clientes.</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

            {/* Configurações Gerais */}
            <div className="space-y-4 pt-6 border-t border-slate-100 dark:border-slate-800/60">
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
            </div>
          </div>

          <div className="p-6 bg-slate-50 border-t border-slate-200 dark:bg-slate-900/60 dark:border-slate-800/60 flex items-center justify-end">
            <button
              type="submit"
              disabled={saving}
              className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-semibold py-3 px-8 rounded-xl transition-all shadow-lg shadow-[var(--color-primary-base)]/20 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2"
            >
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
              Salvar Parâmetros
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
