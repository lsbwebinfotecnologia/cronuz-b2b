'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, ChevronDown, ChevronUp, RefreshCw, Calendar, CheckCircle2, Clock } from 'lucide-react';
import { getToken } from '@/lib/auth';

interface MonthProjectionItem {
    key: string;
    label: string;
    year: number;
    month: number;
    is_current: boolean;
    is_past: boolean;
    is_future: boolean;
    completed: number;
    pending: number;
    cancelled: number;
    total_active: number;
    count_completed: number;
    count_pending: number;
    count_total: number;
}

interface ProjectionSummary {
    months_past: number;
    months_future: number;
    avg_past_monthly: number;
    current_month_completed: number;
    current_month_pending: number;
    current_month_total: number;
    forecast_3m_total: number;
    forecast_12m_total: number;
    forecast_12m_monthly_avg: number;
}

interface ServiceOrdersProjectionChartProps {
    customerFilter?: string;
    onSelectMonthFilter?: (startDate: string, endDate: string) => void;
}

export default function ServiceOrdersProjectionChart({ customerFilter, onSelectMonthFilter }: ServiceOrdersProjectionChartProps) {
    const [collapsed, setCollapsed] = useState<boolean>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('cronuz_os_chart_collapsed');
            return saved === 'true';
        }
        return false;
    });

    const [data, setData] = useState<{ series: MonthProjectionItem[]; summary: ProjectionSummary | null }>({
        series: [],
        summary: null
    });
    const [loading, setLoading] = useState(true);
    const [activeTooltip, setActiveTooltip] = useState<MonthProjectionItem | null>(null);

    const toggleCollapsed = () => {
        setCollapsed(prev => {
            const next = !prev;
            if (typeof window !== 'undefined') {
                localStorage.setItem('cronuz_os_chart_collapsed', String(next));
            }
            return next;
        });
    };

    const fetchProjection = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            params.set('months_past', '3');
            params.set('months_future', '12');
            if (customerFilter) {
                params.set('customer_id', customerFilter);
            }

            const res = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/service-orders/projection-chart?${params.toString()}`,
                {
                    headers: { 'Authorization': `Bearer ${getToken()}` }
                }
            );

            if (res.ok) {
                const json = await res.json();
                setData({
                    series: json.series || [],
                    summary: json.summary || null
                });
            }
        } catch (error) {
            console.error('Falha ao carregar projeção de O.S.:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProjection();
    }, [customerFilter]);

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(val);
    };

    const formatCompactCurrency = (val: number) => {
        if (val >= 1000000) return `R$ ${(val / 1000000).toFixed(1)}M`;
        if (val >= 1000) return `R$ ${(val / 1000).toFixed(1)}k`;
        return `R$ ${val.toFixed(0)}`;
    };

    // Calcula valor máximo para escala das barras
    const maxVal = Math.max(
        ...data.series.map(s => Math.max(s.completed + s.pending, 100)),
        1000
    );

    const handleBarClick = (item: MonthProjectionItem) => {
        if (!onSelectMonthFilter) return;
        const lastDay = new Date(item.year, item.month, 0).getDate();
        const start = `${item.key}-01`;
        const end = `${item.key}-${String(lastDay).padStart(2, '0')}`;
        onSelectMonthFilter(start, end);
    };

    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-all duration-200">
            {/* Cabeçalho do Card Compacto */}
            <div className="px-5 py-3.5 flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                        <TrendingUp className="w-4 h-4" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                                Projeção Anual & Histórico de O.S.
                            </h2>
                            <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                3m anteriores + 12m projeção
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            Acompanhe o que já foi faturado e antecipe oportunidades de novos serviços.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Legenda rápida */}
                    <div className="hidden lg:flex items-center gap-3 text-xs mr-3">
                        <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block"></span>
                            <span>Realizado (Concluído)</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                            <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block"></span>
                            <span>Previsto (Pendente / Execução)</span>
                        </div>
                    </div>

                    <button
                        onClick={fetchProjection}
                        title="Recarregar Projeção"
                        disabled={loading}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-500' : ''}`} />
                    </button>

                    <button
                        onClick={toggleCollapsed}
                        title={collapsed ? "Expandir Gráfico" : "Recolher Gráfico"}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    >
                        {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            {/* Conteúdo Expansível */}
            {!collapsed && (
                <div className="p-5 space-y-4">
                    {/* Indicadores Compactos de Resumo */}
                    {data.summary && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                                <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block tracking-wider">
                                    Média Meses Anteriores
                                </span>
                                <div className="text-base font-extrabold text-slate-800 dark:text-slate-100 mt-0.5">
                                    {formatCurrency(data.summary.avg_past_monthly)}
                                    <span className="text-[11px] font-normal text-slate-500 ml-1">/mês</span>
                                </div>
                            </div>

                            <div className="bg-emerald-50/60 dark:bg-emerald-950/20 p-3 rounded-xl border border-emerald-100 dark:border-emerald-800/40">
                                <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block tracking-wider">
                                    Mês Atual (Previsto + Concluído)
                                </span>
                                <div className="text-base font-extrabold text-emerald-700 dark:text-emerald-300 mt-0.5">
                                    {formatCurrency(data.summary.current_month_total)}
                                </div>
                            </div>

                            <div className="bg-indigo-50/60 dark:bg-indigo-950/20 p-3 rounded-xl border border-indigo-100 dark:border-indigo-800/40">
                                <span className="text-[10px] uppercase font-bold text-indigo-600 dark:text-indigo-400 block tracking-wider">
                                    Previsão Próx. 3 Meses
                                </span>
                                <div className="text-base font-extrabold text-indigo-700 dark:text-indigo-300 mt-0.5">
                                    {formatCurrency(data.summary.forecast_3m_total)}
                                </div>
                            </div>

                            <div className="bg-blue-50/60 dark:bg-blue-950/20 p-3 rounded-xl border border-blue-100 dark:border-blue-800/40">
                                <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 block tracking-wider">
                                    Previsão Total (12 Meses)
                                </span>
                                <div className="text-base font-extrabold text-blue-700 dark:text-blue-300 mt-0.5 flex items-baseline gap-1">
                                    {formatCurrency(data.summary.forecast_12m_total)}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Área do Gráfico de Barras com Rolagem Horizontal Suave (Mobile Friendly) */}
                    <div className="relative">
                        <div className="overflow-x-auto pb-2 pt-6 custom-scrollbar">
                            <div className="min-w-[760px] flex items-end justify-between gap-2 h-44 px-2">
                                {data.series.map((item) => {
                                    const totalHeightPct = Math.min(((item.completed + item.pending) / maxVal) * 100, 100);
                                    const completedPct = item.completed + item.pending > 0 
                                        ? (item.completed / (item.completed + item.pending)) * 100 
                                        : 0;
                                    const pendingPct = 100 - completedPct;

                                    return (
                                        <div
                                            key={item.key}
                                            onClick={() => handleBarClick(item)}
                                            onMouseEnter={() => setActiveTooltip(item)}
                                            onMouseLeave={() => setActiveTooltip(null)}
                                            className={`flex-1 flex flex-col items-center h-full justify-end cursor-pointer group relative transition-all rounded-lg p-1 ${
                                                item.is_current
                                                    ? 'bg-indigo-50/70 dark:bg-indigo-950/30 ring-1 ring-indigo-400/50'
                                                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                                            }`}
                                        >
                                            {/* Valor compacto no topo da barra */}
                                            <div className="mb-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition">
                                                {item.completed + item.pending > 0 ? formatCompactCurrency(item.completed + item.pending) : '-'}
                                            </div>

                                            {/* Container da Barra Empilhada */}
                                            <div className="w-full max-w-[28px] h-28 bg-slate-100 dark:bg-slate-800/80 rounded-t-md flex flex-col justify-end overflow-hidden relative shadow-inner">
                                                {totalHeightPct > 0 ? (
                                                    <div
                                                        className="w-full flex flex-col justify-end transition-all duration-300"
                                                        style={{ height: `${Math.max(totalHeightPct, 4)}%` }}
                                                    >
                                                        {/* Parcela Pendente (Topo) */}
                                                        {item.pending > 0 && (
                                                            <div
                                                                className="w-full bg-indigo-500 dark:bg-indigo-500/90 group-hover:bg-indigo-600 transition"
                                                                style={{ height: `${pendingPct}%` }}
                                                            ></div>
                                                        )}
                                                        {/* Parcela Concluída (Base) */}
                                                        {item.completed > 0 && (
                                                            <div
                                                                className="w-full bg-emerald-500 dark:bg-emerald-500/90 group-hover:bg-emerald-600 transition"
                                                                style={{ height: `${completedPct}%` }}
                                                            ></div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="w-full h-1 bg-slate-200 dark:bg-slate-700/60 mt-auto"></div>
                                                )}
                                            </div>

                                            {/* Rótulo do Mês */}
                                            <div className="mt-2 text-center">
                                                <span className={`text-[11px] block font-semibold leading-tight ${
                                                    item.is_current
                                                        ? 'text-indigo-600 dark:text-indigo-400 font-extrabold'
                                                        : item.is_past
                                                        ? 'text-slate-500 dark:text-slate-400'
                                                        : 'text-slate-700 dark:text-slate-300'
                                                }`}>
                                                    {item.label}
                                                </span>
                                                {item.is_current && (
                                                    <span className="inline-block mt-0.5 px-1 py-0.2 text-[9px] font-bold bg-indigo-600 text-white rounded leading-none">
                                                        Hoje
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Tooltip Dinâmico ao passar o mouse ou focar */}
                        {activeTooltip && (
                            <div className="absolute top-0 right-4 z-20 bg-slate-900 text-white dark:bg-slate-800 px-3.5 py-2.5 rounded-xl shadow-xl border border-slate-700 text-xs pointer-events-none transition-all animate-in fade-in zoom-in-95">
                                <div className="flex items-center justify-between gap-3 border-b border-slate-700/80 pb-1.5 mb-1.5 font-bold">
                                    <span className="flex items-center gap-1.5 text-indigo-300">
                                        <Calendar className="w-3.5 h-3.5" /> {activeTooltip.label}
                                    </span>
                                    {activeTooltip.is_current && (
                                        <span className="text-[10px] bg-indigo-500 px-1.5 py-0.5 rounded text-white">Mês Atual</span>
                                    )}
                                </div>
                                <div className="space-y-1">
                                    <div className="flex justify-between gap-4">
                                        <span className="text-emerald-400 flex items-center gap-1">
                                            <CheckCircle2 className="w-3 h-3" /> Realizado ({activeTooltip.count_completed}):
                                        </span>
                                        <span className="font-semibold">{formatCurrency(activeTooltip.completed)}</span>
                                    </div>
                                    <div className="flex justify-between gap-4">
                                        <span className="text-indigo-300 flex items-center gap-1">
                                            <Clock className="w-3 h-3" /> Previsto ({activeTooltip.count_pending}):
                                        </span>
                                        <span className="font-semibold">{formatCurrency(activeTooltip.pending)}</span>
                                    </div>
                                    <div className="flex justify-between gap-4 border-t border-slate-700/80 pt-1 font-bold">
                                        <span className="text-slate-300">Total Ativo:</span>
                                        <span>{formatCurrency(activeTooltip.total_active)}</span>
                                    </div>
                                </div>
                                <p className="text-[10px] text-slate-400 mt-1 italic">
                                    Clique na barra para filtrar a listagem abaixo neste mês.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
