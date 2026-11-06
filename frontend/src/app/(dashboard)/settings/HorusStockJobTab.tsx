'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';

interface StockJobHistoryEntry {
  run_at: string;
  trigger: string;
  status: string;
  checked_count: number;
  updated_count: number;
  duration_ms: number;
  window: string;
  message: string;
}

interface StockJobStatusResponse {
  company_id: number;
  horus_enabled: boolean;
  horus_company: number;
  horus_branch: number;
  horus_stock_local: string | number | null;
  horus_legacy_pagination: boolean;
  cod_tpo_caract: string;
  cod_caract: string;
  characteristic_type_name: string;
  characteristic_value: string;
  local_products_count: number;
  enabled: boolean;
  interval_minutes: number;
  last_run_at: string | null;
  last_success_at: string | null;
  last_status: string;
  last_trigger: string | null;
  last_duration_ms: number;
  last_checked_count: number;
  last_updated_count: number;
  last_window: string;
  last_message: string;
  history: StockJobHistoryEntry[];
}

export function HorusStockJobTab() {
  const [statusData, setStatusData] = useState<StockJobStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningNow, setRunningNow] = useState(false);
  const [savingCfg, setSavingCfg] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [intervalMinutes, setIntervalMinutes] = useState(5);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const fetchJobStatus = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`${apiBase}/b2c/products/stock-job-status`, {
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      });
      if (!res.ok) throw new Error('Falha ao carregar status do Job de Estoque.');
      const data: StockJobStatusResponse = await res.json();
      setStatusData(data);
      setEnabled(Boolean(data.enabled));
      setIntervalMinutes(Number(data.interval_minutes || 5));
    } catch (err: any) {
      if (!silent) toast.error(err.message || 'Erro ao buscar status do job.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    fetchJobStatus(false);
    const timer = setInterval(() => {
      fetchJobStatus(true);
    }, 30000);
    return () => clearInterval(timer);
  }, [fetchJobStatus]);

  const handleSaveConfig = async (nextEnabled: boolean, nextInterval: number) => {
    setSavingCfg(true);
    try {
      const res = await fetch(`${apiBase}/b2c/products/stock-job-config`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          enabled: nextEnabled,
          interval_minutes: nextInterval,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Não foi possível salvar a configuração do job.');
      }
      setEnabled(nextEnabled);
      setIntervalMinutes(nextInterval);
      toast.success(
        nextEnabled
          ? `Job automático de estoque ativado (a cada ${nextInterval} min).`
          : 'Job automático de estoque pausado.'
      );
      await fetchJobStatus(true);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar configuração do job.');
    } finally {
      setSavingCfg(false);
    }
  };

  const handleRunNow = async () => {
    setRunningNow(true);
    try {
      const res = await fetch(`${apiBase}/b2c/products/stock-job-run`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || 'Falha ao executar sincronização de estoque.');
      }
      if (data.last_status === 'ERROR') {
        toast.error(data.last_message || 'Ocorreu um erro ao consultar o Horus.');
      } else {
        toast.success(data.last_message || 'Sincronização de estoque executada com sucesso!');
      }
      await fetchJobStatus(true);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao disparar job de estoque.');
    } finally {
      setRunningNow(false);
    }
  };

  const formatDateTime = (iso: string | null) => {
    if (!iso) return 'Ainda não executado';
    try {
      return new Date(iso).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center gap-2 text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
        <span className="text-sm font-medium">Carregando telemetria do Job de Estoque (Produtos)...</span>
      </div>
    );
  }

  const lastStatus = statusData?.last_status || 'IDLE';
  const isSuccess = lastStatus === 'SUCCESS';
  const isError = lastStatus === 'ERROR';

  return (
    <div className="p-5 sm:p-6 space-y-6">
      {/* Cabeçalho e Ação Imediata */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              <Activity className="w-3.5 h-3.5" />
              Monitoramento de Job • Estoque Horus ERP
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              <ShieldCheck className="w-3.5 h-3.5" />
              Anti-Gargalo (Single-Flight Lock + Incremental)
            </span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
            Sincronização Automática de Estoque de Produtos (Horus ERP)
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-3xl">
            Consulta periodicamente o endpoint leve <code className="font-mono text-indigo-600 dark:text-indigo-400">Estoque</code> do Horus ERP na janela incremental (última execução até agora), atualizando apenas os saldos alterados no catálogo local e limpando o cache em memória da loja somente quando houver variação de saldo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => fetchJobStatus(false)}
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Atualizar Painel
          </button>
          <button
            type="button"
            disabled={runningNow || !statusData?.horus_enabled}
            onClick={handleRunNow}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 shadow-sm cursor-pointer"
          >
            {runningNow ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
            {runningNow ? 'Consultando Horus...' : 'Executar Sincronia de Estoque Agora'}
          </button>
        </div>
      </div>

      {/* Alerta se Horus estiver desativado */}
      {!statusData?.horus_enabled && (
        <div className="p-4 rounded-2xl border border-amber-200 bg-amber-50/80 dark:bg-amber-950/30 dark:border-amber-800 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800 dark:text-amber-200 space-y-1">
            <p className="font-bold">A integração Horus ERP está desativada para esta empresa.</p>
            <p>Ative a conexão na aba <strong>Integração Horus ERP</strong> para que o job automático de estoque possa consultar os saldos.</p>
          </div>
        </div>
      )}

      {/* Cards de Status da Última Execução */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/50 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Status da Última Execução</span>
            {isSuccess ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            ) : isError ? (
              <AlertTriangle className="w-4 h-4 text-rose-500" />
            ) : (
              <Clock className="w-4 h-4 text-slate-400" />
            )}
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-extrabold ${
                isSuccess
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : isError
                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                  : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {isSuccess ? 'SUCESSO' : isError ? 'FALHA / ERRO' : 'AGUARDANDO 1º CICLO'}
            </span>
            {statusData?.last_trigger && (
              <span className="text-[10px] font-mono font-semibold text-slate-500">
                ({statusData.last_trigger === 'MANUAL' ? 'Manual' : 'Automático'})
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 line-clamp-2 pt-0.5">
            {statusData?.last_message || 'Aguardando primeira execução.'}
          </p>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/50 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Última Hora que Rodou</span>
            <Clock className="w-4 h-4 text-indigo-500" />
          </div>
          <p className="text-sm font-extrabold font-mono text-slate-900 dark:text-white">
            {formatDateTime(statusData?.last_run_at || null)}
          </p>
          <p className="text-[11px] text-slate-500 font-mono truncate">
            Último sucesso: {formatDateTime(statusData?.last_success_at || null)}
          </p>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/50 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Saldos Atualizados no Ciclo</span>
            <Database className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-extrabold font-mono text-slate-900 dark:text-white">
              {statusData?.last_updated_count ?? 0}
            </span>
            <span className="text-xs text-slate-500">
              alterados / {statusData?.last_checked_count ?? 0} movimentados no Horus
            </span>
          </div>
          <p className="text-[11px] text-slate-500">
            Catálogo local monitorado: <strong className="font-mono">{statusData?.local_products_count ?? 0}</strong> produtos
          </p>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/50 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Tempo de Resposta &amp; Janela</span>
            <Activity className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-xl font-extrabold font-mono text-slate-900 dark:text-white">
            {statusData?.last_duration_ms ? `${statusData.last_duration_ms} ms` : '—'}
          </p>
          <p className="text-[10px] font-mono text-slate-500 truncate" title={statusData?.last_window || ''}>
            Janela: {statusData?.last_window || 'Automática (-10 min)'}
          </p>
        </div>
      </div>

      {/* Controle de Frequência e Parâmetros Aplicados */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Agendamento &amp; Proteção do Servidor
              </h3>
            </div>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {enabled ? 'Job Ativo' : 'Job Pausado'}
              </span>
              <input
                type="checkbox"
                className="sr-only peer"
                checked={enabled}
                disabled={savingCfg}
                onChange={(e) => handleSaveConfig(e.target.checked, intervalMinutes)}
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600 relative dark:bg-slate-700" />
            </label>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Intervalo de Sincronização Automática
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {[
                { val: 5, label: 'A cada 5 minutos (Recomendado)' },
                { val: 10, label: 'A cada 10 minutos' },
                { val: 15, label: 'A cada 15 minutos' },
                { val: 30, label: 'A cada 30 minutos' },
              ].map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  disabled={savingCfg}
                  onClick={() => handleSaveConfig(enabled, opt.val)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    intervalMinutes === opt.val
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-indigo-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 pt-1">
              O agendador possui trava <strong>Single-Flight (`max_instances=1` + `threading.Lock` não-bloqueante)</strong>: se uma consulta ao Horus demorar mais que o normal, o servidor nunca empilha nem duplica chamadas.
            </p>
          </div>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Database className="w-4 h-4 text-indigo-600" />
            Parâmetros de Consulta enviados ao Horus (`Estoque`)
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Empresa / Filial</span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                COD_EMPRESA={statusData?.horus_company ?? 1} / FILIAL={statusData?.horus_branch ?? 1}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Local de Estoque</span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                {statusData?.horus_stock_local ? `LOCAL=${statusData.horus_stock_local}` : 'Padrão Geral'}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Paginação Horus</span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                {statusData?.horus_legacy_pagination ? 'Legado (Sem OFFSET/LIMIT)' : 'Padrão (OFFSET/LIMIT)'}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 col-span-2 sm:col-span-3">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Filtro de Característica B2C</span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                {statusData?.cod_tpo_caract && statusData?.cod_caract
                  ? `${statusData.characteristic_type_name || statusData.cod_tpo_caract}: ${statusData.characteristic_value || statusData.cod_caract} (COD_TPO_CARACT=${statusData.cod_tpo_caract}, COD_CARACT=${statusData.cod_caract})`
                  : 'Todos os produtos do catálogo local da empresa'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Histórico das Últimas 15 Execuções */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Histórico Recente de Execuções (Últimos 15 Ciclos)
            </h3>
            <p className="text-xs text-slate-500">
              Acompanhe cada disparo automático ou manual do Job de Estoque de Produtos.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-2.5 px-4">Data / Hora</th>
                <th className="py-2.5 px-4">Origem</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Janela Consultada (Horus)</th>
                <th className="py-2.5 px-4 text-right">Movimentados</th>
                <th className="py-2.5 px-4 text-right">Atualizados</th>
                <th className="py-2.5 px-4 text-right">Duração</th>
                <th className="py-2.5 px-4">Resumo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {!statusData?.history || statusData.history.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    Nenhuma execução registrada ainda. Clique em <strong>Executar Sincronia de Estoque Agora</strong> acima ou aguarde o ciclo automático de 5 minutos.
                  </td>
                </tr>
              ) : (
                statusData.history.map((item, idx) => (
                  <tr key={`${item.run_at}-${idx}`} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                    <td className="py-2.5 px-4 font-mono whitespace-nowrap text-slate-800 dark:text-slate-200">
                      {formatDateTime(item.run_at)}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {item.trigger === 'MANUAL' ? 'MANUAL' : 'AUTO (5m)'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                          item.status === 'SUCCESS'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                        }`}
                      >
                        {item.status === 'SUCCESS' ? 'SUCESSO' : 'ERRO'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {item.window}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-right font-semibold text-slate-700 dark:text-slate-300">
                      {item.checked_count}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-right font-bold text-indigo-600 dark:text-indigo-400">
                      {item.updated_count}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-right text-slate-500 whitespace-nowrap">
                      {item.duration_ms} ms
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300 max-w-md truncate" title={item.message}>
                      {item.message}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
