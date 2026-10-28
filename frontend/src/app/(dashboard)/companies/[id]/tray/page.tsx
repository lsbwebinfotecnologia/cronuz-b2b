'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  ShoppingBag,
  Globe,
  KeyRound,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  CreditCard,
  ExternalLink,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';
import { CurrencyInput } from '@/components/CurrencyInput';
import { useCompany } from '../context';

export default function MasterTrayAndB2CSettingsPage() {
  const params = useParams();
  const companyId = params.id as string;
  const { company, refreshCompany } = useCompany();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  const [b2cDomain, setB2cDomain] = useState('');
  const [form, setForm] = useState({
    b2c_storefront_open: false,
    b2c_checkout_mode: 'NATIVE_GATEWAY',
    b2c_default_freight_value: 15.9,
    b2c_free_shipping_min_value: 150.0,
    b2c_lgpd_terms_text: '',
    tray_enabled: false,
    tray_store_url: '',
    tray_api_address: '',
    tray_store_id: '',
    tray_consumer_key: '',
    tray_consumer_secret: '',
    tray_auth_code: '',
    tray_access_token: '',
    tray_refresh_token: '',
    tray_token_expires_at: '',
  });

  useEffect(() => {
    if (company) {
      setB2cDomain(company.b2c_custom_domain || '');
    }
  }, [company]);

  useEffect(() => {
    async function loadSettings() {
      setLoading(true);
      try {
        const token = getToken();
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/settings`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const data = await res.json();
          setForm({
            b2c_storefront_open: Boolean(data.b2c_storefront_open),
            b2c_checkout_mode: data.b2c_checkout_mode || 'NATIVE_GATEWAY',
            b2c_default_freight_value: Number(data.b2c_default_freight_value || 0),
            b2c_free_shipping_min_value: Number(data.b2c_free_shipping_min_value || 0),
            b2c_lgpd_terms_text: data.b2c_lgpd_terms_text || '',
            tray_enabled: Boolean(data.tray_enabled),
            tray_store_url: data.tray_store_url || '',
            tray_api_address: data.tray_api_address || '',
            tray_store_id: data.tray_store_id || '',
            tray_consumer_key: data.tray_consumer_key || '',
            tray_consumer_secret: data.tray_consumer_secret || '',
            tray_auth_code: data.tray_auth_code || '',
            tray_access_token: data.tray_access_token || '',
            tray_refresh_token: data.tray_refresh_token || '',
            tray_token_expires_at: data.tray_token_expires_at || '',
          });
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    if (companyId) loadSettings();
  }, [companyId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = getToken();
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

      // 1. Update b2c_custom_domain on company if changed
      if (company) {
        await fetch(`${apiBase}/companies/${companyId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: company.name,
            document: company.document,
            domain: company.domain,
            b2c_custom_domain: b2cDomain.trim() || null,
          }),
        });
      }

      // 2. Save CompanySettings
      const res = await fetch(`${apiBase}/companies/${companyId}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Falha ao salvar configurações.');
      }

      toast.success('Configurações da Tray e Storefront Aberto B2C salvas com sucesso!');
      refreshCompany();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const handleAuthenticateTray = async () => {
    setAuthenticating(true);
    try {
      await handleSave();
      const token = getToken();
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${apiBase}/b2c/tray/authenticate/${companyId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro na autenticação OAuth da Tray.');

      setForm((prev) => ({
        ...prev,
        tray_store_id: data.store_id || prev.tray_store_id,
        tray_api_address: data.api_address || prev.tray_api_address,
        tray_token_expires_at: data.token_expires_at || prev.tray_token_expires_at,
      }));
      toast.success(data.message || 'Tokens OAuth2 gerados com sucesso!');
    } catch (e: any) {
      toast.error(e.message || 'Falha ao autenticar na Tray.');
    } finally {
      setAuthenticating(false);
    }
  };

  const handleTestTray = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await handleSave();
      const token = getToken();
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${apiBase}/b2c/tray/test-connection/${companyId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao testar conexão Tray.');
      setTestResult(data);
      if (data.mcp_ok || data.oauth_ok) {
        toast.success('Conexão com a Tray validada!');
      } else {
        toast.warning('Teste concluído com alertas. Verifique os detalhes abaixo.');
      }
    } catch (e: any) {
      toast.error(e.message || 'Erro ao testar conexão.');
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary-base)]" />
      </div>
    );
  }

  return (
    <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/60 dark:bg-slate-950/50">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 border border-fuchsia-500/20">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                Storefront Aberto B2C &amp; Integração Tray (REST + MCP)
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                Configure o domínio aberto B2C, regras de finalização (Intermediador vs. Tray) e credenciais da App Cronuz na Tray.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--color-primary-base)] hover:opacity-95 text-white text-sm font-bold shadow-sm disabled:opacity-50 transition-all"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar Configurações
        </button>
      </div>

      <div className="p-4 sm:p-6 space-y-6">
        {/* 1. Domínio B2C & Modo de Checkout */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 space-y-5 bg-slate-50/40 dark:bg-slate-950/30">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Globe className="w-5 h-5 text-fuchsia-600" />
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  1. Domínio B2C Aberto &amp; Regra de Finalização (Checkout)
                </h2>
                <p className="text-xs text-slate-500">
                  Defina como o cliente acessa a loja B2C sem login prévio e por onde paga eventual diferença quando o pedido ultrapassar o saldo do cupom.
                </p>
              </div>
            </div>

            <label className="inline-flex items-center gap-2.5 cursor-pointer select-none bg-white dark:bg-slate-900 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800">
              <input
                type="checkbox"
                checked={form.b2c_storefront_open}
                onChange={(e) => setForm({ ...form, b2c_storefront_open: e.target.checked })}
                className="w-4 h-4 rounded text-fuchsia-600 focus:ring-fuchsia-500"
              />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Abrir Vitrine B2C Direto no Domínio Principal
              </span>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Domínio Próprio Exclusivo B2C (Ex: loja.editora.com.br)
              </label>
              <input
                type="text"
                value={b2cDomain}
                onChange={(e) => setB2cDomain(e.target.value)}
                placeholder="Ex: beneficios.cliente.com.br"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Qualquer acesso a este domínio abrirá automaticamente a vitrine aberta B2C com os produtos do Horus.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Modo de Finalização quando houver Diferença a Pagar (Compra &gt; Cupom)
              </label>
              <select
                value={form.b2c_checkout_mode}
                onChange={(e) => setForm({ ...form, b2c_checkout_mode: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-900 dark:text-white"
              >
                <option value="NATIVE_GATEWAY">
                  Intermediador de Pagamento Nativo (Pix / Cartão no próprio Cronuz)
                </option>
                <option value="TRAY_REDIRECT">
                  Integração Tray E-commerce (Cria Cliente + Cupom + Carrinho na Tray e redireciona)
                </option>
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                Nota: Quando o cupom cobre 100% do pedido, o sistema finaliza diretamente e gera o novo cupom com o saldo residual automaticamente.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Valor de Frete Padrão B2C (R$)
              </label>
              <CurrencyInput
                prefixStr="R$ "
                value={form.b2c_default_freight_value}
                onChangeValue={(val) => setForm({ ...form, b2c_default_freight_value: val })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Frete Grátis Acima de (R$)
              </label>
              <CurrencyInput
                prefixStr="R$ "
                value={form.b2c_free_shipping_min_value}
                onChangeValue={(val) => setForm({ ...form, b2c_free_shipping_min_value: val })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-900 dark:text-white"
              />
            </div>
          </div>
        </section>

        {/* 2. Credenciais Tray E-commerce (App Cronuz + Loja do Cliente + MCP Storefront) */}
        <section className="rounded-2xl border border-indigo-200/80 dark:border-indigo-900/40 p-4 sm:p-6 space-y-5 bg-indigo-50/20 dark:bg-indigo-950/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <KeyRound className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  2. Credenciais da Integração Tray E-commerce (API REST + Novo MCP Storefront)
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
                    MCP 2025-11-25 Ready
                  </span>
                </h2>
                <p className="text-xs text-slate-500">
                  Informe o código do aplicativo Cronuz (`consumer_key` / `consumer_secret`), o código de autorização (`code`) da loja do cliente e a URL da loja Tray.
                </p>
              </div>
            </div>

            <label className="inline-flex items-center gap-2.5 cursor-pointer select-none bg-white dark:bg-slate-900 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800">
              <input
                type="checkbox"
                checked={form.tray_enabled}
                onChange={(e) => setForm({ ...form, tray_enabled: e.target.checked })}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Integração Tray Ativa
              </span>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                URL da Loja Tray do Cliente (`store_url`)
              </label>
              <input
                type="text"
                value={form.tray_store_url}
                onChange={(e) => setForm({ ...form, tray_store_url: e.target.value })}
                placeholder="https://www.lojadocliente.com.br"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Endpoint MCP automático: <code className="text-indigo-600 dark:text-indigo-400">{(form.tray_store_url || 'https://loja.com.br').replace(/\/$/, '')}/mcp-app/storefront</code>
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Endereço da API REST (`api_address`)
              </label>
              <input
                type="text"
                value={form.tray_api_address}
                onChange={(e) => setForm({ ...form, tray_api_address: e.target.value })}
                placeholder="https://www.lojadocliente.com.br/web_api"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Código da Loja na Tray (`store_id`)
              </label>
              <input
                type="text"
                value={form.tray_store_id}
                onChange={(e) => setForm({ ...form, tray_store_id: e.target.value })}
                placeholder="Ex: 123456"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-mono text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Consumer Key (Código App Cronuz)
              </label>
              <input
                type="text"
                value={form.tray_consumer_key}
                onChange={(e) => setForm({ ...form, tray_consumer_key: e.target.value })}
                placeholder="consumer_key da App Cronuz"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-mono text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Consumer Secret (Chave Secreta App Cronuz)
              </label>
              <input
                type="password"
                value={form.tray_consumer_secret}
                onChange={(e) => setForm({ ...form, tray_consumer_secret: e.target.value })}
                placeholder="••••••••••••••••••••"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-mono text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Código de Autorização do Cliente (`code`)
              </label>
              <input
                type="text"
                value={form.tray_auth_code}
                onChange={(e) => setForm({ ...form, tray_auth_code: e.target.value })}
                placeholder="Código gerado ao instalar a App na loja"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-mono text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Access Token Atual (Gerado via `/auth` ou Manual)
              </label>
              <input
                type="text"
                value={form.tray_access_token}
                onChange={(e) => setForm({ ...form, tray_access_token: e.target.value })}
                placeholder="Gerado automaticamente ao clicar em Autenticar"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-mono text-slate-600 dark:text-slate-300"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                Refresh Token Atual
              </label>
              <input
                type="text"
                value={form.tray_refresh_token}
                onChange={(e) => setForm({ ...form, tray_refresh_token: e.target.value })}
                placeholder="Renovado automaticamente pelo Cronuz"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-mono text-slate-600 dark:text-slate-300"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleAuthenticateTray}
              disabled={authenticating}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold shadow-sm disabled:opacity-50"
            >
              {authenticating ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              Autenticar `POST /auth` (Gerar Access Token)
            </button>

            <button
              type="button"
              onClick={handleTestTray}
              disabled={testing}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 text-slate-800 dark:text-slate-100 text-xs sm:text-sm font-bold disabled:opacity-50"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Testar Conexão (MCP Storefront + API REST)
            </button>

            {form.tray_token_expires_at && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" />
                Token válido até: {new Date(form.tray_token_expires_at).toLocaleString('pt-BR')}
              </span>
            )}
          </div>

          {testResult && (
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
              <div className="flex flex-wrap items-center gap-4">
                <span className={`font-bold flex items-center gap-1.5 ${testResult.mcp_ok ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {testResult.mcp_ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  MCP Storefront (`{testResult.mcp_endpoint}`): {testResult.mcp_ok ? 'ONLINE' : 'Indisponível'}
                </span>
                <span className={`font-bold flex items-center gap-1.5 ${testResult.oauth_ok ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {testResult.oauth_ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  OAuth2 REST API: {testResult.oauth_ok ? 'AUTENTICADO' : 'Não autenticado'}
                </span>
              </div>
              {testResult.errors?.length > 0 && (
                <div className="text-rose-600 dark:text-rose-400 space-y-1 pt-1">
                  {testResult.errors.map((err: string, i: number) => (
                    <p key={i}>• {err}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* 3. Termo de Consentimento LGPD */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              3. Texto de Consentimento e Privacidade LGPD (Exibido no Cadastro/Checkout B2C)
            </h2>
          </div>
          <textarea
            rows={4}
            value={form.b2c_lgpd_terms_text}
            onChange={(e) => setForm({ ...form, b2c_lgpd_terms_text: e.target.value })}
            placeholder="Deixe em branco para usar o termo padrão da Lei Geral de Proteção de Dados (Lei nº 13.709/2018)..."
            className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-800 dark:text-slate-200"
          />
        </section>
      </div>
    </div>
  );
}
