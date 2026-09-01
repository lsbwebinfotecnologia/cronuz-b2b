'use client';

import { useState, useEffect } from 'react';
import {
  DatabaseZap, Save, Loader2, CheckCircle2, XCircle,
  Eye, EyeOff, ShieldCheck, Zap, AlertTriangle, RefreshCw,
  Server, Clock, Database, CreditCard, Building2, ShoppingCart, FileSpreadsheet, Layers
} from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';
import { useCompany } from '../layout';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface HorusSQLSettings {
  horus_sql_enabled: boolean;
  horus_sql_host: string;
  horus_sql_port: string;
  horus_sql_database: string;
  horus_sql_username: string;
  horus_sql_password: string | null; // "SET" ou null — nunca plaintext
  horus_sql_cod_empresa: string;
  horus_sql_cod_filial: string;
  // Parâmetros Bancários / Financeiros
  horus_banco_forma_pagto: string;
  horus_banco_codigo: string;
  horus_banco_agencia: string;
  horus_banco_conta: string;
  horus_banco_carteira: string;
}

interface TestResult {
  status: 'connected' | 'error' | 'config_error';
  message: string;
  database?: string;
  server_time?: string;
  sql_version?: string;
}

export default function CompanyHorusSQLPage() {
  const { company, refreshCompany } = useCompany();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [showPasswordValue, setShowPasswordValue] = useState(false);
  const [activeConfigTab, setActiveConfigTab] = useState<'conexao' | 'financeiro' | 'vendas' | 'fiscal'>('conexao');

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
  });

  // Senha nova que o usuario digita (plaintext, so no front, nunca persiste fora do teste/save)
  const [newPassword, setNewPassword] = useState('');

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
        });
      }
    } catch (e) {
      console.error(e);
      toast.error('Erro ao carregar configurações Horus SQL.');
    } finally {
      setLoading(false);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setTestResult(null); // Limpa resultado ao editar qualquer campo
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
        toast.success('Conexão ao SQL Server do Horus estabelecida com sucesso!');
      } else {
        const msg = data.detail || data.message || 'Falha na conexão SQL.';
        setTestResult({ status: 'error', message: msg });
        toast.error(msg);
      }
    } catch (e: any) {
      const msg = e?.message || 'Erro de rede ao testar conexão.';
      setTestResult({ status: 'error', message: msg });
      toast.error(msg);
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
        toast.success('Configurações do Horus SQL salvas com sucesso!');
        setNewPassword('');
        setShowPasswordInput(false);
        await fetchSettings();
        refreshCompany();
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Erro ao salvar configurações.');
      }
    } catch (e) {
      console.error(e);
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

  const isSavedAndConfigured = settings.horus_sql_password === 'SET' &&
    settings.horus_sql_host && settings.horus_sql_database && settings.horus_sql_username;

  return (
    <div className="p-6 space-y-6 overflow-y-auto max-h-full">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/30">
            <DatabaseZap className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">Horus SQL Direct — Parâmetros Globais</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Conexão direta ao SQL Server do Horus ERP e parâmetros operacionais de integração
            </p>
          </div>
        </div>

        <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${
          settings.horus_sql_enabled && isSavedAndConfigured
            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
        }`}>
          <span className={`h-1.5 w-1.5 rounded-full ${
            settings.horus_sql_enabled && isSavedAndConfigured
              ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
          }`} />
          {settings.horus_sql_enabled && isSavedAndConfigured ? 'Módulo Ativo' : 'Módulo Inativo'}
        </div>
      </div>

      {/* Aviso segurança */}
      <div className="flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-800/50 dark:bg-violet-950/20">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-violet-600 dark:text-violet-400" />
        <div>
          <p className="text-sm font-semibold text-violet-800 dark:text-violet-300">Segurança & Desempenho</p>
          <p className="text-xs text-violet-700 dark:text-violet-400">
            Credenciais criptografadas via Fernet (AES-128). Pool de conexões inteligente com TTL e isolamento assíncrono.
            Os parâmetros cadastrados aqui são compartilhados com as rotinas do Seller sem redundância.
          </p>
        </div>
      </div>

      {/* Toggle mestre do módulo */}
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
        <div>
          <p className="text-sm font-semibold text-slate-800 dark:text-white">Habilitar Módulo Horus SQL Direct</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Permite conexão direta ao banco SQL Server do Horus para baixa financeira e jobs</p>
        </div>
        <label className="relative inline-flex cursor-pointer items-center">
          <input
            type="checkbox"
            name="horus_sql_enabled"
            checked={settings.horus_sql_enabled}
            onChange={handleChange}
            className="sr-only peer"
          />
          <div className="peer h-6 w-11 rounded-full bg-slate-200 peer-checked:bg-violet-600 peer-focus:outline-none transition-colors dark:bg-slate-700 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-all peer-checked:after:translate-x-5" />
        </label>
      </div>

      {/* Abas / Grupos de Parâmetros Expansíveis */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 pb-1">
        <button
          type="button"
          onClick={() => setActiveConfigTab('conexao')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
            activeConfigTab === 'conexao'
              ? 'bg-violet-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Server className="h-4 w-4" />
          Conexão SQL Server
        </button>

        <button
          type="button"
          onClick={() => setActiveConfigTab('financeiro')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
            activeConfigTab === 'financeiro'
              ? 'bg-violet-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <CreditCard className="h-4 w-4" />
          Parâmetros Financeiros & Borderô
        </button>

        <button
          type="button"
          onClick={() => setActiveConfigTab('vendas')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
            activeConfigTab === 'vendas'
              ? 'bg-violet-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <ShoppingCart className="h-4 w-4" />
          Parâmetros de Vendas
          <span className="text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded">Futuro</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveConfigTab('fiscal')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
            activeConfigTab === 'fiscal'
              ? 'bg-violet-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <FileSpreadsheet className="h-4 w-4" />
          Parâmetros Fiscais & NF
          <span className="text-[10px] bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded">Futuro</span>
        </button>
      </div>

      {/* ─── ABA 1: CONEXÃO SQL SERVER ──────────────────────────── */}
      {activeConfigTab === 'conexao' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="bg-slate-50 dark:bg-slate-800/50 px-5 py-3 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Credenciais da Conexão SQL Server (pytds)</h2>
            </div>
            <div className="p-5 space-y-4">

              {/* Host + Porta */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 space-y-1">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Servidor (IP ou Hostname) *</label>
                  <input
                    type="text"
                    name="horus_sql_host"
                    value={settings.horus_sql_host}
                    onChange={handleChange}
                    placeholder="191.9.118.243 ou ip:porta"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
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
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
              </div>

              {/* Banco */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Nome do Banco de Dados *</label>
                <input
                  type="text"
                  name="horus_sql_database"
                  value={settings.horus_sql_database}
                  onChange={handleChange}
                  placeholder="admlivros"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              {/* Usuário + Senha */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Usuário SQL *</label>
                  <input
                    type="text"
                    name="horus_sql_username"
                    value={settings.horus_sql_username}
                    onChange={handleChange}
                    placeholder="sa"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Senha SQL *</label>
                    {settings.horus_sql_password === 'SET' && !showPasswordInput && (
                      <button
                        type="button"
                        onClick={() => { setShowPasswordInput(true); setNewPassword(''); }}
                        className="text-xs text-violet-600 hover:text-violet-700 dark:text-violet-400 font-medium"
                      >
                        Alterar senha
                      </button>
                    )}
                    {showPasswordInput && (
                      <button
                        type="button"
                        onClick={() => { setShowPasswordInput(false); setNewPassword(''); }}
                        className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 font-medium"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>

                  {settings.horus_sql_password === 'SET' && !showPasswordInput ? (
                    <div className="flex items-center gap-2 w-full rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800/40 dark:bg-emerald-950/20 px-3 py-2">
                      <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">Senha configurada e criptografada</span>
                    </div>
                  ) : (
                    <div className="relative">
                      <input
                        type={showPasswordValue ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => { setNewPassword(e.target.value); setTestResult(null); }}
                        placeholder={settings.horus_sql_password === 'SET' ? 'Nova senha SQL' : 'Digite a senha SQL'}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 pr-9 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasswordValue(!showPasswordValue)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showPasswordValue ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Cód. Empresa e Filial */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Cód. Empresa no Horus</label>
                  <input
                    type="text"
                    name="horus_sql_cod_empresa"
                    value={settings.horus_sql_cod_empresa}
                    onChange={handleChange}
                    placeholder="1"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
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
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Teste de Conexão */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="bg-slate-50 dark:bg-slate-800/50 px-5 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-slate-500" />
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Teste de Conexão SQL Server</h2>
              </div>
              {newPassword ? (
                <span className="text-xs text-amber-600 dark:text-amber-400 font-medium bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full">
                  Usando nova senha (não salva)
                </span>
              ) : settings.horus_sql_password === 'SET' ? (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full">
                  Usando senha salva
                </span>
              ) : null}
            </div>

            <div className="p-5 space-y-4">
              <button
                type="button"
                onClick={handleTest}
                disabled={testing || !canTest}
                className={`w-full flex items-center justify-center gap-3 rounded-xl py-3 px-5 text-sm font-bold transition-all ${
                  canTest
                    ? 'bg-violet-600 hover:bg-violet-700 text-white shadow-sm hover:shadow-md'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                }`}
              >
                {testing ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Testando conexão SQL...
                  </>
                ) : (
                  <>
                    <DatabaseZap className="h-5 w-5" />
                    Testar Conexão ao SQL Server
                  </>
                )}
              </button>

              {testResult && (
                <div className={`rounded-xl border p-4 space-y-3 ${
                  testResult.status === 'connected'
                    ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800/40 dark:bg-emerald-950/20'
                    : 'border-rose-200 bg-rose-50 dark:border-rose-800/40 dark:bg-rose-950/20'
                }`}>
                  <div className="flex items-center gap-2">
                    {testResult.status === 'connected'
                      ? <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      : <XCircle className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0" />
                    }
                    <p className={`text-sm font-bold ${
                      testResult.status === 'connected'
                        ? 'text-emerald-800 dark:text-emerald-300'
                        : 'text-rose-800 dark:text-rose-300'
                    }`}>
                      {testResult.status === 'connected'
                        ? 'Conexão SQL estabelecida com sucesso!'
                        : 'Falha na conexão SQL'}
                    </p>
                  </div>
                  {testResult.status !== 'connected' && (
                    <p className="text-xs text-rose-700 dark:text-rose-400 font-mono bg-rose-100 dark:bg-rose-950/30 rounded-lg px-3 py-2">
                      {testResult.message}
                    </p>
                  )}
                  {testResult.status === 'connected' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {testResult.database && <div className="p-2 bg-white/60 dark:bg-slate-900/60 rounded">Banco: <b>{testResult.database}</b></div>}
                      {testResult.server_time && <div className="p-2 bg-white/60 dark:bg-slate-900/60 rounded">Horário: <b>{testResult.server_time}</b></div>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── ABA 2: PARÂMETROS FINANCEIROS & BORDERÔ ───────────── */}
      {activeConfigTab === 'financeiro' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="bg-slate-50 dark:bg-slate-800/50 px-5 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-violet-500" />
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Parâmetros Bancários para Geração de Borderô (Horus ERP)</h2>
            </div>
            <div className="p-5 space-y-4">
              <div className="p-3.5 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/30 dark:bg-amber-950/20 text-xs text-amber-800 dark:text-amber-300">
                <strong>Atenção:</strong> Estes códigos são utilizados na montagem do registro de borderô no Horus ERP (tabelas <code>BORDERO</code> e <code>LANCTOS_CRECEBER</code>). Verifique exatamente como estão cadastrados no Horus do cliente.
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    Forma de Pagamento no Horus (COD_FORMA) *
                  </label>
                  <input
                    type="text"
                    name="horus_banco_forma_pagto"
                    value={settings.horus_banco_forma_pagto}
                    onChange={handleChange}
                    placeholder="Ex: 01 ou DIN ou CAR"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                  <p className="text-[11px] text-slate-400">Código da forma de pagamento na tabela FORMAS_PAGTO do Horus.</p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    Código do Banco no Horus (COD_BANCO) *
                  </label>
                  <input
                    type="text"
                    name="horus_banco_codigo"
                    value={settings.horus_banco_codigo}
                    onChange={handleChange}
                    placeholder="Ex: 001, 237, 341"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                  <p className="text-[11px] text-slate-400">Número de compensação do banco cadastrado no Horus.</p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    Código da Agência (COD_AGENCIA) *
                  </label>
                  <input
                    type="text"
                    name="horus_banco_agencia"
                    value={settings.horus_banco_agencia}
                    onChange={handleChange}
                    placeholder="Ex: 1234 ou 1234-5"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                  <p className="text-[11px] text-slate-400">Número da agência bancária vinculada à conta.</p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    Número da Conta Corrente (COD_CONTAC) *
                  </label>
                  <input
                    type="text"
                    name="horus_banco_conta"
                    value={settings.horus_banco_conta}
                    onChange={handleChange}
                    placeholder="Ex: 56789-0"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                  <p className="text-[11px] text-slate-400">Número da conta corrente de depósito/liquidação.</p>
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    Número da Carteira de Cobrança (NRO_CARTEIRA) *
                  </label>
                  <input
                    type="text"
                    name="horus_banco_carteira"
                    value={settings.horus_banco_carteira}
                    onChange={handleChange}
                    placeholder="Ex: 17, 109, 09"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                  <p className="text-[11px] text-slate-400">Carteira bancária associada aos títulos no ERP Horus.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── ABA 3: PARÂMETROS DE VENDAS (EXPANSÃO) ───────────── */}
      {activeConfigTab === 'vendas' && (
        <div className="p-8 text-center rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30 space-y-3">
          <ShoppingCart className="h-8 w-8 text-slate-400 mx-auto" />
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">Parâmetros de Vendas & Pedidos Horus</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Esta seção receberá parâmetros específicos de pedidos Horus (Métodos de Venda, Tipos de Pedido V/T/D, Códigos de Transportadoras e Tabelas de Preço).
          </p>
          <span className="inline-block text-[11px] font-semibold text-violet-600 bg-violet-50 dark:bg-violet-950/40 px-3 py-1 rounded-full border border-violet-200 dark:border-violet-800">
            Estrutura pronta para expansão
          </span>
        </div>
      )}

      {/* ─── ABA 4: PARÂMETROS FISCAIS (EXPANSÃO) ─────────────── */}
      {activeConfigTab === 'fiscal' && (
        <div className="p-8 text-center rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30 space-y-3">
          <FileSpreadsheet className="h-8 w-8 text-slate-400 mx-auto" />
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">Parâmetros Fiscais & Notas de Entrada</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Esta seção receberá mapeamento de CFOPs de Entrada, Locais de Estoque Horus e parâmetros para importação de XML de fornecedores diretamente no SQL.
          </p>
          <span className="inline-block text-[11px] font-semibold text-violet-600 bg-violet-50 dark:bg-violet-950/40 px-3 py-1 rounded-full border border-violet-200 dark:border-violet-800">
            Estrutura pronta para expansão
          </span>
        </div>
      )}

      {/* Botão Salvar Fixo no Rodapé */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Todas as alterações são sincronizadas imediatamente com os endpoints operacionais do Seller.
        </p>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-60 px-6 py-2.5 text-sm font-bold text-white transition-all shadow-sm hover:shadow"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Salvando...' : 'Salvar Todas as Configurações'}
        </button>
      </div>

    </div>
  );
}
