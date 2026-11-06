'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Wallet,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Settings2,
  Save,
  ChevronDown,
  ChevronUp,
  Building2,
  Receipt,
} from 'lucide-react';
import { toast } from 'sonner';
import { getToken } from '@/lib/auth';
import { useCompany } from '../context';
import CoraSettingsPanel from '@/components/payments/CoraSettingsPanel';
import {
  SellerPaymentRoutingMatrix,
  VindiCheckoutPanel,
} from '@/app/(dashboard)/settings/B2CCheckoutSettings';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface Provider {
  code: string;
  name: string;
  short_name?: string;
  methods: string[];
  config_location: 'HUB' | 'SELLER_SETTINGS';
  operational: boolean;
  enabled: boolean;
  configured: boolean;
  detail: string;
}
interface Channel {
  code: string;
  name: string;
  methods: string[];
}
interface Hub {
  providers: Provider[];
  channels: Channel[];
  method_labels: Record<string, string>;
  routes: Record<string, Record<string, string>>;
}

export default function CompanyPaymentsHubPage() {
  const { company } = useCompany();
  const [hub, setHub] = useState<Hub | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [openConfig, setOpenConfig] = useState<string | null>(null);
  const [settings, setSettings] = useState<any>({});
  const [savingSettings, setSavingSettings] = useState(false);

  const headers = () => ({
    Authorization: `Bearer ${getToken()}`,
    'Content-Type': 'application/json',
  });

  const load = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    try {
      const [hubRes, settingsRes] = await Promise.all([
        fetch(`${API}/companies/${company.id}/payments/hub`, { headers: headers() }),
        fetch(`${API}/companies/${company.id}/settings`, { headers: headers() }),
      ]);
      const hubBody = await hubRes.json();
      if (!hubRes.ok) throw new Error(hubBody?.detail || 'Erro ao carregar o Hub de Pagamentos.');
      setHub(hubBody);

      if (settingsRes.ok) {
        const sData = await settingsRes.json();
        setSettings({
          vindi_api_key: sData.vindi_api_key || '',
          vindi_sandbox: sData.vindi_sandbox ?? true,
          vindi_integration_mode: sData.vindi_integration_mode || 'TRANSPARENT',
          vindi_express_cpf_only: sData.vindi_express_cpf_only !== false,
          vindi_max_installments: sData.vindi_max_installments || 6,
          vindi_allow_pix: sData.vindi_allow_pix !== false,
          vindi_allow_credit_card: sData.vindi_allow_credit_card !== false,
          vindi_allow_boleto: Boolean(sData.vindi_allow_boleto),
          vindi_postal_code_seller: sData.vindi_postal_code_seller || '01001000',
          vindi_reseller_token: sData.vindi_reseller_token || '',
          vindi_consumer_key: sData.vindi_consumer_key || '',
          vindi_consumer_secret: sData.vindi_consumer_secret || '',
          vindi_access_token: sData.vindi_access_token || '',
          vindi_return_url: sData.vindi_return_url || '',
          b2c_checkout_mode: sData.b2c_checkout_mode || 'NATIVE_GATEWAY',
          tray_enabled: Boolean(sData.tray_enabled),
          b2c_showcases_config: sData.b2c_showcases_config || {},
          payment_gateway_active: sData.payment_gateway_active || 'EFI',
          efi_sandbox: sData.efi_sandbox ?? true,
          efi_client_id: sData.efi_client_id || '',
          efi_client_secret: sData.efi_client_secret || '',
          efi_payee_code: sData.efi_payee_code || '',
          efi_certificate_path: sData.efi_certificate_path || '',
          inter_enabled: Boolean(sData.inter_enabled),
          inter_sandbox: sData.inter_sandbox ?? true,
          inter_api_version: sData.inter_api_version || 'V2',
          inter_client_id: sData.inter_client_id || '',
          inter_client_secret: sData.inter_client_secret || '',
          inter_account_number: sData.inter_account_number || '',
          cielo_merchant_id: sData.cielo_merchant_id || '',
          cielo_client_id: sData.cielo_client_id || '',
          cielo_client_secret: sData.cielo_client_secret || '',
          rede_pv: sData.rede_pv || '',
          rede_token: sData.rede_token || '',
        });
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [company]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleProvider = async (p: Provider) => {
    if (!company) return;
    if (
      p.enabled &&
      !confirm(
        `Desabilitar ${p.name} para este seller? As rotas que usam ${p.name} serão removidas.`
      )
    )
      return;
    setToggling(p.code);
    try {
      const res = await fetch(`${API}/companies/${company.id}/payments/providers/${p.code}`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({ enabled: !p.enabled }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.detail || 'Erro ao atualizar intermediador.');
      setHub(body);
      toast.success(
        `${p.name} ${!p.enabled ? 'habilitado' : 'desabilitado'}${
          body.removed_routes ? ` · ${body.removed_routes} rota(s) removida(s)` : ''
        }.`
      );
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setToggling(null);
    }
  };

  const handleSaveProviderSettings = async () => {
    if (!company) return;
    setSavingSettings(true);
    try {
      const payload = { ...settings };
      delete payload._hub_routes;
      delete payload._hub_channel_modes;
      delete payload._hub_channels;
      const res = await fetch(`${API}/companies/${company.id}/settings`, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.detail || 'Falha ao salvar credenciais do provedor.');
      toast.success('Credenciais e parâmetros do provedor salvos com sucesso!');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar credenciais.');
    } finally {
      setSavingSettings(false);
    }
  };

  if (loading || !hub || !company) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="p-3 md:p-6 space-y-6 overflow-y-auto max-h-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-900/30">
            <Wallet className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">
              Central de Pagamentos &amp; Bancos (Master)
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Selecione a operação abaixo (B2C, B2B, PDV, Eventos, Assinaturas, Financeiro Horus) e clique no provedor para abrir suas configurações.
            </p>
          </div>
        </div>
      </div>

      {/* PASSO 1: SELETOR DE OPERAÇÕES (B2C, EVENTOS, ASSINATURAS, B2B, HORUS ERP, FINANCEIRO CRONUZ, PDV) */}
      <SellerPaymentRoutingMatrix
        companyId={Number(company.id)}
        settings={settings}
        setSettings={setSettings}
        activeProviderDrawer={openConfig}
        onJumpToProvider={(provCode) => {
          setOpenConfig(provCode);
          setTimeout(() => {
            const el = document.getElementById('master-provider-credentials-drawer');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 80);
        }}
      />

      {/* PASSO 2: INTERMEDIADORES HABILITADOS & ABERTURA DE CREDENCIAIS SOB DEMANDA */}
      <section
        id="master-provider-credentials-drawer"
        className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4 shadow-sm"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block">
              Passo 2 • Intermediadores &amp; Bancos Homologados
            </span>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-indigo-600" />
              Habilitação de Provedores e Configuração Sob Demanda
            </h2>
            <p className="text-xs text-slate-500">
              Habilite/desabilite provedores para este seller ou clique em <strong>Abrir Configurações</strong> para editar chaves e certificados.
            </p>
          </div>
          {openConfig && (
            <button
              type="button"
              onClick={() => setOpenConfig(null)}
              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 shrink-0 cursor-pointer"
            >
              Fechar Painel do Provedor ✕
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {hub.providers.map((p) => {
            const isOpened = openConfig === p.code;
            return (
              <div
                key={p.code}
                className={`rounded-xl border p-4 flex flex-col justify-between space-y-3 transition-all ${
                  isOpened
                    ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/30 ring-2 ring-indigo-500/20 shadow-sm'
                    : p.enabled
                    ? 'border-slate-200 bg-slate-50/40 dark:border-slate-800 dark:bg-slate-900/40'
                    : 'border-slate-200 opacity-75 dark:border-slate-800'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{p.name}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {p.methods.map((m) => (
                          <span
                            key={m}
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                          >
                            {hub.method_labels[m] || m}
                          </span>
                        ))}
                      </div>
                    </div>
                    {toggling === p.code ? (
                      <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                    ) : (
                      <label
                        className="relative inline-flex cursor-pointer items-center shrink-0"
                        title={p.enabled ? 'Habilitado para o seller' : 'Desabilitado'}
                      >
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={p.enabled}
                          onChange={() => toggleProvider(p)}
                        />
                        <div className="peer h-6 w-11 rounded-full bg-slate-200 peer-checked:bg-indigo-600 transition-colors dark:bg-slate-700 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-all peer-checked:after:translate-x-5" />
                      </label>
                    )}
                  </div>

                  <p
                    className={`text-xs flex items-center gap-1.5 ${
                      p.configured ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500'
                    }`}
                  >
                    {p.configured ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                    )}
                    {p.detail}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setOpenConfig(isOpened ? null : p.code)}
                  className={`w-full inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition-all cursor-pointer ${
                    isOpened
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {isOpened ? (
                    <>
                      <ChevronUp className="h-4 w-4" /> Fechar Configurações
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4" /> Abrir Configurações ({p.short_name || p.code})
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* PAINEL DE CONFIGURAÇÃO DO PROVEDOR SELECIONADO (SOB DEMANDA) */}
        {openConfig === 'CORA' && (
          <div className="rounded-2xl border border-pink-200 dark:border-pink-900/50 p-3 md:p-5 bg-white dark:bg-slate-900 animate-in fade-in">
            <CoraSettingsPanel companyId={company.id} embedded />
          </div>
        )}

        {openConfig === 'VINDI' && (
          <div className="space-y-4 rounded-2xl border border-indigo-200 dark:border-indigo-900/50 p-4 md:p-5 bg-white dark:bg-slate-900 animate-in fade-in">
            <VindiCheckoutPanel settings={settings} setSettings={setSettings} />
            <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                disabled={savingSettings}
                onClick={handleSaveProviderSettings}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar Credenciais Vindi
              </button>
            </div>
          </div>
        )}

        {openConfig === 'EFI' && (
          <div className="p-5 rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-slate-50/60 dark:bg-slate-900/40 space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg">
                  <Receipt className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Efí Bank / Gerencianet (PIX, Boleto e Cartão)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Credenciais OAuth2 da Efí para esta empresa.
                  </p>
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(settings.efi_sandbox)}
                  onChange={(e) => setSettings({ ...settings, efi_sandbox: e.target.checked })}
                  className="rounded text-emerald-600"
                />
                Modo Sandbox
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">Client ID</label>
                <input
                  type="text"
                  value={settings.efi_client_id || ''}
                  onChange={(e) => setSettings({ ...settings, efi_client_id: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">Client Secret</label>
                <input
                  type="password"
                  value={settings.efi_client_secret || ''}
                  onChange={(e) => setSettings({ ...settings, efi_client_secret: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">Payee Code (Identificador)</label>
                <input
                  type="text"
                  value={settings.efi_payee_code || ''}
                  onChange={(e) => setSettings({ ...settings, efi_payee_code: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-mono"
                />
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                disabled={savingSettings}
                onClick={handleSaveProviderSettings}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar Credenciais Efí
              </button>
            </div>
          </div>
        )}

        {openConfig === 'INTER' && (
          <div className="p-5 rounded-2xl border border-orange-200 dark:border-orange-900/50 bg-slate-50/60 dark:bg-slate-900/40 space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-orange-500/10 text-orange-600 dark:text-orange-400 rounded-lg">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Banco Inter (Boletos &amp; BolePix V2/V3)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Parâmetros de integração mTLS do Banco Inter.
                  </p>
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs font-bold text-orange-700 dark:text-orange-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(settings.inter_enabled)}
                  onChange={(e) => setSettings({ ...settings, inter_enabled: e.target.checked })}
                  className="rounded text-orange-600"
                />
                Integração Inter Ativa
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">Conta Corrente</label>
                <input
                  type="text"
                  value={settings.inter_account_number || ''}
                  onChange={(e) => setSettings({ ...settings, inter_account_number: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">Client ID</label>
                <input
                  type="text"
                  value={settings.inter_client_id || ''}
                  onChange={(e) => setSettings({ ...settings, inter_client_id: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">Client Secret</label>
                <input
                  type="password"
                  value={settings.inter_client_secret || ''}
                  onChange={(e) => setSettings({ ...settings, inter_client_secret: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-mono"
                />
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                disabled={savingSettings}
                onClick={handleSaveProviderSettings}
                className="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar Credenciais Banco Inter
              </button>
            </div>
          </div>
        )}

        {(openConfig === 'CIELO' || openConfig === 'REDE') && (
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 space-y-4 animate-in fade-in">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Credenciais Cielo / Rede (e.Rede)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
                <h4 className="text-xs font-extrabold uppercase text-slate-700 dark:text-slate-300">Cielo API 3.0</h4>
                <input
                  type="text"
                  placeholder="Merchant ID"
                  value={settings.cielo_merchant_id || ''}
                  onChange={(e) => setSettings({ ...settings, cielo_merchant_id: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-mono"
                />
                <input
                  type="text"
                  placeholder="Client ID"
                  value={settings.cielo_client_id || ''}
                  onChange={(e) => setSettings({ ...settings, cielo_client_id: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-mono"
                />
                <input
                  type="password"
                  placeholder="Client Secret"
                  value={settings.cielo_client_secret || ''}
                  onChange={(e) => setSettings({ ...settings, cielo_client_secret: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-mono"
                />
              </div>
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
                <h4 className="text-xs font-extrabold uppercase text-slate-700 dark:text-slate-300">Rede (e.Rede Itaú)</h4>
                <input
                  type="text"
                  placeholder="PV (Filiação)"
                  value={settings.rede_pv || ''}
                  onChange={(e) => setSettings({ ...settings, rede_pv: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-mono"
                />
                <input
                  type="password"
                  placeholder="Token de Integração"
                  value={settings.rede_token || ''}
                  onChange={(e) => setSettings({ ...settings, rede_token: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-mono"
                />
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                disabled={savingSettings}
                onClick={handleSaveProviderSettings}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar Credenciais Cielo / Rede
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
