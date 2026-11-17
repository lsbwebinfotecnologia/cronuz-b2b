'use client';

import { useState, useEffect } from 'react';
import {
  Save,
  KeyRound,
  CheckCircle2,
  BookOpen,
  FolderTree,
  DollarSign,
  Database,
  Loader2,
  PlugZap,
  Copy,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';
import { CurrencyInput } from '@/components/CurrencyInput';
import { EvStepHeader } from '@/components/estantevirtual/EvStepHeader';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface EvCategoryItem {
  id: number;
  name: string;
}

interface LocalCategory {
  id: number;
  name: string;
}

export default function EstanteVirtualSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingConn, setTestingConn] = useState(false);

  const [evEnabled, setEvEnabled] = useState(false);
  const [evEnvironment, setEvEnvironment] = useState('PRODUCAO');
  const [evSellerId, setEvSellerId] = useState('');
  const [evEmail, setEvEmail] = useState('');
  const [evPassword, setEvPassword] = useState('');
  const [passwordConfigured, setPasswordConfigured] = useState(false);
  const [hasAuthToken, setHasAuthToken] = useState(false);
  const [tokenExpiresAt, setTokenExpiresAt] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState('');

  // Preset Config
  const [defaultCategoryId, setDefaultCategoryId] = useState<number>(65);
  const [defaultCondition, setDefaultCondition] = useState<'NOVO' | 'USADO'>('NOVO');
  const [priceRuleType, setPriceRuleType] = useState<'PERCENTAGE' | 'FIXED'>('PERCENTAGE');
  const [priceRuleValue, setPriceRuleValue] = useState<number>(0);
  const [minPriceFloor, setMinPriceFloor] = useState<number>(6.0);
  const [minStockBuffer, setMinStockBuffer] = useState<number>(0);
  const [defaultHandlingDays, setDefaultHandlingDays] = useState<number>(2);
  const [defaultLanguage, setDefaultLanguage] = useState<string>('Pt');
  const [defaultWeightGrams, setDefaultWeightGrams] = useState<number>(300);
  const [defaultReleaseYear, setDefaultReleaseYear] = useState<number>(2024);
  const [defaultPublisherFallback, setDefaultPublisherFallback] = useState<string>('Editora');
  const [defaultAuthorFallback, setDefaultAuthorFallback] = useState<string>('Vários Autores');
  const [autoSyncStock, setAutoSyncStock] = useState<boolean>(true);
  const [horusDefaultCustomerDoc, setHorusDefaultCustomerDoc] = useState<string>('');
  const [horusDefaultCustomerGuid, setHorusDefaultCustomerGuid] = useState<string>('');
  const [categoryMapping, setCategoryMapping] = useState<Record<string, { id: number; name: string }>>({});

  const [evCategories, setEvCategories] = useState<EvCategoryItem[]>([]);
  const [localCategories, setLocalCategories] = useState<LocalCategory[]>([]);
  const [horusContext, setHorusContext] = useState<any>(null);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/estantevirtual/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setEvEnabled(Boolean(data.ev_enabled));
        setEvEnvironment(data.ev_environment || 'PRODUCAO');
        setEvSellerId(data.ev_seller_id || '');
        setEvEmail(data.ev_email || '');
        setPasswordConfigured(Boolean(data.password_configured));
        setHasAuthToken(Boolean(data.has_auth_token));
        setTokenExpiresAt(data.ev_token_expires_at || null);
        setWebhookUrl(data.webhook_url || '');
        setEvCategories(data.ev_official_categories || []);
        setLocalCategories(data.local_categories || []);
        setHorusContext(data.horus_context || null);

        const p = data.ev_preset_config || {};
        setDefaultCategoryId(Number(p.default_category_id || 65));
        setDefaultCondition(p.default_condition === 'USADO' ? 'USADO' : 'NOVO');
        setPriceRuleType(p.price_rule_type === 'FIXED' ? 'FIXED' : 'PERCENTAGE');
        setPriceRuleValue(Number(p.price_rule_value || 0));
        setMinPriceFloor(Math.max(6, Number(p.min_price_floor || 6)));
        setMinStockBuffer(Number(p.min_stock_buffer || 0));
        setDefaultHandlingDays(Number(p.default_handling_days || 2));
        setDefaultLanguage(p.default_language || 'Pt');
        setDefaultWeightGrams(Number(p.default_weight_grams || 300));
        setDefaultReleaseYear(Number(p.default_release_year || 2024));
        setDefaultPublisherFallback(p.default_publisher_fallback || 'Editora');
        setDefaultAuthorFallback(p.default_author_fallback || 'Vários Autores');
        setAutoSyncStock(p.auto_sync_stock !== false);
        setHorusDefaultCustomerDoc(p.horus_default_customer_doc || '');
        setHorusDefaultCustomerGuid(p.horus_default_customer_guid || '');
        setCategoryMapping(p.category_mapping || {});
      }
    } catch {
      toast.error('Falha ao carregar as pré-configurações da Estante Virtual.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

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

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = getToken();
      const body: Record<string, any> = {
        ev_enabled: evEnabled,
        ev_environment: evEnvironment,
        ev_seller_id: evSellerId,
        ev_email: evEmail,
        ev_preset_config: {
          default_category_id: defaultCategoryId,
          default_condition: defaultCondition,
          price_rule_type: priceRuleType,
          price_rule_value: priceRuleValue,
          min_price_floor: Math.max(6, minPriceFloor),
          min_stock_buffer: minStockBuffer,
          default_handling_days: Math.min(20, Math.max(1, defaultHandlingDays)),
          default_language: defaultLanguage,
          default_weight_grams: defaultWeightGrams,
          default_release_year: defaultReleaseYear,
          default_publisher_fallback: defaultPublisherFallback,
          default_author_fallback: defaultAuthorFallback,
          auto_sync_stock: autoSyncStock,
          horus_default_customer_doc: horusDefaultCustomerDoc,
          horus_default_customer_guid: horusDefaultCustomerGuid,
          category_mapping: categoryMapping,
        },
      };
      if (evPassword.trim()) {
        body.ev_password = evPassword.trim();
      }

      const res = await fetch(`${API_URL}/estantevirtual/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(data.message || 'Pré-configurações da Estante Virtual salvas!');
        setEvPassword('');
        fetchSettings();
      } else {
        toast.error(data.detail || 'Erro ao salvar configurações.');
      }
    } catch {
      toast.error('Falha de comunicação ao salvar configurações.');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConn(true);
    try {
      await handleSave();
      const token = getToken();
      const res = await fetch(`${API_URL}/estantevirtual/test-connection`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(data.message || 'Autenticação JWT 24h homologada com sucesso!');
        fetchSettings();
      } else {
        toast.error(data.detail || 'Não foi possível autenticar na API da Estante Virtual.');
      }
    } catch {
      toast.error('Erro de conexão ao testar login na Estante Virtual.');
    } finally {
      setTestingConn(false);
    }
  };

  const simulatedPrice = (() => {
    const base = 50.0;
    const calc =
      priceRuleType === 'PERCENTAGE' ? base * (1 + priceRuleValue / 100) : base + priceRuleValue;
    const por = Math.max(Math.max(6, minPriceFloor), calc);
    const de = Math.max(por, base);
    return { de, por };
  })();

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[360px]">
        <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 space-y-5 max-w-[1600px] mx-auto">
      <EvStepHeader
        currentStep={1}
        title="Conector Oficial Estante Virtual & Regras de Publicação"
        explanation="Configure o id_vendedor e credenciais da API Marketplace (Bearer JWT 24h), defina a Estante padrão (1..74), regra de preço e integração Horus ERP."
        guideSteps={[
          'Informe o id_vendedor, E-mail e Senha fornecidos pelo suporte da Estante Virtual',
          'Copie a URL de Callback de Pedidos para homologação na Estante Virtual',
          'Defina a Estante padrão (1..74), Preço (valor_de / valor_por) e pressione F2 para salvar',
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testingConn || saving}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-bold text-xs sm:text-sm hover:bg-indigo-100 transition cursor-pointer disabled:opacity-50"
            >
              {testingConn ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
              Testar Login JWT (24h)
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm shadow-sm transition cursor-pointer disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar Pré-Configurações (F2)
            </button>
          </div>
        }
      />

      {/* BLOCO 1.1: CREDENCIAIS OFICIAIS DA API MARKETPLACE ESTANTE VIRTUAL */}
      <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black text-sm shadow-xs">
              EV
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                  1.1 • Autenticação API Marketplace Estante Virtual (`POST /auth/login`)
                </h2>
                {hasAuthToken ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 text-[11px] font-extrabold">
                    <CheckCircle2 className="h-3.5 w-3.5" /> TOKEN JWT 24H ATIVO
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 text-[11px] font-bold">
                    Aguardando Credenciais EV
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                O Cronuz renova automaticamente o Bearer Token a cada 24h e inclui o <code className="font-mono">id_vendedor</code> em todos os lotes de produtos, estoques e preços.
              </p>
            </div>
          </div>

          <label className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={evEnabled}
              onChange={(e) => setEvEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600"
            />
            <span className="text-xs font-extrabold text-slate-800 dark:text-slate-100">
              Integração Estante Virtual Ativa
            </span>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              ID do Vendedor (<code className="font-mono">id_vendedor</code>) *
            </label>
            <input
              type="text"
              value={evSellerId}
              onChange={(e) => setEvSellerId(e.target.value.replace(/\D/g, ''))}
              placeholder="Ex: 2124720"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs font-bold"
            />
            <span className="text-[10px] text-slate-400">Código numérico fixo do livreiro na EV</span>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              E-mail de Login na API EV *
            </label>
            <input
              type="email"
              value={evEmail}
              onChange={(e) => setEvEmail(e.target.value)}
              placeholder="integracao@sualivraria.com.br"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Senha da API EV {passwordConfigured ? '(Salva ✓)' : '*'}
            </label>
            <input
              type="password"
              value={evPassword}
              onChange={(e) => setEvPassword(e.target.value)}
              placeholder={passwordConfigured ? '•••••••••••• (Deixe em branco para manter)' : 'Digite a senha da API EV'}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Ambiente da API
            </label>
            <select
              value={evEnvironment}
              onChange={(e) => setEvEnvironment(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
            >
              <option value="PRODUCAO">PRODUÇÃO (api-marketplace.estantevirtual.com.br)</option>
              <option value="SANDBOX">SANDBOX (Homologação Estante Virtual)</option>
            </select>
          </div>
        </div>

        {/* URL de Callback de Pedidos para enviar à equipe da Estante Virtual */}
        <div className="p-3.5 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-900 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <p className="text-xs font-extrabold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-indigo-600" />
              URL Oficial de Callback de Pedidos (<code className="font-mono">POST /pedido</code> e <code className="font-mono">PUT /pedido</code>)
            </p>
            <p className="text-[11px] text-slate-600 dark:text-slate-400">
              Envie esta URL ao suporte da Estante Virtual para receber automaticamente novos pedidos e atualizações de status a cada 10 minutos:
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <code className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-xs text-slate-800 dark:text-slate-200">
              {webhookUrl}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(webhookUrl);
                toast.success('URL de Callback copiada para a área de transferência!');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 cursor-pointer"
            >
              <Copy className="h-3.5 w-3.5" /> Copiar URL
            </button>
          </div>
        </div>
      </div>

      {/* BLOCO 1.2: REGRAS DE PREÇO (VALOR_DE / VALOR_POR), ESTOQUE & CONDIÇÃO IMUTÁVEL */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center gap-2.5 border-b border-slate-100 dark:border-slate-800 pb-3">
            <DollarSign className="h-5 w-5 text-emerald-600" />
            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                1.2 • Precificação (<code className="font-mono">valor_de</code> / <code className="font-mono">valor_por</code>) &amp; Piso R$ 6,00
              </h2>
              <p className="text-xs text-slate-500">
                Calculado automaticamente sobre o Preço de Capa do Horus ERP ou Catálogo Local.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Modo de Ajuste
              </label>
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => setPriceRuleType('PERCENTAGE')}
                  className={`py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                    priceRuleType === 'PERCENTAGE'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-2xs'
                      : 'text-slate-500'
                  }`}
                >
                  Percentual (%)
                </button>
                <button
                  type="button"
                  onClick={() => setPriceRuleType('FIXED')}
                  className={`py-1.5 rounded-lg text-xs font-extrabold transition cursor-pointer ${
                    priceRuleType === 'FIXED'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-2xs'
                      : 'text-slate-500'
                  }`}
                >
                  Valor Fixo (R$)
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                {priceRuleType === 'PERCENTAGE' ? 'Markup / Ajuste (%)' : 'Acréscimo Fixo (R$)'}
              </label>
              <CurrencyInput
                value={priceRuleValue}
                onChangeValue={(val) => setPriceRuleValue(val)}
                prefixStr={priceRuleType === 'FIXED' ? 'R$ ' : ''}
                suffixStr={priceRuleType === 'PERCENTAGE' ? '%' : ''}
                max={priceRuleType === 'PERCENTAGE' ? 100 : undefined}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Piso Mínimo EV (R$)
              </label>
              <CurrencyInput
                value={minPriceFloor}
                onChangeValue={(val) => setMinPriceFloor(Math.max(6, val))}
                prefixStr="R$ "
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs font-bold"
              />
              <span className="text-[10px] text-slate-400">Regra EV: nunca menor que R$ 6,00</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-900 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              Simulação para Livro com Preço de Capa <strong>R$ 50,00</strong>:
            </span>
            <div className="font-mono font-extrabold text-emerald-800 dark:text-emerald-300">
              valor_de: R$ {simulatedPrice.de.toFixed(2).replace('.', ',')} • valor_por: R${' '}
              {simulatedPrice.por.toFixed(2).replace('.', ',')}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Condição Padrão (<code className="font-mono">tipo</code>)
              </label>
              <select
                value={defaultCondition}
                onChange={(e) => setDefaultCondition(e.target.value as 'NOVO' | 'USADO')}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
              >
                <option value="NOVO">NOVO (Sem uso)</option>
                <option value="USADO">USADO (Sebo / Seminovo)</option>
              </select>
              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                Imutável após criar o SKU na EV
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Estoque de Segurança (Buffer)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={minStockBuffer}
                onChange={(e) => setMinStockBuffer(Math.max(0, Number(e.target.value)))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs font-bold"
              />
              <span className="text-[10px] text-slate-400">Zera na EV se saldo ≤ buffer</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Prazo de Postagem (Dias)
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={defaultHandlingDays}
                onChange={(e) => setDefaultHandlingDays(Math.min(20, Math.max(1, Number(e.target.value))))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs font-bold"
              />
              <span className="text-[10px] text-slate-400">Máx. 20 dias (Encomenda / POD)</span>
            </div>
          </div>
        </div>

        {/* BLOCO 1.3: AS 74 ESTANTES OFICIAIS DA ESTANTE VIRTUAL + CONTEXTO HORUS ERP */}
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center gap-2.5 border-b border-slate-100 dark:border-slate-800 pb-3">
            <BookOpen className="h-5 w-5 text-indigo-600" />
            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                1.3 • Estante Oficial Padrão (74 Categorias EV) &amp; Metadados Literários
              </h2>
              <p className="text-xs text-slate-500">
                O Cronuz mapeia automaticamente o Gênero do Horus para as 74 Estantes da EV e usa esta como fallback.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Estante Padrão Fallback (<code className="font-mono">categoria_id</code> 1..74)
              </label>
              <select
                value={defaultCategoryId}
                onChange={(e) => setDefaultCategoryId(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
              >
                {evCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    #{cat.id} — {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Idioma Padrão (<code className="font-mono">idioma</code>)
              </label>
              <select
                value={defaultLanguage}
                onChange={(e) => setDefaultLanguage(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold"
              >
                <option value="Pt">Pt — Português (Padrão EV)</option>
                <option value="En">En — Inglês</option>
                <option value="Es">Es — Espanhol</option>
                <option value="Fr">Fr — Francês</option>
                <option value="De">De — Alemão</option>
                <option value="It">It — Italiano</option>
                <option value="Jp">Jp — Japonês</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Peso Padrão Fallback (Gramas)
              </label>
              <input
                type="number"
                min={50}
                max={15000}
                value={defaultWeightGrams}
                onChange={(e) => setDefaultWeightGrams(Math.max(50, Number(e.target.value)))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Ano de Edição Fallback (<code className="font-mono">ano</code>)
              </label>
              <input
                type="number"
                min={1900}
                max={2030}
                value={defaultReleaseYear}
                onChange={(e) => setDefaultReleaseYear(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs"
              />
            </div>
          </div>

          {/* Integração Horus ERP */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Database className="h-4 w-4 text-indigo-600" />
                Contexto Horus ERP (<code className="font-mono">SD_*</code> Saldo &amp; Envio de Pedidos em CAIXA ALTA)
              </span>
              {horusContext?.horus_enabled ? (
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-mono text-[10px] font-bold">
                  EMP {horusContext.horus_company} • FIL {horusContext.horus_branch} • LOC {horusContext.horus_stock_local}
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-600 font-mono text-[10px]">
                  Catálogo Local Cronuz
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                  CPF/CNPJ Cliente Padrão Horus (Opcional)
                </label>
                <input
                  type="text"
                  value={horusDefaultCustomerDoc}
                  onChange={(e) => setHorusDefaultCustomerDoc(e.target.value)}
                  placeholder="Usa CPF/CNPJ do comprador EV se vazio"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                  GUID Horus B2B (Opcional)
                </label>
                <input
                  type="text"
                  value={horusDefaultCustomerGuid}
                  onChange={(e) => setHorusDefaultCustomerGuid(e.target.value.toUpperCase())}
                  placeholder="Usa GUID padrão da empresa se vazio"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs uppercase"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* BLOCO 1.4: DE/PARA OPCIONAL ENTRE CATEGORIAS LOCAIS E AS 74 ESTANTES DA EV */}
      {localCategories.length > 0 && (
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <FolderTree className="h-4 w-4 text-indigo-600" />
            <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
              1.4 • Mapeamento De/Para de Categorias Locais → 74 Estantes Oficiais da Estante Virtual
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {localCategories.slice(0, 18).map((lc) => {
              const mappedId = categoryMapping[String(lc.id)]?.id || defaultCategoryId;
              return (
                <div
                  key={lc.id}
                  className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 flex items-center justify-between gap-2 text-xs"
                >
                  <span className="font-bold text-slate-700 dark:text-slate-300 truncate">
                    {lc.name}
                  </span>
                  <select
                    value={mappedId}
                    onChange={(e) => {
                      const newId = Number(e.target.value);
                      const found = evCategories.find((c) => c.id === newId);
                      setCategoryMapping((prev) => ({
                        ...prev,
                        [String(lc.id)]: { id: newId, name: found?.name || 'Outros Assuntos' },
                      }));
                    }}
                    className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-semibold max-w-[180px]"
                  >
                    {evCategories.map((ec) => (
                      <option key={ec.id} value={ec.id}>
                        #{ec.id} {ec.name}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
