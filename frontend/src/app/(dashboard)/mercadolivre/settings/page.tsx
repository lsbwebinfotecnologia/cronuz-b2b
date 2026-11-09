'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Save,
  KeyRound,
  CheckCircle2,
  Sparkles,
  BookOpen,
  FolderTree,
  DollarSign,
  Database,
  ExternalLink,
  Loader2,
  Search,
  RefreshCw,
  Info,
  PlugZap,
  ChevronDown,
  Copy,
  Unplug,
  ShieldCheck,
  Store,
  X,
} from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';
import { CurrencyInput } from '@/components/CurrencyInput';
import { MeliStepHeader } from '@/components/mercadolivre/MeliStepHeader';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface LocalCategory {
  id: number;
  name: string;
}

const MARKETPLACE_CHANNELS = [
  {
    id: 'mercadolivre',
    name: 'Mercado Livre',
    badge: 'OFICIAL • ATIVO',
    tagline: 'Catálogo, MLB1196, Estoque Delta & Mercado Envios',
    color: 'bg-amber-400 text-slate-950 border-amber-500/40',
    available: true,
  },
  {
    id: 'shopee',
    name: 'Shopee',
    badge: 'EM BREVE',
    tagline: 'Sincronização de Anúncios, Estoque & Pedidos Shopee',
    color: 'bg-orange-500 text-white border-orange-500/40',
    available: false,
  },
  {
    id: 'amazon',
    name: 'Amazon Brasil',
    badge: 'EM BREVE',
    tagline: 'Publicação por ISBN/ASIN (SP-API), BuyBox & Pedidos',
    color: 'bg-slate-900 text-amber-400 border-slate-700',
    available: false,
  },
  {
    id: 'magalu',
    name: 'Magalu',
    badge: 'EM BREVE',
    tagline: 'Integrações de Catálogo, Estoque & Pedidos Magalu',
    color: 'bg-sky-600 text-white border-sky-500/40',
    available: false,
  },
  {
    id: 'tiktok',
    name: 'TikTok Shop',
    badge: 'EM BREVE',
    tagline: 'Social Commerce, Catálogo Sincronizado & Pedidos',
    color: 'bg-pink-600 text-white border-pink-500/40',
    available: false,
  },
  {
    id: 'americanas',
    name: 'Americanas',
    badge: 'EM BREVE',
    tagline: 'Conector B2W / Americanas Marketplace & Estoque',
    color: 'bg-rose-600 text-white border-rose-500/40',
    available: false,
  },
  {
    id: 'estantevirtual',
    name: 'Estante Virtual',
    badge: 'EM BREVE',
    tagline: 'Especializado em Livreiros, Editoras & Acervo ISBN',
    color: 'bg-indigo-600 text-white border-indigo-500/40',
    available: false,
  },
];

