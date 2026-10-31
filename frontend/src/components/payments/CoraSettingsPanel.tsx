'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Landmark, Loader2, ShieldCheck, Upload, CheckCircle2, XCircle, Trash2, Zap, Save,
  AlertTriangle, KeyRound, FileKey2, CalendarClock, Settings2, BellRing, Link2, Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { getToken } from '@/lib/auth';
import { CurrencyInput } from '@/components/CurrencyInput';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const MAX_CERT_BYTES = 1 * 1024 * 1024; // 1 MB — certificados reais têm poucos KB

type Env = 'STAGE' | 'PRODUCTION';
type CertFormat = 'PEM' | 'PFX';

interface Account {
  environment: Env;
  configured: boolean;
  client_id: string;
  has_certificate: boolean;
  cert_format?: CertFormat | null;
  cert_subject?: string | null;
  cert_valid_from?: string | null;
  cert_valid_until?: string | null;
  cert_days_left?: number | null;
  last_test_at?: string | null;
  last_test_ok?: boolean | null;
  last_test_message?: string | null;
}

interface Config {
  active_environment: Env;
  integration_mode: string;
  payment_forms: 'BANK_SLIP' | 'BANK_SLIP_PIX';
  fine_rate: number | null;
  interest_rate: number | null;
  discount_rate: number | null;
  notify_enabled: boolean;
  notify_rules: string[];
}

interface Overview {
  enabled: boolean;
  webhook: { registered: boolean; environment: Env | null };
  config: Config;
  accounts: Record<Env, Account>;
  options: { notify_rules: string[] };
}

const ENV_LABEL: Record<Env, string> = { STAGE: 'Stage (testes)', PRODUCTION: 'Produção' };

const NOTIFY_LABEL: Record<string, string> = {
  NOTIFY_FIFTEEN_DAYS_BEFORE_DUE_DATE: '15 dias antes',
  NOTIFY_TEN_DAYS_BEFORE_DUE_DATE: '10 dias antes',
  NOTIFY_SEVEN_DAYS_BEFORE_DUE_DATE: '7 dias antes',
  NOTIFY_FIVE_DAYS_BEFORE_DUE_DATE: '5 dias antes',
  NOTIFY_TWO_DAYS_BEFORE_DUE_DATE: '2 dias antes',
  NOTIFY_ON_DUE_DATE: 'No vencimento',
  NOTIFY_TWO_DAYS_AFTER_DUE_DATE: '2 dias depois',
  NOTIFY_FIVE_DAYS_AFTER_DUE_DATE: '5 dias depois',
  NOTIFY_SEVEN_DAYS_AFTER_DUE_DATE: '7 dias depois',
  NOTIFY_TEN_DAYS_AFTER_DUE_DATE: '10 dias depois',
  NOTIFY_FIFTEEN_DAYS_AFTER_DUE_DATE: '15 dias depois',
  NOTIFY_WHEN_PAID: 'Quando for pago',
};

const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '-');
const fmtDateTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR') : '-');

const inputCls = 'w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-pink-500';
const labelCls = 'text-xs font-semibold text-slate-600 dark:text-slate-400';
const btnCls = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50';

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="relative inline-flex cursor-pointer items-center shrink-0">
      <input type="checkbox" className="sr-only peer" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <div className="peer h-6 w-11 rounded-full bg-slate-200 peer-checked:bg-pink-600 transition-colors dark:bg-slate-700 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-all peer-checked:after:translate-x-5 peer-disabled:opacity-50" />
    </label>
  );
}

