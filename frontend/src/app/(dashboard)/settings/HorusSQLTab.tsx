'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  DatabaseZap, Save, Loader2, CheckCircle2, XCircle,
  Eye, EyeOff, ShieldCheck, Server, CreditCard, ShoppingCart,
  FileSpreadsheet, AlertTriangle, Building2
} from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';
import { useCompany } from './context';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface ProfileBankFields {
  forma_pagto: string;
  forma_pagto_credito_maior: string;
  banco: string;
  agencia: string;
  conta: string;
  carteira: string;
  payment_date_mode: string;
  unify_installments: boolean;
  split_excess_launch: boolean;
}

interface ReconciliationProfileConfig {
  code: string;
  name: string;
  short_name: string;
  channel_label: string;
  enabled: boolean;
  payment_date_mode?: string;
  unify_installments?: boolean;
  split_excess_launch?: boolean;
  forma_pagto_credito_maior?: string;
  custom_bank?: ProfileBankFields;
  effective_bank?: ProfileBankFields;
}

interface HorusSQLSettings {
  horus_sql_enabled: boolean;
  horus_sql_host: string;
  horus_sql_port: string;
  horus_sql_database: string;
  horus_sql_username: string;
  horus_sql_password: string | null;
  horus_sql_cod_empresa: string;
  horus_sql_cod_filial: string;
  horus_banco_forma_pagto: string;
  horus_banco_codigo: string;
  horus_banco_agencia: string;
  horus_banco_conta: string;
  horus_banco_carteira: string;
  horus_vendas_metodo?: string;
}

const DEFAULT_RECONCILIATION_PROFILES: ReconciliationProfileConfig[] = [
  { code: 'TRAY_SHOPEE', name: 'Shopee ↔ Tray ↔ Horus ERP', short_name: 'Shopee + Tray', channel_label: 'Shopee', enabled: true },
  { code: 'TRAY_TIKTOK', name: 'TikTok Shop ↔ Tray ↔ Horus ERP', short_name: 'TikTok + Tray', channel_label: 'TikTok Shop', enabled: true },
  { code: 'TRAY_VINDI', name: 'Vindi ↔ Tray ↔ Horus ERP', short_name: 'Vindi + Tray', channel_label: 'Vindi', enabled: true },
  { code: 'VINDI_DIRECT', name: 'Vindi Direto ↔ Horus ERP', short_name: 'Vindi Direto', channel_label: 'Vindi Direto', enabled: true },
];

