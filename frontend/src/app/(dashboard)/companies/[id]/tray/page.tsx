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
  ExternalLink,
  ShieldCheck,
  Sparkles,
  Settings2,
} from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';
import { useCompany } from '../context';

export default function MasterTrayAndB2CSettingsPage() {
  const params = useParams();
  const companyId = params.id as string;
  const { company } = useCompany();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [showGlobalEditor, setShowGlobalEditor] = useState(false);

  // Credenciais Universais do App Cronuz na Tray (compartilhadas entre todos os sellers)
  const [globalApp, setGlobalApp] = useState({
    app_name: 'App Cronuz Tray',
    consumer_key: '',
    consumer_secret: '',
  });

  // Dados exclusivos da loja Tray deste Seller (Apenas URL + CODE)
  const [form, setForm] = useState({
    tray_enabled: false,
    tray_store_url: '',
    tray_auth_code: '',
    tray_store_id: '',
    tray_api_address: '',
    tray_access_token: '',
    tray_refresh_token: '',
    tray_token_expires_at: '',
  });

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const token = getToken();
      const [resSettings, resGlobal] = await Promise.all([
        fetch(`${apiUrl}/companies/${companyId}/settings`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${apiUrl}/b2c/tray/global-app`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (resGlobal.ok) {
        const gData = await resGlobal.json();
        setGlobalApp({
          app_name: gData.app_name || 'App Cronuz Tray',
          consumer_key: gData.consumer_key || '',
          consumer_secret: gData.consumer_secret || '',
        });
        if (!gData.consumer_key || !gData.consumer_secret) {
          setShowGlobalEditor(true);
        }
      }

      if (resSettings.ok) {
        const data = await resSettings.json();
        setForm({
          tray_enabled: Boolean(data.tray_enabled),
          tray_store_url: data.tray_store_url || '',
          tray_auth_code: data.tray_auth_code || '',
          tray_store_id: data.tray_store_id || '',
          tray_api_address: data.tray_api_address || '',
          tray_access_token: data.tray_access_token || '',
          tray_refresh_token: data.tray_refresh_token || '',
          tray_token_expires_at: data.tray_token_expires_at || '',
        });
      }
    } catch (error) {
      toast.error('Erro ao carregar configurações da Tray.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (companyId) fetchSettings();
  }, [companyId]);

  const handleSaveGlobalApp = async () => {
    if (!globalApp.consumer_key.trim() || !globalApp.consumer_secret.trim()) {
      toast.error('Informe a Consumer Key e o Consumer Secret do App Cronuz na Tray.');
      return;
    }
    setSavingGlobal(true);
    try {
      const token = getToken();
      const res = await fetch(`${apiUrl}/b2c/tray/global-app`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(globalApp),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'App Universal Cronuz salvo com sucesso!');
        setShowGlobalEditor(false);
      } else {
        toast.error(data.detail || 'Erro ao salvar credenciais universais.');
      }
    } catch (e) {
      toast.error('Erro de conexão ao salvar App Universal.');
    } finally {
      setSavingGlobal(false);
    }
  };

  const handleSaveSellerTray = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      const token = getToken();
      let cleanUrl = form.tray_store_url.trim().replace(/\/+$/, '');
      if (cleanUrl && !cleanUrl.startsWith('http')) {
        cleanUrl = `https://${cleanUrl}`;
      }
      // Remove /web_api if the user pasted the full web_api URL into the store URL field
      const baseStoreUrl = cleanUrl.replace(/(\/web_api)+(\/auth)?$/i, '').replace(/\/+$/, '');
      const derivedApiAddress = baseStoreUrl ? `${baseStoreUrl}/web_api` : '';

      const res = await fetch(`${apiUrl}/companies/${companyId}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          tray_enabled: form.tray_enabled,
          tray_store_url: baseStoreUrl,
          tray_auth_code: form.tray_auth_code.trim(),
          tray_api_address: derivedApiAddress,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setForm((prev) => ({
          ...prev,
          tray_store_url: updated.tray_store_url || baseStoreUrl,
          tray_api_address: updated.tray_api_address || derivedApiAddress,
        }));
        toast.success('Vínculo da loja Tray do Seller salvo com sucesso!');
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Erro ao salvar dados da Tray do Seller.');
      }
    } catch (error) {
      toast.error('Erro de conexão ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const handleAuthenticateTray = async () => {
    setAuthenticating(true);
    try {
      await handleSaveSellerTray();
      const token = getToken();
      const res = await fetch(`${apiUrl}/b2c/tray/authenticate/${companyId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'Autenticado na Tray com sucesso!');
        fetchSettings();
      } else {
        toast.error(data.detail || 'Falha ao autenticar na Tray.');
      }
    } catch (error) {
      toast.error('Erro ao comunicar com o servidor.');
    } finally {
      setAuthenticating(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await handleSaveSellerTray();
      const token = getToken();
      const res = await fetch(`${apiUrl}/b2c/tray/test-connection/${companyId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setTestResult(data);
        toast.success('Diagnóstico da Tray executado!');
      } else {
        toast.error(data.detail || 'Falha no teste da Tray.');
      }
    } catch (error) {
      toast.error('Erro ao testar conexão.');
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center text-slate-500 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> Carregando integração Tray...
      </div>
    );
  }

  const hasUniversalAppConfigured = Boolean(globalApp.consumer_key && globalApp.consumer_secret);

  return (
    <div className="space-y-6">
      {/* 1. Card do App Universal Cronuz na Tray (Configurado uma única vez no Master) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-5 md:p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/60 dark:bg-slate-800/30">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <KeyRound className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Credenciais Universais do App Cronuz na Tray (Master Global)
                </h2>
                {hasUniversalAppConfigured ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <CheckCircle2 className="w-3.5 h-3.5" /> App Cronuz Pré-Definido Ativo
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    <AlertCircle className="w-3.5 h-3.5" /> Pendente Configurar App Universal
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                O <strong>Consumer Key</strong> e <strong>Consumer Secret</strong> do App Cronuz são universais para todos os sellers. Configure apenas uma vez aqui no Master.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowGlobalEditor(!showGlobalEditor)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <Settings2 className="w-4 h-4" />
            {showGlobalEditor ? 'Ocultar Credenciais do App' : 'Editar App Universal Cronuz'}
          </button>
        </div>

        {showGlobalEditor && (
          <div className="p-5 md:p-6 bg-indigo-50/30 dark:bg-indigo-950/10 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Consumer Key Universal (App Cronuz)
                </label>
                <input
                  type="text"
                  placeholder="Chave pública do App Cronuz na Tray"
                  value={globalApp.consumer_key}
                  onChange={(e) => setGlobalApp({ ...globalApp, consumer_key: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Consumer Secret Universal (App Cronuz)
                </label>
                <input
                  type="password"
                  placeholder="Chave secreta do App Cronuz na Tray"
                  value={globalApp.consumer_secret}
                  onChange={(e) => setGlobalApp({ ...globalApp, consumer_secret: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white font-mono"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSaveGlobalApp}
                disabled={savingGlobal}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
              >
                {savingGlobal ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar Credenciais Universais do Cronuz
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2. Vínculo da Loja Tray deste Seller (Apenas CODE e URL da Tray) */}
      <form onSubmit={handleSaveSellerTray} className="space-y-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Loja Tray do Seller ({company?.name || `Empresa #${companyId}`})
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Preencha apenas a <strong>URL da loja Tray</strong> e o <strong>CODE</strong> de autorização deste Seller. A autenticação usa automaticamente o App Universal do Cronuz.
                </p>
              </div>
            </div>

            <label className="inline-flex items-center gap-3 cursor-pointer bg-slate-50 dark:bg-slate-800/60 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <input
                type="checkbox"
                checked={form.tray_enabled}
                onChange={(e) => setForm({ ...form, tray_enabled: e.target.checked })}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Integração Tray Ativa neste Seller
              </span>
            </label>
          </div>

          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  URL da Loja Tray do Seller
                </label>
                <input
                  type="text"
                  placeholder="https://www.lojadocliente.com.br"
                  value={form.tray_store_url}
                  onChange={(e) => setForm({ ...form, tray_store_url: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                />
                <p className="text-xs text-slate-400 mt-1">
                  O endpoint da API (<code>/web_api</code>) e o MCP Storefront (<code>/mcp-app/storefront</code>) são derivados automaticamente desta URL.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  CODE (Código de Autorização da Loja Tray)
                </label>
                <input
                  type="text"
                  placeholder="Código gerado ao instalar o App Cronuz na loja Tray"
                  value={form.tray_auth_code}
                  onChange={(e) => setForm({ ...form, tray_auth_code: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white font-mono"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Código retornado pela Tray na instalação/autorização da loja do cliente.
                </p>
              </div>
            </div>

            {/* Status dos Tokens e Ações */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {form.tray_access_token ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Access Token OAuth2 Ativo
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                      <AlertCircle className="w-3.5 h-3.5" /> Aguardando Geração de Token
                    </span>
                  )}
                  {form.tray_store_id && (
                    <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                      Loja Tray ID: #{form.tray_store_id}
                    </span>
                  )}
                  {form.tray_token_expires_at && (
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Expira em: {new Date(form.tray_token_expires_at).toLocaleString('pt-BR')}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  As regras de frete, criação de cupons e visualização de carrinhos ficam disponíveis diretamente no painel do Seller em <strong>B2C</strong>.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleAuthenticateTray}
                  disabled={authenticating}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {authenticating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <KeyRound className="w-4 h-4" />
                  )}
                  Gerar Token OAuth2 (/auth)
                </button>

                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testing}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  {testing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  Testar MCP & API Tray
                </button>
              </div>
            </div>

            {testResult && (
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/30 space-y-2 text-xs">
                <div className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-500" />
                  Diagnóstico de Conectividade Tray (API OAuth2 + MCP Storefront)
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <div className="font-bold text-slate-700 dark:text-slate-300 mb-1">
                      API Privada OAuth2 (<code>/web_api</code> — Principal):{' '}
                      <span className={testResult.oauth_ok ? 'text-emerald-600' : 'text-amber-500'}>
                        {testResult.oauth_ok ? '100% AUTENTICADA & ATIVA' : 'PENDENTE / VERIFICAR'}
                      </span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 font-medium">{testResult.oauth_message}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <div className="font-bold text-slate-700 dark:text-slate-300 mb-1">
                      MCP Storefront (<code>/mcp-app/storefront</code> — Complementar):{' '}
                      <span className={testResult.mcp_ok ? 'text-emerald-600' : 'text-amber-600'}>
                        {testResult.mcp_ok ? 'ONLINE' : 'OPCIONAL (OPERANDO VIA /web_api)'}
                      </span>
                    </div>
                    <pre className="text-[11px] text-slate-500 overflow-x-auto max-h-28 whitespace-pre-wrap">
                      {typeof testResult.mcp_info === 'object' && testResult.mcp_info?.detalhe
                        ? testResult.mcp_info.detalhe
                        : JSON.stringify(testResult.mcp_info, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-200 dark:border-slate-800 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar Vínculo Tray do Seller
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
