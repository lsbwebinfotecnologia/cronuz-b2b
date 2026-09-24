'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Truck,
  RefreshCw,
  Loader2,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Search,
  ChevronLeft,
  ChevronRight,
  Play,
  ArrowLeft,
  Clock,
  PackageCheck,
  Send,
  Building2,
  X,
  ToggleLeft,
  ToggleRight,
  Settings,
  CheckCircle2,
  Pause,
  SlidersHorizontal,
  Hash,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { getToken, getUser } from '@/lib/auth';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface LogItem {
  id: number;
  company_id: number;
  provider: string;
  cod_ped_venda: number;
  cod_cli: number | null;
  pedido_web_origem: string | null;
  id_ord_sys_log: string | null;
  status_horus: string | null;
  situation: string;
  cep_validated: boolean | null;
  cep_checked_at: string | null;
  cep_error_detail: string | null;
  tracking_code?: string | null;
  key_nfe?: string | null;
  nfe_number?: string | null;
  sent_at: string | null;
  checked_at: string | null;
  invoiced_at: string | null;
  error_log: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface LogStats {
  total: number;
  with_wms_id: number;
  in_logistics: number;
  lft: number;
  checked: number;
  invoiced: number;
  cep_invalid: number;
  errors: number;
}

export default function LogisticaLogsPage() {
  const user = getUser();
  const companyId = user?.company_id;

  const [loading, setLoading] = useState(true);
  const [runningAuto, setRunningAuto] = useState(false);
  const [runningCheck, setRunningCheck] = useState(false);
  const [runningInvoice, setRunningInvoice] = useState(false);
  const [togglingJob, setTogglingJob] = useState<string | null>(null);
  const [logSettings, setLogSettings] = useState<{
    enabled: boolean;
    feature_auto_send: boolean;
    feature_auto_check: boolean;
    provider: string;
    check_interval_min: number;
  } | null>(null);

  const [items, setItems] = useState<LogItem[]>([]);
  const [stats, setStats] = useState<LogStats>({
    total: 0,
    with_wms_id: 0,
    in_logistics: 0,
    lft: 0,
    checked: 0,
    invoiced: 0,
    cep_invalid: 0,
    errors: 0,
  });

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  // Filtros
  const [activeTab, setActiveTab] = useState<'ALL' | 'ERRORS' | 'WITH_WMS_ID' | 'IN_LOGISTICS' | 'LFT' | 'INVOICED' | 'CEP_INVALID'>('ALL');
  const [search, setSearch] = useState('');

  const fetchSettings = useCallback(async () => {
    if (!companyId) return;
    try {
      const res = await fetch(`${API}/companies/${companyId}/logistics/settings`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setLogSettings({
          enabled: data.enabled ?? false,
          feature_auto_send: data.feature_auto_send ?? true,
          feature_auto_check: data.feature_auto_check ?? false,
          provider: data.provider || 'MKT',
          check_interval_min: data.check_interval_min ?? 15,
        });
      }
    } catch {
      // Silencioso
    }
  }, [companyId]);

  const fetchLogs = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const token = getToken();
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: '20',
      });

      if (activeTab === 'ERRORS') {
        params.append('only_errors', 'true');
      } else if (activeTab !== 'ALL') {
        params.append('situation', activeTab);
      }

      if (search.trim()) {
        params.append('search', search.trim());
      }

      const res = await fetch(`${API}/companies/${companyId}/logistics/logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error('Falha ao consultar logs de logística.');
      }

      const data = await res.json();
      setItems(data.items || []);
      setTotalPages(data.pages || 1);
      setTotalRecords(data.total || 0);
      if (data.stats) setStats(data.stats);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao carregar logs.');
    } finally {
      setLoading(false);
    }
  }, [companyId, page, activeTab, search]);

  useEffect(() => {
    fetchSettings();
    fetchLogs();
  }, [fetchSettings, fetchLogs]);

  // Alterna ativação/desativação de um job
  const handleToggleJob = async (jobName: 'auto_send' | 'auto_check', currentVal: boolean) => {
    if (!companyId || togglingJob) return;
    setTogglingJob(jobName);
    try {
      const res = await fetch(`${API}/companies/${companyId}/logistics/toggle-job`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ job_name: jobName, enabled: !currentVal }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Erro ao alterar status do job.');
      }
      setLogSettings(prev => prev ? {
        ...prev,
        feature_auto_send: data.feature_auto_send,
        feature_auto_check: data.feature_auto_check,
      } : null);
      toast.success(data.message || 'Status do job atualizado com sucesso!');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao alterar job.');
    } finally {
      setTogglingJob(null);
    }
  };

  // Disparo manual da rotina de envio
  const handleTriggerAuto = async () => {
    if (!companyId || runningAuto) return;
    setRunningAuto(true);
    try {
      const token = getToken();
      const res = await fetch(`${API}/companies/${companyId}/logistics/run-auto`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Erro ao processar envio automático.');
      }
      const st = data.result || {};
      toast.success(
        `Rotina de envio executada! Processados: ${st.processed || 0} | Enviados: ${st.sent || 0} | Críticas: ${st.errors || 0}`
      );
      fetchLogs();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao disparar rotina.');
    } finally {
      setRunningAuto(false);
    }
  };

  // Disparo manual da conferência WMS
  const handleTriggerCheck = async () => {
    if (!companyId || runningCheck) return;
    setRunningCheck(true);
    try {
      const token = getToken();
      const res = await fetch(`${API}/companies/${companyId}/logistics/process-check`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Erro ao processar conferência.');
      }
      toast.success(data.message || `${data.conferred_count || 0} pedido(s) conferido(s) no Horus.`);
      fetchLogs();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao executar conferência WMS.');
    } finally {
      setRunningCheck(false);
    }
  };

  // Disparo manual do envio de Notas Fiscais (FAT -> NFe no WMS)
  const handleTriggerInvoice = async () => {
    if (!companyId || runningInvoice) return;
    setRunningInvoice(true);
    try {
      const token = getToken();
      const res = await fetch(`${API}/companies/${companyId}/logistics/process-invoice`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Erro ao processar faturamento de pedidos.');
      }
      const st = data.result || {};
      toast.success(
        `Envio de NFe finalizado! Faturados: ${st.invoiced || 0} | Processados: ${st.processed || 0} | Críticas: ${st.errors || 0}`
      );
      fetchLogs();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao enviar notas fiscais para o WMS.');
    } finally {
      setRunningInvoice(false);
    }
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const getSituationBadge = (situation: string) => {
    const cls = 'inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border whitespace-nowrap';
    switch (situation) {
      case 'IN_LOGISTICS':
        return (
          <span className={`${cls} bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-800`}>
            <PackageCheck className="h-3 w-3" /> No WMS (Enviado)
          </span>
        );
      case 'CEP_INVALID':
        return (
          <span className={`${cls} bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-800`}>
            <XCircle className="h-3 w-3" /> CEP Inválido
          </span>
        );
      case 'CHECKED':
        return (
          <span className={`${cls} bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800`}>
            <CheckCircle className="h-3 w-3" /> Conferido no WMS
          </span>
        );
      case 'INVOICED':
        return (
          <span className={`${cls} bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border-purple-200 dark:border-purple-800`}>
            <CheckCircle className="h-3 w-3" /> Faturado
          </span>
        );
      case 'CANCELED':
        return (
          <span className={`${cls} bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700`}>
            Cancelado
          </span>
        );
      default:
        return (
          <span className={`${cls} bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800`}>
            <Clock className="h-3 w-3" /> Pendente / Crítica
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto p-4 md:p-6 pb-24">
      {/* ─── TOPO / CABEÇALHO ──────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/horus-direct/pedidos"
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-slate-600 dark:text-slate-300"
            title="Voltar para Pedidos"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="p-3 bg-violet-100 dark:bg-violet-950/50 rounded-2xl text-violet-700 dark:text-violet-300">
            <Truck className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Logs da Logística WMS
              </h1>
              {logSettings?.enabled ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 className="h-3 w-3" /> WMS Ativo ({logSettings.provider})
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                  WMS Desabilitado
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Gestão de jobs de sincronização, envios de pedidos, conferência WMS e auditoria de erros
            </p>
          </div>
        </div>

        {/* Ações Rápidas */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={fetchLogs}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar Logs
          </button>

          <button
            type="button"
            onClick={handleTriggerInvoice}
            disabled={runningInvoice || loading}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-xs transition-colors disabled:opacity-50"
            title="Consulta pedidos faturados (FAT) no Horus e envia a NFe para o WMS"
          >
            {runningInvoice ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
            {runningInvoice ? 'Enviando NFe...' : 'Enviar NFe (FAT)'}
          </button>
        </div>
      </div>

      {/* ─── PAINEL DE CONTROLE DOS JOBS AUTOMÁTICOS ─────────────────── */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 md:p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
              Controle de Sincronização Automática (Jobs em Segundo Plano)
            </h2>
          </div>
          <span className="text-[11px] text-slate-400">
            Você pode pausar ou ativar qualquer job a qualquer momento com efeito imediato.
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card Job 1: Envio Automático */}
          <div className={`p-4 rounded-xl border transition-all ${
            logSettings?.feature_auto_send
              ? 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/20'
              : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50'
          }`}>
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Send className={`h-4 w-4 ${logSettings?.feature_auto_send ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`} />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                    Envio de Pedidos (LEX → WMS)
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Busca pedidos liberados para expedição no Horus e envia automaticamente ao armazém WMS.
                </p>
                <div className="pt-1">
                  {logSettings?.feature_auto_send ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      Job Ativo (executa a cada 15 min)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-400">
                      <Pause className="h-3 w-3" />
                      Job Pausado (Envio automático desligado)
                    </span>
                  )}
                </div>
              </div>

              {/* Switch de Ativação */}
              <button
                type="button"
                onClick={() => handleToggleJob('auto_send', logSettings?.feature_auto_send ?? true)}
                disabled={togglingJob === 'auto_send'}
                className="shrink-0 p-1 rounded-lg hover:bg-white/60 dark:hover:bg-slate-800 transition-colors"
                title={logSettings?.feature_auto_send ? "Clique para pausar o job de envio automático" : "Clique para ativar o job de envio automático"}
              >
                {togglingJob === 'auto_send' ? (
                  <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
                ) : logSettings?.feature_auto_send ? (
                  <ToggleRight className="h-8 w-8 text-emerald-500" />
                ) : (
                  <ToggleLeft className="h-8 w-8 text-slate-400" />
                )}
              </button>
            </div>

            {/* Ação manual */}
            <div className="mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">Disparo manual:</span>
              <button
                type="button"
                onClick={handleTriggerAuto}
                disabled={runningAuto || loading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors disabled:opacity-50"
              >
                {runningAuto ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 fill-white" />}
                {runningAuto ? 'Enviando...' : 'Processar Fila Agora'}
              </button>
            </div>
          </div>

          {/* Card Job 2: Conferência Automática */}
          <div className={`p-4 rounded-xl border transition-all ${
            logSettings?.feature_auto_check
              ? 'border-violet-200 bg-violet-50/40 dark:border-violet-900/40 dark:bg-violet-950/20'
              : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50'
          }`}>
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <PackageCheck className={`h-4 w-4 ${logSettings?.feature_auto_check ? 'text-violet-600 dark:text-violet-400' : 'text-slate-400'}`} />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                    Conferência WMS (WMS → Horus LFT)
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Busca pedidos conferidos no WMS, registra volumes/pesos e libera para faturamento (LFT) no Horus.
                </p>
                <div className="pt-1">
                  {logSettings?.feature_auto_check ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-violet-700 dark:text-violet-300">
                      <span className="h-2 w-2 rounded-full bg-violet-500 animate-pulse"></span>
                      Job Ativo (executa a cada {logSettings.check_interval_min || 15} min)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-400">
                      <Pause className="h-3 w-3" />
                      Job Pausado (Conferência automática desligada)
                    </span>
                  )}
                </div>
              </div>

              {/* Switch de Ativação */}
              <button
                type="button"
                onClick={() => handleToggleJob('auto_check', logSettings?.feature_auto_check ?? false)}
                disabled={togglingJob === 'auto_check'}
                className="shrink-0 p-1 rounded-lg hover:bg-white/60 dark:hover:bg-slate-800 transition-colors"
                title={logSettings?.feature_auto_check ? "Clique para pausar o job de conferência automática" : "Clique para ativar o job de conferência automática"}
              >
                {togglingJob === 'auto_check' ? (
                  <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
                ) : logSettings?.feature_auto_check ? (
                  <ToggleRight className="h-8 w-8 text-violet-500" />
                ) : (
                  <ToggleLeft className="h-8 w-8 text-slate-400" />
                )}
              </button>
            </div>

            {/* Ação manual */}
            <div className="mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">Disparo manual:</span>
              <button
                type="button"
                onClick={handleTriggerCheck}
                disabled={runningCheck || loading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white shadow-xs transition-colors disabled:opacity-50"
              >
                {runningCheck ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {runningCheck ? 'Conferindo...' : 'Conferir WMS Agora'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── CARDS DE RESUMO (Mobile First) ───────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
        {/* 1. Total na Fila */}
        <div 
          onClick={() => { setActiveTab('ALL'); setPage(1); }}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            activeTab === 'ALL'
              ? 'border-slate-800 bg-slate-100/90 dark:border-slate-200 dark:bg-slate-800 shadow-md ring-2 ring-slate-400/20'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total na Fila</p>
            <Clock className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{stats.total}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Pedidos registrados</p>
        </div>

        {/* 2. Com Nº Logística (WMS ID) */}
        <div 
          onClick={() => { setActiveTab('WITH_WMS_ID'); setPage(1); }}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            activeTab === 'WITH_WMS_ID'
              ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-600 dark:bg-indigo-950/40 shadow-md ring-2 ring-indigo-400/20'
              : 'border-indigo-200 dark:border-indigo-900/40 bg-indigo-50/40 dark:bg-indigo-950/20 shadow-sm hover:border-indigo-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider">Com Nº Logística</p>
            <Hash className="h-3.5 w-3.5 text-indigo-500" />
          </div>
          <p className="text-2xl font-black text-indigo-800 dark:text-indigo-200 mt-1">{stats.with_wms_id}</p>
          <p className="text-[10px] text-indigo-600/70 dark:text-indigo-400/70 mt-0.5">ID gerado no WMS</p>
        </div>

        {/* 3. No WMS (Enviados) */}
        <div 
          onClick={() => { setActiveTab('IN_LOGISTICS'); setPage(1); }}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            activeTab === 'IN_LOGISTICS'
              ? 'border-blue-500 bg-blue-50 dark:border-blue-600 dark:bg-blue-950/40 shadow-md ring-2 ring-blue-400/20'
              : 'border-blue-200 dark:border-blue-900/40 bg-blue-50/40 dark:bg-blue-950/20 shadow-sm hover:border-blue-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider">No WMS (Enviados)</p>
            <Truck className="h-3.5 w-3.5 text-blue-500" />
          </div>
          <p className="text-2xl font-black text-blue-800 dark:text-blue-200 mt-1">{stats.in_logistics}</p>
          <p className="text-[10px] text-blue-600/70 dark:text-blue-400/70 mt-0.5">Aguardando picking</p>
        </div>

        {/* 4. Em LFT (Conferidos) */}
        <div 
          onClick={() => { setActiveTab('LFT'); setPage(1); }}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            activeTab === 'LFT'
              ? 'border-emerald-500 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950/40 shadow-md ring-2 ring-emerald-400/20'
              : 'border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-sm hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Em LFT (Conferidos)</p>
            <PackageCheck className="h-3.5 w-3.5 text-emerald-500" />
          </div>
          <p className="text-2xl font-black text-emerald-800 dark:text-emerald-200 mt-1">{stats.lft}</p>
          <p className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70 mt-0.5">Liberados p/ faturar</p>
        </div>

        {/* 5. Faturados (NFe) */}
        <div 
          onClick={() => { setActiveTab('INVOICED'); setPage(1); }}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            activeTab === 'INVOICED'
              ? 'border-purple-500 bg-purple-50 dark:border-purple-600 dark:bg-purple-950/40 shadow-md ring-2 ring-purple-400/20'
              : 'border-purple-200 dark:border-purple-900/40 bg-purple-50/40 dark:bg-purple-950/20 shadow-sm hover:border-purple-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-purple-700 dark:text-purple-400 uppercase tracking-wider">Faturados (NFe)</p>
            <FileText className="h-3.5 w-3.5 text-purple-500" />
          </div>
          <p className="text-2xl font-black text-purple-800 dark:text-purple-200 mt-1">{stats.invoiced}</p>
          <p className="text-[10px] text-purple-600/70 dark:text-purple-400/70 mt-0.5">NF enviada ao armazém</p>
        </div>

        {/* 6. Críticas / Erros */}
        <div 
          onClick={() => { setActiveTab('ERRORS'); setPage(1); }}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            activeTab === 'ERRORS'
              ? 'border-rose-500 bg-rose-50 dark:border-rose-600 dark:bg-rose-950/40 shadow-md ring-2 ring-rose-400/20'
              : 'border-rose-200 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-950/20 shadow-sm hover:border-rose-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider">Críticas / Erros</p>
            <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
          </div>
          <p className="text-2xl font-black text-rose-800 dark:text-rose-200 mt-1">{stats.errors}</p>
          <p className="text-[10px] text-rose-600/70 dark:text-rose-400/70 mt-0.5">Exigem correção</p>
        </div>
      </div>

      {/* ─── BARRA DE FILTROS E ABAS ──────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Abas Rápidas */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
            <button
              type="button"
              onClick={() => { setActiveTab('ALL'); setPage(1); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0 ${
                activeTab === 'ALL'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Todos ({stats.total})
            </button>

            <button
              type="button"
              onClick={() => { setActiveTab('WITH_WMS_ID'); setPage(1); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0 flex items-center gap-1.5 ${
                activeTab === 'WITH_WMS_ID'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100'
              }`}
            >
              <Hash className="h-3.5 w-3.5" />
              Com Nº Logística ({stats.with_wms_id})
            </button>

            <button
              type="button"
              onClick={() => { setActiveTab('IN_LOGISTICS'); setPage(1); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0 ${
                activeTab === 'IN_LOGISTICS'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              No WMS ({stats.in_logistics})
            </button>

            <button
              type="button"
              onClick={() => { setActiveTab('LFT'); setPage(1); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0 flex items-center gap-1.5 ${
                activeTab === 'LFT'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100'
              }`}
            >
              <PackageCheck className="h-3.5 w-3.5" />
              Em LFT ({stats.lft})
            </button>

            <button
              type="button"
              onClick={() => { setActiveTab('INVOICED'); setPage(1); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0 flex items-center gap-1.5 ${
                activeTab === 'INVOICED'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 hover:bg-purple-100'
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              Faturados ({stats.invoiced})
            </button>

            <button
              type="button"
              onClick={() => { setActiveTab('CEP_INVALID'); setPage(1); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0 ${
                activeTab === 'CEP_INVALID'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              CEP Inválido ({stats.cep_invalid})
            </button>

            <button
              type="button"
              onClick={() => { setActiveTab('ERRORS'); setPage(1); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shrink-0 flex items-center gap-1.5 ${
                activeTab === 'ERRORS'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 hover:bg-rose-100'
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Com Críticas ({stats.errors})
            </button>
          </div>

          {/* Campo de Busca */}
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar pedido Horus ou Web..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ─── TABELA DE LOGS ────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold sticky top-0">
              <tr>
                <th className="p-3.5">Data / Hora</th>
                <th className="p-3.5">Pedido Horus</th>
                <th className="p-3.5">Pedido Web</th>
                <th className="p-3.5">Cliente</th>
                <th className="p-3.5 text-center">Situação WMS</th>
                <th className="p-3.5">Crítica / Detalhes</th>
                <th className="p-3.5 text-center">ID no WMS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-400">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-violet-500" />
                    Carregando histórico de envios...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-slate-400">
                    Nenhum registro encontrado com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                items.map((it) => {
                  const hasProblem = it.situation === 'CEP_INVALID' || Boolean(it.error_log);
                  const rowBg = hasProblem
                    ? 'bg-rose-50/40 dark:bg-rose-950/15 hover:bg-rose-50/80 dark:hover:bg-rose-950/25'
                    : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40';

                  return (
                    <tr key={it.id} className={`transition-colors ${rowBg}`}>
                      {/* Data / Hora */}
                      <td className="p-3.5 whitespace-nowrap text-slate-600 dark:text-slate-400">
                        {formatDate(it.sent_at || it.updated_at || it.created_at)}
                      </td>

                      {/* Pedido Horus */}
                      <td className="p-3.5 font-mono font-bold text-violet-700 dark:text-violet-300 whitespace-nowrap">
                        #{it.cod_ped_venda}
                      </td>

                      {/* Pedido Web */}
                      <td className="p-3.5 font-mono font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        {it.pedido_web_origem ? `#${it.pedido_web_origem}` : '—'}
                      </td>

                      {/* Cliente */}
                      <td className="p-3.5 font-semibold text-slate-700 dark:text-slate-300">
                        {it.cod_cli ? `Cód: ${it.cod_cli}` : '—'}
                      </td>

                      {/* Situação WMS & Horus */}
                      <td className="p-3.5 text-center whitespace-nowrap">
                        <div className="flex flex-col items-center gap-1">
                          {getSituationBadge(it.situation)}
                          {it.status_horus && (
                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              it.status_horus === 'LFT'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                                : it.status_horus === 'FAT'
                                ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800'
                                : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                            }`}>
                              Horus: {it.status_horus}
                            </span>
                          )}
                          {it.nfe_number && (
                            <span className="font-mono text-[10px] text-purple-700 dark:text-purple-300 font-semibold" title={`Chave NFe: ${it.key_nfe || ''}`}>
                              NF #{it.nfe_number}
                            </span>
                          )}
                          {it.id_ord_sys_log && (
                            <div className="flex items-center justify-center gap-1 font-mono text-[10px]" title="ID do Pedido / Remessa no WMS">
                              <span className="text-slate-400 font-semibold">WMS:</span>
                              <span className="font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-800">
                                #{it.id_ord_sys_log}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Crítica / Detalhes */}
                      <td className="p-3.5 max-w-md">
                        {it.situation === 'CEP_INVALID' ? (
                          <div className="flex items-start gap-1.5 text-rose-700 dark:text-rose-400">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-rose-600" />
                            <span className="font-semibold">{it.cep_error_detail || 'CEP inválido.'}</span>
                          </div>
                        ) : it.error_log ? (
                          <div className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
                            <span>{it.error_log}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Sem críticas registradas.</span>
                        )}
                      </td>

                      {/* ID no WMS */}
                      <td className="p-3.5 text-center font-mono text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {it.id_ord_sys_log || '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ─── PAGINAÇÃO ────────────────────────────────────────── */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <span className="text-slate-500">
            Mostrando <strong>{items.length}</strong> de <strong>{totalRecords}</strong> registros (Página {page} de {totalPages})
          </span>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2.5 font-bold text-slate-700 dark:text-slate-300">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
