'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  KeyRound,
  Copy,
  RefreshCw,
  ExternalLink,
  Server,
  Database,
  Activity,
  CheckCircle2,
  XCircle,
  Loader2,
  BookOpen,
  Globe,
  Lock,
} from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';
import Link from 'next/link';

interface BridgeAgentStatus {
  online: boolean;
  last_seen: string | null;
  seconds_since_heartbeat: number | null;
  agent_version: string;
  hostname: string;
  os_info: string;
  local_horus_url: string;
  local_horus_ok: boolean;
  local_sql_ok: boolean;
  local_sql_database: string;
  service_mode: boolean;
  total_requests_served: number;
  last_latency_ms: number;
  recent_logs: Array<{
    timestamp: string;
    method: string;
    endpoint: string;
    target_type: string;
    status_code: number;
    elapsed_ms: number;
  }>;
}

interface BridgeConfigData {
  company_id: number;
  company_name: string;
  company_document: string;
  module_horus_api_bridge: boolean;
  enabled: boolean;
  expires_at: string | null;
  expires_at_br: string | null;
  days_remaining: number | null;
  is_expired: boolean;
  is_valid: boolean;
  status_label: string;
  license_key: string | null;
  api_username: string | null;
  api_password: string | null;
  api_token: string | null;
  rate_limit_per_min: number;
  allow_financial_sql: boolean;
  custom_gateway_url: string | null;
  public_horus_base_url: string;
  public_seller_scoped_url: string;
  agent_status: BridgeAgentStatus;
}

