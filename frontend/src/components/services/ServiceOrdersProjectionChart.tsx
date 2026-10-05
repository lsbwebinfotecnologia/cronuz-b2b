'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, ChevronDown, ChevronUp, RefreshCw, Calendar, CheckCircle2, Clock, ArrowUpRight, ArrowDownRight, Minus, History } from 'lucide-react';
import { getToken } from '@/lib/auth';

interface MonthProjectionItem {
    key: string;
    label: string;
    month_name: string;
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
    prev_year_key: string;
    prev_year_completed: number;
    prev_year_total: number;
    prev_year_count_completed: number;
    diff_prev_year: number;
    growth_prev_year_pct: number;
}

interface ProjectionSummary {
    target_year: number;
    prev_year: number;
    year_completed_total: number;
    year_pending_total: number;
    year_total_active: number;
    year_monthly_avg: number;
    prev_year_completed_total: number;
    prev_year_monthly_avg: number;
    year_diff_prev: number;
    year_growth_pct: number;
    current_month_completed: number;
    current_month_pending: number;
    current_month_total: number;
    current_month_prev_year: number;
}

interface ServiceOrdersProjectionChartProps {
    customerFilter?: string;
    onSelectMonthFilter?: (startDate: string, endDate: string) => void;
}

export default function ServiceOrdersProjectionChart({ customerFilter, onSelectMonthFilter }: ServiceOrdersProjectionChartProps) {
    const currentYear = new Date().getFullYear();
    const [selectedYear, setSelectedYear] = useState<number>(currentYear);
    const [availableYears, setAvailableYears] = useState<number[]>([currentYear - 1, currentYear, currentYear + 1]);

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
            params.set('year', String(selectedYear));
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
                if (json.available_years && Array.isArray(json.available_years) && json.available_years.length > 0) {
                    setAvailableYears(json.available_years);
                }
            }
        } catch (error) {
            console.error('Falha ao carregar projeção de O.S.:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProjection();
    }, [selectedYear, customerFilter]);

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(val);
    };

    const formatCompactCurrency = (val: number) => {
        if (val >= 1000000) return `R$ ${(val / 1000000).toFixed(1)}M`;
        if (val >= 1000) return `R$ ${(val / 1000).toFixed(1)}k`;
        return `R$ ${val.toFixed(0)}`;
    };

    // Calcula valor máximo para escala das barras (levando em conta o ano atual e o ano anterior)
    const maxVal = Math.max(
        ...data.series.map(s => Math.max(s.completed + s.pending, s.prev_year_completed, 100)),
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
            <div className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                        <TrendingUp className="w-4 h-4" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                                Projeção Anual & Comparativo de O.S.
                            </h2>
                            <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                Jan a Dez • vs. Ano Anterior
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            Acompanhe serviços realizados, agendados e compare o mesmo mês do ano anterior.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3 ml-auto flex-wrap">
                    {/* Seletor de Ano com Destaque */}
                    <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1 shadow-xs">
                        <Calendar className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                        <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Ano:</label>
                        <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(Number(e.target.value))}
                            className="bg-transparent text-xs font-extrabold text-indigo-600 dark:text-indigo-400 focus:outline-none cursor-pointer pr-1"
                        >
                            {availableYears.map(y => (
                                <option key={y} value={y} className="dark:bg-slate-900 dark:text-white">
                                    {y} {y === currentYear ? '(Atual)' : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Legenda rápida */}
                    <div className="hidden xl:flex items-center gap-3 text-xs">
                        <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block"></span>
                            <span>Realizado ({selectedYear})</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                            <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block"></span>
                            <span>Previsto ({selectedYear})</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                            <span className="w-2.5 h-2.5 rounded-sm bg-slate-300 dark:bg-slate-600 inline-block border border-dashed border-slate-400"></span>
                            <span>Ano Anterior ({selectedYear - 1})</span>
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
                    {/* Indicadores Compactos de Resumo Anual */}
                    {data.summary && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="bg-emerald-50/60 dark:bg-emerald-950/20 p-3 rounded-xl border border-emerald-100 dark:border-emerald-800/40">
                                <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 block tracking-wider">
                                    Realizado em {selectedYear}
                                </span>
                                <div className="text-base font-extrabold text-emerald-700 dark:text-emerald-300 mt-0.5">
                                    {formatCurrency(data.summary.year_completed_total)}
                                </div>
                            </div>

                            <div className="bg-indigo-50/60 dark:bg-indigo-950/20 p-3 rounded-xl border border-indigo-100 dark:border-indigo-800/40">
                                <span className="text-[10px] uppercase font-bold text-indigo-600 dark:text-indigo-400 block tracking-wider">
                                    Previsto Restante {selectedYear}
                                </span>
                                <div className="text-base font-extrabold text-indigo-700 dark:text-indigo-300 mt-0.5">
                                    {formatCurrency(data.summary.year_pending_total)}
                                </div>
                            </div>

                            <div className="bg-blue-50/60 dark:bg-blue-950/20 p-3 rounded-xl border border-blue-100 dark:border-blue-800/40">
                                <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 block tracking-wider">
                                    Total Projetado {selectedYear}
                                </span>
                                <div className="text-base font-extrabold text-blue-700 dark:text-blue-300 mt-0.5">
                                    {formatCurrency(data.summary.year_total_active)}
                                    <span className="text-[11px] font-normal text-slate-500 ml-1">
                                        (~{formatCurrency(data.summary.year_monthly_avg)}/mês)
                                    </span>
                                </div>
                            </div>

                            <div className="bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 block tracking-wider">
                                        vs. Ano {selectedYear - 1}
                                    </span>
                                    {data.summary.year_growth_pct >= 0 ? (
                                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center">
                                            <ArrowUpRight className="w-3 h-3" /> +{data.summary.year_growth_pct}%
                                        </span>
                                    ) : (
                                        <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 flex items-center">
                                            <ArrowDownRight className="w-3 h-3" /> {data.summary.year_growth_pct}%
                                        </span>
                                    )}
                                </div>
                                <div className="text-base font-extrabold text-slate-800 dark:text-slate-100 mt-0.5">
                                    {formatCurrency(data.summary.prev_year_completed_total)}
                                    <span className="text-[11px] font-normal text-slate-500 ml-1">
                                        realizado em {selectedYear - 1}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Área do Gráfico de Barras com Comparativo YoY Lado a Lado */}
                    <div className="relative">
                        <div className="overflow-x-auto pb-2 pt-6 custom-scrollbar">
                            <div className="min-w-[760px] flex items-end justify-between gap-2.5 h-48 px-2">
                                {data.series.map((item) => {
                                    const totalCurrent = item.completed + item.pending;
                                    const currentHeightPct = Math.min((totalCurrent / maxVal) * 100, 100);
                                    const prevHeightPct = Math.min((item.prev_year_completed / maxVal) * 100, 100);

                                    const completedPct = totalCurrent > 0 
                                        ? (item.completed / totalCurrent) * 100 
                                        : 0;
                                    const pendingPct = 100 - completedPct;

                                    return (
                                        <div
                                            key={item.key}
                                            onClick={() => handleBarClick(item)}
                                            onMouseEnter={() => setActiveTooltip(item)}
                                            onMouseLeave={() => setActiveTooltip(null)}
                                            className={`flex-1 flex flex-col items-center h-full justify-end cursor-pointer group relative transition-all rounded-xl p-1.5 ${
                                                item.is_current
                                                    ? 'bg-indigo-50/80 dark:bg-indigo-950/40 ring-1 ring-indigo-400/60 shadow-xs'
                                                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                                            }`}
                                        >
                                            {/* Valor compacto do ano selecionado no topo da barra */}
                                            <div className="mb-1 text-[10px] font-bold text-slate-600 dark:text-slate-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition">
                                                {totalCurrent > 0 ? formatCompactCurrency(totalCurrent) : '-'}
                                            </div>

                                            {/* Container das Duas Barras (Ano Anterior vs. Ano Selecionado) */}
                                            <div className="w-full flex items-end justify-center gap-1 h-32">
                                                {/* Barra 1: Ano Anterior (Cinza / Histórico de Referência) */}
                                                <div 
                                                    className="w-1/2 max-w-[12px] bg-slate-200 dark:bg-slate-700/70 rounded-t-sm transition-all duration-300 group-hover:bg-slate-300 dark:group-hover:bg-slate-600 relative"
                                                    style={{ height: `${Math.max(prevHeightPct, 2)}%` }}
                                                    title={`${item.month_name}/${selectedYear - 1}: ${formatCurrency(item.prev_year_completed)}`}
                                                ></div>

                                                {/* Barra 2: Ano Selecionado (Verde Realizado + Índigo Previsto) */}
                                                <div className="w-1/2 max-w-[14px] h-full flex flex-col justify-end">
                                                    {currentHeightPct > 0 ? (
                                                        <div
                                                            className="w-full flex flex-col justify-end transition-all duration-300 rounded-t-sm overflow-hidden"
                                                            style={{ height: `${Math.max(currentHeightPct, 4)}%` }}
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
                                                        <div className="w-full h-1 bg-slate-200 dark:bg-slate-700/60 mt-auto rounded-t-xs"></div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Rótulo do Mês e Badge de Crescimento YoY */}
                                            <div className="mt-2 text-center w-full">
                                                <span className={`text-[11px] block font-semibold leading-tight ${
                                                    item.is_current
                                                        ? 'text-indigo-600 dark:text-indigo-400 font-extrabold'
                                                        : 'text-slate-700 dark:text-slate-300'
                                                }`}>
                                                    {item.month_name}
                                                </span>
                                                {item.is_current ? (
                                                    <span className="inline-block mt-0.5 px-1 py-0.2 text-[8px] font-bold bg-indigo-600 text-white rounded leading-none">
                                                        Hoje
                                                    </span>
                                                ) : (
                                                    item.prev_year_completed > 0 && (
                                                        <span className={`inline-block mt-0.5 text-[8px] font-semibold ${
                                                            item.growth_prev_year_pct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'
                                                        }`}>
                                                            {item.growth_prev_year_pct >= 0 ? `+${item.growth_prev_year_pct}%` : `${item.growth_prev_year_pct}%`}
                                                        </span>
                                                    )
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Tooltip Dinâmico ao passar o mouse ou focar */}
                        {activeTooltip && (
                            <div className="absolute top-0 right-4 z-20 bg-slate-900 text-white dark:bg-slate-800 px-4 py-3 rounded-2xl shadow-2xl border border-slate-700 text-xs pointer-events-none transition-all animate-in fade-in zoom-in-95 min-w-[240px]">
                                <div className="flex items-center justify-between gap-3 border-b border-slate-700/80 pb-2 mb-2 font-bold">
                                    <span className="flex items-center gap-1.5 text-indigo-300">
                                        <Calendar className="w-3.5 h-3.5" /> {activeTooltip.month_name} de {selectedYear}
                                    </span>
                                    {activeTooltip.is_current && (
                                        <span className="text-[10px] bg-indigo-500 px-1.5 py-0.5 rounded text-white">Mês Atual</span>
                                    )}
                                </div>
                                <div className="space-y-1.5">
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
                                        <span className="text-slate-200">Total {selectedYear}:</span>
                                        <span className="text-white">{formatCurrency(activeTooltip.total_active)}</span>
                                    </div>

                                    {/* Comparativo com mesmo mês no ano anterior */}
                                    <div className="border-t border-slate-700/80 pt-1.5 mt-1.5 space-y-1 text-slate-300">
                                        <div className="flex justify-between gap-4">
                                            <span className="flex items-center gap-1 text-slate-400">
                                                <History className="w-3 h-3" /> {activeTooltip.month_name}/{selectedYear - 1}:
                                            </span>
                                            <span className="font-medium text-slate-300">{formatCurrency(activeTooltip.prev_year_completed)}</span>
                                        </div>
                                        <div className="flex justify-between gap-4">
                                            <span className="text-slate-400">Variação YoY:</span>
                                            <span className={`font-bold flex items-center gap-0.5 ${
                                                activeTooltip.diff_prev_year >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                            }`}>
                                                {activeTooltip.diff_prev_year >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                                                {formatCurrency(activeTooltip.diff_prev_year)} ({activeTooltip.growth_prev_year_pct}%)
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <p className="text-[10px] text-slate-400 mt-2 italic border-t border-slate-700/60 pt-1.5">
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
