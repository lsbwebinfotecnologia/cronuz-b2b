'use client';

import { useEffect, useState } from 'react';
import {
  ExternalLink,
  Copy,
  Link2,
  CreditCard,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  KeyRound,
  RefreshCw,
  Terminal,
  Sparkles,
  Settings2,
} from 'lucide-react';
import { toast } from 'sonner';
import { getToken } from '@/lib/auth';

type Props = {
  settings: any;
  setSettings: (s: any) => void;
};

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/** Modo de finalização do carrinho da loja B2C (configurado pelo seller). */
export function B2CCheckoutModeSelector({ settings, setSettings }: Props) {
  const isVindiLink =
    settings.payment_gateway_active === 'VINDI' &&
    settings.vindi_integration_mode === 'PAYMENT_LINK';

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">
        Modo de Finalização do Carrinho na Loja B2C
      </label>
      <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/30">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
          <span className="w-3.5 h-3.5 rounded-full border-2 border-indigo-600 bg-indigo-600" />
          {isVindiLink
            ? 'Finalizar com Link de Pagamento Hospedado no Final da Venda'
            : 'Finalizar por Forma de Pagamento na Loja (Checkout Transparente)'}
        </span>
        <span className="block mt-1 text-xs text-slate-500">
          {isVindiLink
            ? 'Gera o pedido no Cronuz e redireciona o cliente para o Link de Pagamento Seguro (PIX, Cartão ou Boleto).'
            : 'O cliente escolhe PIX, Cartão de Crédito ou Boleto diretamente dentro da página da loja B2C.'}
        </span>
      </div>
    </div>
  );
}

