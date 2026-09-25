'use client';

import { useState, useEffect } from 'react';
import { Truck, Save, Loader2, CheckCircle2, XCircle, Eye, EyeOff, Plug, ToggleLeft, ToggleRight, AlertTriangle, Info } from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';
import { useCompany } from './layout';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const PROVIDERS = [{ value: 'MKT', label: 'MKT Logística' }];

interface LogisticsSettings {
  configured: boolean;
  provider: string;
  enabled: boolean;
  api_url: string;
  login: string;
  password_set: boolean;
  warehouse_id: string;
  client_id: string;
  operator_id: string;
  address_type: string;
  stock_local?: string;
  feature_auto_send?: boolean;
  feature_auto_check: boolean;
  feature_auto_invoice?: boolean;
  min_order_number?: number | null;
  check_interval_min: number;
  providers: string[];
}

export function LogisticsTab() {
  const { company } = useCompany();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [changePassword, setChangePassword] = useState(false);

  const [settings, setSettings] = useState<LogisticsSettings>({
    configured: false,
    provider: 'MKT',
    enabled: false,
    api_url: '',
    login: '',
    password_set: false,
    warehouse_id: '',
    client_id: '',
    operator_id: '',
    address_type: '1',
    stock_local: '',
    feature_auto_send: true,
    feature_auto_check: false,
    feature_auto_invoice: true,
    min_order_number: null,
    check_interval_min: 15,
    providers: ['MKT'],
  });

  const companyId = company?.id;

  useEffect(() => {
    if (!companyId) return;
    fetch(`${API}/companies/${companyId}/logistics/settings`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(r => r.json())
      .then(data => {
        // Sempre popula o form com os dados do banco (configured=true = já foi salvo antes)
        setSettings(prev => ({
          ...prev,
          ...data,
          // Garante valores padrão caso venham nulos do banco
          provider: data.provider || 'MKT',
          api_url: data.api_url || '',
          login: data.login || '',
          warehouse_id: data.warehouse_id || '',
          client_id: data.client_id || '',
          operator_id: data.operator_id || '',
          address_type: data.address_type || '1',
          stock_local: data.stock_local || '',
          feature_auto_send: data.feature_auto_send ?? true,
          feature_auto_check: data.feature_auto_check ?? false,
          feature_auto_invoice: data.feature_auto_invoice ?? true,
          min_order_number: data.min_order_number ?? null,
          check_interval_min: data.check_interval_min ?? 15,
          password_set: data.password_set ?? false,
          configured: data.configured ?? false,
          providers: data.providers || ['MKT'],
        }));
      })
      .catch(() => toast.error('Erro ao carregar configurações de logística.'))
      .finally(() => setLoading(false));
  }, [companyId]);

  const handleSave = async () => {
    if (!companyId) {
      toast.error('Empresa não carregada. Recarregue a página.');
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        provider: settings.provider,
        enabled: settings.enabled,
        api_url: settings.api_url || null,
        login: settings.login || null,
        warehouse_id: settings.warehouse_id || null,
        client_id: settings.client_id || null,
        operator_id: settings.operator_id || null,
        address_type: settings.address_type || '1',
        stock_local: settings.stock_local || null,
        feature_auto_send: settings.feature_auto_send ?? true,
        feature_auto_check: settings.feature_auto_check ?? false,
        feature_auto_invoice: settings.feature_auto_invoice ?? true,
        min_order_number: (settings.min_order_number !== null && settings.min_order_number !== undefined) ? Number(settings.min_order_number) : null,
        check_interval_min: settings.check_interval_min ?? 15,
      };
      // Envia senha se: (1) primeiro cadastro com senha digitada, ou (2) usuário clicou Alterar e digitou nova senha
      if (newPassword.trim()) body.password = newPassword;

      const r = await fetch(`${API}/companies/${companyId}/logistics/settings`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      let responseData: Record<string, unknown> | null = null;
      if (!r.ok) {
        const errData = await r.json().catch(() => ({})) as Record<string, unknown>;
        let msg = 'Erro ao salvar configurações.';
        if (typeof errData.detail === 'string') {
          msg = errData.detail;
        } else if (Array.isArray(errData.detail)) {
          msg = (errData.detail as { msg?: string; loc?: string[] }[]).map(e =>
            `${e.loc ? e.loc.slice(-1)[0] + ': ' : ''}${e.msg || JSON.stringify(e)}`
          ).join(' | ');
        } else if (errData.detail) {
          msg = JSON.stringify(errData.detail);
        }
        toast.error(msg);
        return;
      } else {
        responseData = await r.json().catch(() => null) as Record<string, unknown> | null;
      }

      // Atualiza state com dados retornados pelo PUT (ou mantém o atual)
      if (responseData) {
        setSettings(prev => ({
          ...prev,
          ...(responseData as Partial<LogisticsSettings>),
          configured: true,
          password_set: (responseData!.password_set as boolean) ?? (prev.password_set || !!newPassword),
        }));
      }

      setChangePassword(false);
      setNewPassword('');
      toast.success('Configurações de logística salvas com sucesso!');

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Erro ao salvar: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!companyId) return;
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch(`${API}/companies/${companyId}/logistics/settings/test`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await r.json();
      setTestResult(data);
      if (data.success) toast.success(data.message || 'Conexão OK!');
      else toast.error(data.message || 'Falha na conexão.');
    } catch {
      setTestResult({ success: false, message: 'Erro ao testar conexão.' });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-violet-100 dark:bg-violet-950/40">
            <Truck className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">Sistema de Logística (WMS)</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Integre com seu sistema de armazenagem e expedição. Provider: <strong>{settings.provider}</strong>
            </p>
          </div>
        </div>
        <button
          onClick={() => setSettings(prev => ({ ...prev, enabled: !prev.enabled }))}
          className="flex items-center gap-2 text-sm font-semibold transition-colors"
        >
          {settings.enabled
            ? <><ToggleRight className="h-7 w-7 text-emerald-500" /><span className="text-emerald-600 dark:text-emerald-400">Habilitado</span></>
            : <><ToggleLeft className="h-7 w-7 text-slate-400" /><span className="text-slate-500">Desabilitado</span></>}
        </button>
      </div>

      {!settings.enabled && (
        <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Integração desabilitada. Habilite e configure para enviar pedidos ao WMS.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Sistema de Logística</label>
          <select
            value={settings.provider}
            onChange={e => setSettings(prev => ({ ...prev, provider: e.target.value }))}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">URL da API</label>
          <input type="url" placeholder="https://api.mktlogistica.com.br/"
            value={settings.api_url} onChange={e => setSettings(prev => ({ ...prev, api_url: e.target.value }))}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500" />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Usuário</label>
          <input type="text" placeholder="usuario_api"
            value={settings.login} onChange={e => setSettings(prev => ({ ...prev, login: e.target.value }))}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500" />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Senha</label>
          {!changePassword && settings.password_set ? (
            /* Senha já cadastrada — mostra bolinhas + botão Alterar */
            <div className="flex gap-2 items-center">
              <div className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-500">●●●●●●●●</div>
              <button type="button" onClick={() => setChangePassword(true)} className="text-xs text-violet-600 dark:text-violet-400 hover:underline font-semibold whitespace-nowrap">Alterar</button>
            </div>
          ) : (
            /* Sem senha cadastrada OU usuário clicou Alterar — input livre */
            <div className="relative">
              {settings.password_set && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mb-1">Digite a nova senha para substituir a atual.</p>
              )}
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Senha da API"
                value={newPassword}
                onChange={e => {
                  setNewPassword(e.target.value);
                  // Garante que changePassword esteja ativo ao digitar
                  if (!changePassword) setChangePassword(true);
                }}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 pr-9 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              {settings.password_set && (
                <button type="button" onClick={() => { setChangePassword(false); setNewPassword(''); }} className="mt-1 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                  Cancelar alteração
                </button>
              )}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Armazém ID</label>
          <input type="text" placeholder="3"
            value={settings.warehouse_id} onChange={e => setSettings(prev => ({ ...prev, warehouse_id: e.target.value }))}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500" />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Cliente ID (no WMS)</label>
          <input type="text" placeholder="42"
            value={settings.client_id} onChange={e => setSettings(prev => ({ ...prev, client_id: e.target.value }))}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500" />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Operador Logístico ID</label>
          <input type="text" placeholder="1"
            value={settings.operator_id} onChange={e => setSettings(prev => ({ ...prev, operator_id: e.target.value }))}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500" />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
            Tipo Endereço Horus
            <span title="COD_TPO_END do Horus para endereço de entrega (ex: E = Entrega)"><Info className="h-3.5 w-3.5 text-slate-400 cursor-help" /></span>
          </label>
          <input type="text" placeholder="E"
            value={settings.address_type} onChange={e => setSettings(prev => ({ ...prev, address_type: e.target.value }))}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500" />
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
            Local de Estoque Horus (COD_LOCAL)
            <span title="Código do Local de Estoque de expedição cadastrado no Horus ERP (ex: 15 para EO-TRANSPO na Filial 2, ou 9 para CV-TRANSPO na Filial 1). Este local é onde o Horus dará a baixa na conferência dos itens deste WMS.">
              <Info className="h-3.5 w-3.5 text-slate-400 cursor-help" />
            </span>
          </label>
          <input
            type="text"
            placeholder="ex: 15 (EO-TRANSPO / Filial 2) ou 9 (CV-TRANSPO / Filial 1)"
            value={settings.stock_local || ''}
            onChange={e => setSettings(prev => ({ ...prev, stock_local: e.target.value }))}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Parâmetro <code>COD_LOCAL</code> do Horus ERP utilizado na rotina de conferência (<code>ConfereItem_Pedido</code>). Caso não seja informado, o sistema utilizará o local padrão da filial do pedido.
          </p>
        </div>

        {/* Número de Pedido Inicial (Corte para Automação) */}
        <div className="space-y-1.5 md:col-span-2">
          <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
            Número do Pedido Inicial (Corte para Automação)
            <span title="Define o número de pedido inicial a partir do qual as rotinas automáticas de envio, conferência e envio de NF devem atuar. Pedidos com número inferior a este serão ignorados pela rotina automática.">
              <Info className="h-3.5 w-3.5 text-slate-400 cursor-help" />
            </span>
          </label>
          <input
            type="number"
            placeholder="ex: 19594"
            value={settings.min_order_number ?? ''}
            onChange={e => setSettings(prev => ({ ...prev, min_order_number: e.target.value ? Number(e.target.value) : null }))}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono"
          />
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Apenas pedidos com código igual ou superior a este número serão processados automaticamente pelo robô de logística (envio WMS, conferência LFT e envio de Nota Fiscal). Deixe vazio para processar sem limite inferior.
          </p>
        </div>
      </div>

      {/* Jobs de Automação em Segundo Plano */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Automação de Jobs em Segundo Plano</h3>
        
        {/* Envio Automático */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Envio Automático de Pedidos (LEX → WMS)</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Job que busca pedidos liberados para expedição no Horus e envia automaticamente ao WMS a cada 15 min.</p>
            </div>
            <button type="button" onClick={() => setSettings(prev => ({ ...prev, feature_auto_send: !prev.feature_auto_send }))}>
              {settings.feature_auto_send
                ? <ToggleRight className="h-7 w-7 text-emerald-500" />
                : <ToggleLeft className="h-7 w-7 text-slate-400" />}
            </button>
          </div>
        </div>

        {/* Conferência Automática */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Conferência Automática (WMS → Horus LFT)</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Job que busca pedidos conferidos no WMS e libera para faturamento (LFT) no Horus a cada 15 min.</p>
            </div>
            <button type="button" onClick={() => setSettings(prev => ({ ...prev, feature_auto_check: !prev.feature_auto_check }))}>
              {settings.feature_auto_check
                ? <ToggleRight className="h-7 w-7 text-emerald-500" />
                : <ToggleLeft className="h-7 w-7 text-slate-400" />}
            </button>
          </div>
          {settings.feature_auto_check && (
            <div className="flex items-center gap-3 pt-1 border-t border-slate-100 dark:border-slate-800">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap">Intervalo de Verificação (min):</label>
              <input type="number" min={5} max={60}
                value={settings.check_interval_min} onChange={e => setSettings(prev => ({ ...prev, check_interval_min: Number(e.target.value) }))}
                className="w-20 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm text-center text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500" />
            </div>
          )}
        </div>

        {/* Envio Automático de Notas Fiscais */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Envio Automático de Notas Fiscais (FAT → WMS)</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Job que localiza pedidos faturados no Horus ERP (com NFe/XML gerados) e envia automaticamente ao WMS a cada 15 min.</p>
            </div>
            <button type="button" onClick={() => setSettings(prev => ({ ...prev, feature_auto_invoice: !prev.feature_auto_invoice }))}>
              {settings.feature_auto_invoice
                ? <ToggleRight className="h-7 w-7 text-emerald-500" />
                : <ToggleLeft className="h-7 w-7 text-slate-400" />}
            </button>
          </div>
        </div>
      </div>

      {testResult && (
        <div className={`flex items-center gap-2 text-sm px-4 py-3 rounded-xl border ${testResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300' : 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/30 dark:border-rose-800 dark:text-rose-300'}`}>
          {testResult.success ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
          {testResult.message}
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
        <button type="button" onClick={handleTest} disabled={testing || !settings.enabled}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors">
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
          Testar Conexão
        </button>
        <button type="button" onClick={handleSave} disabled={saving}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar Configurações
        </button>
      </div>
    </div>
  );
}
