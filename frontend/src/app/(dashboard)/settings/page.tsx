'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings2, Loader2, Save, Store, MonitorSmartphone, Receipt, Mail, Database, DatabaseZap, Building2, CreditCard, Truck, ChevronRight, ChevronDown, FileText, Key, CheckCircle, BookOpen, Package } from 'lucide-react';
import Link from 'next/link';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';
import { PrintPointsTab } from './PrintPointsTab';
import { EmailTemplatesTab } from './EmailTemplatesTab';
import { HorusTab } from './HorusTab';
import { HorusSQLTab } from './HorusSQLTab';
import { BookinfoTab } from './BookinfoTab';
import { SefazBranchesTab } from './SefazBranchesTab';
import { DropshipTab } from './DropshipTab';
import { LogisticsTab } from './LogisticsTab';
import { useCompany } from './context';
import { CurrencyInput } from '@/components/CurrencyInput';
import CoraSettingsPanel from '@/components/payments/CoraSettingsPanel';
import { B2CCheckoutModeSelector, SellerPaymentRoutingMatrix, VindiCheckoutPanel } from './B2CCheckoutSettings';

export default function SettingsPage() {
  const { company } = useCompany();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingCert, setUploadingCert] = useState(false);
  const currentUser = getUser();
  const companyId = currentUser?.company_id;

  const [activeTab, setActiveTab] = useState('geral');
  const [openMenuGroups, setOpenMenuGroups] = useState<Record<string, boolean>>({
    '1. Operações & Canais': true,
    '2. ERP & Catálogo': true,
    '3. Fiscal & Notas': true,
    '4. Comunicação': true,
  });
  const [selectedOperationHub, setSelectedOperationHub] = useState<'B2C' | 'B2B' | 'PDV' | 'HORUS' | 'EVENTS' | 'FISCAL'>('B2C');
  const [selectedProviderTab, setSelectedProviderTab] = useState<'VINDI' | 'CORA' | 'INTER' | 'EFI' | 'CIELO_REDE' | null>(null);
  useEffect(() => {
    // Atalho de outras telas: /settings?tab=pagamentos&provider=VINDI
    const params = new URLSearchParams(window.location.search);
    const t = params.get('tab');
    const p = params.get('provider') as 'VINDI' | 'CORA' | 'INTER' | 'EFI' | 'CIELO_REDE' | null;
    if (t) setActiveTab(t);
    if (p && ['VINDI', 'CORA', 'INTER', 'EFI', 'CIELO_REDE'].includes(p)) setSelectedProviderTab(p);
  }, []);
  const [testEmail, setTestEmail] = useState('');
  const [testingSmtp, setTestingSmtp] = useState(false);

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
    pdv_max_installments: 12,
    pdv_min_installment_amount: 5.0,
    cover_image_base_url: '',
    cover_image_secondary_base_url: '',
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
    smtp_bcc_email: '',
    smtp_use_ssl: false,
    payment_gateway_active: 'EFI',
    cielo_client_id: '',
    cielo_client_secret: '',
    cielo_merchant_id: '',
    rede_pv: '',
    rede_token: '',
    vindi_api_key: '',
    vindi_sandbox: true,
    vindi_integration_mode: 'TRANSPARENT',
    vindi_express_cpf_only: true,
    vindi_max_installments: 6,
    vindi_allow_pix: true,
    vindi_allow_credit_card: true,
    vindi_allow_boleto: false,
    vindi_postal_code_seller: '01001000',
    vindi_reseller_token: '',
    vindi_consumer_key: '',
    vindi_consumer_secret: '',
    vindi_access_token: '',
    vindi_return_url: '',
    b2c_checkout_mode: 'NATIVE_GATEWAY',
    tray_enabled: false,
    b2c_showcases_config: null as any,
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
        pdv_max_installments: data.pdv_max_installments ?? 12,
        pdv_min_installment_amount: data.pdv_min_installment_amount ?? 5.0,
        cover_image_base_url: data.cover_image_base_url || '',
        cover_image_secondary_base_url: data.cover_image_secondary_base_url || '',
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
        smtp_bcc_email: data.smtp_bcc_email || '',
        smtp_use_ssl: data.smtp_use_ssl || false,
        payment_gateway_active:
          data.b2c_showcases_config?.payment_channel_modes?.B2C_STOREFRONT?.mode === 'PAYMENT_LINK' ||
          data.b2c_showcases_config?.vindi_config?.integration_mode === 'PAYMENT_LINK'
            ? data.b2c_showcases_config?.payment_channel_modes?.B2C_STOREFRONT?.link_provider || 'VINDI'
            : data.payment_gateway_active || 'EFI',
        cielo_client_id: data.cielo_client_id || '',
        cielo_client_secret: data.cielo_client_secret || '',
        cielo_merchant_id: data.cielo_merchant_id || '',
        rede_pv: data.rede_pv || '',
        rede_token: data.rede_token || '',
        vindi_api_key: data.vindi_api_key || '',
        vindi_sandbox: data.b2c_showcases_config?.vindi_config?.sandbox !== false,
        vindi_integration_mode:
          data.b2c_showcases_config?.payment_channel_modes?.B2C_STOREFRONT?.mode === 'PAYMENT_LINK'
            ? 'PAYMENT_LINK'
            : data.b2c_showcases_config?.vindi_config?.integration_mode || 'TRANSPARENT',
        vindi_express_cpf_only:
          data.b2c_showcases_config?.payment_channel_modes?.B2C_STOREFRONT?.express_cpf_only !== undefined
            ? data.b2c_showcases_config.payment_channel_modes.B2C_STOREFRONT.express_cpf_only !== false
            : data.b2c_showcases_config?.vindi_config?.express_cpf_only !== false,
        vindi_max_installments: Number(data.b2c_showcases_config?.vindi_config?.max_installments || 6),
        vindi_allow_pix: data.b2c_showcases_config?.vindi_config?.allow_pix !== false,
        vindi_allow_credit_card: data.b2c_showcases_config?.vindi_config?.allow_credit_card !== false,
        vindi_allow_boleto: Boolean(data.b2c_showcases_config?.vindi_config?.allow_boleto),
        vindi_postal_code_seller: data.b2c_showcases_config?.vindi_config?.postal_code_seller || data.origin_zip_code || '01001000',
        vindi_reseller_token: data.b2c_showcases_config?.vindi_config?.reseller_token || '',
        vindi_consumer_key: data.b2c_showcases_config?.vindi_config?.consumer_key || '',
        vindi_consumer_secret: data.b2c_showcases_config?.vindi_config?.consumer_secret || '',
        vindi_access_token: data.b2c_showcases_config?.vindi_config?.access_token || '',
        vindi_return_url: data.b2c_showcases_config?.vindi_config?.return_url || '',
        b2c_checkout_mode: data.b2c_checkout_mode || 'NATIVE_GATEWAY',
        tray_enabled: Boolean(data.tray_enabled),
        b2c_showcases_config: data.b2c_showcases_config || null,
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
        horus_sql_enabled: data.horus_sql_enabled || false,
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
      const pendingHubModes = payloadSettings._hub_channel_modes;
      const pendingHubRoutes = payloadSettings._hub_routes;
      const pendingHubChannels = payloadSettings._hub_channels;
      delete payloadSettings._hub_channel_modes;
      delete payloadSettings._hub_routes;
      delete payloadSettings._hub_channels;
      delete payloadSettings.inter_cert_path;
      delete payloadSettings.inter_key_path;
      delete payloadSettings.efi_certificate_path;
      // tray_enabled é gerido na integração Tray; aqui é apenas leitura
      delete payloadSettings.tray_enabled;

      // Se o usuário alterou o Passo 1 (Matriz de Canais / Link no Fim da Venda) e clicou no Salvar Geral da página, persiste as rotas do Hub também
      if (pendingHubModes && Array.isArray(pendingHubChannels)) {
        try {
          const routeItems: Array<{ channel: string; method: string; provider: string | null }> = [];
          pendingHubChannels.forEach((ch: any) => {
            const chMode = pendingHubModes[ch.code]?.mode || 'PER_METHOD';
            (ch.methods || []).forEach((m: string) => {
              let prov = pendingHubRoutes?.[ch.code]?.[m] || null;
              if (chMode === 'PAYMENT_LINK' && m === 'LINK') {
                prov = pendingHubModes[ch.code]?.link_provider || 'VINDI';
              }
              routeItems.push({ channel: ch.code, method: m, provider: prov });
            });
          });
          await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/payments/routes`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              routes: routeItems,
              channel_modes: pendingHubModes,
            }),
          });
        } catch (hubErr) {
          console.error('Erro ao sincronizar rotas do Hub:', hubErr);
        }
      }

      // Configurações de Link / Sandbox da Vindi ficam em b2c_showcases_config.vindi_config (preserva o restante do JSON e sincroniza payment_channel_modes)
      const existingChannelModes =
        pendingHubModes ||
        settings.b2c_showcases_config?.payment_channel_modes ||
        {};
      const b2cTargetMode =
        settings.b2c_checkout_mode === 'TRAY_REDIRECT'
          ? 'TRAY_REDIRECT'
          : (settings.vindi_integration_mode || 'TRANSPARENT') === 'PAYMENT_LINK' ||
            existingChannelModes.B2C_STOREFRONT?.mode === 'PAYMENT_LINK'
          ? 'PAYMENT_LINK'
          : 'PER_METHOD';
      if (b2cTargetMode === 'PAYMENT_LINK') {
        payloadSettings.payment_gateway_active = existingChannelModes.B2C_STOREFRONT?.link_provider || 'VINDI';
      }
      payloadSettings.b2c_showcases_config = {
        ...(settings.b2c_showcases_config || {}),
        payment_channel_modes: {
          ...existingChannelModes,
          B2C_STOREFRONT: {
            ...(existingChannelModes.B2C_STOREFRONT || {}),
            mode: b2cTargetMode,
            link_provider: existingChannelModes.B2C_STOREFRONT?.link_provider || 'VINDI',
            express_cpf_only: settings.vindi_express_cpf_only !== false,
          },
        },
        vindi_config: {
          ...(settings.b2c_showcases_config?.vindi_config || {}),
          sandbox: Boolean(settings.vindi_sandbox),
          integration_mode: settings.vindi_integration_mode || 'TRANSPARENT',
          express_cpf_only: settings.vindi_express_cpf_only !== false,
          max_installments: Number(settings.vindi_max_installments || 6),
          allow_pix: settings.vindi_allow_pix !== false,
          allow_credit_card: settings.vindi_allow_credit_card !== false,
          allow_boleto: Boolean(settings.vindi_allow_boleto),
          postal_code_seller: (settings.vindi_postal_code_seller || '01001000').replace(/\D/g, '') || '01001000',
          reseller_token: (settings.vindi_reseller_token || '').trim(),
          consumer_key: (settings.vindi_consumer_key || '').trim(),
          consumer_secret: (settings.vindi_consumer_secret || '').trim(),
          access_token: (settings.vindi_access_token || '').trim(),
          return_url: (settings.vindi_return_url || '').trim(),
        },
      };
      delete payloadSettings.vindi_sandbox;
      delete payloadSettings.vindi_integration_mode;
      delete payloadSettings.vindi_express_cpf_only;
      delete payloadSettings.vindi_max_installments;
      delete payloadSettings.vindi_allow_pix;
      delete payloadSettings.vindi_allow_credit_card;
      delete payloadSettings.vindi_allow_boleto;
      delete payloadSettings.vindi_postal_code_seller;
      delete payloadSettings.vindi_reseller_token;
      delete payloadSettings.vindi_consumer_key;
      delete payloadSettings.vindi_consumer_secret;
      delete payloadSettings.vindi_access_token;
      delete payloadSettings.vindi_return_url;

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

  const handleTestSmtp = async () => {
    if (!testEmail) return toast.error('Digite o e-mail de teste.');
    setTestingSmtp(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/dashboard/smtp-test`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ to_email: testEmail })
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || 'Erro ao enviar e-mail');
      }
      toast.success('E-mail enviado com sucesso! Verifique sua caixa de entrada.');
      setTestEmail('');
    } catch(err: any) {
      toast.error(err.message);
    } finally {
      setTestingSmtp(false);
    }
  };

  const hasHorusSql = Boolean(company?.module_horus_sql || (settings as any).horus_sql_enabled);

  const tabGroups = [
    {
      group: '1. Operações & Canais',
      items: [
        { id: 'geral', label: 'Central de Operações', icon: Settings2, activeStatus: true },
        { id: 'pagamentos', label: 'Pagamentos & Gateways', icon: CreditCard, activeStatus: Boolean(settings.vindi_api_key || settings.efi_client_id || settings.inter_enabled || settings.cielo_merchant_id) },
        { id: 'pdv', label: 'Frente de Caixa (PDV)', icon: Store, activeStatus: Boolean(company?.module_pdv) },
        { id: 'frete', label: 'Frete e Logística', icon: Truck, activeStatus: Boolean(settings.origin_zip_code) },
      ],
    },
    {
      group: '2. ERP & Catálogo',
      items: [
        ...(company?.module_horus_erp ? [{ id: 'horus', label: 'Integração Horus ERP', icon: Database, activeStatus: Boolean((settings as any).horus_enabled) }] : []),
        ...(hasHorusSql ? [{ id: 'horus_sql', label: 'Horus SQL Direct', icon: DatabaseZap, activeStatus: hasHorusSql }] : []),
        { id: 'bookinfo', label: 'Integração Bookinfo', icon: BookOpen, activeStatus: Boolean((settings as any).bookinfo_sync_enabled || (settings as any).bookinfo_api_key) },
        { id: 'dropship', label: 'Dropship Horus', icon: Package, activeStatus: Boolean((company as any)?.module_dropship) },
        ...(hasHorusSql ? [{ id: 'logistics', label: 'Logística WMS', icon: Truck, activeStatus: hasHorusSql }] : []),
      ],
    },
    {
      group: '3. Fiscal & Notas',
      items: [
        { id: 'fiscal', label: 'Fiscal (NFS-e)', icon: Building2, activeStatus: Boolean(fiscalSettings.nfse_enabled) },
        { id: 'sefaz_sp', label: 'Fiscal SEFAZ', icon: Key, activeStatus: true },
        { id: 'print_points', label: 'Séries e Pontos', icon: FileText, activeStatus: printPoints.length > 0 },
      ],
    },
    {
      group: '4. Comunicação',
      items: [
        { id: 'email', label: 'E-mails (SMTP)', icon: Mail, activeStatus: Boolean(settings.smtp_host) },
        { id: 'templates', label: 'Modelos de E-mail', icon: FileText, activeStatus: true },
      ],
    },
  ];

  const tabs = tabGroups.flatMap((g) => g.items);

  const isFormTab = activeTab !== 'templates' && activeTab !== 'print_points' && activeTab !== 'horus' && activeTab !== 'horus_sql' && activeTab !== 'bookinfo' && activeTab !== 'sefaz_sp' && activeTab !== 'dropship' && activeTab !== 'logistics';
  const FormContainer = isFormTab ? 'form' : 'div';

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Settings2 className="h-6 w-6 text-[var(--color-primary-base)]" />
            Central de Operações &amp; Configurações
          </h1>
          <p className="text-slate-500 text-sm mt-1 dark:text-slate-400">
            Selecione a operação que deseja configurar ou navegue pelos módulos classificados ao lado.
          </p>
        </div>
        {activeTab !== 'geral' && (
          <button
            type="button"
            onClick={() => setActiveTab('geral')}
            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 shrink-0 cursor-pointer shadow-sm"
          >
            <Settings2 className="w-3.5 h-3.5 text-[var(--color-primary-base)]" />
            Voltar ao Seletor de Operações
          </button>
        )}
      </div>

      <div className="flex flex-col md:flex-row gap-5 items-start min-w-0">
        {/* Sidebar Menu Organizado por Domínios Operacionais (Expansível) */}
        <div className="w-full md:w-64 shrink-0 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm dark:bg-slate-900/40 dark:border-slate-800 space-y-2">
          {tabGroups.map((grp) => {
            const isOpen = openMenuGroups[grp.group] !== false;
            return (
              <div key={grp.group} className="space-y-1">
                <button
                  type="button"
                  onClick={() => setOpenMenuGroups((p) => ({ ...p, [grp.group]: !isOpen }))}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300 transition-colors cursor-pointer"
                >
                  <span>{grp.group}</span>
                  {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
                {isOpen && (
                  <nav className="space-y-0.5">
                    {grp.items.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all cursor-pointer ${
                          activeTab === tab.id
                            ? 'bg-[var(--color-primary-base)]/10 text-[var(--color-primary-base)] dark:bg-[var(--color-primary-base)]/20 font-bold shadow-xs'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 relative truncate min-w-0">
                          <tab.icon
                            className={`w-4 h-4 shrink-0 ${
                              activeTab === tab.id
                                ? 'text-[var(--color-primary-base)]'
                                : 'text-slate-400 dark:text-slate-500'
                            } transition-colors`}
                          />
                          <span className="truncate">{tab.label}</span>
                        </div>
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ml-2 ${
                            tab.activeStatus
                              ? 'bg-emerald-500'
                              : 'bg-slate-200 dark:bg-slate-700'
                          }`}
                          title={tab.activeStatus ? 'Ativo / Configurado' : 'Opcional / Pendente'}
                        />
                      </button>
                    ))}
                  </nav>
                )}
              </div>
            );
          })}
        </div>

        {/* Content Area */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          key={activeTab}
          className="flex-1 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:bg-slate-900/40 dark:border-slate-800 w-full min-w-0"
        >
          <FormContainer onSubmit={isFormTab ? handleSaveSettings : undefined}>
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

                        <div className="space-y-1.5 md:col-span-2 border-t border-slate-100 dark:border-slate-800/60 pt-4 mt-2">
                          <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block mb-2">
                            Certificado Digital A1 (.pfx)
                          </label>
                          <div className="flex items-center gap-3 w-full">
                            <input
                              type="file"
                              accept=".pfx"
                              onChange={handleNfseCertificateUpload}
                              className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100 dark:file:bg-purple-900/30 dark:file:text-purple-400"
                            />
                            <div className="w-48 shrink-0">
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

              {/* Tab: GERAL — Central de Operações (Seletor por Tipo de Operação + Catálogo Geral) */}
              {activeTab === 'geral' && (
                <div className="space-y-6 animate-in fade-in">
                  {/* BLOCO 1: SELETOR DE OPERAÇÕES (DINÂMICA AUTOEXPLICATIVA) */}
                  <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 space-y-4">
                    <div>
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block">
                        Guia Rápido • Escolha o Tipo de Operação
                      </span>
                      <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                        Qual frente de operação você deseja configurar agora?
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Selecione a operação abaixo (<strong>Storefront B2C</strong>, <strong>Storefront B2B</strong>, <strong>PDV</strong>, <strong>Horus ERP</strong>, <strong>Eventos/Assinaturas</strong> ou <strong>Fiscal</strong>) para ver o resumo e abrir diretamente as telas de configuração correspondentes.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                      {[
                        {
                          id: 'B2C',
                          title: 'B2C (Loja Virtual Aberta)',
                          desc: 'Vendas para consumidor final (CPF), vitrines, sincronia de produtos e checkout.',
                          badge: 'Checkout Transparente / Link',
                          icon: Store,
                        },
                        {
                          id: 'B2B',
                          title: 'Storefront B2B (Atacado)',
                          desc: 'Portal de pedidos para livrarias/CNPJs, visibilidade de estoque, capas e frete.',
                          badge: settings.b2b_show_stock_quantity ? 'Estoque Exato Visível' : 'Estoque Oculto',
                          icon: Building2,
                        },
                        {
                          id: 'PDV',
                          title: 'Frente de Caixa (PDV)',
                          desc: 'Vendas presenciais na loja ou feiras, trava de saldo e parcelamento no cartão.',
                          badge: `Até ${settings.pdv_max_installments || 12}x • ${settings.pdv_allow_out_of_stock ? 'Sem trava saldo' : 'Com trava saldo'}`,
                          icon: MonitorSmartphone,
                        },
                        {
                          id: 'HORUS',
                          title: 'Horus ERP & SQL Direct',
                          desc: 'Conexão com o ERP Horus (API REST B2B, SQL Direct, Dropship e WMS).',
                          badge: company?.module_horus_erp ? 'Módulo Horus Ativo' : 'Integração ERP',
                          icon: Database,
                        },
                        {
                          id: 'EVENTS',
                          title: 'Eventos Escolares & Assinaturas',
                          desc: 'Feiras literárias, listas escolares com cashback/vale-livro e clubes recorrentes.',
                          badge: 'Checkout & Gateways',
                          icon: CreditCard,
                        },
                        {
                          id: 'FISCAL',
                          title: 'Fiscal (NFS-e / SEFAZ) & E-mails',
                          desc: 'Certificado digital A1, emissão de notas, séries de impressão e disparo SMTP.',
                          badge: fiscalSettings.nfse_enabled ? 'NFS-e Ativa' : 'Configurar Fiscal / SMTP',
                          icon: Key,
                        },
                      ].map((op) => {
                        const isSelected = selectedOperationHub === op.id;
                        const IconComp = op.icon;
                        return (
                          <button
                            key={op.id}
                            type="button"
                            onClick={() => setSelectedOperationHub(op.id as any)}
                            className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                              isSelected
                                ? 'border-indigo-600 bg-white dark:bg-slate-900 ring-2 ring-indigo-500/20 shadow-sm'
                                : 'border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 hover:border-indigo-300'
                            }`}
                          >
                            <div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                                  <IconComp className={`w-4 h-4 ${isSelected ? 'text-indigo-600' : 'text-slate-400'}`} />
                                  {op.title}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{op.desc}</p>
                            </div>
                            <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                              <span className="text-[10px] font-mono font-bold text-indigo-600 dark:text-indigo-400">
                                {op.badge}
                              </span>
                              <span className="text-[10px] font-bold text-slate-400">
                                {isSelected ? 'Selecionado ✓' : 'Selecionar →'}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* PAINEL DE ATALHOS E AÇÕES DA OPERAÇÃO SELECIONADA */}
                    <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-white dark:bg-slate-900 space-y-3 shadow-sm">
                      {selectedOperationHub === 'B2C' && (
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                          <div className="space-y-1">
                            <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block">
                              Operação Selecionada • Storefront B2C (Loja Virtual)
                            </span>
                            <p className="text-xs text-slate-600 dark:text-slate-300">
                              Configure os meios de pagamento do B2C (Cartão, PIX, Boleto ou Link Vindi no final da venda), gerencie as vitrines da loja ou sincronize produtos do Horus por característica.
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => setActiveTab('pagamentos')}
                              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer shadow-sm"
                            >
                              Abrir Pagamentos B2C →
                            </button>
                            <Link
                              href="/b2c/showcases"
                              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200"
                            >
                              Gerenciar Vitrines B2C →
                            </Link>
                            <Link
                              href="/products"
                              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200"
                            >
                              Catálogo &amp; Sincronia B2C →
                            </Link>
                          </div>
                        </div>
                      )}

                      {selectedOperationHub === 'B2B' && (
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                          <div className="space-y-1">
                            <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block">
                              Operação Selecionada • Storefront B2B (Atacado &amp; Livrarias)
                            </span>
                            <p className="text-xs text-slate-600 dark:text-slate-300">
                              Defina as regras de pagamento imediato ou faturado via Horus ERP para clientes CNPJ, além do gateway de frete e visibilidade de estoque abaixo.
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => setActiveTab('pagamentos')}
                              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer shadow-sm"
                            >
                              Abrir Pagamentos B2B →
                            </button>
                            <button
                              type="button"
                              onClick={() => setActiveTab('frete')}
                              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                            >
                              Abrir Frete &amp; Logística →
                            </button>
                          </div>
                        </div>
                      )}

                      {selectedOperationHub === 'PDV' && (
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                          <div className="space-y-1">
                            <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block">
                              Operação Selecionada • Frente de Caixa (PDV)
                            </span>
                            <p className="text-xs text-slate-600 dark:text-slate-300">
                              Configure trava de saldo para feiras/eventos, limite de parcelas no cartão de crédito e quais adquirentes/bancos processam o PDV.
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => setActiveTab('pdv')}
                              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer shadow-sm"
                            >
                              Abrir Configurações do PDV →
                            </button>
                            <button
                              type="button"
                              onClick={() => setActiveTab('pagamentos')}
                              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                            >
                              Pagamentos do PDV →
                            </button>
                          </div>
                        </div>
                      )}

                      {selectedOperationHub === 'HORUS' && (
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                          <div className="space-y-1">
                            <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block">
                              Operação Selecionada • Integração Horus ERP &amp; Ecossistema
                            </span>
                            <p className="text-xs text-slate-600 dark:text-slate-300">
                              Acesse rapidamente os parâmetros da API REST do Horus (`SD_*` / `AC_*`), conexão SQL Direct, Dropship, Bookinfo e WMS.
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            {company?.module_horus_erp && (
                              <button
                                type="button"
                                onClick={() => setActiveTab('horus')}
                                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer shadow-sm"
                              >
                                Abrir Horus ERP (API) →
                              </button>
                            )}
                            {hasHorusSql && (
                              <button
                                type="button"
                                onClick={() => setActiveTab('horus_sql')}
                                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                              >
                                Abrir Horus SQL Direct →
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setActiveTab('dropship')}
                              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                            >
                              Abrir Dropship Horus →
                            </button>
                            <button
                              type="button"
                              onClick={() => setActiveTab('bookinfo')}
                              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                            >
                              Abrir Bookinfo →
                            </button>
                          </div>
                        </div>
                      )}

                      {selectedOperationHub === 'EVENTS' && (
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                          <div className="space-y-1">
                            <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block">
                              Operação Selecionada • Eventos Escolares &amp; Assinaturas
                            </span>
                            <p className="text-xs text-slate-600 dark:text-slate-300">
                              Configure os provedores de pagamento para Feiras/Escolas e Assinaturas (por forma de pagamento ou Link Vindi no final da venda).
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => setActiveTab('pagamentos')}
                              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer shadow-sm"
                            >
                              Configurar Pagamentos (Eventos &amp; Assinaturas) →
                            </button>
                            <Link
                              href="/schools-events"
                              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200"
                            >
                              Painel Escolas &amp; Eventos →
                            </Link>
                          </div>
                        </div>
                      )}

                      {selectedOperationHub === 'FISCAL' && (
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                          <div className="space-y-1">
                            <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block">
                              Operação Selecionada • Fiscal, Notas &amp; Comunicação
                            </span>
                            <p className="text-xs text-slate-600 dark:text-slate-300">
                              Configure emissão de NFS-e, certificados SEFAZ, séries de impressão e servidor de e-mail transacional (SMTP).
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => setActiveTab('fiscal')}
                              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer shadow-sm"
                            >
                              Abrir Fiscal (NFS-e) →
                            </button>
                            <button
                              type="button"
                              onClick={() => setActiveTab('sefaz_sp')}
                              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                            >
                              Abrir Fiscal SEFAZ →
                            </button>
                            <button
                              type="button"
                              onClick={() => setActiveTab('email')}
                              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                            >
                              Abrir E-mails (SMTP) →
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* BLOCO 2: CONFIGURAÇÕES GERAIS DE CATÁLOGO (SERVIDOR PRIMÁRIO E SECUNDÁRIO DE CAPAS + ESTOQUE B2B) */}
                  <div className="space-y-4 pt-2">
                    <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800/60 pb-3">
                      <div className="p-2 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg">
                        <Settings2 className="h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Parâmetros Globais de Catálogo &amp; Capas</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Servidores de capas por ISBN (com fallback automático) e visibilidade de estoque na vitrine B2B.</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">
                          Servidor Primário de Capas (Base URL)
                        </label>
                        <input
                          type="url"
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all font-mono text-sm placeholder:text-slate-400 dark:bg-slate-900/50 dark:border-slate-700 dark:text-white dark:focus:ring-[var(--color-primary-base)]/50 dark:placeholder:text-slate-600"
                          placeholder="https://capas.cataventobr.com.br"
                          value={settings.cover_image_base_url}
                          onChange={e => setSettings({ ...settings, cover_image_base_url: e.target.value })}
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          1ª opção de busca por <b>ISBN.jpg</b> (ex: https://capas.site.com.br/978...jpg).
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">
                          Servidor Secundário de Capas — Fallback (Base URL)
                        </label>
                        <input
                          type="url"
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all font-mono text-sm placeholder:text-slate-400 dark:bg-slate-900/50 dark:border-slate-700 dark:text-white dark:focus:ring-[var(--color-primary-base)]/50 dark:placeholder:text-slate-600"
                          placeholder="https://capas-secundario.site.com.br"
                          value={settings.cover_image_secondary_base_url}
                          onChange={e => setSettings({ ...settings, cover_image_secondary_base_url: e.target.value })}
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          2ª opção automática: se a capa não existir no link primário, busca no link secundário via <b>ISBN.jpg</b>. Se não houver em nenhum dos dois, exibe sem capa.
                        </p>
                      </div>
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
                              <span className="text-xs text-slate-500">Se ativo, mostra &ldquo;Disponível: X un&rdquo;. Se inativo, exibe apenas se o produto está ou não disponível.</span>
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
                    
                    <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-3 pt-3 mt-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                              Validação de Saldo de Estoque no PDV
                            </h3>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              settings.pdv_allow_out_of_stock 
                                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                                : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                            }`}>
                              {settings.pdv_allow_out_of_stock ? '⚡ Venda sem Saldo Liberada' : '🔒 Validando Saldo Obrigatório'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
                            {settings.pdv_allow_out_of_stock
                              ? 'O PDV permite adicionar e vender produtos mesmo que o saldo no sistema/ERP esteja zerado ou insuficiente (ideal para feiras e eventos itinerantes).'
                              : 'O PDV bloqueia a adição de itens com saldo zerado e não permite vender quantidades acima do estoque disponível.'}
                          </p>
                        </div>
                        <label className="relative flex items-center cursor-pointer shrink-0">
                          <span className="mr-3 text-xs font-semibold text-slate-700 dark:text-slate-300">
                            {settings.pdv_allow_out_of_stock ? 'Sem Trava de Estoque' : 'Travar sem Estoque'}
                          </span>
                          <div className="relative">
                            <input 
                              type="checkbox" 
                              className="sr-only peer" 
                              checked={settings.pdv_allow_out_of_stock} 
                              onChange={e => setSettings({ ...settings, pdv_allow_out_of_stock: e.target.checked })} 
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500 dark:bg-slate-700 dark:border-slate-600"></div>
                          </div>
                        </label>
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-4 pt-3 mt-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <CreditCard className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                            Configuração de Parcelamento no Cartão de Crédito
                          </h3>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
                          Defina o limite de parcelas disponíveis no terminal PDV e o valor mínimo permitido por parcela.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                            Número Máximo de Parcelas (Crédito)
                          </label>
                          <select
                            value={settings.pdv_max_installments}
                            onChange={e => setSettings({ ...settings, pdv_max_installments: Number(e.target.value) })}
                            className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                          >
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
                              <option key={n} value={n}>
                                {n === 1 ? '1x (Somente à vista)' : `Até ${n}x`}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                            Valor Mínimo por Parcela
                          </label>
                          <CurrencyInput
                            prefixStr="R$ "
                            value={settings.pdv_min_installment_amount || 1.0}
                            onChangeValue={val => setSettings({ ...settings, pdv_min_installment_amount: Math.max(1.0, val) })}
                            className="w-full px-3 py-2 text-xs font-medium rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab: PAGAMENTOS — Matriz por Canal × Forma de Pagamento + Cofre de Credenciais Sob Demanda */}
              {activeTab === 'pagamentos' && (
                <div className="space-y-6 animate-in fade-in">
                  {/* PASSO 1: MATRIZ DE ROTEAMENTO POR FRENTE (B2C, EVENTOS, ASSINATURAS, B2B, HORUS ERP, FINANCEIRO CRONUZ, PDV) */}
                  {companyId && (
                    <SellerPaymentRoutingMatrix
                      companyId={companyId}
                      settings={settings}
                      setSettings={setSettings}
                      activeProviderDrawer={selectedProviderTab}
                      onJumpToProvider={(provCode) => {
                        if (provCode === 'CIELO' || provCode === 'REDE') {
                          setSelectedProviderTab('CIELO_REDE');
                        } else if (['VINDI', 'CORA', 'INTER', 'EFI'].includes(provCode)) {
                          setSelectedProviderTab(provCode as any);
                        }
                        setTimeout(() => {
                          const el = document.getElementById('provider-credentials-vault');
                          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }, 80);
                      }}
                      onJumpToPdvTab={() => setActiveTab('pdv')}
                    />
                  )}

                  {/* PASSO 2: CREDENCIAIS, CERTIFICADOS & CONSOLE DE HOMOLOGAÇÃO POR PROVEDOR (SOB DEMANDA) */}
                  <div
                    id="provider-credentials-vault"
                    className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-5 shadow-sm"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3.5">
                      <div>
                        <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block">
                          Passo 2 • Provedores &amp; Contas Bancárias (Abertura Sob Demanda)
                        </span>
                        <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                          Configuração de Chaves, Certificados e Homologação
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Clique em <strong>Abrir Configurações</strong> na operação acima ou selecione um provedor abaixo para abrir apenas a tela daquele gateway, sem misturar formulários.
                        </p>
                      </div>
                      {selectedProviderTab && (
                        <button
                          type="button"
                          onClick={() => setSelectedProviderTab(null)}
                          className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 shrink-0 cursor-pointer"
                        >
                          Fechar Painel do Provedor ✕
                        </button>
                      )}
                    </div>

                    {/* Abas de Seleção do Provedor para Configurar Credenciais */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                      {[
                        {
                          id: 'VINDI',
                          name: 'Vindi Commerce',
                          desc: 'Cartão, PIX, Boleto e Link',
                          ready: Boolean(settings.vindi_api_key && settings.vindi_api_key.trim().length >= 8),
                        },
                        {
                          id: 'CORA',
                          name: 'Banco Cora',
                          desc: 'Boleto Registrado & PIX mTLS',
                          ready: true,
                        },
                        {
                          id: 'EFI',
                          name: 'Efí Bank (Gerencianet)',
                          desc: 'PIX, Boleto & Cartão (.p12)',
                          ready: Boolean(settings.efi_client_id && settings.efi_client_secret),
                        },
                        {
                          id: 'INTER',
                          name: 'Banco Inter',
                          desc: 'Boletos V2 & V3 BolePix',
                          ready: Boolean(settings.inter_enabled && settings.inter_client_id),
                        },
                        {
                          id: 'CIELO_REDE',
                          name: 'Cielo / Rede',
                          desc: 'Adquirentes de Cartão',
                          ready: Boolean(settings.cielo_merchant_id || settings.rede_pv),
                        },
                      ].map((tab) => {
                        const active = selectedProviderTab === tab.id;
                        return (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setSelectedProviderTab(active ? null : (tab.id as any))}
                            className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                              active
                                ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/40 ring-2 ring-indigo-500/20 shadow-sm'
                                : 'border-slate-200 dark:border-slate-800 hover:border-indigo-300'
                            }`}
                          >
                            <div>
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                                  {tab.name}
                                </span>
                                <span
                                  className={`w-2 h-2 rounded-full shrink-0 ${
                                    tab.ready ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
                                  }`}
                                />
                              </div>
                              <span className="text-[10px] text-slate-500 block mt-0.5 truncate">
                                {tab.desc}
                              </span>
                            </div>
                            <div className="mt-2 pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                              <span className={`text-[10px] font-bold ${tab.ready ? 'text-emerald-600' : 'text-amber-600'}`}>
                                {tab.ready ? 'Configurado ✓' : 'Pendente'}
                              </span>
                              <span className="text-[10px] font-extrabold text-indigo-600 dark:text-indigo-400">
                                {active ? 'Aberto ▴' : 'Configurar →'}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {!selectedProviderTab && (
                      <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 text-center text-xs text-slate-500">
                        Nenhum formulário de credenciais aberto no momento. Clique em <strong>Abrir Configurações</strong> no provedor da operação escolhida acima (ou em um dos 5 cartões acima) para abrir somente a configuração que deseja editar.
                      </div>
                    )}

                    {/* 1. PAINEL VINDI COMMERCE */}
                    {selectedProviderTab === 'VINDI' && (
                      <div className="space-y-3 animate-in fade-in">
                        <VindiCheckoutPanel settings={settings} setSettings={setSettings} />
                      </div>
                    )}

                    {/* 2. PAINEL BANCO CORA */}
                    {selectedProviderTab === 'CORA' && companyId && (
                      <div className="rounded-2xl border border-pink-200 dark:border-pink-900/40 p-3 md:p-5 bg-white dark:bg-slate-900 animate-in fade-in">
                        <CoraSettingsPanel companyId={companyId} embedded />
                      </div>
                    )}

                    {/* 3. PAINEL EFÍ BANK */}
                    {selectedProviderTab === 'EFI' && (
                      <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                          <div className="flex items-center gap-2">
                            <div className="p-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg">
                              <Receipt className="h-5 w-5" />
                            </div>
                            <div>
                              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                                Efí Bank / Gerencianet (PIX, Boleto e Cartão)
                              </h2>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                Credenciais para emissão de QR Code PIX, Boletos e Cartão nos canais selecionados acima.
                              </p>
                            </div>
                          </div>
                          <label className="relative flex items-center cursor-pointer shrink-0">
                            <span className="mr-3 text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase">
                              Sandbox
                            </span>
                            <div className="relative">
                              <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={settings.efi_sandbox}
                                onChange={(e) =>
                                  setSettings({ ...settings, efi_sandbox: e.target.checked })
                                }
                              />
                              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 dark:bg-slate-700 dark:border-slate-600"></div>
                            </div>
                          </label>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                              Client ID
                            </label>
                            <input
                              type="text"
                              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-mono text-xs dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                              placeholder="Client_Id_..."
                              value={settings.efi_client_id}
                              onChange={(e) =>
                                setSettings({ ...settings, efi_client_id: e.target.value })
                              }
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                              Client Secret
                            </label>
                            <input
                              type="password"
                              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-mono text-xs dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                              placeholder="Client_Secret_..."
                              value={settings.efi_client_secret}
                              onChange={(e) =>
                                setSettings({ ...settings, efi_client_secret: e.target.value })
                              }
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                              Identificador de Conta (Payee Code)
                            </label>
                            <input
                              type="text"
                              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-mono text-xs dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                              placeholder="Ex: 57C2..."
                              value={settings.efi_payee_code}
                              onChange={(e) =>
                                setSettings({ ...settings, efi_payee_code: e.target.value })
                              }
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                              <span>Certificado (.p12 / .pem)</span>
                              {uploadingCert && (
                                <Loader2 className="h-3 w-3 animate-spin text-emerald-500" />
                              )}
                            </label>
                            <div className="flex flex-col gap-2">
                              <input
                                type="file"
                                accept=".p12,.pem"
                                onChange={handleCertificateUpload}
                                disabled={uploadingCert}
                                className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
                              />
                              {settings.efi_certificate_path && (
                                <p
                                  className="text-xs text-slate-500 font-mono truncate"
                                  title={settings.efi_certificate_path}
                                >
                                  Salvo em: {settings.efi_certificate_path}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 4. PAINEL BANCO INTER */}
                    {selectedProviderTab === 'INTER' && (
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 dark:bg-slate-800/50 dark:border-slate-700">
                        <div className="flex items-center gap-3 mb-5">
                          <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center dark:bg-orange-900/40">
                            <Building2 className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                          </div>
                          <div className="flex-1">
                            <h3 className="text-base font-bold text-slate-800 dark:text-white">
                              Banco Inter (Boletos &amp; BolePix V2/V3)
                            </h3>
                            <p className="text-xs text-slate-500 font-medium">
                              Emissão e conciliação automática de boletos bancários e BolePix via mTLS
                            </p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              className="sr-only peer"
                              checked={settings.inter_enabled}
                              onChange={(e) =>
                                setSettings({ ...settings, inter_enabled: e.target.checked })
                              }
                            />
                            <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-300 rounded-full peer dark:bg-slate-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                          </label>
                        </div>

                        <div className="space-y-5 relative">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                                Conta Corrente (Opcional)
                              </label>
                              <input
                                type="text"
                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-slate-900 font-mono text-xs dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                                placeholder="Ex: 1234567-8"
                                value={settings.inter_account_number}
                                onChange={(e) =>
                                  setSettings({ ...settings, inter_account_number: e.target.value })
                                }
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-xs font-bold text-slate-700 block">Ambiente</label>
                              <div className="flex bg-slate-200 p-1 rounded-xl">
                                <button
                                  type="button"
                                  onClick={() => setSettings({ ...settings, inter_sandbox: true })}
                                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                                    settings.inter_sandbox
                                      ? 'bg-white text-slate-800 shadow-sm'
                                      : 'text-slate-500 hover:text-slate-700'
                                  }`}
                                >
                                  Sandbox (Homol)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setSettings({ ...settings, inter_sandbox: false })}
                                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                                    !settings.inter_sandbox
                                      ? 'bg-orange-500 text-white shadow-sm'
                                      : 'text-slate-500 hover:text-slate-700'
                                  }`}
                                >
                                  Produção REAL
                                </button>
                              </div>
                            </div>
                            <div className="space-y-1.5 md:col-span-2">
                              <label className="text-xs font-bold text-slate-700 block">
                                Motor de Emissão (API)
                              </label>
                              <div className="flex bg-slate-200 p-1 rounded-xl">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSettings({ ...settings, inter_api_version: 'V2' })
                                  }
                                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                                    settings.inter_api_version === 'V2'
                                      ? 'bg-white text-slate-800 shadow-sm'
                                      : 'text-slate-500 hover:text-slate-700'
                                  }`}
                                >
                                  V2 Clássica (Síncrono)
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSettings({ ...settings, inter_api_version: 'V3' })
                                  }
                                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                                    settings.inter_api_version === 'V3'
                                      ? 'bg-orange-500 text-white shadow-sm'
                                      : 'text-slate-500 hover:text-slate-700'
                                  }`}
                                >
                                  V3 BolePix (Assíncrono)
                                </button>
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-xs font-bold text-slate-700 block">
                                Client ID
                              </label>
                              <input
                                type="text"
                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-slate-900 font-mono text-xs"
                                placeholder="Client_Id"
                                value={settings.inter_client_id}
                                onChange={(e) =>
                                  setSettings({ ...settings, inter_client_id: e.target.value })
                                }
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-xs font-bold text-slate-700 block">
                                Client Secret
                              </label>
                              <input
                                type="password"
                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-slate-900 font-mono text-xs"
                                placeholder="Client_Secret"
                                value={settings.inter_client_secret}
                                onChange={(e) =>
                                  setSettings({ ...settings, inter_client_secret: e.target.value })
                                }
                              />
                            </div>
                          </div>

                          <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
                            <h4 className="text-xs font-bold text-orange-900 flex items-center mb-1.5">
                              <Key className="w-4 h-4 mr-2" /> Certificados de Aplicação (mTLS)
                            </h4>
                            <p className="text-xs text-orange-800 mb-3">
                              Faça upload do arquivo <b>.crt</b> e da chave privada <b>.key</b> gerados no portal do Banco Inter.
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                              <div className="border-2 border-dashed border-orange-300 rounded-xl p-3 bg-white relative hover:bg-orange-50 transition-colors">
                                <input
                                  type="file"
                                  accept=".crt,.pem"
                                  onChange={(e) => setInterCertFile(e.target.files?.[0] || null)}
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                />
                                <div className="flex items-center gap-2.5">
                                  <FileText className="w-6 h-6 text-orange-500" />
                                  <p className="font-bold text-xs text-slate-700">
                                    {interCertFile ? interCertFile.name : 'Clique para enviar .CRT'}
                                  </p>
                                </div>
                              </div>
                              <div className="border-2 border-dashed border-orange-300 rounded-xl p-3 bg-white relative hover:bg-orange-50 transition-colors">
                                <input
                                  type="file"
                                  accept=".key"
                                  onChange={(e) => setInterKeyFile(e.target.files?.[0] || null)}
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                />
                                <div className="flex items-center gap-2.5">
                                  <Key className="w-6 h-6 text-slate-500" />
                                  <p className="font-bold text-xs text-slate-700">
                                    {interKeyFile ? interKeyFile.name : 'Clique para enviar .KEY'}
                                  </p>
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={handleInterCertUpload}
                              disabled={!interCertFile || !interKeyFile}
                              className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white px-4 py-2 font-bold rounded-lg text-xs"
                            >
                              Enviar e Validar Certificados
                            </button>
                            {settings.inter_cert_path && (
                              <div className="mt-3 flex items-center gap-2 text-xs font-bold text-emerald-600 bg-emerald-50 py-1.5 px-3 rounded-lg w-fit border border-emerald-200">
                                <CheckCircle className="w-4 h-4" /> Certificados ativos no servidor
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 5. PAINEL CIELO & REDE */}
                    {selectedProviderTab === 'CIELO_REDE' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                          <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                            Cielo E-commerce API 3.0
                          </h4>
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                              Merchant ID
                            </label>
                            <input
                              type="text"
                              className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-900 font-mono text-xs dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                              value={settings.cielo_merchant_id}
                              onChange={(e) =>
                                setSettings({ ...settings, cielo_merchant_id: e.target.value })
                              }
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                              Client ID
                            </label>
                            <input
                              type="text"
                              className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-900 font-mono text-xs dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                              value={settings.cielo_client_id}
                              onChange={(e) =>
                                setSettings({ ...settings, cielo_client_id: e.target.value })
                              }
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                              Client Secret
                            </label>
                            <input
                              type="password"
                              className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-900 font-mono text-xs dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                              value={settings.cielo_client_secret}
                              onChange={(e) =>
                                setSettings({ ...settings, cielo_client_secret: e.target.value })
                              }
                            />
                          </div>
                        </div>

                        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                          <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                            Rede / Itaú (e.Rede)
                          </h4>
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                              PV (Ponto de Venda / Filiação)
                            </label>
                            <input
                              type="text"
                              className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-900 font-mono text-xs dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                              value={settings.rede_pv}
                              onChange={(e) =>
                                setSettings({ ...settings, rede_pv: e.target.value })
                              }
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                              Token de Integração
                            </label>
                            <input
                              type="password"
                              className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-900 font-mono text-xs dark:bg-slate-900 dark:border-slate-700 dark:text-white"
                              value={settings.rede_token}
                              onChange={(e) =>
                                setSettings({ ...settings, rede_token: e.target.value })
                              }
                            />
                          </div>
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
                    <div className="space-y-1.5 md:col-span-2">
                      <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">E-mail para Cópia Oculta Fixa (BCC)</label>
                      <input
                        type="email"
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono text-sm placeholder:text-slate-400 dark:bg-slate-900/50 dark:border-slate-700 dark:text-white dark:focus:ring-indigo-500/50"
                        placeholder="financeiro@seudominio.com.br"
                        value={settings.smtp_bcc_email || ''}
                        onChange={e => setSettings({ ...settings, smtp_bcc_email: e.target.value })}
                      />
                      <p className="text-xs text-slate-500">Se preenchido, todos os envios de O.S (como notas e boletos) enviarão uma cópia oculta para este e-mail automaticamente.</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mt-4 px-1">
                    <label className="relative flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={settings.smtp_use_ssl} 
                        onChange={e => setSettings({ ...settings, smtp_use_ssl: e.target.checked })} 
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500 dark:bg-slate-700 dark:border-slate-600"></div>
                    </label>
                    <div>
                      <span className="text-sm font-bold text-slate-700 dark:text-slate-300 block">Usar conexão segura fechada (SSL)</span>
                      <span className="text-xs text-slate-500 block">Marque se a porta exigir conexão SSL direta (ex: 465). Se for STARTTLS (ex: 587), deixe desmarcado.</span>
                    </div>
                  </div>

                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5 mt-6 dark:bg-indigo-900/20 dark:border-indigo-800/50">
                    <h3 className="text-sm font-semibold text-indigo-900 dark:text-indigo-300 mb-2">Testar Configuração</h3>
                    <p className="text-xs text-indigo-700 dark:text-indigo-400 mb-4">
                      Recomendamos salvar as configurações antes de realizar o teste. O sistema enviará um e-mail de teste para o endereço informado abaixo utilizando as credenciais salvas.
                    </p>
                    <div className="flex items-center gap-3">
                      <input
                        type="email"
                        placeholder="E-mail de destino para teste"
                        className="flex-1 bg-white border border-indigo-200 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:ring-2 focus:ring-indigo-500 outline-none dark:bg-slate-900/50 dark:border-indigo-800/50 dark:text-white"
                        value={testEmail}
                        onChange={e => setTestEmail(e.target.value)}
                      />
                      <button
                        type="button"
                        disabled={testingSmtp}
                        onClick={handleTestSmtp}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-6 rounded-xl text-sm transition-colors disabled:opacity-50 flex items-center gap-2"
                      >
                        {testingSmtp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                        Enviar Teste
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {/* Tab: TEMPLATES DE EMAIL */}
              {activeTab === 'templates' && (
                <div className="animate-in fade-in">
                  <EmailTemplatesTab />
                </div>
              )}

              {/* Tab: HORUS ERP */}
              {activeTab === 'horus' && (
                <div className="animate-in fade-in">
                  <HorusTab />
                </div>
              )}

              {/* Tab: HORUS SQL DIRECT */}
              {activeTab === 'horus_sql' && (
                <div className="animate-in fade-in">
                  <HorusSQLTab />
                </div>
              )}

              {/* Tab: BOOKINFO */}
              {activeTab === 'bookinfo' && (
                <div className="animate-in fade-in">
                  <BookinfoTab />
                </div>
              )}

              {/* Tab: SEFAZ SP */}
              {activeTab === 'sefaz_sp' && (
                <div className="animate-in fade-in p-6">
                  <SefazBranchesTab />
                </div>
              )}
              {/* Tab: DROPSHIP HORUS */}
              {activeTab === 'dropship' && (
                <div className="animate-in fade-in">
                  <DropshipTab />
                </div>
              )}

              {/* Tab: LOGÍSTICA WMS */}
              {activeTab === 'logistics' && (
                <div className="animate-in fade-in">
                  <LogisticsTab />
                </div>
              )}

            </div>

            {activeTab !== 'templates' && activeTab !== 'horus' && activeTab !== 'bookinfo' && activeTab !== 'sefaz_sp' && activeTab !== 'dropship' && activeTab !== 'logistics' && (
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
            )}
          </FormContainer>
        </motion.div>
      </div>
    </div>
  );
}