/** Credenciais Vindi Commerce + Modalidade (Transparente vs Link) + Console de Homologação e Diagnóstico. */
export function VindiCheckoutPanel({ settings, setSettings }: Props) {
  const [testing, setTesting] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);
  const [testAmount, setTestAmount] = useState<number>(1.0);
  const [testCustomer, setTestCustomer] = useState({
    name: 'CLIENTE TESTE HOMOLOGACAO',
    cpf: '11144477735',
    email: 'homologacao@cronuzb2b.com.br',
    phone: '11999999999',
  });
  const [card, setCard] = useState({
    holder: 'STEPHEN STRANGE',
    number: '5448280000000007',
    expiration: '01/2035',
    cvv: '123',
  });
  const [showAdvancedOAuth, setShowAdvancedOAuth] = useState(false);
  const [oauthCode, setOauthCode] = useState('');
  const [exchangingOAuth, setExchangingOAuth] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);
  const [syncingPending, setSyncingPending] = useState(false);
  const [syncSummary, setSyncSummary] = useState<string | null>(null);

  const integrationMode = (settings.vindi_integration_mode || 'TRANSPARENT') as
    | 'PAYMENT_LINK'
    | 'TRANSPARENT';
  const webhookUrl = `${API}/b2c/webhooks/vindi`;

  const handleSyncPendingVindi = async () => {
    setSyncingPending(true);
    setSyncSummary(null);
    try {
      const res = await fetch(`${API}/b2c/orders/sync-vindi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Falha ao sincronizar com a Vindi.');
      const msg = data.message || `Verificados: ${data.checked || 0} | Aprovados agora: ${data.approved_now || 0}`;
      setSyncSummary(msg);
      toast.success(msg);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao consultar transações na Vindi.');
    } finally {
      setSyncingPending(false);
    }
  };

  const fillSandboxCard = () => {
    setCard({
      holder: 'STEPHEN STRANGE',
      number: '5448280000000007',
      expiration: '01/2035',
      cvv: '123',
    });
    toast.info('Cartão oficial de teste da documentação Vindi preenchido!');
  };

  const runTest = async (
    method: 'PAYMENT_LINK' | 'PIX' | 'CREDIT_CARD',
    overrideSandbox?: boolean
  ) => {
    setTesting(method);
    const useSandbox =
      overrideSandbox !== undefined ? overrideSandbox : Boolean(settings.vindi_sandbox);
    if (overrideSandbox !== undefined) {
      setSettings({ ...settings, vindi_sandbox: overrideSandbox });
    }
    try {
      const res = await fetch(`${API}/b2c/vindi/test-transaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          amount: testAmount,
          payment_method: method,
          vindi_api_key: settings.vindi_api_key || undefined,
          sandbox: useSandbox,
          postal_code_seller: settings.vindi_postal_code_seller || '01001000',
          reseller_token: settings.vindi_reseller_token || '',
          access_token: settings.vindi_access_token || '',
          customer_name: testCustomer.name,
          customer_cpf: testCustomer.cpf,
          customer_email: testCustomer.email,
          customer_phone: testCustomer.phone,
          ...(method === 'CREDIT_CARD'
            ? {
                card_holder_name: card.holder,
                card_number: card.number,
                card_expiration: card.expiration,
                card_cvv: card.cvv,
                installments: 1,
              }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao testar a Vindi.');
      setResult(data);
      if (data.success) toast.success(data.message || 'Operação validada na Vindi com sucesso!');
      else if (data.simulated) toast.warning('Teste SIMULADO: nenhuma chave configurada.');
      else toast.error(data.message || 'A Vindi retornou um erro de validação.');
    } catch (e: any) {
      toast.error(e.message || 'Falha no teste da Vindi.');
    } finally {
      setTesting(null);
    }
  };

  const handleExchangeOAuthToken = async () => {
    if (!settings.vindi_consumer_key || !settings.vindi_consumer_secret || !oauthCode.trim()) {
      toast.error('Preencha Consumer Key, Consumer Secret e o CODE obtido na Vindi.');
      return;
    }
    setExchangingOAuth(true);
    try {
      const res = await fetch(`${API}/b2c/vindi/generate-access-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          consumer_key: settings.vindi_consumer_key,
          consumer_secret: settings.vindi_consumer_secret,
          code: oauthCode.trim(),
          sandbox: Boolean(settings.vindi_sandbox),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Falha ao gerar Access Token.');
      setSettings({ ...settings, vindi_access_token: data.access_token });
      toast.success(data.message || 'Access Token gerado com sucesso!');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao gerar Access Token.');
    } finally {
      setExchangingOAuth(false);
    }
  };

  const inputCls =
    'w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-900 focus:ring-2 focus:ring-indigo-500 font-mono text-xs dark:bg-slate-900/50 dark:border-slate-700 dark:text-white';

  const tone = result?.success
    ? 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-200'
    : result?.simulated
    ? 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-200'
    : 'bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-950/30 dark:border-rose-800 dark:text-rose-200';

  const diag = result?.diagnostics || {};
  const vindiErrors: Array<{ code: string; field: string; message: string; solution: string }> =
    Array.isArray(diag.vindi_errors) ? diag.vindi_errors : [];
  const hasTokenEnvError = vindiErrors.some((e) => e.code === '003039' || e.code === '001001');

  const authCodeUrl = settings.vindi_sandbox
    ? `https://tc-intermediador-sandbox.yapay.com.br/authentication?consumer_key=${encodeURIComponent(
        settings.vindi_consumer_key || ''
      )}`
    : `https://tc.intermediador.yapay.com.br/authentication?consumer_key=${encodeURIComponent(
        settings.vindi_consumer_key || ''
      )}`;

  return (
    <div className="space-y-4 mt-4 p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 animate-in fade-in slide-in-from-top-2">
      {/* 1. Escolha da Modalidade na Vindi: Checkout Transparente vs Link de Pagamento */}
      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
          Modalidade de Pagamento na Vindi Commerce
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setSettings({ ...settings, vindi_integration_mode: 'TRANSPARENT' })}
            className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
              integrationMode === 'TRANSPARENT'
                ? 'border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/40 ring-2 ring-indigo-500/20'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-indigo-300'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="flex items-center gap-1.5 text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                <CreditCard className="w-4 h-4 text-indigo-600" />
                1. Checkout Transparente (PIX & Cartão na Loja)
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                Sem sair da Loja
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Usa <code className="font-mono">POST /api/v3/transactions/payment</code> + Fingerprint Antifraude. Gera QR Code PIX (Copia e Cola) ou aprova Cartão na própria página B2C.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setSettings({ ...settings, vindi_integration_mode: 'PAYMENT_LINK' })}
            className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
              integrationMode === 'PAYMENT_LINK'
                ? 'border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/40 ring-2 ring-indigo-500/20'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-indigo-300'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="flex items-center gap-1.5 text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                <Link2 className="w-4 h-4 text-emerald-600" />
                2. Link de Pagamento Vindi (Checkout Hospedado)
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                Ambiente Vindi
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Valida a transação via API (<code className="font-mono">/v1/tmp_transactions/create</code> ou <code className="font-mono">/api/v3/charges</code>) e redireciona para o Link Oficial Vindi.
            </p>
          </button>
        </div>

        {/* Opção de Checkout Express por CPF (exclusiva para Link de Pagamento Vindi) */}
        {integrationMode === 'PAYMENT_LINK' && (
          <div className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <label className="flex items-start gap-2.5 cursor-pointer flex-1">
              <input
                type="checkbox"
                checked={settings.vindi_express_cpf_only !== false}
                onChange={(e) =>
                  setSettings({ ...settings, vindi_express_cpf_only: e.target.checked })
                }
                className="w-4 h-4 mt-0.5 rounded text-emerald-600 shrink-0"
              />
              <div>
                <span className="text-xs font-extrabold text-emerald-950 dark:text-emerald-200 block">
                  Checkout Express por CPF na Loja B2C (Não repetir cadastro do cliente)
                </span>
                <span className="text-[11px] text-emerald-800 dark:text-emerald-300/90 block mt-0.5">
                  Como a página hospedada da Vindi já solicita Nome, E-mail, Telefone, Endereço de Entrega e Pagamento (PIX ou Cartão), mantendo esta opção marcada a nossa Loja B2C pede <strong>apenas o CPF</strong> (e o aceite LGPD) antes de abrir o Link da Vindi. Assim que o cliente preenche e paga lá na Vindi, sincronizamos automaticamente os dados e o status aprovado de volta para o pedido!
                </span>
              </div>
            </label>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase bg-emerald-600 text-white self-start sm:self-center shrink-0">
              Recomendado p/ Link
            </span>
          </div>
        )}
      </div>

      {/* 2. Campos Obrigatórios de Configuração no Seller */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
        <div className="md:col-span-2 space-y-1.5">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
            Token da Conta (<code className="font-mono">token_account</code>) Vindi Commerce *
          </label>
          <input
            type="password"
            className={inputCls}
            value={settings.vindi_api_key}
            onChange={(e) => setSettings({ ...settings, vindi_api_key: e.target.value })}
            placeholder="Ex: 93d71f5187981a7 (15 caracteres em Minha Conta → Token)"
          />
          <p className="text-[11px] text-slate-500">
            No painel <strong>Vindi Commerce (intermediador.yapay.com.br)</strong>: menu <em>Minha Conta → Chave de Integração (Token)</em>.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
            Ambiente da Conta Vindi
          </label>
          <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(settings.vindi_sandbox)}
              onChange={(e) => setSettings({ ...settings, vindi_sandbox: e.target.checked })}
              className="w-4 h-4 rounded text-indigo-600"
            />
            <span>
              {settings.vindi_sandbox ? 'Homologação (Sandbox)' : 'Produção (Cobrança Real)'}
            </span>
          </label>
          <p className="text-[11px] text-slate-500">
            {settings.vindi_sandbox
              ? 'Aponta para api.intermediador.sandbox.yapay.com.br'
              : 'Aponta para api.intermediador.yapay.com.br'}
          </p>
        </div>
      </div>

      {/* 3. Parâmetros Operacionais Vindi Commerce */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
            CEP de Origem do Seller (<code className="font-mono">postal_code_seller</code>)
          </label>
          <input
            type="text"
            value={settings.vindi_postal_code_seller || ''}
            onChange={(e) =>
              setSettings({
                ...settings,
                vindi_postal_code_seller: e.target.value.replace(/\D/g, '').slice(0, 8),
              })
            }
            placeholder="01001000"
            className={inputCls}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
            Parcelamento Máx. (<code className="font-mono">max_split_transaction</code>)
          </label>
          <select
            value={settings.vindi_max_installments || 6}
            onChange={(e) =>
              setSettings({ ...settings, vindi_max_installments: Number(e.target.value) })
            }
            className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-slate-900 font-semibold text-xs dark:bg-slate-900 dark:border-slate-700 dark:text-white"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
              <option key={n} value={n}>
                Até {n}x no cartão
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
            Meios Habilitados (<code className="font-mono">available_payment_methods</code>)
          </label>
          <div className="flex flex-wrap items-center gap-3 p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.vindi_allow_pix !== false}
                onChange={(e) => setSettings({ ...settings, vindi_allow_pix: e.target.checked })}
                className="rounded text-indigo-600"
              />
              PIX (27)
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.vindi_allow_credit_card !== false}
                onChange={(e) =>
                  setSettings({ ...settings, vindi_allow_credit_card: e.target.checked })
                }
                className="rounded text-indigo-600"
              />
              Cartão (3,4,16...)
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(settings.vindi_allow_boleto)}
                onChange={(e) => setSettings({ ...settings, vindi_allow_boleto: e.target.checked })}
                className="rounded text-indigo-600"
              />
              Boleto (6)
            </label>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
            URL de Retorno (<code className="font-mono">url_success</code>)
          </label>
          <input
            type="text"
            value={settings.vindi_return_url || ''}
            onChange={(e) => setSettings({ ...settings, vindi_return_url: e.target.value })}
            placeholder="https://sualoja.com.br"
            className={inputCls}
          />
        </div>
      </div>

      {/* 4. OAuth Avançado Opcional (Envio de Cobrança V3 / Consumer Key & Secret) */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAdvancedOAuth(!showAdvancedOAuth)}
          className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <KeyRound className="w-3.5 h-3.5 text-indigo-600" />
            Credenciais OAuth Opcionais (Apenas se usar API Envio de Cobrança V3 / Estornos)
          </span>
          {showAdvancedOAuth ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </button>

        {showAdvancedOAuth && (
          <div className="p-3.5 border-t border-slate-200 dark:border-slate-700 space-y-3 bg-slate-50/50 dark:bg-slate-900/50">
            <p className="text-[11px] text-slate-500">
              Conforme a documentação da Vindi Commerce, para <strong>Checkout Transparente (PIX/Cartão)</strong> e <strong>Carrinho/Link (<code className="font-mono">/v1/tmp_transactions/create</code>)</strong> basta apenas o <code className="font-mono">token_account</code> acima. Preencha os campos abaixo somente se desejar usar o endpoint <code className="font-mono">POST /api/v3/charges</code>.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  Consumer Key
                </label>
                <input
                  type="text"
                  className={inputCls}
                  value={settings.vindi_consumer_key || ''}
                  onChange={(e) =>
                    setSettings({ ...settings, vindi_consumer_key: e.target.value })
                  }
                  placeholder="Consumer Key da Vindi"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  Consumer Secret
                </label>
                <input
                  type="password"
                  className={inputCls}
                  value={settings.vindi_consumer_secret || ''}
                  onChange={(e) =>
                    setSettings({ ...settings, vindi_consumer_secret: e.target.value })
                  }
                  placeholder="Consumer Secret da Vindi"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  Access Token OAuth Ativo
                </label>
                <input
                  type="text"
                  className={inputCls}
                  value={settings.vindi_access_token || ''}
                  onChange={(e) =>
                    setSettings({ ...settings, vindi_access_token: e.target.value })
                  }
                  placeholder="Gerado via CODE ou colado diretamente"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {settings.vindi_consumer_key && (
                <a
                  href={authCodeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-bold inline-flex items-center gap-1.5 hover:bg-indigo-100"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  1º Passo: Obter CODE no Navegador
                </a>
              )}
              <input
                type="text"
                value={oauthCode}
                onChange={(e) => setOauthCode(e.target.value)}
                placeholder="Cole aqui o CODE da URL de redirecionamento..."
                className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono w-64 dark:bg-slate-900 dark:border-slate-700"
              />
              <button
                type="button"
                disabled={exchangingOAuth}
                onClick={handleExchangeOAuthToken}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {exchangingOAuth ? 'Gerando...' : '2º Passo: Gerar Access Token'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* URL de Webhook + Retorno de Pagamento (PIX & Cartão) e Histórico de Aprovação */}
      <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-3 text-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="font-bold text-slate-800 dark:text-slate-200 block">
              Retorno Automático de Aprovação (PIX & Cartão) + Histórico Auditável:
            </span>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Em toda venda enviamos automaticamente a URL abaixo em <code className="font-mono">transaction[url_notification]</code>. Quando o cliente paga (via PIX ou Cartão no Link da Vindi), a Vindi notifica o Cronuz e também consultamos <code className="font-mono">GET /api/v3/transactions/get_by_token</code> para gravar o meio exato (<code className="font-mono">PIX</code> ou <code className="font-mono">CREDIT_CARD</code>), os dados do comprador e o histórico completo de eventos no pedido.
            </p>
            <code className="font-mono text-[11px] text-indigo-600 dark:text-indigo-400 break-all block mt-1">
              {webhookUrl}
            </code>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(webhookUrl);
                toast.success('URL de Webhook copiada!');
              }}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              Copiar Webhook
            </button>
            <button
              type="button"
              disabled={syncingPending}
              onClick={handleSyncPendingVindi}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncingPending ? 'animate-spin' : ''}`} />
              {syncingPending ? 'Consultando Vindi...' : 'Sincronizar Pagamentos Pendentes'}
            </button>
          </div>
        </div>
        {syncSummary && (
          <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-[11px] font-semibold text-emerald-900 dark:text-emerald-200">
            ✓ {syncSummary}
          </div>
        )}
      </div>

      {/* 5. Console de Homologação e Diagnóstico Detalhado de Erros da Vindi */}
      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900/60 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Terminal className="w-4 h-4 text-indigo-600" />
              Homologar & Diagnosticar Transação na Vindi (PIX, Cartão e Link)
            </p>
            <p className="text-xs text-slate-500">
              Dispara a requisição real para a API da Vindi Commerce e exibe o diagnóstico completo (códigos de erro oficiais, campos e JSON).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={testing !== null}
              onClick={() => runTest('PIX')}
              className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
            >
              {testing === 'PIX' ? 'Testando PIX...' : `1. Testar PIX (R$ ${testAmount.toFixed(2)})`}
            </button>
            <button
              type="button"
              disabled={testing !== null}
              onClick={() => runTest('CREDIT_CARD')}
              className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold disabled:opacity-50 cursor-pointer dark:bg-slate-700"
            >
              {testing === 'CREDIT_CARD'
                ? 'Testando Cartão...'
                : `2. Testar Cartão (R$ ${testAmount.toFixed(2)})`}
            </button>
            <button
              type="button"
              disabled={testing !== null}
              onClick={() => runTest('PAYMENT_LINK')}
              className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <Link2 className="w-3.5 h-3.5" />
              {testing === 'PAYMENT_LINK'
                ? 'Validando Link...'
                : `3. Testar Link (R$ ${testAmount.toFixed(2)})`}
            </button>
          </div>
        </div>

        {/* Parâmetros do Teste (Valor, Comprador e Cartão de Teste) */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 pt-1">
          <div>
            <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
              Valor do Teste (cód. 003065 mín. R$ 10)
            </label>
            <div className="flex gap-1.5">
              {[1.0, 10.0].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setTestAmount(v)}
                  className={`flex-1 py-1.5 rounded-lg border text-xs font-bold cursor-pointer ${
                    testAmount === v
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600'
                  }`}
                >
                  R$ {v.toFixed(2).replace('.', ',')}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
              CPF Comprador Teste (≠ Vendedor)
            </label>
            <input
              className={inputCls}
              value={testCustomer.cpf}
              onChange={(e) =>
                setTestCustomer({
                  ...testCustomer,
                  cpf: e.target.value.replace(/\D/g, '').slice(0, 14),
                })
              }
              placeholder="CPF do comprador"
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
              E-mail Comprador Teste (≠ E-mail da Conta Vindi — Regra 003021)
            </label>
            <input
              className={inputCls}
              value={testCustomer.email}
              onChange={(e) => setTestCustomer({ ...testCustomer, email: e.target.value })}
              placeholder="homologacao@cronuzb2b.com.br"
            />
          </div>
        </div>

        {/* Dados do Cartão para Teste de Cartão Transparente */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <input
            className={inputCls}
            inputMode="numeric"
            placeholder="Número do Cartão"
            value={card.number}
            onChange={(e) =>
              setCard({ ...card, number: e.target.value.replace(/\D/g, '').slice(0, 19) })
            }
          />
          <input
            className={inputCls}
            placeholder="Validade MM/AAAA"
            value={card.expiration}
            onChange={(e) => setCard({ ...card, expiration: e.target.value.slice(0, 7) })}
          />
          <input
            className={inputCls}
            inputMode="numeric"
            placeholder="CVV"
            value={card.cvv}
            onChange={(e) =>
              setCard({ ...card, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })
            }
          />
          <button
            type="button"
            onClick={fillSandboxCard}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Usar Cartão Sandbox Vindi
          </button>
        </div>

        {!settings.vindi_sandbox && (
          <p className="text-xs font-bold text-rose-600">
            Ambiente de Produção selecionado: o teste criará uma cobrança REAL de R${' '}
            {testAmount.toFixed(2).replace('.', ',')} na Vindi.
          </p>
        )}

        {/* Resultado + Painel de Diagnóstico de Erros */}
        {result && (
          <div className={`p-3.5 rounded-xl border text-xs space-y-3 ${tone}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-bold flex items-center gap-1.5 text-sm">
                {result.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{result.message}</span>
              </div>
              <span className="px-2 py-0.5 rounded bg-white/80 dark:bg-slate-900/80 border font-mono text-[11px]">
                {result.sandbox ? 'SANDBOX' : 'PRODUÇÃO'} | {result.credential_type}
                {diag.http_status ? ` | HTTP ${diag.http_status}` : ''}
              </span>
            </div>

            {diag.endpoint && (
              <div className="font-mono text-[11px] opacity-85 break-all">
                <strong>Endpoint chamado:</strong> {diag.endpoint}
              </div>
            )}

            {/* Tabela de Erros Estruturados da Vindi Commerce */}
            {vindiErrors.length > 0 && (
              <div className="rounded-lg border border-rose-200 dark:border-rose-800/70 bg-white dark:bg-slate-900 p-3 space-y-2 text-slate-800 dark:text-slate-200">
                <p className="font-extrabold text-xs text-rose-700 dark:text-rose-400">
                  Diagnóstico Oficial de Erros da Vindi Commerce:
                </p>
                {vindiErrors.map((err, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-lg bg-rose-50/60 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/50 space-y-1"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-rose-600 text-white font-mono font-bold text-[10px]">
                        Código {err.code}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500">
                        Campo: <strong>{err.field}</strong>
                      </span>
                      <span className="font-bold text-rose-800 dark:text-rose-300">
                        {err.message}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-700 dark:text-slate-300">
                      <strong>Como resolver:</strong> {err.solution}
                    </p>
                  </div>
                ))}

                {hasTokenEnvError && (
                  <div className="pt-1 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        runTest(result.payment_method || 'PIX', !Boolean(settings.vindi_sandbox))
                      }
                      className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Testar Automaticamente no Ambiente{' '}
                      {settings.vindi_sandbox ? 'PRODUÇÃO' : 'SANDBOX'}
                    </button>
                    <span className="text-[11px] text-slate-500">
                      Clique para verificar se o seu Token pertence ao outro ambiente da Vindi.
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Links de Pagamento / QR Code PIX quando bem-sucedido */}
            {result.payment_url && (
              <div className="pt-1 flex flex-wrap items-center gap-2">
                <a
                  href={result.payment_url}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Abrir Página de Pagamento da Vindi (R$ {Number(result.amount || testAmount).toFixed(2)})
                </a>
                {result.url_car && (
                  <a
                    href={result.url_car}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Abrir URL Carrinho Vindi
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(result.payment_url);
                    toast.success('Link de pagamento copiado!');
                  }}
                  className="px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copiar Link
                </button>
              </div>
            )}

            {result.pix_qr_code_url && (
              <div className="flex items-center gap-4 bg-white dark:bg-slate-900 p-3 rounded-lg border">
                <img
                  src={result.pix_qr_code_url}
                  alt="QR Code PIX Vindi"
                  className="w-32 h-32 rounded bg-white border p-1"
                />
                <div className="space-y-1.5 flex-1 min-w-0">
                  <p className="font-bold text-slate-800 dark:text-slate-200">
                    QR Code PIX Gerado pela Vindi Commerce!
                  </p>
                  {result.pix_code && (
                    <>
                      <code className="block p-2 rounded bg-slate-50 dark:bg-slate-950 border font-mono text-[10px] break-all text-slate-800 dark:text-slate-200">
                        {result.pix_code}
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(result.pix_code);
                          toast.success('Código PIX Copia e Cola copiado!');
                        }}
                        className="px-3 py-1 rounded bg-emerald-600 text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                        Copiar PIX Copia e Cola
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Inspetor de Payload JSON Enviado e Recebido */}
            {(diag.request_preview || diag.response_preview) && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowRawJson(!showRawJson)}
                  className="text-[11px] font-bold underline flex items-center gap-1 cursor-pointer opacity-80 hover:opacity-100"
                >
                  {showRawJson
                    ? 'Ocultar JSON Técnico (Request / Response)'
                    : 'Ver JSON Técnico Enviado e Resposta Bruta da Vindi'}
                </button>
                {showRawJson && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                    <div className="p-2.5 rounded-lg bg-slate-900 text-slate-100 font-mono text-[10px] overflow-x-auto max-h-60">
                      <div className="text-indigo-400 font-bold mb-1">
                        REQUEST ENVIADO À VINDI (MASCARADO):
                      </div>
                      <pre>{JSON.stringify(diag.request_preview, null, 2)}</pre>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-900 text-slate-100 font-mono text-[10px] overflow-x-auto max-h-60">
                      <div className="text-emerald-400 font-bold mb-1">
                        RESPONSE RECEBIDO DA VINDI (HTTP {diag.http_status}):
                      </div>
                      <pre>
                        {typeof diag.response_preview === 'string'
                          ? diag.response_preview
                          : JSON.stringify(diag.response_preview, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

type RoutingMatrixProps = {
  companyId: number;
  settings?: any;
  setSettings?: (s: any) => void;
  onJumpToProvider?: (providerCode: string) => void;
  onJumpToPdvTab?: () => void;
  activeProviderDrawer?: string | null;
};

/**
 * Matriz Unificada de Roteamento por Canal × Forma de Pagamento (ou Link no Fim da Venda).
 * Permite ao Seller ou Master escolher 1 provedor para cada forma (ex: Cartão -> Vindi, PIX -> Efí, Boleto -> Cora)
 * OU definir que o canal finaliza com Link de Pagamento no final da venda (sem amarrar na forma),
 * com botão direto para abrir a configuração do provedor selecionado sob demanda.
 */
export function SellerPaymentRoutingMatrix({
  companyId,
  settings = {},
  setSettings,
  onJumpToProvider,
  onJumpToPdvTab,
  activeProviderDrawer,
}: RoutingMatrixProps) {
  const [hub, setHub] = useState<any | null>(null);
  const [loadingHub, setLoadingHub] = useState(true);
  const [savingHub, setSavingHub] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<string>('B2C_STOREFRONT');
  const [routes, setRoutes] = useState<Record<string, Record<string, string>>>({});
  const [channelModes, setChannelModes] = useState<Record<string, any>>({});
  const [showOverviewTable, setShowOverviewTable] = useState(false);

  const loadHub = async () => {
    if (!companyId) return;
    setLoadingHub(true);
    try {
      const res = await fetch(`${API}/companies/${companyId}/payments/hub`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Falha ao carregar matriz de pagamentos.');
      const data = await res.json();
      setHub(data);
      setRoutes(data.routes || {});
      setChannelModes(data.channel_modes || {});
    } catch (e: any) {
      toast.error(e.message || 'Erro ao carregar canais de pagamento.');
    } finally {
      setLoadingHub(false);
    }
  };

  useEffect(() => {
    loadHub();
  }, [companyId]);

  const setMethodProvider = (channelCode: string, methodCode: string, providerCode: string) => {
    setRoutes((prev) => {
      const chMap = { ...(prev[channelCode] || {}) };
      if (providerCode) chMap[methodCode] = providerCode;
      else delete chMap[methodCode];
      const nextRoutes = { ...prev, [channelCode]: chMap };
      if (setSettings) {
        setSettings((sPrev: any) => ({
          ...sPrev,
          _hub_routes: nextRoutes,
          _hub_channels: hub?.channels || [],
        }));
      }
      return nextRoutes;
    });
  };

  const setChannelModeField = (channelCode: string, field: string, value: any) => {
    setChannelModes((prev) => {
      const updatedCh = {
        ...(prev[channelCode] || { mode: 'PER_METHOD', link_provider: 'VINDI', express_cpf_only: true }),
        [field]: value,
      };
      const nextModes = {
        ...prev,
        [channelCode]: updatedCh,
      };

      // Sincroniza imediatamente com o estado principal do SettingsPage quando presente
      if (setSettings) {
        setSettings((sPrev: any) => {
          const nextShowcases = {
            ...(sPrev.b2c_showcases_config || {}),
            payment_channel_modes: nextModes,
          };
          const patch: any = {
            ...sPrev,
            b2c_showcases_config: nextShowcases,
            _hub_channel_modes: nextModes,
            _hub_routes: routes,
            _hub_channels: hub?.channels || [],
          };
          if (channelCode === 'B2C_STOREFRONT') {
            if (updatedCh.mode === 'PAYMENT_LINK') {
              const lp = updatedCh.link_provider || 'VINDI';
              patch.b2c_checkout_mode = 'NATIVE_GATEWAY';
              patch.payment_gateway_active = lp;
              patch.vindi_integration_mode = 'PAYMENT_LINK';
              patch.vindi_express_cpf_only = updatedCh.express_cpf_only !== false;
            } else {
              patch.b2c_checkout_mode = 'NATIVE_GATEWAY';
              patch.vindi_integration_mode = 'TRANSPARENT';
            }
          }
          return patch;
        });
      }

      return nextModes;
    });
  };

  // Mantém a matriz sincronizada se o usuário clicar na modalidade dentro do VindiCheckoutPanel abaixo
  useEffect(() => {
    if (!hub || loadingHub || !settings || !settings.vindi_integration_mode) return;
    setChannelModes((prev) => {
      const curB2c = prev.B2C_STOREFRONT || {
        mode: 'PER_METHOD',
        link_provider: 'VINDI',
        express_cpf_only: true,
      };
      const targetMode =
        settings.vindi_integration_mode === 'PAYMENT_LINK'
          ? 'PAYMENT_LINK'
          : 'PER_METHOD';
      const targetExpress = settings.vindi_express_cpf_only !== false;
      if (curB2c.mode === targetMode && curB2c.express_cpf_only === targetExpress) {
        return prev;
      }
      return {
        ...prev,
        B2C_STOREFRONT: {
          ...curB2c,
          mode: targetMode,
          link_provider: curB2c.link_provider || 'VINDI',
          express_cpf_only: targetExpress,
        },
      };
    });
  }, [settings?.vindi_integration_mode, settings?.vindi_express_cpf_only]);

  const handleSaveMatrix = async () => {
    if (!companyId || !hub) return;
    setSavingHub(true);
    try {
      const routeItems: Array<{ channel: string; method: string; provider: string | null }> = [];
      (hub.channels || []).forEach((ch: any) => {
        const chMode = channelModes[ch.code]?.mode || 'PER_METHOD';
        (ch.methods || []).forEach((m: string) => {
          let prov = routes[ch.code]?.[m] || null;
          if (chMode === 'PAYMENT_LINK' && m === 'LINK') {
            prov = channelModes[ch.code]?.link_provider || 'VINDI';
          }
          routeItems.push({ channel: ch.code, method: m, provider: prov });
        });
      });

      const res = await fetch(`${API}/companies/${companyId}/payments/routes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          routes: routeItems,
          channel_modes: channelModes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Erro ao salvar roteamento de pagamentos.');
      setHub(data);
      setRoutes(data.routes || {});
      setChannelModes(data.channel_modes || {});

      // Sincroniza estado local do settings para o B2C (incluindo payment_channel_modes em b2c_showcases_config)
      if (setSettings) {
        const b2cCfg = (data.channel_modes || {}).B2C_STOREFRONT || {};
        const b2cRoutes = (data.routes || {}).B2C_STOREFRONT || {};
        const nextShowcases = {
          ...(settings.b2c_showcases_config || {}),
          payment_channel_modes: data.channel_modes || channelModes,
        };
        if (b2cCfg.mode === 'PAYMENT_LINK') {
          const lp = b2cCfg.link_provider || 'VINDI';
          setSettings({
            ...settings,
            b2c_checkout_mode: 'NATIVE_GATEWAY',
            payment_gateway_active: lp,
            vindi_integration_mode: 'PAYMENT_LINK',
            vindi_express_cpf_only: b2cCfg.express_cpf_only !== false,
            b2c_showcases_config: nextShowcases,
            _hub_channel_modes: data.channel_modes || channelModes,
            _hub_routes: data.routes || routes,
            _hub_channels: data.channels || hub?.channels || [],
          });
        } else {
          const primary = b2cRoutes.CARD || b2cRoutes.PIX || b2cRoutes.BOLETO || settings.payment_gateway_active;
          setSettings({
            ...settings,
            b2c_checkout_mode: 'NATIVE_GATEWAY',
            payment_gateway_active: primary,
            vindi_integration_mode: 'TRANSPARENT',
            b2c_showcases_config: nextShowcases,
            _hub_channel_modes: data.channel_modes || channelModes,
            _hub_routes: data.routes || routes,
            _hub_channels: data.channels || hub?.channels || [],
          });
        }
      }

      toast.success('Regras de pagamento por operação salvas com sucesso!');
    } catch (e: any) {
      toast.error(e.message || 'Falha ao salvar matriz de pagamentos.');
    } finally {
      setSavingHub(false);
    }
  };

  if (loadingHub || !hub) {
    return (
      <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-500 flex items-center gap-2">
        <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
        Carregando matriz de canais e formas de pagamento...
      </div>
    );
  }

  const visibleChannels = (hub.channels || []).filter((c: any) => c.code !== 'PAYMENT_LINK');
  const activeChannelObj =
    visibleChannels.find((c: any) => c.code === selectedChannel) || visibleChannels[0];
  const activeChCode = activeChannelObj?.code || 'B2C_STOREFRONT';
  const activeChModeObj = channelModes[activeChCode] || {
    mode: 'PER_METHOD',
    link_provider: 'VINDI',
    express_cpf_only: true,
    allow_horus_invoicing: true,
  };
  const activeMode = activeChModeObj.mode || 'PER_METHOD';
  const providersList: Array<any> = hub.providers || [];

  const getProvidersForMethod = (method: string) =>
    providersList.filter((p) => Array.isArray(p.methods) && p.methods.includes(method));

  const getProviderMeta = (code?: string) => providersList.find((p) => p.code === code);

  const summarizeChannel = (ch: any) => {
    const cm = channelModes[ch.code]?.mode || 'PER_METHOD';
    if (ch.supports_checkout_finisher && cm === 'PAYMENT_LINK') {
      const lp = channelModes[ch.code]?.link_provider || 'VINDI';
      return `Link no Fim da Venda (${lp})`;
    }
    const r = routes[ch.code] || {};
    const parts: string[] = [];
    if (r.CARD) parts.push(`Cartão: ${r.CARD}`);
    if (r.PIX) parts.push(`PIX: ${r.PIX}`);
    if (r.BOLETO) parts.push(`Boleto: ${r.BOLETO}`);
    return parts.length > 0 ? parts.join(' • ') : 'Não definido';
  };

  const METHOD_CARDS = [
    {
      code: 'CARD',
      title: 'Cartão de Crédito',
      subtitle: 'Processamento à vista ou parcelado com antifraude',
      badge: 'Ex: Vindi / Cielo / Rede / Efí',
    },
    {
      code: 'PIX',
      title: 'PIX Instantâneo (QR Code / Copia e Cola)',
      subtitle: 'Geração de QR Code dinâmico e conciliação por Webhook',
      badge: 'Ex: Efí / Cora / Inter / Vindi',
    },
    {
      code: 'BOLETO',
      title: 'Boleto Bancário Registrado / BolePix',
      subtitle: 'Emissão de boleto com código de barras e linha digitável',
      badge: 'Ex: Cora / Inter / Efí / Vindi',
    },
  ];

  return (
    <div className="space-y-5">
      {/* BLOCO 1: SELETOR DAS 7 FRENTES / CANAIS DO ECOSSISTEMA CRONUZ */}
      <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3.5">
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block">
              Passo 1 • Escolha a Frente / Canal Operacional
            </span>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              Onde e Como Cada Frente do Sistema Recebe Pagamentos
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Selecione o canal abaixo (<strong>B2C</strong>, <strong>Eventos Escolares</strong>, <strong>Assinaturas</strong>, <strong>B2B</strong>, <strong>Financeiro Horus ERP</strong> ou <strong>Financeiro Cronuz</strong>) para definir um provedor por forma de pagamento ou Link no final da venda.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowOverviewTable(!showOverviewTable)}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              {showOverviewTable ? 'Ocultar Resumo Geral' : 'Ver Resumo de Todos os Canais'}
            </button>
            <button
              type="button"
              disabled={savingHub}
              onClick={handleSaveMatrix}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm cursor-pointer disabled:opacity-50"
            >
              {savingHub ? 'Salvando...' : 'Salvar Regras dos Canais'}
            </button>
          </div>
        </div>

        {/* Grade de Cards dos Canais (B2C, Eventos, Assinaturas, B2B, Horus ERP, Financeiro Cronuz, PDV) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {visibleChannels.map((ch: any) => {
            const isSelected = ch.code === activeChCode;
            const summary = summarizeChannel(ch);
            const isConfigured = summary !== 'Não definido';
            return (
              <button
                key={ch.code}
                type="button"
                onClick={() => setSelectedChannel(ch.code)}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between min-w-0 ${
                  isSelected
                    ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/40 ring-2 ring-indigo-500/20 shadow-sm'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40 hover:border-indigo-300'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                      {ch.short_name || ch.name}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                        isConfigured
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : 'bg-slate-200/70 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      {isConfigured ? 'Ativo' : 'Pendente'}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 line-clamp-2 mt-1 block">
                    {ch.description}
                  </span>
                </div>
                <div className="mt-2.5 pt-2 border-t border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-1 min-w-0">
                  <span className="text-[10px] font-mono font-bold text-indigo-700 dark:text-indigo-300 truncate">
                    {summary}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Tabela Resumo de Todos os Canais (Opcional / Expansível) */}
        {showOverviewTable && (
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 mt-2">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-950 text-[11px] uppercase text-slate-500 font-bold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Canal / Frente</th>
                  <th className="py-2.5 px-3">Modo de Finalização</th>
                  <th className="py-2.5 px-3">Cartão</th>
                  <th className="py-2.5 px-3">PIX</th>
                  <th className="py-2.5 px-3">Boleto</th>
                  <th className="py-2.5 px-3">Link no Fim da Venda</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {visibleChannels.map((ch: any) => {
                  const cm = channelModes[ch.code]?.mode || 'PER_METHOD';
                  const r = routes[ch.code] || {};
                  const isLink = ch.supports_checkout_finisher && cm === 'PAYMENT_LINK';
                  return (
                    <tr
                      key={ch.code}
                      onClick={() => setSelectedChannel(ch.code)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                    >
                      <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white">
                        {ch.short_name || ch.name}
                      </td>
                      <td className="py-2.5 px-3">
                        {isLink ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                            Link no Fim da Venda
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold text-[10px]">
                            Por Forma de Pagamento
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        {isLink ? 'Definido no Link' : r.CARD || '—'}
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        {isLink ? 'Definido no Link' : r.PIX || '—'}
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        {isLink ? 'Definido no Link' : r.BOLETO || '—'}
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        {isLink ? channelModes[ch.code]?.link_provider || r.LINK || 'VINDI' : r.LINK || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* BLOCO 2: CONFIGURAÇÃO DO CANAL SELECIONADO */}
        {activeChannelObj && (
          <div className="p-4 sm:p-5 rounded-2xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/30 dark:bg-indigo-950/20 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block">
                  Configurando Canal: {activeChannelObj.name}
                </span>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                  {activeChannelObj.description}
                </p>
              </div>
              {activeChCode === 'PDV' && onJumpToPdvTab && (
                <button
                  type="button"
                  onClick={onJumpToPdvTab}
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shrink-0 cursor-pointer"
                >
                  Regras de Parcelamento da Frente de Caixa (PDV) →
                </button>
              )}
            </div>

            {/* Opção extra do B2B: manter faturamento Horus ERP ativo */}
            {activeChCode === 'B2B_STOREFRONT' && (
              <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-start gap-2.5 text-xs">
                <input
                  type="checkbox"
                  checked={activeChModeObj.allow_horus_invoicing !== false}
                  onChange={(e) =>
                    setChannelModeField('B2B_STOREFRONT', 'allow_horus_invoicing', e.target.checked)
                  }
                  className="w-4 h-4 mt-0.5 rounded text-indigo-600"
                />
                <div>
                  <span className="font-bold text-slate-900 dark:text-white block">
                    Manter Faturamento B2B pelas Condições Comerciais do Horus ERP (28/56 dias, Consignação, Limite de Crédito)
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Além das condições faturadas do Horus ERP, você pode habilitar abaixo quais provedores processam pagamentos imediatos (Cartão, PIX ou Boleto) quando o cliente B2B optar por pagar no pedido.
                  </span>
                </div>
              </div>
            )}

            {/* SE O CANAL SUPORTA ESCOLHER ENTRE "POR FORMA DE PAGAMENTO" VS "LINK NO FIM DA VENDA" */}
            {activeChannelObj.supports_checkout_finisher && (
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 block">
                  Como a venda é finalizada em &ldquo;{activeChannelObj.short_name || activeChannelObj.name}&rdquo;?
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* OPÇÃO A: POR FORMA DE PAGAMENTO (CHECKOUT TRANSPARENTE) */}
                  <button
                    type="button"
                    onClick={() => setChannelModeField(activeChCode, 'mode', 'PER_METHOD')}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                      activeMode === 'PER_METHOD'
                        ? 'border-indigo-600 bg-white dark:bg-slate-900 ring-2 ring-indigo-500/20 shadow-sm'
                        : 'border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/50 hover:border-indigo-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <CreditCard className="w-4 h-4 text-indigo-600" />
                        1. Por Forma de Pagamento (Transparente)
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700">
                        Flexível por Meio
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      O cliente escolhe a forma na nossa tela e você define <strong>1 provedor para cada forma</strong> (ex: <strong>Cartão → Vindi</strong>, <strong>PIX → Efí</strong>, <strong>Boleto → Cora</strong>).
                    </p>
                  </button>

                  {/* OPÇÃO B: LINK DE PAGAMENTO NO FINAL DA VENDA (NÃO AMARRA NA FORMA) */}
                  <button
                    type="button"
                    onClick={() => setChannelModeField(activeChCode, 'mode', 'PAYMENT_LINK')}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                      activeMode === 'PAYMENT_LINK'
                        ? 'border-emerald-600 bg-white dark:bg-slate-900 ring-2 ring-emerald-500/20 shadow-sm'
                        : 'border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/50 hover:border-emerald-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <Link2 className="w-4 h-4 text-emerald-600" />
                        2. Link de Pagamento no Final da Venda
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">
                        Fim da Venda
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      <strong>Não amarra na forma de pagamento</strong>: no fim da venda o pedido gera o Link Oficial (ex: Vindi) e o cliente escolhe PIX, Cartão ou Boleto lá dentro.
                    </p>
                  </button>
                </div>
              </div>
            )}

            {/* CONTEÚDO QUANDO MODO = LINK DE PAGAMENTO NO FINAL DA VENDA */}
            {activeChannelObj.supports_checkout_finisher && activeMode === 'PAYMENT_LINK' ? (
              <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 space-y-4">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
                  <div className="space-y-2.5 min-w-0">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                      Provedor do Link de Pagamento (Acionado no Final da Venda)
                    </label>
                    <select
                      value={activeChModeObj.link_provider || 'VINDI'}
                      onChange={(e) => {
                        setChannelModeField(activeChCode, 'link_provider', e.target.value);
                        setMethodProvider(activeChCode, 'LINK', e.target.value);
                      }}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-xs sm:text-sm font-bold text-slate-900 dark:text-white"
                    >
                      {getProvidersForMethod('LINK').map((p: any) => (
                        <option key={p.code} value={p.code}>
                          {p.name} — Link Hospedado ({p.configured ? 'Configurado ✓' : 'Pendente'})
                        </option>
                      ))}
                    </select>
                    {onJumpToProvider && (
                      <button
                        type="button"
                        onClick={() => onJumpToProvider(activeChModeObj.link_provider || 'VINDI')}
                        className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer shadow-sm inline-flex items-center justify-center gap-1.5"
                      >
                        <Settings2 className="w-3.5 h-3.5 shrink-0" />
                        <span>Abrir Configurações ({activeChModeObj.link_provider || 'VINDI'}) →</span>
                      </button>
                    )}
                  </div>
                  <div className="p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-900 dark:text-emerald-200 leading-relaxed min-w-0">
                    <strong>Como funciona:</strong> Como este canal está em <em>Link de Pagamento no Final da Venda</em>, não há amarração individual por forma na tela da loja. O cliente vai para o ambiente seguro da{' '}
                    <strong>{activeChModeObj.link_provider || 'VINDI'}</strong> e lá escolhe PIX, Cartão de Crédito ou Boleto.
                  </div>
                </div>

                {/* Opção de pedir apenas o CPF quando usar Link da Vindi */}
                {(activeChModeObj.link_provider || 'VINDI') === 'VINDI' &&
                  (activeChCode === 'B2C_STOREFRONT' || activeChCode === 'SCHOOLS') && (
                    <label className="flex items-start gap-2.5 p-3 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/30 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={activeChModeObj.express_cpf_only !== false}
                        onChange={(e) =>
                          setChannelModeField(activeChCode, 'express_cpf_only', e.target.checked)
                        }
                        className="w-4 h-4 mt-0.5 rounded text-indigo-600 shrink-0"
                      />
                      <div className="text-xs">
                        <span className="font-extrabold text-slate-900 dark:text-white block">
                          Checkout Express por CPF (Manter apenas o CPF na nossa tela para não repetir dados na Vindi)
                        </span>
                        <span className="text-[11px] text-slate-600 dark:text-slate-300">
                          Como o ambiente da Vindi já solicita Nome, E-mail, Endereço e Pagamento, marcando esta opção pedimos apenas o <strong>CPF</strong> (e o aceite LGPD) antes de abrir o Link da Vindi. Quando o cliente paga lá (PIX ou Cartão), recebemos o retorno automático e gravamos o histórico completo no pedido.
                        </span>
                      </div>
                    </label>
                  )}
              </div>
            ) : (
              /* CONTEÚDO QUANDO MODO = POR FORMA DE PAGAMENTO (1 ÚNICO PROVEDOR POR FORMA) */
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                    Selecione o Provedor de Cada Forma e Clique para Abrir as Configurações
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Ex: Cartão → Vindi | PIX → Efí | Boleto → Cora
                  </span>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                  {METHOD_CARDS.filter((mc) => (activeChannelObj.methods || []).includes(mc.code)).map(
                    (mc) => {
                      const selectedProv = routes[activeChCode]?.[mc.code] || '';
                      const provMeta = getProviderMeta(selectedProv);
                      const availableProviders = getProvidersForMethod(mc.code);
                      const isDrawerOpen =
                        activeProviderDrawer &&
                        (activeProviderDrawer === selectedProv ||
                          (activeProviderDrawer === 'CIELO_REDE' &&
                            (selectedProv === 'CIELO' || selectedProv === 'REDE')));
                      return (
                        <div
                          key={mc.code}
                          className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between space-y-3 min-w-0 ${
                            selectedProv
                              ? 'border-indigo-300 dark:border-indigo-800 bg-white dark:bg-slate-900 shadow-sm'
                              : 'border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/50'
                          }`}
                        >
                          <div className="space-y-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className="text-xs font-extrabold text-slate-900 dark:text-white block">
                                  {mc.title}
                                </span>
                                <span className="text-[11px] text-slate-500 block">{mc.subtitle}</span>
                              </div>
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                                {mc.code}
                              </span>
                            </div>

                            <select
                              value={selectedProv}
                              onChange={(e) => setMethodProvider(activeChCode, mc.code, e.target.value)}
                              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                            >
                              <option value="">Desativado nesta operação</option>
                              {availableProviders.map((p: any) => (
                                <option key={p.code} value={p.code}>
                                  {p.name} {p.configured ? '✓ (Configurado)' : '(Pendente de chave)'}
                                </option>
                              ))}
                            </select>
                          </div>

                          {selectedProv && provMeta ? (
                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                              <div className="flex items-center justify-between text-[11px]">
                                <span
                                  className={`font-semibold flex items-center gap-1 ${
                                    provMeta.configured ? 'text-emerald-600' : 'text-amber-600'
                                  }`}
                                >
                                  {provMeta.configured ? (
                                    <>
                                      <CheckCircle2 className="w-3.5 h-3.5" /> Credenciais ativas
                                    </>
                                  ) : (
                                    <>
                                      <AlertTriangle className="w-3.5 h-3.5" /> Requer configurar chave
                                    </>
                                  )}
                                </span>
                              </div>
                              {onJumpToProvider && (
                                <button
                                  type="button"
                                  onClick={() => onJumpToProvider(selectedProv)}
                                  className={`w-full px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                                    isDrawerOpen
                                      ? 'bg-indigo-600 text-white shadow-sm'
                                      : 'bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                                  }`}
                                >
                                  <Settings2 className="w-3.5 h-3.5" />
                                  Abrir Configurações ({provMeta.short_name || selectedProv}) →
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400">
                              Selecione um provedor acima para liberar e configurar esta forma de pagamento.
                            </div>
                          )}
                        </div>
                      );
                    }
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