export default function HorusApiBridgeMasterPanel({
  companyId,
  onCompanyRefresh,
}: {
  companyId: string;
  onCompanyRefresh?: () => void;
}) {
  const [config, setConfig] = useState<BridgeConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [moduleEnabled, setModuleEnabled] = useState(false);
  const [licenseEnabled, setLicenseEnabled] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  const [apiUsername, setApiUsername] = useState('');
  const [apiPassword, setApiPassword] = useState('');
  const [rateLimit, setRateLimit] = useState(120);
  const [allowFinancialSql, setAllowFinancialSql] = useState(true);
  const [customGatewayUrl, setCustomGatewayUrl] = useState('');

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const fetchConfig = useCallback(async () => {
    const token = getToken();
    if (!token || !companyId) return;
    try {
      const res = await fetch(`${apiUrl}/horus-api-bridge/config?company_id=${companyId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: BridgeConfigData = await res.json();
        setConfig(data);
        setModuleEnabled(!!data.module_horus_api_bridge);
        setLicenseEnabled(!!data.enabled);
        setExpiresAt(data.expires_at || '');
        setApiUsername(data.api_username || '');
        setApiPassword(data.api_password || '');
        setRateLimit(data.rate_limit_per_min || 120);
        setAllowFinancialSql(data.allow_financial_sql ?? true);
        setCustomGatewayUrl(data.custom_gateway_url || '');
      }
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  }, [apiUrl, companyId]);

  useEffect(() => {
    fetchConfig();
    const timer = setInterval(fetchConfig, 15000);
    return () => clearInterval(timer);
  }, [fetchConfig]);

  async function handleSave(overrides?: {
    module_horus_api_bridge?: boolean;
    enabled?: boolean;
    expires_at?: string;
    regenerate_token?: boolean;
    allow_financial_sql?: boolean;
  }) {
    setSaving(true);
    const token = getToken();
    try {
      const payload = {
        module_horus_api_bridge:
          overrides?.module_horus_api_bridge !== undefined ? overrides.module_horus_api_bridge : moduleEnabled,
        enabled: overrides?.enabled !== undefined ? overrides.enabled : licenseEnabled,
        expires_at: (overrides?.expires_at !== undefined ? overrides.expires_at : expiresAt) || null,
        api_username: apiUsername.trim() || null,
        api_password: apiPassword.trim() || null,
        regenerate_token: !!overrides?.regenerate_token,
        rate_limit_per_min: Number(rateLimit) || 120,
        allow_financial_sql:
          overrides?.allow_financial_sql !== undefined ? overrides.allow_financial_sql : allowFinancialSql,
        custom_gateway_url: customGatewayUrl.trim() || null,
      };

      const res = await fetch(`${apiUrl}/horus-api-bridge/config?company_id=${companyId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.detail || 'Falha ao salvar configuração da API Horus Paralela.');
        return;
      }

      const updated: BridgeConfigData = await res.json();
      setConfig(updated);
      setModuleEnabled(!!updated.module_horus_api_bridge);
      setLicenseEnabled(!!updated.enabled);
      setExpiresAt(updated.expires_at || '');
      setApiUsername(updated.api_username || '');
      setApiPassword(updated.api_password || '');
      setRateLimit(updated.rate_limit_per_min || 120);
      setAllowFinancialSql(updated.allow_financial_sql ?? true);
      setCustomGatewayUrl(updated.custom_gateway_url || '');
      if (onCompanyRefresh) onCompanyRefresh();
      toast.success('Configuração, Chave de Licença e Credenciais da API Horus Paralela salvas!');
    } catch (e: any) {
      toast.error(`Erro de rede: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  }

  function addDays(days: number) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const iso = `${yyyy}-${mm}-${dd}`;
    setExpiresAt(iso);
    setModuleEnabled(true);
    setLicenseEnabled(true);
  }

  function copyText(label: string, val?: string | null) {
    if (!val) return;
    navigator.clipboard.writeText(val);
    toast.success(`${label} copiado para a área de transferência!`);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400 py-4">
        <Loader2 className="h-4 w-4 animate-spin text-purple-500" /> Carregando API Horus Complementar (.EXE)...
      </div>
    );
  }

  const agent = config?.agent_status;

  return (
    <section className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mt-8">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
          <Server className="h-4 w-4 text-purple-600" /> API Horus B2B Complementar &amp; Agente Bridge (.EXE)
        </h3>
        <div className="flex items-center gap-2">
          <Link
            href={`/horus-api-docs?company_id=${companyId}`}
            target="_blank"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-sm transition-colors"
          >
            <BookOpen className="h-3.5 w-3.5" /> Abrir Documentação da API (Seller)
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-purple-200 dark:border-purple-500/30 bg-white dark:bg-slate-900/50 overflow-hidden shadow-sm">
        {/* Header Master Toggle */}
        <div
          className={`px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b transition-colors ${
            moduleEnabled
              ? 'bg-purple-50/80 dark:bg-purple-950/25 border-purple-200 dark:border-purple-500/30'
              : 'bg-slate-50 dark:bg-slate-800/40 border-slate-100 dark:border-slate-800'
          }`}
        >
          <div className="flex items-start sm:items-center gap-3">
            <div
              className={`p-2.5 rounded-xl border transition-colors ${
                moduleEnabled
                  ? 'bg-purple-600 text-white border-purple-500 shadow-sm'
                  : 'bg-slate-200 border-slate-300 text-slate-400 dark:bg-slate-700 dark:border-slate-600'
              }`}
            >
              <Server className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Habilitar API Horus B2B em Paralelo (HorusAPIBridge.exe)
                </p>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                    config?.is_valid
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                  }`}
                >
                  {config?.status_label || 'Desativado'}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Intermediador seguro para clientes sem porta liberada no firewall (8060/1433). Espelha todos os endpoints{' '}
                <code className="font-mono text-purple-600 dark:text-purple-400">TServerB2B</code> + endpoints Financeiros SQL via executável local com logo oficial Horus B2B.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                const next = !moduleEnabled;
                setModuleEnabled(next);
                setLicenseEnabled(next);
                handleSave({ module_horus_api_bridge: next, enabled: next });
              }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                moduleEnabled
                  ? 'bg-purple-600 text-white hover:bg-purple-700'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300'
              }`}
            >
              {moduleEnabled ? 'Módulo Ativo ✓' : 'Ativar Módulo'}
            </button>
          </div>
        </div>

        {/* Corpo de Configuração */}
        <div className="p-6 space-y-6">
          {/* Status em Tempo Real do Executável Local */}
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3">
              <div
                className={`h-3.5 w-3.5 rounded-full shrink-0 mt-1 sm:mt-0 ${
                  agent?.online ? 'bg-emerald-500 animate-pulse ring-4 ring-emerald-500/20' : 'bg-rose-500'
                }`}
              />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                    Status do Executável Local (HorusAPIBridge.exe):
                  </span>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                      agent?.online
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                        : 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300'
                    }`}
                  >
                    {agent?.online ? `ONLINE (${agent.hostname} • v${agent.agent_version})` : 'OFFLINE (Aguardando Conexão do .EXE)'}
                  </span>
                  {agent?.service_mode && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-300">
                      Serviço Windows
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  {agent?.last_seen
                    ? `Última comunicação: ${agent.last_seen} • Requisições atendidas: ${agent.total_requests_served} • Latência local: ${agent.last_latency_ms}ms`
                    : 'Nenhuma comunicação registrada ainda nesta sessão do servidor.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                  agent?.local_horus_ok
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300'
                    : 'bg-slate-100 border-slate-200 text-slate-500 dark:bg-slate-800 dark:border-slate-700'
                }`}
              >
                {agent?.local_horus_ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                API Local 8060
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                  agent?.local_sql_ok
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300'
                    : 'bg-slate-100 border-slate-200 text-slate-500 dark:bg-slate-800 dark:border-slate-700'
                }`}
              >
                {agent?.local_sql_ok ? <Database className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                SQL Local 1433 {agent?.local_sql_database ? `(${agent.local_sql_database})` : ''}
              </span>
              <button
                type="button"
                onClick={fetchConfig}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                title="Atualizar status agora"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Licenciamento e Validade */}
          <div className="p-4 rounded-2xl border border-purple-200 dark:border-purple-500/30 bg-purple-50/30 dark:bg-purple-950/15 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-purple-600" />
                <span className="text-xs font-extrabold uppercase tracking-wider text-purple-800 dark:text-purple-300">
                  Licença Criptográfica do Executável (HMAC-SHA256) &amp; Permissões
                </span>
              </div>
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={licenseEnabled}
                    onChange={e => setLicenseEnabled(e.target.checked)}
                    className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                  />
                  Licença Liberada
                </label>
                <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowFinancialSql}
                    onChange={e => setAllowFinancialSql(e.target.checked)}
                    className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                  />
                  Habilitar Endpoints Financeiros SQL via .EXE
                </label>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
              <div className="flex flex-col sm:flex-row sm:items-end gap-2 flex-1">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Data de Validade da Licença (.EXE)
                  </label>
                  <input
                    type="date"
                    value={expiresAt}
                    onChange={e => setExpiresAt(e.target.value)}
                    className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-100"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => addDays(-1)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300"
                  >
                    Expirar (Ontem)
                  </button>
                  <button
                    type="button"
                    onClick={() => addDays(30)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                  >
                    +30 Dias
                  </button>
                  <button
                    type="button"
                    onClick={() => addDays(90)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                  >
                    +90 Dias
                  </button>
                  <button
                    type="button"
                    onClick={() => addDays(365)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                  >
                    +1 Ano
                  </button>
                </div>
              </div>

              <button
                type="button"
                disabled={saving}
                onClick={() => handleSave()}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-sm disabled:opacity-50"
              >
                {saving ? 'Salvando...' : '🔑 Salvar & Gerar Chave do .EXE'}
              </button>
            </div>

            {config?.license_key && (
              <div className="p-2.5 rounded-xl bg-slate-900 text-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="truncate text-[11px] font-mono">
                  <span className="text-purple-400 font-bold mr-2">CHAVE LICENÇA (.EXE):</span>
                  {config.license_key}
                </div>
                <button
                  type="button"
                  onClick={() => copyText('Chave de licença', config.license_key)}
                  className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-bold shrink-0 inline-flex items-center gap-1"
                >
                  <Copy className="h-3 w-3" /> Copiar Chave
                </button>
              </div>
            )}
          </div>

          {/* Credenciais da API Pública para o Seller & Configuração de Droplet Dedicado */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
              <p className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-purple-600" /> Credenciais da API Pública (Para o Seller / Integrador)
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Usuário API (Basic Auth)
                  </label>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={apiUsername}
                      onChange={e => setApiUsername(e.target.value)}
                      placeholder="Ex: grupole_api"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => copyText('Usuário API', apiUsername)}
                      className="px-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Senha API (Basic Auth)
                  </label>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={apiPassword}
                      onChange={e => setApiPassword(e.target.value)}
                      placeholder="Senha da API"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => copyText('Senha API', apiPassword)}
                      className="px-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                    Token API (Bearer / X-API-Key)
                  </label>
                  <button
                    type="button"
                    onClick={() => handleSave({ regenerate_token: true })}
                    className="text-[11px] font-bold text-purple-600 hover:underline"
                  >
                    🔄 Rotacionar Token
                  </button>
                </div>
                <div className="flex gap-1">
                  <input
                    type="text"
                    readOnly
                    value={config?.api_token || 'Salve para gerar o token automaticamente'}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-950 text-xs font-mono text-slate-700 dark:text-slate-300"
                  />
                  <button
                    type="button"
                    onClick={() => copyText('Token API', config?.api_token)}
                    className="px-2.5 rounded-lg bg-slate-900 dark:bg-slate-700 text-white text-xs font-bold"
                  >
                    Copiar
                  </button>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
              <p className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-purple-600" /> Endpoints Públicos &amp; Droplet Dedicado
              </p>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                  URL Base Padrão Horus (Compatível 100% com Documentação Horus)
                </label>
                <div className="flex gap-1">
                  <input
                    type="text"
                    readOnly
                    value={config?.public_horus_base_url || ''}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-950 text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => copyText('URL Base da API', config?.public_horus_base_url)}
                    className="px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    URL de Droplet Dedicado de API (Opcional)
                  </label>
                  <input
                    type="text"
                    value={customGatewayUrl}
                    onChange={e => setCustomGatewayUrl(e.target.value)}
                    placeholder="Ex: https://api-horus.cronuz.com.br"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Rate Limit (req/min)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={5000}
                    value={rateLimit}
                    onChange={e => setRateLimit(Number(e.target.value) || 120)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-bold"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