function FilePicker({ label, accept, file, onFile, icon: Icon }: {
  label: string; accept: string; file: File | null; onFile: (f: File | null) => void; icon: any;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className={labelCls}>{label}</span>
      <span className={`flex items-center gap-2 rounded-lg border border-dashed px-3 py-3 text-sm cursor-pointer transition-colors ${file ? 'border-pink-400 bg-pink-50 text-pink-700 dark:bg-pink-950/20 dark:text-pink-300' : 'border-slate-300 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate">{file ? file.name : 'Selecionar arquivo'}</span>
        <input
          type="file"
          accept={accept}
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0] || null;
            if (f && f.size > MAX_CERT_BYTES) {
              toast.error('O arquivo excede o limite máximo permitido de 1 MB para certificados.');
              e.target.value = '';
              return;
            }
            onFile(f);
          }}
        />
      </span>
    </label>
  );
}

interface CoraSettingsPanelProps {
  companyId: number | string;
  /** Seller: quando o Cora não está habilitado (403), não renderiza nada. */
  hideWhenUnavailable?: boolean;
  /** Oculta o cabeçalho (quando embutido em outra tela, ex.: Hub do Master). */
  embedded?: boolean;
}

export default function CoraSettingsPanel({ companyId, hideWhenUnavailable = false, embedded = false }: CoraSettingsPanelProps) {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [envTab, setEnvTab] = useState<Env>('STAGE');

  // Formulário de credenciais (por aba de ambiente)
  const [clientId, setClientId] = useState('');
  const [certFormat, setCertFormat] = useState<CertFormat>('PEM');
  const [certFile, setCertFile] = useState<File | null>(null);
  const [keyFile, setKeyFile] = useState<File | null>(null);
  const [pfxFile, setPfxFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [savingAccount, setSavingAccount] = useState(false);
  const [testing, setTesting] = useState(false);
  const [removing, setRemoving] = useState(false);

  // Configuração geral
  const [config, setConfig] = useState<Config | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);

  // Webhook
  const [webhookBase, setWebhookBase] = useState(API.startsWith('https://') ? API : '');
  const [registering, setRegistering] = useState(false);

  const company = useMemo(() => (companyId ? { id: companyId } : null), [companyId]);
  const authHeaders = () => ({ Authorization: `Bearer ${getToken()}` });

  const load = useCallback(async () => {
    if (!company) return;
    try {
      const res = await fetch(`${API}/companies/${company.id}/cora`, { headers: authHeaders() });
      const body = await res.json().catch(() => ({}));
      if (res.status === 403) { setUnavailable(true); return; }
      if (!res.ok) throw new Error(body?.detail || 'Erro ao carregar configuração do Cora.');
      setUnavailable(false);
      setData(body);
      setConfig(body.config);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [company]);

  useEffect(() => { load(); }, [load]);

  // Ao trocar de aba / recarregar, preenche o formulário com o ambiente selecionado
  useEffect(() => {
    const acc = data?.accounts?.[envTab];
    setClientId(acc?.client_id || '');
    setCertFormat((acc?.cert_format as CertFormat) || 'PEM');
    setCertFile(null); setKeyFile(null); setPfxFile(null); setPassword('');
  }, [envTab, data]);

  const handleRegisterWebhook = async () => {
    if (!company) return;
    setRegistering(true);
    try {
      const res = await fetch(`${API}/companies/${company.id}/cora/webhook`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_base_url: webhookBase }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof body?.detail === 'string' ? body.detail : 'Erro ao registrar webhook.');
      setData(body);
      setConfig(body.config);
      toast.success(body.message || 'Webhook registrado.');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRegistering(false);
    }
  };

  const handleSaveAccount = async () => {
    if (!company) return;
    if (clientId.trim().length < 3) { toast.error('Informe o Client ID fornecido pelo Cora.'); return; }
    if (certFormat === 'PEM' && (!!certFile !== !!keyFile)) { toast.error('No formato PEM envie o certificado e a chave privada juntos.'); return; }
    if (certFormat === 'PFX' && pfxFile && !password) { toast.error('Informe a senha do arquivo PFX.'); return; }

    const form = new FormData();
    form.append('client_id', clientId.trim());
    form.append('cert_format', certFormat);
    if (certFormat === 'PEM') {
      if (certFile) form.append('certificate', certFile);
      if (keyFile) form.append('private_key', keyFile);
    } else if (pfxFile) {
      form.append('pfx_file', pfxFile);
    }
    if (password) form.append('password', password);

    setSavingAccount(true);
    try {
      const res = await fetch(`${API}/companies/${company.id}/cora/accounts/${envTab}`, {
        method: 'PUT', headers: authHeaders(), body: form,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof body?.detail === 'string' ? body.detail : 'Erro ao salvar credenciais.');
      setData(body);
      setConfig(body.config);
      toast.success(`Credenciais de ${ENV_LABEL[envTab]} salvas.`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingAccount(false);
    }
  };

  const handleTest = async () => {
    if (!company) return;
    setTesting(true);
    try {
      const res = await fetch(`${API}/companies/${company.id}/cora/accounts/${envTab}/test`, { method: 'POST', headers: authHeaders() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail || 'Erro ao testar conexão.');
      body.success ? toast.success(body.message) : toast.error(body.message);
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setTesting(false);
    }
  };

  const handleRemove = async () => {
    if (!company || !confirm(`Remover as credenciais de ${ENV_LABEL[envTab]} deste seller?`)) return;
    setRemoving(true);
    try {
      const res = await fetch(`${API}/companies/${company.id}/cora/accounts/${envTab}`, { method: 'DELETE', headers: authHeaders() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail || 'Erro ao remover credenciais.');
      setData(body);
      setConfig(body.config);
      toast.success('Credenciais removidas.');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRemoving(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!company || !config) return;
    setSavingConfig(true);
    try {
      const res = await fetch(`${API}/companies/${company.id}/cora/config`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          active_environment: config.active_environment,
          integration_mode: config.integration_mode,
          payment_forms: config.payment_forms,
          fine_rate: config.fine_rate ?? 0,
          interest_rate: config.interest_rate ?? 0,
          discount_rate: config.discount_rate ?? 0,
          notify_enabled: config.notify_enabled,
          notify_rules: config.notify_rules,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof body?.detail === 'string' ? body.detail : 'Erro ao salvar configurações.');
      setData(body);
      setConfig(body.config);
      toast.success('Configurações do Cora salvas.');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingConfig(false);
    }
  };

  const setCfg = <K extends keyof Config>(k: K, v: Config[K]) => setConfig(prev => (prev ? { ...prev, [k]: v } : prev));

  if (unavailable) {
    if (hideWhenUnavailable) return null;
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
        O Banco Cora não está habilitado para esta empresa. A habilitação é feita pelo Master no Hub de Pagamentos.
      </div>
    );
  }
  if (loading || !data || !config) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-pink-600" /></div>;
  }

  const account = data.accounts[envTab];
  const activeAccount = data.accounts[data.config.active_environment];
  const isOperational = data.enabled && activeAccount?.configured;
  const certWarning = account.cert_days_left != null && account.cert_days_left <= 30;

  return (
    <div className={embedded ? 'space-y-5' : 'p-3 md:p-6 space-y-5 overflow-y-auto max-h-full'}>
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-100 dark:bg-pink-900/30">
            <Landmark className="h-5 w-5 text-pink-600 dark:text-pink-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Banco Cora</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Credenciais, certificado e parâmetros de cobrança (Integração Direta)</p>
          </div>
        </div>
        <div className={`self-start flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${isOperational ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${isOperational ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
          {isOperational ? `Ativo · ${ENV_LABEL[data.config.active_environment]}` : data.enabled ? 'Habilitado · configurar credenciais' : 'Não habilitado'}
        </div>
      </div>

      {/* Segurança */}
      <div className="flex items-start gap-3 rounded-xl border border-pink-200 bg-pink-50 p-4 dark:border-pink-800/50 dark:bg-pink-950/20">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-pink-600 dark:text-pink-400" />
        <p className="text-xs text-pink-800 dark:text-pink-300">
          Certificado e chave privada ficam somente no banco de dados, com a chave criptografada. Arquivos PFX são convertidos no servidor.
          Nada é gravado em disco: o mTLS usa arquivos temporários destruídos após cada requisição.
        </p>
      </div>

      {!data.enabled && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
          O Banco Cora está desabilitado no Hub de Pagamentos. As configurações podem ser preparadas, mas o seller só terá acesso após a habilitação.
        </div>
      )}

      {/* Modalidade e ambiente ativo */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="bg-slate-50 dark:bg-slate-800/50 px-4 md:px-5 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Modalidade e ambiente</h2>
        </div>
        <div className="p-4 md:p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className={labelCls}>Modalidade de integração</label>
            <select className={inputCls} value={config.integration_mode} onChange={e => setCfg('integration_mode', e.target.value)}>
              <option value="DIRECT">Integração Direta (Client ID + certificado mTLS)</option>
              <option value="PARTNER" disabled>Parceria Cora (em breve)</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Ambiente ativo para emissão</label>
            <div className="grid grid-cols-2 gap-2">
              {(['STAGE', 'PRODUCTION'] as Env[]).map(env => (
                <button key={env} type="button" onClick={() => setCfg('active_environment', env)}
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${config.active_environment === env ? 'border-pink-600 bg-pink-600 text-white' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>
                  {ENV_LABEL[env]}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500">Salve em “Parâmetros de cobrança”. Produção exige credenciais de Produção cadastradas.</p>
          </div>
        </div>
      </div>

      {/* Credenciais por ambiente */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="bg-slate-50 dark:bg-slate-800/50 px-4 md:px-5 py-3 border-b border-slate-200 dark:border-slate-700 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Credenciais e certificado</h2>
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {(['STAGE', 'PRODUCTION'] as Env[]).map(env => (
              <button key={env} type="button" onClick={() => setEnvTab(env)}
                className={`shrink-0 flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${envTab === env ? 'bg-pink-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                {ENV_LABEL[env]}
                {data.accounts[env].configured && <CheckCircle2 className="h-3.5 w-3.5" />}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 md:p-5 space-y-4">
          {/* Situação do certificado salvo */}
          {account.has_certificate ? (
            <div className={`rounded-lg border p-3 text-xs grid grid-cols-1 sm:grid-cols-3 gap-2 ${certWarning ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/20' : 'border-emerald-200 bg-emerald-50 dark:border-emerald-800/50 dark:bg-emerald-950/20'}`}>
              <div><span className="block text-slate-500">Certificado</span><span className="font-semibold text-slate-800 dark:text-slate-100 break-all">{account.cert_subject || '-'}</span></div>
              <div><span className="block text-slate-500">Validade</span><span className="font-semibold text-slate-800 dark:text-slate-100">{fmtDate(account.cert_valid_from)} → {fmtDate(account.cert_valid_until)}</span></div>
              <div className="flex items-center gap-1">
                <CalendarClock className={`h-4 w-4 ${certWarning ? 'text-amber-600' : 'text-emerald-600'}`} />
                <span className={`font-semibold ${certWarning ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {account.cert_days_left != null ? `${account.cert_days_left} dias restantes` : '-'} · {account.cert_format}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 p-3 text-xs text-slate-500">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Nenhum certificado importado para {ENV_LABEL[envTab]}.
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className={labelCls}>Client ID *</label>
              <input className={inputCls} value={clientId} onChange={e => setClientId(e.target.value)} placeholder="int-xxxxxxxxxxxx" autoComplete="off" />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Formato do certificado</label>
              <select className={inputCls} value={certFormat} onChange={e => { setCertFormat(e.target.value as CertFormat); setCertFile(null); setKeyFile(null); setPfxFile(null); }}>
                <option value="PEM">PEM: certificado (.pem) + chave privada (.key), formato do Cora</option>
                <option value="PFX">PFX / P12: arquivo único com senha</option>
              </select>
            </div>
          </div>

          {certFormat === 'PEM' ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FilePicker label="Certificado (.pem / .crt)" accept=".pem,.crt" file={certFile} onFile={setCertFile} icon={Upload} />
              <FilePicker label="Chave privada (.key / .pem)" accept=".key,.pem" file={keyFile} onFile={setKeyFile} icon={FileKey2} />
              <div className="space-y-1">
                <label className={labelCls}>Senha da chave (se houver)</label>
                <input type="password" className={inputCls} value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FilePicker label="Arquivo PFX / P12" accept=".pfx,.p12" file={pfxFile} onFile={setPfxFile} icon={FileKey2} />
              <div className="space-y-1">
                <label className={labelCls}>Senha do PFX *</label>
                <input type="password" className={inputCls} value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
              </div>
            </div>
          )}
          {account.has_certificate && <p className="text-[11px] text-slate-500">Para trocar só o Client ID, salve sem selecionar arquivos. O certificado atual é mantido.</p>}

          {/* Último teste */}
          {account.last_test_at && (
            <div className={`flex items-start gap-2 rounded-lg p-3 text-xs ${account.last_test_ok ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-300'}`}>
              {account.last_test_ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
              <span><b>Último teste ({fmtDateTime(account.last_test_at)}):</b> {account.last_test_message}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <button type="button" onClick={handleSaveAccount} disabled={savingAccount} className={`${btnCls} bg-pink-600 hover:bg-pink-700 text-white sm:flex-1`}>
              {savingAccount ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar credenciais
            </button>
            <button type="button" onClick={handleTest} disabled={testing || !account.configured} className={`${btnCls} border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 sm:flex-1`}>
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />} Testar conexão
            </button>
            <button type="button" onClick={handleRemove} disabled={removing || !account.has_certificate} className={`${btnCls} border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950/30`}>
              {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Remover
            </button>
          </div>
        </div>
      </div>

      {/* Parâmetros de cobrança */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="bg-slate-50 dark:bg-slate-800/50 px-4 md:px-5 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
          <BellRing className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Parâmetros de cobrança (padrão do seller)</h2>
        </div>
        <div className="p-4 md:p-5 space-y-4">
          <div className="space-y-1">
            <label className={labelCls}>Formas de pagamento do boleto</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {([['BANK_SLIP', 'Somente boleto'], ['BANK_SLIP_PIX', 'Boleto + QR Code Pix']] as const).map(([value, label]) => (
                <button key={value} type="button" onClick={() => setCfg('payment_forms', value)}
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold text-left transition-colors ${config.payment_forms === value ? 'border-pink-600 bg-pink-50 text-pink-700 dark:bg-pink-950/20 dark:text-pink-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className={labelCls}>Multa após o vencimento</label>
              <CurrencyInput value={config.fine_rate ?? 0} onChangeValue={v => setCfg('fine_rate', v)} suffixStr="%" max={100} className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Juros ao mês</label>
              <CurrencyInput value={config.interest_rate ?? 0} onChangeValue={v => setCfg('interest_rate', v)} suffixStr="%" max={100} className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Desconto até o vencimento</label>
              <CurrencyInput value={config.discount_rate ?? 0} onChangeValue={v => setCfg('discount_rate', v)} suffixStr="%" max={100} className={inputCls} />
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-white">Notificações de cobrança pelo Cora</p>
              <p className="text-xs text-slate-500">O Cora envia e-mails ao pagador nos momentos selecionados.</p>
            </div>
            <Toggle checked={config.notify_enabled} onChange={v => setCfg('notify_enabled', v)} />
          </div>
          {config.notify_enabled && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {data.options.notify_rules.map(rule => {
                const checked = config.notify_rules.includes(rule);
                return (
                  <label key={rule} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs cursor-pointer ${checked ? 'border-pink-400 bg-pink-50 text-pink-700 dark:bg-pink-950/20 dark:text-pink-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>
                    <input type="checkbox" className="accent-pink-600" checked={checked}
                      onChange={e => setCfg('notify_rules', e.target.checked ? [...config.notify_rules, rule] : config.notify_rules.filter(r => r !== rule))} />
                    {NOTIFY_LABEL[rule] || rule}
                  </label>
                );
              })}
            </div>
          )}

          <div className="flex justify-end">
            <button type="button" onClick={handleSaveConfig} disabled={savingConfig} className={`${btnCls} bg-pink-600 hover:bg-pink-700 text-white w-full sm:w-auto`}>
              {savingConfig ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar parâmetros
            </button>
          </div>
        </div>
      </div>

      {/* Webhook */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="bg-slate-50 dark:bg-slate-800/50 px-4 md:px-5 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
          <Link2 className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Aviso automático de pagamento (webhook)</h2>
        </div>
        <div className="p-4 md:p-5 space-y-3">
          <p className="text-xs flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            {data.webhook.registered
              ? <><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Registrado no Cora ({data.webhook.environment ? ENV_LABEL[data.webhook.environment] : '-'}).</>
              : <><Clock className="h-4 w-4 text-slate-400" /> Não registrado. A conciliação automática roda a cada 30 minutos.</>}
          </p>
          {data.webhook.registered && data.webhook.environment !== data.config.active_environment && (
            <p className="text-xs text-amber-700">O ambiente ativo mudou: registre o webhook novamente.</p>
          )}
          <div className="flex flex-col sm:flex-row gap-2">
            <input className={inputCls} value={webhookBase} onChange={e => setWebhookBase(e.target.value)} placeholder="URL pública HTTPS da API (ex.: https://api.seudominio.com.br)" />
            <button type="button" onClick={handleRegisterWebhook} disabled={registering || !webhookBase || !activeAccount?.configured}
              className={`${btnCls} border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 shrink-0`}>
              {registering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Registrar webhook
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