export default function MercadoLivreSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingConn, setTestingConn] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // Credenciais OAuth2 & App Instalado
  const [meliEnabled, setMeliEnabled] = useState(false);
  const [meliAppId, setMeliAppId] = useState('');
  const [meliClientSecret, setMeliClientSecret] = useState('');
  const [secretConfigured, setSecretConfigured] = useState(false);
  const [meliRedirectUri, setMeliRedirectUri] = useState('');
  const [defaultCallbackUrl, setDefaultCallbackUrl] = useState('');
  const [effectiveAppReady, setEffectiveAppReady] = useState(false);
  const [usingGlobalApp, setUsingGlobalApp] = useState(false);
  const [meliAccessToken, setMeliAccessToken] = useState('');
  const [hasAccessToken, setHasAccessToken] = useState(false);
  const [meliUserId, setMeliUserId] = useState('');
  const [meliNickname, setMeliNickname] = useState('');
  const [showAdvancedCreds, setShowAdvancedCreds] = useState(false);
  const [showQuickAppModal, setShowQuickAppModal] = useState(false);
  const [saveAsGlobalApp, setSaveAsGlobalApp] = useState(true);

  // Contexto Horus
  const [usesHorus, setUsesHorus] = useState(false);
  const [horusCompany, setHorusCompany] = useState('');
  const [horusBranch, setHorusBranch] = useState('');
  const [horusStockLocal, setHorusStockLocal] = useState('');
  const [horusLegacyPagination, setHorusLegacyPagination] = useState(false);

  // Preset de Publicação, Categorias, Preço e Estoque
  const [nicheMode, setNicheMode] = useState<'BOOKS' | 'GENERAL'>('BOOKS');
  const [defaultCategoryId, setDefaultCategoryId] = useState('MLB1196');
  const [defaultCategoryName, setDefaultCategoryName] = useState(
    'Livros, Revistas e Comics > Livros Físicos'
  );
  const [defaultListingType, setDefaultListingType] = useState('gold_special');
  const [defaultCondition, setDefaultCondition] = useState('new');
  const [priceRuleType, setPriceRuleType] = useState<'PERCENTAGE' | 'FIXED'>('PERCENTAGE');
  const [priceRuleValue, setPriceRuleValue] = useState<number>(0);
  const [addFixedFeeUnder79, setAddFixedFeeUnder79] = useState(false);
  const [fixedFeeUnder79, setFixedFeeUnder79] = useState<number>(6.0);
  const [minStockBuffer, setMinStockBuffer] = useState<number>(1);
  const [defaultWarrantyType, setDefaultWarrantyType] = useState('Garantia do vendedor');
  const [defaultWarrantyTime, setDefaultWarrantyTime] = useState('30 dias');
  const [defaultLanguage, setDefaultLanguage] = useState('Português');
  const [defaultBookCover, setDefaultBookCover] = useState('Mole');
  const [defaultPublisherFallback, setDefaultPublisherFallback] = useState('Editora');
  const [defaultAuthorFallback, setDefaultAuthorFallback] = useState('Vários Autores');
  const [autoSyncStock, setAutoSyncStock] = useState(true);
  const [autoImportOrders, setAutoImportOrders] = useState(true);
  const [horusDefaultCustomerDoc, setHorusDefaultCustomerDoc] = useState('');
  const [horusDefaultCustomerGuid, setHorusDefaultCustomerGuid] = useState('');

  // De/Para de Categorias Locais -> Categorias MLB
  const [localCategories, setLocalCategories] = useState<LocalCategory[]>([]);
  const [categoryMapping, setCategoryMapping] = useState<
    Record<string, { meli_category_id: string; meli_category_name: string }>
  >({});

  // Buscador / Preditor de Categoria ao vivo
  const [predictQuery, setPredictQuery] = useState('');
  const [predictResults, setPredictResults] = useState<
    Array<{ category_id: string; category_name: string }>
  >([]);
  const [predicting, setPredicting] = useState(false);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/mercadolivre/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMeliEnabled(!!data.meli_enabled);
        setMeliAppId(data.meli_app_id || '');
        setSecretConfigured(!!data.meli_client_secret_configured);
        const cbUrl = data.default_callback_url || `${API_URL}/mercadolivre/oauth/callback`;
        setDefaultCallbackUrl(cbUrl);
        setMeliRedirectUri(data.meli_redirect_uri || cbUrl);
        setEffectiveAppReady(!!data.effective_app_ready);
        setUsingGlobalApp(!!data.using_global_app);
        setHasAccessToken(!!data.has_access_token);
        setMeliUserId(data.meli_user_id || '');
        setMeliNickname(data.meli_nickname || '');

        setUsesHorus(!!data.uses_horus);
        setHorusCompany(data.horus_company || '');
        setHorusBranch(data.horus_branch || '');
        setHorusStockLocal(data.horus_stock_local || '');
        setHorusLegacyPagination(!!data.horus_legacy_pagination);
        setLocalCategories(data.local_categories || []);

        const p = data.preset || {};
        setNicheMode(p.niche_mode === 'GENERAL' ? 'GENERAL' : 'BOOKS');
        setDefaultCategoryId(p.default_category_id || 'MLB1196');
        setDefaultCategoryName(
          p.default_category_name || 'Livros, Revistas e Comics > Livros Físicos'
        );
        setDefaultListingType(p.default_listing_type || 'gold_special');
        setDefaultCondition(p.default_condition || 'new');
        setPriceRuleType(p.price_rule_type === 'FIXED' ? 'FIXED' : 'PERCENTAGE');
        setPriceRuleValue(Number(p.price_rule_value || 0));
        setAddFixedFeeUnder79(!!p.add_fixed_fee_under_79);
        setFixedFeeUnder79(Number(p.fixed_fee_under_79 ?? 6.0));
        setMinStockBuffer(Number(p.min_stock_buffer ?? 1));
        setDefaultWarrantyType(p.default_warranty_type || 'Garantia do vendedor');
        setDefaultWarrantyTime(p.default_warranty_time || '30 dias');
        setDefaultLanguage(p.default_language || 'Português');
        setDefaultBookCover(p.default_book_cover || 'Mole');
        setDefaultPublisherFallback(p.default_publisher_fallback || 'Editora');
        setDefaultAuthorFallback(p.default_author_fallback || 'Vários Autores');
        setAutoSyncStock(p.auto_sync_stock ?? true);
        setAutoImportOrders(p.auto_import_orders ?? true);
        setHorusDefaultCustomerDoc(p.horus_default_customer_doc || '');
        setHorusDefaultCustomerGuid(p.horus_default_customer_guid || '');
        setCategoryMapping(p.category_mapping || {});
      }
    } catch {
      toast.error('Erro ao carregar as configurações do Mercado Livre.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('installed') === '1') {
        toast.success('Aplicativo Mercado Livre instalado e conta autenticada com sucesso!');
        window.history.replaceState({}, '', window.location.pathname);
      }
      const oauthCode = urlParams.get('code');
      if (oauthCode) {
        window.history.replaceState({}, '', window.location.pathname);
        (async () => {
          try {
            const token = getToken();
            const res = await fetch(`${API_URL}/mercadolivre/oauth/exchange`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ code: oauthCode }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
              toast.success(data.message || 'Conta Mercado Livre autenticada automaticamente!');
              fetchSettings();
            } else {
              toast.error(data.detail || 'Não foi possível trocar o código OAuth.');
            }
          } catch {
            toast.error('Erro ao processar retorno automático do Mercado Livre.');
          }
        })();
      }
    }
  }, []);

  // Escuta retorno automático do popup OAuth do Mercado Livre
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (ev.data && ev.data.type === 'MELI_OAUTH_COMPLETE') {
        if (ev.data.ok) {
          toast.success(
            `App Mercado Livre instalado! Conta ${ev.data.nickname || ''} conectada com sucesso.`
          );
          fetchSettings();
        } else {
          toast.error('Não foi possível concluir a autorização automática no Mercado Livre.');
        }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Atalho F2 para salvar rapidamente estilo Access Moderno
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const handleSave = async (extraFlags?: { saveGlobal?: boolean; silent?: boolean }) => {
    setSaving(true);
    try {
      const token = getToken();
      const body: Record<string, any> = {
        meli_enabled: meliEnabled,
        meli_app_id: meliAppId,
        meli_redirect_uri: meliRedirectUri,
        meli_user_id: meliUserId,
        meli_nickname: meliNickname,
        save_as_global_app: extraFlags?.saveGlobal ?? false,
        meli_preset_config: {
          niche_mode: nicheMode,
          default_category_id: nicheMode === 'BOOKS' ? 'MLB1196' : defaultCategoryId,
          default_category_name:
            nicheMode === 'BOOKS'
              ? 'Livros, Revistas e Comics > Livros Físicos'
              : defaultCategoryName,
          default_listing_type: defaultListingType,
          default_condition: defaultCondition,
          price_rule_type: priceRuleType,
          price_rule_value: priceRuleValue,
          add_fixed_fee_under_79: addFixedFeeUnder79,
          fixed_fee_under_79: fixedFeeUnder79,
          min_stock_buffer: minStockBuffer,
          default_warranty_type: defaultWarrantyType,
          default_warranty_time: defaultWarrantyTime,
          default_language: defaultLanguage,
          default_book_cover: defaultBookCover,
          default_publisher_fallback: defaultPublisherFallback,
          default_author_fallback: defaultAuthorFallback,
          auto_sync_stock: autoSyncStock,
          auto_import_orders: autoImportOrders,
          horus_default_customer_doc: horusDefaultCustomerDoc,
          horus_default_customer_guid: horusDefaultCustomerGuid,
          category_mapping: categoryMapping,
        },
      };
      if (meliClientSecret.trim()) body.meli_client_secret = meliClientSecret.trim();
      if (meliAccessToken.trim()) body.meli_access_token = meliAccessToken.trim();

      const res = await fetch(`${API_URL}/mercadolivre/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.detail || 'Não foi possível salvar as configurações.');
        return false;
      }
      if (!extraFlags?.silent) {
        toast.success(data.message || 'Pré-configurações salvas com sucesso!');
      }
      setMeliClientSecret('');
      setMeliAccessToken('');
      await fetchSettings();
      return true;
    } catch {
      toast.error('Erro de comunicação ao salvar configurações.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Instalação 1-Clique: Redireciona para o Mercado Livre para aceitar o App Cronuz
  const handleInstallAndConnectMeli = async (mode: 'redirect' | 'popup' = 'redirect') => {
    // Se ainda não há App ID configurado nem globalmente nem no seller, abre o modal guiado de 1 passo
    if (!effectiveAppReady && !meliAppId.trim()) {
      setShowQuickAppModal(true);
      return;
    }

    try {
      await handleSave({ saveGlobal: saveAsGlobalApp, silent: true });
      const token = getToken();
      const frontendOrigin = typeof window !== 'undefined' ? window.location.origin : '';
      const res = await fetch(
        `${API_URL}/mercadolivre/oauth/url?redirect_uri=${encodeURIComponent(
          meliRedirectUri || defaultCallbackUrl
        )}&frontend_origin=${encodeURIComponent(frontendOrigin)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setShowQuickAppModal(true);
        toast.error(data.detail || 'Configure o App ID para iniciar a instalação.');
        return;
      }
      if (data.auth_url) {
        setShowQuickAppModal(false);
        if (mode === 'popup') {
          window.open(data.auth_url, 'CronuzMeliOAuth', 'width=680,height=740');
        } else {
          window.location.href = data.auth_url;
        }
      }
    } catch {
      toast.error('Não foi possível redirecionar para a página de autorização do Mercado Livre.');
    }
  };

  const handleDisconnectMeli = async () => {
    setDisconnecting(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/mercadolivre/oauth/disconnect`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(data.message || 'Conta desconectada com sucesso.');
        fetchSettings();
      } else {
        toast.error(data.detail || 'Não foi possível desconectar a conta.');
      }
    } catch {
      toast.error('Erro ao desconectar conta do Mercado Livre.');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConn(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/mercadolivre/test-connection`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.detail || 'Falha ao autenticar no Mercado Livre.');
        return;
      }
      toast.success(data.message || 'Conexão validada com sucesso!');
      fetchSettings();
    } catch {
      toast.error('Erro ao testar conexão com o Mercado Livre.');
    } finally {
      setTestingConn(false);
    }
  };

  const handlePredictSearch = async () => {
    if (!predictQuery.trim()) return;
    setPredicting(true);
    try {
      const token = getToken();
      const res = await fetch(
        `${API_URL}/mercadolivre/categories/predict?q=${encodeURIComponent(predictQuery.trim())}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setPredictResults(data.suggestions || []);
      }
    } catch {
      toast.error('Erro ao buscar categoria no Mercado Livre.');
    } finally {
      setPredicting(false);
    }
  };

  // Simulador ao vivo do preço para autoexplicação
  const simulatedPrice50 = useMemo(() => {
    let p = 50.0;
    if (priceRuleType === 'PERCENTAGE') {
      p = p * (1 + priceRuleValue / 100);
    } else {
      p = p + priceRuleValue;
    }
    if (addFixedFeeUnder79 && p < 79) {
      p += fixedFeeUnder79;
    }
    return Math.max(0, p);
  }, [priceRuleType, priceRuleValue, addFixedFeeUnder79, fixedFeeUnder79]);

  const isAppInstalled = hasAccessToken || Boolean(meliNickname);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-12">
      {/* Cabeçalho Unificado com Stepper de 4 Etapas e Botão Primário Único */}
      <MeliStepHeader
        currentStep={1}
        title="Central de Aplicativos Marketplace & Pré-Configurações"
        explanation="Instale o aplicativo oficial do Mercado Livre com 1 clique e defina suas regras automáticas de categoria, preço e estoque."
        guideSteps={[
          'Clique em "Instalar & Autorizar no Mercado Livre" e aceite a permissão',
          'Escolha a Categoria Automática (Livros MLB1196 ou Preditor)',
          'Defina Markup e Buffer de Estoque e pressione F2 (ou Salvar)',
        ]}
        actions={
          <button
            type="button"
            onClick={() => handleSave()}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs sm:text-sm shadow-sm transition cursor-pointer disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar Pré-Configurações (F2)
          </button>
        }
      />

      {/* BLOCO 1.1: APP STORE / INSTALAÇÃO AUTOMÁTICA MERCADO LIVRE + ECOSSISTEMA DE MARKETPLACES */}
      <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-start gap-3.5">
            <div className="h-12 w-12 rounded-2xl bg-amber-400 text-slate-950 border border-amber-500/40 flex items-center justify-center font-black text-base shadow-sm shrink-0">
              ML
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 font-mono text-[10px] font-black uppercase">
                  1.1 • Aplicativo Oficial Cronuz
                </span>
                {isAppInstalled ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 text-[11px] font-extrabold">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    APP INSTALADO &amp; ATIVO {meliNickname ? `• @${meliNickname}` : ''}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 text-[11px] font-bold">
                    Pronto para Instalar (OAuth 2.0 Automático)
                  </span>
                )}
              </div>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white mt-1">
                Conector Oficial Mercado Livre Brasil
              </h2>
              <p className="text-xs text-slate-500 max-w-2xl">
                Ao clicar em <strong>Instalar &amp; Autorizar no Mercado Livre</strong>, você será direcionado para a página oficial do Mercado Livre para aceitar o aplicativo Cronuz B2B. O retorno e a renovação de token acontecem automaticamente.
              </p>
            </div>
          </div>

          {/* Ação Principal de Instalação / Status da Conta Instalada */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {isAppInstalled ? (
              <>
                <div className="px-3.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/70 text-xs">
                  <p className="font-extrabold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    {meliNickname || 'Conta Conectada'}
                  </p>
                  <p className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400">
                    Seller ID: {meliUserId || 'Autenticado'} • Renovação Automática Ativa
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testingConn}
                  className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  {testingConn ? 'Testando...' : 'Testar Conexão'}
                </button>

                <button
                  type="button"
                  onClick={() => handleInstallAndConnectMeli('redirect')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 text-xs font-bold cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Reconectar / Trocar Conta
                </button>

                <button
                  type="button"
                  onClick={handleDisconnectMeli}
                  disabled={disconnecting}
                  title="Desinstalar / Desconectar conta"
                  className="p-2.5 rounded-xl border border-rose-200 dark:border-rose-900/60 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-bold cursor-pointer"
                >
                  <Unplug className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => handleInstallAndConnectMeli('redirect')}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-amber-400 dark:hover:bg-amber-500 dark:text-slate-950 text-xs sm:text-sm font-extrabold shadow-sm transition cursor-pointer"
                >
                  <PlugZap className="h-4 w-4 text-amber-400 dark:text-slate-950" />
                  Instalar &amp; Autorizar no Mercado Livre
                  <ExternalLink className="h-3.5 w-3.5 opacity-80" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Galeria Visual de Apps do Hub Marketplaces (Mercado Livre + Próximos Canais) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Store className="h-3.5 w-3.5 text-amber-500" />
              Aplicativos do Hub Marketplaces Cronuz B2B
            </span>
            <button
              type="button"
              onClick={() => setShowAdvancedCreds((prev) => !prev)}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
            >
              <KeyRound className="h-3 w-3" />
              {showAdvancedCreds ? 'Ocultar Credenciais Técnicas' : 'Credenciais Técnicas / App Próprio'}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${showAdvancedCreds ? 'rotate-180' : ''}`}
              />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5">
            {MARKETPLACE_CHANNELS.map((ch) => {
              const activeChannel = ch.id === 'mercadolivre';
              return (
                <div
                  key={ch.id}
                  onClick={() => {
                    if (activeChannel && !isAppInstalled) {
                      handleInstallAndConnectMeli('redirect');
                    }
                  }}
                  className={`p-3 rounded-xl border transition flex flex-col justify-between gap-2 ${
                    activeChannel
                      ? 'border-amber-400 bg-amber-50/40 dark:bg-amber-950/20 shadow-xs cursor-pointer'
                      : 'border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 opacity-75'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${ch.color}`}
                    >
                      {ch.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span
                      className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded ${
                        activeChannel
                          ? isAppInstalled
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-amber-200/80 text-amber-950'
                          : 'bg-slate-200/70 dark:bg-slate-800 text-slate-500'
                      }`}
                    >
                      {activeChannel ? (isAppInstalled ? 'INSTALADO' : 'INSTALAR') : ch.badge}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                      {ch.name}
                    </p>
                    <p className="text-[10px] text-slate-500 line-clamp-2 mt-0.5 leading-tight">
                      {ch.tagline}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Acordeão Opcional: Credenciais Técnicas / App Próprio / Token Manual */}
        {showAdvancedCreds && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                Configuração Avançada do Aplicativo (DevCenter Mercado Livre) ou Token Manual
              </p>
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveAsGlobalApp}
                  onChange={(e) => setSaveAsGlobalApp(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600"
                />
                Usar este App ID como Conector Padrão do Cronuz B2B
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  App ID (Client ID no DevCenter ML)
                </label>
                <input
                  type="text"
                  value={meliAppId}
                  onChange={(e) => setMeliAppId(e.target.value)}
                  placeholder="Ex: 583920192839102"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Client Secret {secretConfigured ? '(Já salvo ✓)' : ''}
                </label>
                <input
                  type="password"
                  value={meliClientSecret}
                  onChange={(e) => setMeliClientSecret(e.target.value)}
                  placeholder={secretConfigured ? '••••••••••••••••' : 'Cole a chave secreta do App'}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Redirect URI (URL de Callback OAuth)
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={meliRedirectUri}
                    onChange={(e) => setMeliRedirectUri(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(meliRedirectUri || defaultCallbackUrl);
                      toast.success('Redirect URI copiada!');
                    }}
                    title="Copiar Redirect URI"
                    className="px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 cursor-pointer"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Access Token Manual {hasAccessToken ? '(Ativo ✓)' : '(Opcional)'}
                </label>
                <input
                  type="password"
                  value={meliAccessToken}
                  onChange={(e) => setMeliAccessToken(e.target.value)}
                  placeholder={hasAccessToken ? 'APP_USR-••••••••••••' : 'Cole APP_USR-... se desejar'}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs"
                />
              </div>
            </div>

            {/* Auxiliar para Teste em Ambiente Local antes do Deploy em Produção */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="text-xs">
                <p className="font-bold text-slate-700 dark:text-slate-200">
                  Testando em Localhost antes de subir para Produção?
                </p>
                <p className="text-[11px] text-slate-500">
                  Após aceitar o app no Mercado Livre, se ele redirecionar para <code className="font-mono">api.cronuzb2b.com.br/...?code=TG-...</code>, cole a URL ou o código <code className="font-mono">TG-...</code> ao lado:
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="text"
                  placeholder="Cole a URL de retorno ou código TG-..."
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter') {
                      const raw = (e.currentTarget.value || '').trim();
                      if (!raw) return;
                      let extracted = raw;
                      try {
                        if (raw.includes('code=')) {
                          const u = new URL(raw.startsWith('http') ? raw : `https://x.com?${raw}`);
                          extracted = u.searchParams.get('code') || raw;
                        }
                      } catch {}
                      const token = getToken();
                      const res = await fetch(`${API_URL}/mercadolivre/oauth/exchange`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          Authorization: `Bearer ${token}`,
                        },
                        body: JSON.stringify({ code: extracted }),
                      });
                      const data = await res.json().catch(() => ({}));
                      if (res.ok) {
                        toast.success(data.message || 'Conta Mercado Livre instalada com sucesso!');
                        fetchSettings();
                      } else {
                        toast.error(data.detail || 'Não foi possível validar o código TG.');
                      }
                    }
                  }}
                  className="w-64 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs"
                />
                <span className="text-[10px] font-mono text-slate-400">(Pressione Enter)</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL RÁPIDO 1-PASSO: ATIVAR APP ID MERCADO LIVRE E REDIRECIONAR */}
      {showQuickAppModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-5 sm:p-6 shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-amber-400 text-slate-950 font-black flex items-center justify-center text-sm">
                  ML
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                    Instalar Aplicativo Mercado Livre no Cronuz
                  </h3>
                  <p className="text-xs text-slate-500">
                    Informe o App ID uma única vez para habilitar o redirecionamento automático ao Mercado Livre.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowQuickAppModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-800/50 space-y-1">
                <p className="font-bold text-amber-900 dark:text-amber-200">
                  1. No portal developers.mercadolivre.com.br, cadastre esta Redirect URI no seu App:
                </p>
                <div className="flex items-center justify-between gap-2 bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-lg border border-amber-200 dark:border-slate-700 font-mono text-[11px]">
                  <span className="truncate">{meliRedirectUri || defaultCallbackUrl}</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(meliRedirectUri || defaultCallbackUrl);
                      toast.success('Redirect URI copiada!');
                    }}
                    className="text-indigo-600 font-sans font-bold shrink-0 cursor-pointer"
                  >
                    Copiar
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                  2. App ID (ID do Aplicativo no Mercado Livre)
                </label>
                <input
                  type="text"
                  value={meliAppId}
                  onChange={(e) => setMeliAppId(e.target.value)}
                  placeholder="Ex: 583920192839102"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">
                  3. Client Secret (Chave Secreta do Aplicativo)
                </label>
                <input
                  type="password"
                  value={meliClientSecret}
                  onChange={(e) => setMeliClientSecret(e.target.value)}
                  placeholder="Cole sua Secret Key do Mercado Livre"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs"
                />
              </div>

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveAsGlobalApp}
                  onChange={(e) => setSaveAsGlobalApp(e.target.checked)}
                  className="rounded border-slate-300 text-amber-500"
                />
                Salvar como App Oficial Global do Cronuz B2B (próximos sellers instalam em 1 clique)
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowQuickAppModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleInstallAndConnectMeli('redirect')}
                disabled={!meliAppId.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-extrabold cursor-pointer disabled:opacity-50"
              >
                <PlugZap className="h-4 w-4" />
                Salvar &amp; Ir para o Mercado Livre
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BLOCO 1.2: CATEGORIAS & FICHA TÉCNICA AUTOMÁTICA */}
      <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-3.5">
          <div className="h-9 w-9 rounded-xl bg-indigo-500/15 text-indigo-600 flex items-center justify-center font-mono font-black text-xs">
            1.2
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              Classificação de Categoria &amp; Preenchimento Automático da Ficha Técnica
            </h2>
            <p className="text-xs text-slate-500">
              Elimina o preenchimento manual: o sistema lê o cadastro do Cronuz/Horus e injeta os atributos obrigatórios do Mercado Livre.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => {
              setNicheMode('BOOKS');
              setDefaultCategoryId('MLB1196');
              setDefaultCategoryName('Livros, Revistas e Comics > Livros Físicos');
            }}
            className={`text-left p-4 rounded-2xl border-2 transition cursor-pointer ${
              nicheMode === 'BOOKS'
                ? 'border-amber-500 bg-amber-50/40 dark:bg-amber-950/20'
                : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-amber-600">
                Opção A • Livrarias, Editoras &amp; Distribuidoras
              </span>
              {nicheMode === 'BOOKS' && <CheckCircle2 className="h-4 w-4 text-amber-500" />}
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white mt-1">
              Categoria Fixa de Livros Físicos (MLB1196)
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Não exige mapear categorias. Todos os itens entram direto em <strong>MLB1196 (Livros Físicos)</strong> enviando `GTIN/ISBN`, `Título`, `Autor`, `Editora`, `Idioma` e `Capa` automaticamente.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setNicheMode('GENERAL')}
            className={`text-left p-4 rounded-2xl border-2 transition cursor-pointer ${
              nicheMode === 'GENERAL'
                ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/20'
                : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-indigo-600">
                Opção B • Papelaria, Brinquedos &amp; Variedades
              </span>
              {nicheMode === 'GENERAL' && <CheckCircle2 className="h-4 w-4 text-indigo-500" />}
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white mt-1">
              Preditor Inteligente ML + Vínculo De/Para
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Consulta a IA do Mercado Livre (`/domain_discovery`) pelo título do item para descobrir a categoria oficial ou utiliza a tabela De/Para abaixo.
            </p>
          </button>
        </div>

        {nicheMode === 'GENERAL' && (
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={predictQuery}
                  onChange={(e) => setPredictQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handlePredictSearch()}
                  placeholder="Teste o preditor: digite o nome de um item (ex: Mochila Escolar, Caderno 10 Matérias)..."
                  className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm"
                />
              </div>
              <button
                type="button"
                onClick={handlePredictSearch}
                disabled={predicting}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                {predicting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Consultar Categoria no ML
              </button>
            </div>

            {predictResults.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {predictResults.map((r) => (
                  <button
                    key={r.category_id}
                    type="button"
                    onClick={() => {
                      setDefaultCategoryId(r.category_id);
                      setDefaultCategoryName(r.category_name);
                      toast.success(`Categoria padrão definida: ${r.category_id}`);
                    }}
                    className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-indigo-500 text-left text-xs flex items-center justify-between cursor-pointer"
                  >
                    <div>
                      <span className="font-mono font-bold text-indigo-600">{r.category_id}</span>
                      <p className="text-slate-600 dark:text-slate-300 truncate">{r.category_name}</p>
                    </div>
                    <span className="text-[11px] font-bold text-indigo-600">Definir Padrão</span>
                  </button>
                ))}
              </div>
            )}

            {localCategories.length > 0 && (
              <div className="space-y-2 pt-2">
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <FolderTree className="h-3.5 w-3.5 text-indigo-500" />
                  Tabela De/Para: Categoria Local Cronuz → Código Categoria MLB
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {localCategories.map((cat) => {
                    const current = categoryMapping[String(cat.id)] || {
                      meli_category_id: '',
                      meli_category_name: '',
                    };
                    return (
                      <div
                        key={cat.id}
                        className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                      >
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
                          {cat.name}
                        </span>
                        <input
                          type="text"
                          value={current.meli_category_id}
                          onChange={(e) =>
                            setCategoryMapping((prev) => ({
                              ...prev,
                              [String(cat.id)]: {
                                meli_category_id: e.target.value.toUpperCase().trim(),
                                meli_category_name: cat.name,
                              },
                            }))
                          }
                          placeholder="Ex: MLB1196"
                          className="w-28 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs uppercase"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Valores Padrão de Fallback da Ficha Técnica */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
              Tipo de Exposição no ML
            </label>
            <select
              value={defaultListingType}
              onChange={(e) => setDefaultListingType(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
            >
              <option value="gold_special">Clássico (gold_special — Menor Tarifa)</option>
              <option value="gold_pro">Premium (gold_pro — Sem Juros p/ Cliente)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
              Acabamento de Capa (Se vazio no ERP)
            </label>
            <select
              value={defaultBookCover}
              onChange={(e) => setDefaultBookCover(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
            >
              <option value="Mole">Capa Mole / Brochura</option>
              <option value="Dura">Capa Dura</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
              Idioma Padrão (Se vazio no ERP)
            </label>
            <input
              type="text"
              value={defaultLanguage}
              onChange={(e) => setDefaultLanguage(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
              Prazo de Garantia Padrão
            </label>
            <input
              type="text"
              value={defaultWarrantyTime}
              onChange={(e) => setDefaultWarrantyTime(e.target.value)}
              placeholder="Ex: 30 dias"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            />
          </div>
        </div>
      </div>

      {/* BLOCOS 1.3 E 1.4: PRECIFICAÇÃO E ESTOQUE HORUS/CRONUZ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 1.3 Regra de Preço */}
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="h-9 w-9 rounded-xl bg-emerald-500/15 text-emerald-600 flex items-center justify-center font-mono font-black text-xs">
              1.3
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                Formação Automática de Preço no ML
              </h2>
              <p className="text-xs text-slate-500">
                Aplica ajuste automático sobre o Preço de Capa do Horus/Cronuz.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300">
                Ajuste sobre Preço Base (Markup)
              </label>
              <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setPriceRuleType('PERCENTAGE')}
                  className={`px-2.5 py-1 rounded-md cursor-pointer ${
                    priceRuleType === 'PERCENTAGE'
                      ? 'bg-white dark:bg-slate-900 text-emerald-600 shadow-sm'
                      : 'text-slate-500'
                  }`}
                >
                  %
                </button>
                <button
                  type="button"
                  onClick={() => setPriceRuleType('FIXED')}
                  className={`px-2.5 py-1 rounded-md cursor-pointer ${
                    priceRuleType === 'FIXED'
                      ? 'bg-white dark:bg-slate-900 text-emerald-600 shadow-sm'
                      : 'text-slate-500'
                  }`}
                >
                  R$
                </button>
              </div>
            </div>

            {priceRuleType === 'PERCENTAGE' ? (
              <CurrencyInput
                value={priceRuleValue}
                onChangeValue={setPriceRuleValue}
                suffixStr="%"
                max={100}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-sm font-bold"
              />
            ) : (
              <CurrencyInput
                value={priceRuleValue}
                onChangeValue={setPriceRuleValue}
                prefixStr="R$ "
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-sm font-bold"
              />
            )}

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5">
              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Embutir taxa fixa do Mercado Livre em produtos abaixo de R$ 79,00
                </span>
                <input
                  type="checkbox"
                  checked={addFixedFeeUnder79}
                  onChange={(e) => setAddFixedFeeUnder79(e.target.checked)}
                  className="rounded border-slate-300 text-amber-500 focus:ring-amber-500"
                />
              </label>

              {addFixedFeeUnder79 && (
                <div className="flex items-center justify-between gap-3 pt-1">
                  <span className="text-[11px] font-bold text-slate-500">
                    Valor da Taxa Fixa ML (R$):
                  </span>
                  <CurrencyInput
                    value={fixedFeeUnder79}
                    onChangeValue={setFixedFeeUnder79}
                    prefixStr="R$ "
                    className="w-36 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs font-bold text-right"
                  />
                </div>
              )}
            </div>

            {/* Simulação Autoexplicativa */}
            <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-800/50 flex items-center justify-between text-xs">
              <span className="text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5 font-medium">
                <Info className="h-3.5 w-3.5 shrink-0" />
                Simulação (Livro com Preço Capa R$ 50,00):
              </span>
              <span className="font-mono font-black text-emerald-700 dark:text-emerald-300">
                Anúncio ML = R$ {simulatedPrice50.toFixed(2).replace('.', ',')}
              </span>
            </div>
          </div>
        </div>

        {/* 1.4 Regra de Estoque e Buffer */}
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="h-9 w-9 rounded-xl bg-indigo-500/15 text-indigo-600 flex items-center justify-center font-mono font-black text-xs">
              1.4
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                Sincronização de Estoque (Horus / Cronuz) &amp; Buffer
              </h2>
              <p className="text-xs text-slate-500">
                Sincronização incremental (Delta): só envia ao ML quando o saldo realmente variar.
              </p>
            </div>
          </div>

          {usesHorus && (
            <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/70 dark:border-indigo-800/60 text-xs space-y-1">
              <div className="font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" /> Filtro de Estoque Horus ERP Ativo:
              </div>
              <p className="text-indigo-700 dark:text-indigo-300 font-mono text-[11px]">
                SD_COD_EMPRESA={horusCompany || '—'} | SD_COD_FILIAL={horusBranch || '—'} | SD_LOCAL_ESTOQUE=
                {horusStockLocal || 'GERAL'} | Paginação={horusLegacyPagination ? 'LEGADO' : 'OFFSET/LIMIT'}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                Estoque de Segurança (Buffer Mínimo)
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={String(minStockBuffer)}
                onChange={(e) => setMinStockBuffer(Number(e.target.value.replace(/\D/g, '') || 0))}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-sm font-bold"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Exemplo: Com Buffer = <strong>{minStockBuffer}</strong>, se o Horus tiver{' '}
                <strong>{minStockBuffer} un.</strong> ou menos, o anúncio pausa automaticamente no ML.
              </p>
            </div>

            <div className="space-y-2.5 pt-1">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoSyncStock}
                  onChange={(e) => setAutoSyncStock(e.target.checked)}
                  className="rounded border-slate-300 text-amber-500"
                />
                Job Automático de Estoque (a cada 15 min)
              </label>

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoImportOrders}
                  onChange={(e) => setAutoImportOrders(e.target.checked)}
                  className="rounded border-slate-300 text-amber-500"
                />
                Recepção Automática via Webhook (orders_v2)
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