export function HorusSQLTab() {
  const { company } = useCompany();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any | null>(null);
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [showPasswordValue, setShowPasswordValue] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'financeiro' | 'conexao' | 'vendas' | 'fiscal'>('financeiro');

  const [settings, setSettings] = useState<HorusSQLSettings>({
    horus_sql_enabled: false,
    horus_sql_host: '',
    horus_sql_port: '1433',
    horus_sql_database: '',
    horus_sql_username: '',
    horus_sql_password: null,
    horus_sql_cod_empresa: '1',
    horus_sql_cod_filial: '1',
    horus_banco_forma_pagto: '',
    horus_banco_codigo: '',
    horus_banco_agencia: '',
    horus_banco_conta: '',
    horus_banco_carteira: '',
    horus_vendas_metodo: '',
  });

  const [newPassword, setNewPassword] = useState('');
  const [reconciliationProfiles, setReconciliationProfiles] = useState<ReconciliationProfileConfig[]>(DEFAULT_RECONCILIATION_PROFILES);
  const [reconciliationBanks, setReconciliationBanks] = useState<Record<string, ProfileBankFields>>({});

  useEffect(() => {
    if (!company) return;
    fetchSettings();
  }, [company]);

  async function fetchSettings() {
    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`${API}/companies/${company!.id}/horus-sql/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSettings({
          horus_sql_enabled:       data.horus_sql_enabled ?? false,
          horus_sql_host:          data.horus_sql_host ?? '',
          horus_sql_port:          data.horus_sql_port ?? '1433',
          horus_sql_database:      data.horus_sql_database ?? '',
          horus_sql_username:      data.horus_sql_username ?? '',
          horus_sql_password:      data.horus_sql_password ?? null,
          horus_sql_cod_empresa:   data.horus_sql_cod_empresa ?? '1',
          horus_sql_cod_filial:    data.horus_sql_cod_filial ?? '1',
          horus_banco_forma_pagto: data.horus_banco_forma_pagto ?? '',
          horus_banco_codigo:      data.horus_banco_codigo ?? '',
          horus_banco_agencia:     data.horus_banco_agencia ?? '',
          horus_banco_conta:       data.horus_banco_conta ?? '',
          horus_banco_carteira:    data.horus_banco_carteira ?? '',
          horus_vendas_metodo:     data.horus_vendas_metodo ?? '',
        });

        const profs: ReconciliationProfileConfig[] =
          Array.isArray(data.reconciliation_profiles) && data.reconciliation_profiles.length > 0
            ? data.reconciliation_profiles
            : DEFAULT_RECONCILIATION_PROFILES;
        setReconciliationProfiles(profs);

        const bankMap: Record<string, ProfileBankFields> = {};
        for (const p of profs) {
          const defaultUnify = p.code === 'TRAY_SHOPEE' || p.code === 'TRAY_TIKTOK';
          const cb = p.custom_bank || p.effective_bank || {
            forma_pagto: '',
            forma_pagto_credito_maior: '',
            banco: '',
            agencia: '',
            conta: '',
            carteira: '',
            payment_date_mode: 'CHANNEL_DATE',
            unify_installments: defaultUnify,
            split_excess_launch: true,
          };
          bankMap[p.code] = {
            forma_pagto: cb.forma_pagto || '',
            forma_pagto_credito_maior: p.forma_pagto_credito_maior || cb.forma_pagto_credito_maior || '',
            banco: cb.banco || '',
            agencia: cb.agencia || '',
            conta: cb.conta || '',
            carteira: cb.carteira || '',
            payment_date_mode: p.payment_date_mode || cb.payment_date_mode || 'CHANNEL_DATE',
            unify_installments:
              p.unify_installments !== undefined
                ? Boolean(p.unify_installments)
                : cb.unify_installments !== undefined
                ? Boolean(cb.unify_installments)
                : defaultUnify,
            split_excess_launch:
              p.split_excess_launch !== undefined
                ? Boolean(p.split_excess_launch)
                : cb.split_excess_launch !== undefined
                ? Boolean(cb.split_excess_launch)
                : true,
          };
        }
        setReconciliationBanks(bankMap);
      }
    } catch (e) {
      console.error(e);
      toast.error('Erro ao carregar configurações Horus SQL.');
    } finally {
      setLoading(false);
    }
  }

  function handleProfileBankChange(profileCode: string, field: keyof ProfileBankFields, value: string | boolean) {
    const defaultUnify = profileCode === 'TRAY_SHOPEE' || profileCode === 'TRAY_TIKTOK';
    setReconciliationBanks((prev) => ({
      ...prev,
      [profileCode]: {
        ...(prev[profileCode] || {
          forma_pagto: '',
          forma_pagto_credito_maior: '',
          banco: '',
          agencia: '',
          conta: '',
          carteira: '',
          payment_date_mode: 'CHANNEL_DATE',
          unify_installments: defaultUnify,
          split_excess_launch: true,
        }),
        [field]: value,
      },
    }));
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value, type, checked } = e.target;
    setTestResult(null);
    setSettings(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  }

  const effectivePassword = newPassword || (settings.horus_sql_password === 'SET' ? '__SAVED__' : '');
  const canTest = Boolean(
    settings.horus_sql_host &&
    settings.horus_sql_database &&
    settings.horus_sql_username &&
    effectivePassword
  );

  async function handleTest() {
    if (!canTest) return;
    setTesting(true);
    setTestResult(null);

    try {
      const token = getToken();
      const useLive = Boolean(newPassword);

      let res: Response;
      if (useLive) {
        res = await fetch(`${API}/companies/${company!.id}/horus-sql/test-live`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            host: settings.horus_sql_host,
            port: settings.horus_sql_port || '1433',
            database: settings.horus_sql_database,
            username: settings.horus_sql_username,
            password: newPassword,
          }),
        });
      } else {
        res = await fetch(`${API}/companies/${company!.id}/horus-sql/test`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      const data = await res.json();
      if (res.ok && data.status === 'connected') {
        setTestResult(data);
        toast.success('Conexão ao SQL Server do Horus validada com sucesso!');
      } else {
        const msg = data.detail || data.message || 'Falha na conexão SQL.';
        setTestResult({ status: 'error', message: msg });
        toast.error(msg);
      }
    } catch (e: any) {
      toast.error('Erro de rede ao testar conexão.');
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const token = getToken();
      const payload: Record<string, any> = {
        horus_sql_enabled:       settings.horus_sql_enabled,
        horus_sql_host:          settings.horus_sql_host,
        horus_sql_port:          settings.horus_sql_port,
        horus_sql_database:      settings.horus_sql_database,
        horus_sql_username:      settings.horus_sql_username,
        horus_sql_cod_empresa:   settings.horus_sql_cod_empresa,
        horus_sql_cod_filial:    settings.horus_sql_cod_filial,
        horus_banco_forma_pagto: settings.horus_banco_forma_pagto,
        horus_banco_codigo:      settings.horus_banco_codigo,
        horus_banco_agencia:     settings.horus_banco_agencia,
        horus_banco_conta:       settings.horus_banco_conta,
        horus_banco_carteira:    settings.horus_banco_carteira,
        horus_vendas_metodo:     settings.horus_vendas_metodo,
        reconciliation_banks:    reconciliationBanks,
      };

      if (newPassword) {
        payload.horus_sql_password = newPassword;
      }

      const res = await fetch(`${API}/companies/${company!.id}/horus-sql/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success('Configurações atualizadas com sucesso!');
        setNewPassword('');
        setShowPasswordInput(false);
        await fetchSettings();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Erro ao salvar configurações.');
      }
    } catch (e) {
      toast.error('Erro inesperado ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary-base)]" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">

      {/* Header com Status */}
      <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/30">
            <DatabaseZap className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Parâmetros de Integração Horus SQL</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Configurações para baixa financeira, borderô e comunicação direta com o banco do Horus
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-60 px-5 py-2 text-xs font-bold text-white transition-all shadow-sm"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {saving ? 'Salvando...' : 'Salvar Alterações'}
        </button>
      </div>

      {/* Sub-abas de configuração */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-1">
        <button
          type="button"
          onClick={() => setActiveSubTab('financeiro')}
          className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors ${
            activeSubTab === 'financeiro'
              ? 'bg-violet-600 text-white'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <CreditCard className="h-3.5 w-3.5" />
          Parâmetros Financeiros & Borderô
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('conexao')}
          className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors ${
            activeSubTab === 'conexao'
              ? 'bg-violet-600 text-white'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Server className="h-3.5 w-3.5" />
          Conexão SQL Server
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('vendas')}
          className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors ${
            activeSubTab === 'vendas'
              ? 'bg-violet-600 text-white'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <ShoppingCart className="h-3.5 w-3.5" />
          Vendas (Futuro)
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('fiscal')}
          className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors ${
            activeSubTab === 'fiscal'
              ? 'bg-violet-600 text-white'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
          Fiscal & Estoque (Futuro)
        </button>
      </div>

      {/* ─── ABA: PARÂMETROS FINANCEIROS POR TIPO DE CONCILIAÇÃO ──────────────── */}
      {activeSubTab === 'financeiro' && (
        <div className="space-y-6">
          {/* 1. CONFIGURAÇÃO INDIVIDUAL POR MODALIDADE DE CONCILIAÇÃO */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-violet-600" />
                <div>
                  <h4 className="text-sm font-bold text-slate-800 dark:text-white">
                    Códigos Bancários do Horus por Tipo de Conciliação (Borderô)
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Defina o Banco, Agência, Conta Corrente e Forma de Pagamento (códigos do Horus ERP) específicos para cada operação de conciliação.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {(reconciliationProfiles.some((p) => p.enabled)
                ? reconciliationProfiles.filter((p) => p.enabled)
                : reconciliationProfiles
              ).map((prof) => {
                const b = reconciliationBanks[prof.code] || {
                  forma_pagto: '',
                  banco: '',
                  agencia: '',
                  conta: '',
                  carteira: '',
                  payment_date_mode: 'CHANNEL_DATE',
                  unify_installments: prof.code === 'TRAY_SHOPEE' || prof.code === 'TRAY_TIKTOK',
                };
                const isComplete = Boolean(b.forma_pagto && b.banco && b.agencia && b.conta);
                return (
                  <div
                    key={prof.code}
                    className={`rounded-2xl border p-4 space-y-3.5 transition-all ${
                      isComplete
                        ? 'border-emerald-200 bg-emerald-50/20 dark:border-emerald-900/50 dark:bg-emerald-950/10'
                        : 'border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-950/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="text-xs font-extrabold text-slate-900 dark:text-white block">
                          {prof.name}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400">
                          Código: {prof.code}
                        </span>
                      </div>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          isComplete
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                        }`}
                      >
                        {isComplete ? 'Configurado' : 'Usa Padrão / Pendente'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                          Forma Pagto (COD_FORMA) *
                        </label>
                        <input
                          type="text"
                          value={b.forma_pagto}
                          onChange={(e) =>
                            handleProfileBankChange(prof.code, 'forma_pagto', e.target.value)
                          }
                          placeholder={settings.horus_banco_forma_pagto || 'Ex: 01, CAR, PIX'}
                          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                          Banco Horus (COD_BANCO) *
                        </label>
                        <input
                          type="text"
                          value={b.banco}
                          onChange={(e) =>
                            handleProfileBankChange(prof.code, 'banco', e.target.value)
                          }
                          placeholder={settings.horus_banco_codigo || 'Ex: 001, 237, 341'}
                          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                          Agência (COD_AGENCIA) *
                        </label>
                        <input
                          type="text"
                          value={b.agencia}
                          onChange={(e) =>
                            handleProfileBankChange(prof.code, 'agencia', e.target.value)
                          }
                          placeholder={settings.horus_banco_agencia || 'Ex: 1234'}
                          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                        />
                      </div>

                      <div className="space-y-1 sm:col-span-2">
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                          Conta Corrente (COD_CONTAC) *
                        </label>
                        <input
                          type="text"
                          value={b.conta}
                          onChange={(e) =>
                            handleProfileBankChange(prof.code, 'conta', e.target.value)
                          }
                          placeholder={settings.horus_banco_conta || 'Ex: 56789-0'}
                          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                          Carteira (NRO_CARTEIRA)
                        </label>
                        <input
                          type="text"
                          value={b.carteira}
                          onChange={(e) =>
                            handleProfileBankChange(prof.code, 'carteira', e.target.value)
                          }
                          placeholder={settings.horus_banco_carteira || 'Ex: 17, 09'}
                          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                        />
                      </div>

                      <div className="space-y-1 col-span-2 sm:col-span-3 pt-1">
                        <label className="text-[11px] font-bold text-amber-700 dark:text-amber-400 block">
                          Forma Pagto Horus p/ Crédito Maior Separado (COD_FORMA Excedente)
                        </label>
                        <input
                          type="text"
                          value={b.forma_pagto_credito_maior || ''}
                          onChange={(e) =>
                            handleProfileBankChange(
                              prof.code,
                              'forma_pagto_credito_maior',
                              e.target.value
                            )
                          }
                          placeholder="Ex: 135 (CREDITO SHOPEE)"
                          className="w-full rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20 px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                        <span className="text-[10px] text-slate-500 block">
                          Quando o título no Horus for maior que a venda/nota na Tray, o valor da venda é baixado e o valor a mais é desmembrado em um novo lançamento separado com esta Forma de Pagamento (ex: <code>135</code> - CREDITO SHOPEE).
                        </span>
                      </div>

                      <div className="space-y-1 col-span-2 sm:col-span-3 pt-1">
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                          Regra Padrão de Data de Pagamento & Baixa no Horus
                        </label>
                        <select
                          value={b.payment_date_mode || 'CHANNEL_DATE'}
                          onChange={(e) =>
                            handleProfileBankChange(prof.code, 'payment_date_mode', e.target.value)
                          }
                          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                        >
                          <option value="CHANNEL_DATE">
                            1. Usar Data da Planilha ({prof.channel_label}) — Baixa (PG) cada lançamento com sua data real de repasse
                          </option>
                          <option value="SPECIFIC_DATE">
                            2. Usar Borderô e Baixar (PG) com uma Data Específica (informada na hora de gerar)
                          </option>
                          <option value="BORDERO_OPEN">
                            3. Apenas Gerar Borderô em Aberto (AP) — Baixar manualmente dentro do Horus
                          </option>
                        </select>
                      </div>

                      <div className="col-span-2 sm:col-span-3 pt-1">
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                          <div>
                            <span className="text-[11px] font-extrabold text-slate-800 dark:text-slate-200 block">
                              Unificar Parcelas da Nota em Lançamento Único + Gravar Taxa ({prof.channel_label})
                            </span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                              Quando o pedido tiver várias parcelas no Horus mas {prof.channel_label} pagar de uma só vez, unifica na 1ª parcela e grava a taxa em <code>VLR_LANCTO_ABATIMENTO</code> para bater o fechamento bancário.
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleProfileBankChange(prof.code, 'unify_installments', true)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                                b.unify_installments
                                  ? 'bg-emerald-600 text-white shadow-2xs'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                              }`}
                            >
                              SIM
                            </button>
                            <button
                              type="button"
                              onClick={() => handleProfileBankChange(prof.code, 'unify_installments', false)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                                !b.unify_installments
                                  ? 'bg-slate-800 text-white dark:bg-slate-700 shadow-2xs'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                              }`}
                            >
                              NÃO
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. CONTA BANCÁRIA PADRÃO (FALLBACK QUANDO UM PERFIL NÃO TIVER CONTA PRÓPRIA) */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5 shadow-sm">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <CreditCard className="h-4 w-4 text-violet-500" />
              <h4 className="text-sm font-bold text-slate-800 dark:text-white">
                Conta Bancária Padrão no Horus ERP (Fallback Geral)
              </h4>
            </div>

            <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900/30 dark:bg-amber-950/20 text-xs text-amber-800 dark:text-amber-300">
              Caso algum tipo de conciliação acima seja deixado em branco, o sistema utilizará estes códigos padrão na gravação das tabelas <code>BORDERO</code> e <code>LANCTOS_CRECEBER</code>.
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Forma de Pagamento Padrão no Horus (COD_FORMA)
                </label>
                <input
                  type="text"
                  name="horus_banco_forma_pagto"
                  value={settings.horus_banco_forma_pagto}
                  onChange={handleChange}
                  placeholder="Ex: 01 ou DIN ou CAR"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                <p className="text-[11px] text-slate-400">Código na tabela FORMAS_PAGTO do Horus.</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Código do Banco Padrão no Horus (COD_BANCO)
                </label>
                <input
                  type="text"
                  name="horus_banco_codigo"
                  value={settings.horus_banco_codigo}
                  onChange={handleChange}
                  placeholder="Ex: 001, 237, 341"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                <p className="text-[11px] text-slate-400">Código do banco cadastrado no ERP.</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Código da Agência Padrão (COD_AGENCIA)
                </label>
                <input
                  type="text"
                  name="horus_banco_agencia"
                  value={settings.horus_banco_agencia}
                  onChange={handleChange}
                  placeholder="Ex: 1234"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                <p className="text-[11px] text-slate-400">Número da agência bancária.</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Número da Conta Corrente Padrão (COD_CONTAC)
                </label>
                <input
                  type="text"
                  name="horus_banco_conta"
                  value={settings.horus_banco_conta}
                  onChange={handleChange}
                  placeholder="Ex: 56789-0"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                <p className="text-[11px] text-slate-400">Conta corrente de liquidação.</p>
              </div>

              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Número da Carteira de Cobrança Padrão (NRO_CARTEIRA)
                </label>
                <input
                  type="text"
                  name="horus_banco_carteira"
                  value={settings.horus_banco_carteira}
                  onChange={handleChange}
                  placeholder="Ex: 17, 109, 09"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                <p className="text-[11px] text-slate-400">Carteira bancária dos lançamentos a receber.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── ABA: CONEXÃO SQL SERVER ──────────────────────────── */}
      {activeSubTab === 'conexao' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5 shadow-sm">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <Server className="h-4 w-4 text-violet-500" />
            <h4 className="text-sm font-bold text-slate-800 dark:text-white">Configuração da Conexão SQL Server (NAT / IP)</h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Servidor (IP ou Hostname) *</label>
              <input
                type="text"
                name="horus_sql_host"
                value={settings.horus_sql_host}
                onChange={handleChange}
                placeholder="191.9.118.243 ou IP,Porta"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Porta</label>
              <input
                type="text"
                name="horus_sql_port"
                value={settings.horus_sql_port}
                onChange={handleChange}
                placeholder="1433"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Nome do Banco de Dados *</label>
            <input
              type="text"
              name="horus_sql_database"
              value={settings.horus_sql_database}
              onChange={handleChange}
              placeholder="admlivros"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Usuário SQL *</label>
              <input
                type="text"
                name="horus_sql_username"
                value={settings.horus_sql_username}
                onChange={handleChange}
                placeholder="sa"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Senha SQL *</label>
                {settings.horus_sql_password === 'SET' && !showPasswordInput && (
                  <button
                    type="button"
                    onClick={() => { setShowPasswordInput(true); setNewPassword(''); }}
                    className="text-xs text-violet-600 hover:text-violet-700 font-medium"
                  >
                    Alterar senha
                  </button>
                )}
                {showPasswordInput && (
                  <button
                    type="button"
                    onClick={() => { setShowPasswordInput(false); setNewPassword(''); }}
                    className="text-xs text-slate-500 font-medium"
                  >
                    Cancelar
                  </button>
                )}
              </div>

              {settings.horus_sql_password === 'SET' && !showPasswordInput ? (
                <div className="flex items-center gap-2 w-full rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-800/40 dark:bg-emerald-950/20 px-3.5 py-2.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">Senha protegida com criptografia</span>
                </div>
              ) : (
                <div className="relative">
                  <input
                    type={showPasswordValue ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); setTestResult(null); }}
                    placeholder={settings.horus_sql_password === 'SET' ? 'Nova senha SQL' : 'Digite a senha SQL'}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 pr-9 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswordValue(!showPasswordValue)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPasswordValue ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Cód. Empresa no Horus</label>
              <input
                type="text"
                name="horus_sql_cod_empresa"
                value={settings.horus_sql_cod_empresa}
                onChange={handleChange}
                placeholder="1"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Cód. Filial no Horus</label>
              <input
                type="text"
                name="horus_sql_cod_filial"
                value={settings.horus_sql_cod_filial}
                onChange={handleChange}
                placeholder="1"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          </div>

          {/* Teste */}
          <div className="pt-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing || !canTest}
              className={`w-full flex items-center justify-center gap-2 rounded-xl py-2.5 px-4 text-xs font-bold transition-all ${
                canTest
                  ? 'bg-violet-600 hover:bg-violet-700 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
              }`}
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseZap className="h-4 w-4" />}
              {testing ? 'Testando conexão...' : 'Testar Conexão ao SQL Server'}
            </button>
          </div>
        </div>
      )}

      {/* ─── ABA: VENDAS ──────────────────────────────────────── */}
      {activeSubTab === 'vendas' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-violet-100 dark:bg-violet-950/50 text-violet-600">
              <ShoppingCart className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">Parâmetros de Vendas & Pedidos Horus</h4>
              <p className="text-xs text-slate-400">Configurações para consulta e filtros de pedidos no ERP Horus.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                Método de Venda Padrão (COD_METODO)
              </label>
              <input
                type="text"
                name="horus_vendas_metodo"
                value={settings.horus_vendas_metodo || ''}
                onChange={handleChange}
                placeholder="Ex: 1, 01, WEB, LOJA"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono"
              />
              <p className="text-[11px] text-slate-400">
                Define o método de venda padrão pré-selecionado na tela de Pedidos do Horus Direct.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ─── ABA: FISCAL (FUTURO) ─────────────────────────────── */}
      {activeSubTab === 'fiscal' && (
        <div className="p-8 text-center rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
          <FileSpreadsheet className="h-8 w-8 text-slate-400 mx-auto" />
          <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200">Parâmetros Fiscais & Estoque Horus</h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Configurações para importação de NF de entrada de fornecedores e controle de estoques locais.
          </p>
        </div>
      )}

    </motion.div>
  );
}
