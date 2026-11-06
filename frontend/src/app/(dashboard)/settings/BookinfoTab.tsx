'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Save, BookOpen, Key, RefreshCw, Play, Bell, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';
import { useCompany } from './context';

export function BookinfoTab({ companyIdProp }: { companyIdProp?: number } = {}) {
  const { company } = useCompany();
  const targetCompanyId = companyIdProp || (company?.id ? Number(company.id) : null);

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [integratorId, setIntegratorId] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    environment: 'PROD',
    bookinfo_api_key: '',
    bookinfo_sync_enabled: false,
    bookinfo_purchase_auto: false,
    bookinfo_purchase_interval_minutes: 15,
    bookinfo_notify_processing_early: false,
    bookinfo_analysis_timing: 'BEFORE_CONFERENCE',
    bookinfo_min_stock_buffer: 0,
    bookinfo_block_consign_low_stock: false,
    bookinfo_consign_low_stock_threshold: 5,
    bookinfo_check_existing_consign_balance: false,
    bookinfo_max_consign_client_units: 10,
    bookinfo_allow_partial_fulfill: true,
  });

  useEffect(() => {
    async function fetchSettings() {
      if (!targetCompanyId) return;
      try {
        const token = getToken();
        if (!token) return;
        const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

        const [settingsRes, integRes] = await Promise.all([
          fetch(`${apiBase}/companies/${targetCompanyId}/settings`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${apiBase}/integrators/${targetCompanyId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        const settings = settingsRes.ok ? await settingsRes.json() : {};
        const integrators = integRes.ok ? await integRes.json() : [];
        const bookinfoInteg = Array.isArray(integrators)
          ? integrators.find((i: any) => i.platform === 'BOOKINFO')
          : null;

        let integEnv = 'PROD';
        let integToken = '';
        if (bookinfoInteg) {
          setIntegratorId(bookinfoInteg.id);
          let creds: any = {};
          if (typeof bookinfoInteg.credentials === 'string') {
            try {
              creds = JSON.parse(bookinfoInteg.credentials);
            } catch {}
          } else if (bookinfoInteg.credentials) {
            creds = bookinfoInteg.credentials;
          }
          integEnv = creds.Ambiente || 'PROD';
          integToken = creds.Token || '';
        }

        setFormData({
          environment: integEnv,
          bookinfo_api_key: integToken || settings.bookinfo_api_key || '',
          bookinfo_sync_enabled: settings.bookinfo_sync_enabled || false,
          bookinfo_purchase_auto: settings.bookinfo_purchase_auto || false,
          bookinfo_purchase_interval_minutes: settings.bookinfo_purchase_interval_minutes || 15,
          bookinfo_notify_processing_early: settings.bookinfo_notify_processing_early || false,
          bookinfo_analysis_timing: settings.bookinfo_analysis_timing || 'BEFORE_CONFERENCE',
          bookinfo_min_stock_buffer: settings.bookinfo_min_stock_buffer || 0,
          bookinfo_block_consign_low_stock: settings.bookinfo_block_consign_low_stock || false,
          bookinfo_consign_low_stock_threshold: settings.bookinfo_consign_low_stock_threshold ?? 5,
          bookinfo_check_existing_consign_balance: settings.bookinfo_check_existing_consign_balance || false,
          bookinfo_max_consign_client_units: settings.bookinfo_max_consign_client_units ?? 10,
          bookinfo_allow_partial_fulfill: settings.bookinfo_allow_partial_fulfill !== false,
        });
      } catch (e) {
        console.error('Erro ao buscar configurações do Bookinfo:', e);
      } finally {
        setLoading(false);
      }
    }

    fetchSettings();
  }, [targetCompanyId]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else if (
      name === 'bookinfo_purchase_interval_minutes' ||
      name === 'bookinfo_min_stock_buffer' ||
      name === 'bookinfo_consign_low_stock_threshold' ||
      name === 'bookinfo_max_consign_client_units'
    ) {
      setFormData(prev => ({
        ...prev,
        [name]: parseInt(value.replace(/\D/g, '')) || 0,
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleToggle = (name: string, currentVal: boolean) => {
    setFormData(prev => ({ ...prev, [name]: !currentVal }));
  };

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!targetCompanyId) return;
    setSaving(true);

    try {
      const token = getToken();
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const cleanToken = formData.bookinfo_api_key.trim();

      const integPayload = {
        company_id: Number(targetCompanyId),
        platform: 'BOOKINFO',
        active: Boolean(cleanToken),
        credentials: JSON.stringify({
          Ambiente: formData.environment,
          Token: cleanToken,
        }),
      };

      const integMethod = integratorId ? 'PUT' : 'POST';
      const integEndpoint = integratorId ? `/integrators/${integratorId}` : `/integrators/`;

      const [integRes, settingsRes] = await Promise.all([
        fetch(`${apiBase}${integEndpoint}`, {
          method: integMethod,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(integPayload),
        }),
        fetch(`${apiBase}/companies/${targetCompanyId}/settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            bookinfo_api_key: cleanToken,
            bookinfo_sync_enabled: formData.bookinfo_sync_enabled,
            bookinfo_purchase_auto: formData.bookinfo_purchase_auto,
            bookinfo_purchase_interval_minutes: formData.bookinfo_purchase_interval_minutes || 15,
            bookinfo_notify_processing_early: formData.bookinfo_notify_processing_early,
            bookinfo_analysis_timing: formData.bookinfo_analysis_timing,
            bookinfo_min_stock_buffer: formData.bookinfo_min_stock_buffer,
            bookinfo_block_consign_low_stock: formData.bookinfo_block_consign_low_stock,
            bookinfo_consign_low_stock_threshold: formData.bookinfo_consign_low_stock_threshold,
            bookinfo_check_existing_consign_balance: formData.bookinfo_check_existing_consign_balance,
            bookinfo_max_consign_client_units: formData.bookinfo_max_consign_client_units,
            bookinfo_allow_partial_fulfill: formData.bookinfo_allow_partial_fulfill,
          }),
        }),
      ]);

      if (!settingsRes.ok) throw new Error('Falha ao salvar configurações do Bookinfo');
      if (integRes.ok) {
        const savedInteg = await integRes.json();
        if (!integratorId && savedInteg?.id) setIntegratorId(savedInteg.id);
      }

      toast.success('Configurações da Bookinfo atualizadas com sucesso!');
    } catch {
      toast.error('Erro ao salvar as configurações.');
    } finally {
      setSaving(false);
    }
  }

  if (loading || !targetCompanyId) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary-base)]" />
      </div>
    );
  }

  const hasToken = Boolean(formData.bookinfo_api_key.trim());

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/60 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl">
            <BookOpen className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Integração Bookinfo Hub B2B</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Credenciais de acesso, regras comerciais de avaliação de estoque e automações de compra/venda.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-bold border ${
              hasToken
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800/50'
                : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
            }`}
          >
            {hasToken ? `Token Configurado (${formData.environment})` : 'Token Pendente'}
          </span>
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-bold ${
              formData.bookinfo_sync_enabled
                ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
            }`}
          >
            {formData.bookinfo_sync_enabled ? 'Sync Automático Ativo' : 'Sync Manual'}
          </span>
        </div>
      </div>

      <form onSubmit={handleSaveSettings} className="space-y-6 pt-1">
        {/* 1. Credenciais de Acesso */}
        <div className="bg-slate-50/50 dark:bg-slate-900/20 p-5 rounded-2xl border border-slate-200 dark:border-slate-800/60 shadow-sm space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-semibold text-sm">
              <Key className="w-4 h-4 text-indigo-500" />
              <h3>1. Credenciais de Acesso (Bookinfo API)</h3>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block">Ambiente da API</label>
              <select
                name="environment"
                value={formData.environment}
                onChange={handleInputChange}
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-3.5 text-sm text-slate-900 font-medium focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="PROD">Produção Real (bookhub-api)</option>
                <option value="HOMOL">Homologação / Testes (hml)</option>
              </select>
            </div>

            <div className="md:col-span-2 space-y-1.5">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block">
                Token Bearer / Chave de Acesso (API Key)
              </label>
              <input
                type="password"
                name="bookinfo_api_key"
                value={formData.bookinfo_api_key}
                onChange={handleInputChange}
                placeholder="Cole aqui o Token Bearer fornecido pela Bookinfo"
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-sm font-mono text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 outline-none transition-all placeholder:text-slate-400"
              />
            </div>
          </div>
        </div>

        {/* 2. Automações de Vendas e Compras */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1">
            2. Automações em Segundo Plano (Vendas & Compras)
          </h3>

          <div className="grid grid-cols-1 gap-3.5">
            {/* Sincronização de Vendas */}
            <div className="bg-slate-50/50 dark:bg-slate-900/20 border border-slate-200 dark:border-slate-800/60 rounded-2xl p-4 shadow-sm flex items-center justify-between transition-all hover:border-slate-300 dark:hover:border-slate-700">
              <div className="space-y-1 flex-1 pr-4">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-emerald-500" />
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Sincronização Automática — Pedidos de Venda
                  </h4>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Importa e processa automaticamente os pedidos de venda originados do Bookinfo Hub em fila.
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleToggle('bookinfo_sync_enabled', formData.bookinfo_sync_enabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  formData.bookinfo_sync_enabled ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    formData.bookinfo_sync_enabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Automação de Compras */}
            <div className="bg-slate-50/50 dark:bg-slate-900/20 border border-slate-200 dark:border-slate-800/60 rounded-2xl p-4 shadow-sm flex flex-col gap-3.5 transition-all hover:border-slate-300 dark:hover:border-slate-700">
              <div className="flex items-center justify-between">
                <div className="space-y-1 flex-1 pr-4">
                  <div className="flex items-center gap-2">
                    <Play className="w-4 h-4 text-blue-500" />
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Sincronização Automática — Pedidos de Compra
                    </h4>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Busca pedidos de compra no Hórus ERP, transmite à Bookinfo e sincroniza os retornos automaticamente.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleToggle('bookinfo_purchase_auto', formData.bookinfo_purchase_auto)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    formData.bookinfo_purchase_auto ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      formData.bookinfo_purchase_auto ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {formData.bookinfo_purchase_auto && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="pt-3 border-t border-slate-200/60 dark:border-slate-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                      Intervalo de Execução (em minutos)
                    </label>
                    <span className="text-[11px] text-slate-400">Recomendado: 15 minutos (mínimo 5 min).</span>
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    name="bookinfo_purchase_interval_minutes"
                    value={formData.bookinfo_purchase_interval_minutes}
                    onChange={handleInputChange}
                    className="w-28 rounded-xl border border-slate-200 bg-white py-2 px-3 text-sm text-center font-mono text-slate-900 font-bold focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 outline-none"
                  />
                </motion.div>
              )}
            </div>

            {/* Aviso Prévio de Processamento */}
            <div className="bg-slate-50/50 dark:bg-slate-900/20 border border-slate-200 dark:border-slate-800/60 rounded-2xl p-4 shadow-sm flex items-center justify-between transition-all hover:border-slate-300 dark:hover:border-slate-700">
              <div className="space-y-1 flex-1 pr-4">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-amber-500" />
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Notificar Bookinfo (&ldquo;Processando&rdquo;) Antecipadamente
                  </h4>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Muda o status na Bookinfo para Processando assim que o pedido é inserido no Hórus ERP (antes do faturamento NF-e).
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleToggle('bookinfo_notify_processing_early', formData.bookinfo_notify_processing_early)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  formData.bookinfo_notify_processing_early ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    formData.bookinfo_notify_processing_early ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* 3. Momento da Análise & Regras Comerciais de Estoque/Consignação */}
        <div className="bg-slate-50/50 dark:bg-slate-900/20 p-5 rounded-2xl border border-slate-200 dark:border-slate-800/60 shadow-sm space-y-5">
          <div className="space-y-3 border-b border-slate-200/60 dark:border-slate-800/60 pb-5">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" /> 3. Momento da Análise de Itens
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Define o fluxo operacional de análise e comunicação de situação de itens com a Bookinfo.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label
                className={`cursor-pointer rounded-xl border p-3.5 transition-all flex flex-col gap-1.5 ${
                  formData.bookinfo_analysis_timing === 'BEFORE_CONFERENCE'
                    ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20 ring-1 ring-indigo-500'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-900 dark:text-white">Antes da Conferência (Padrão)</span>
                  <input
                    type="radio"
                    name="bookinfo_analysis_timing"
                    value="BEFORE_CONFERENCE"
                    checked={formData.bookinfo_analysis_timing === 'BEFORE_CONFERENCE'}
                    onChange={handleInputChange}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Analisa o saldo disponível no Hórus, envia a avaliação à Bookinfo e aguarda para gerar o pedido no ERP.
                </p>
              </label>

              <label
                className={`cursor-pointer rounded-xl border p-3.5 transition-all flex flex-col gap-1.5 ${
                  formData.bookinfo_analysis_timing === 'AFTER_CONFERENCE'
                    ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20 ring-1 ring-indigo-500'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-900 dark:text-white">Pós-Conferência / Faturamento</span>
                  <input
                    type="radio"
                    name="bookinfo_analysis_timing"
                    value="AFTER_CONFERENCE"
                    checked={formData.bookinfo_analysis_timing === 'AFTER_CONFERENCE'}
                    onChange={handleInputChange}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Envia o pedido direto ao Hórus para conferência e emissão da NF-e; envia a situação real após o faturamento.
                </p>
              </label>
            </div>
          </div>

          {/* Regras Comerciais */}
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-500" /> 4. Regras Comerciais de Atendimento e Consignação
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Parâmetros aplicados automaticamente ao analisar o estoque disponível no Hórus ERP para pedidos Bookinfo.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="space-y-1.5 bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Buffer de Estoque Mínimo</label>
                <input
                  type="text"
                  inputMode="numeric"
                  name="bookinfo_min_stock_buffer"
                  value={formData.bookinfo_min_stock_buffer}
                  onChange={handleInputChange}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-1.5 px-3 text-sm font-mono text-slate-900 dark:text-white font-medium"
                />
                <p className="text-[11px] text-slate-400">Unidades retidas como reserva de segurança.</p>
              </div>

              <div className="space-y-1.5 bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Estoque Crítico Consignação</label>
                <input
                  type="text"
                  inputMode="numeric"
                  name="bookinfo_consign_low_stock_threshold"
                  value={formData.bookinfo_consign_low_stock_threshold}
                  onChange={handleInputChange}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-1.5 px-3 text-sm font-mono text-slate-900 dark:text-white font-medium"
                />
                <p className="text-[11px] text-slate-400">Gatilho de estoque baixo para travar consignação.</p>
              </div>

              <div className="space-y-1.5 bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Teto Consignado por Cliente</label>
                <input
                  type="text"
                  inputMode="numeric"
                  name="bookinfo_max_consign_client_units"
                  value={formData.bookinfo_max_consign_client_units}
                  onChange={handleInputChange}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-1.5 px-3 text-sm font-mono text-slate-900 dark:text-white font-medium"
                />
                <p className="text-[11px] text-slate-400">Máximo de exemplares consignados por título.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer">
                <div className="pr-2">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                    Bloquear Consignação em Estoque Baixo
                  </span>
                  <span className="text-[11px] text-slate-400">Prioriza venda direta faturada</span>
                </div>
                <input
                  type="checkbox"
                  name="bookinfo_block_consign_low_stock"
                  checked={formData.bookinfo_block_consign_low_stock}
                  onChange={handleInputChange}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer">
                <div className="pr-2">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                    Checar Saldo Já Consignado
                  </span>
                  <span className="text-[11px] text-slate-400">Evita sobre-estoque no cliente</span>
                </div>
                <input
                  type="checkbox"
                  name="bookinfo_check_existing_consign_balance"
                  checked={formData.bookinfo_check_existing_consign_balance}
                  onChange={handleInputChange}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer">
                <div className="pr-2">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                    Permitir Atendimento Parcial
                  </span>
                  <span className="text-[11px] text-slate-400">Atende quantidade disponível</span>
                </div>
                <input
                  type="checkbox"
                  name="bookinfo_allow_partial_fulfill"
                  checked={formData.bookinfo_allow_partial_fulfill}
                  onChange={handleInputChange}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-7 py-2.5 text-sm rounded-xl font-bold flex items-center gap-2 transition-all bg-[var(--color-primary-base)] text-white hover:bg-[var(--color-primary-hover)] shadow-lg shadow-[var(--color-primary-base)]/25 active:scale-[0.98] transform hover:scale-[1.02] disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Salvando...' : 'Salvar Configurações Bookinfo'}
          </button>
        </div>
      </form>
    </div>
  );
}
