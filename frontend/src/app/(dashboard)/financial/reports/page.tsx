'use client';

import { useState, useEffect, useMemo } from 'react';
import {
    BarChart3, ArrowLeft, CalendarDays, Filter, Download, FileSpreadsheet,
    FileText, TrendingUp, TrendingDown, Award, FolderTree, Search,
    ChevronDown, ChevronRight, Layers, RefreshCw, Loader2, ShieldAlert, X, Building2
} from 'lucide-react';
import { toast } from 'sonner';
import { getToken } from '@/lib/auth';
import Link from 'next/link';

const fmtBRL = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

const getCategoryHierarchyName = (cat: any, categories: any[]) => {
    let current = cat;
    const names: string[] = [];
    let safe = 0;
    while (current && safe < 10) {
        names.unshift(current.name);
        current = current.parent_id ? categories.find((c: any) => c.id === current.parent_id) : null;
        safe++;
    }
    return names.join(' > ');
};

export default function FinancialReportsPage() {
    const [activeViewTab, setActiveViewTab] = useState<'SYNTHETIC_360' | 'DRE'>('SYNTHETIC_360');

    // Shared auxiliary data
    const [accounts, setAccounts] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);

    // ==================== STATE: SYNTHETIC 360° ====================
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-01-01`;
    });
    const [endDate, setEndDate] = useState(() => {
        const d = new Date();
        const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        return `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
    });
    const [groupBy, setGroupBy] = useState<'year' | 'month' | 'day'>('month');
    const [statusScope, setStatusScope] = useState<'PAID' | 'OPEN' | 'ALL'>('PAID');
    const [typeFilter, setTypeFilter] = useState<string>('');
    const [categoryId, setCategoryId] = useState<string>('');
    const [accountId, setAccountId] = useState<string>('');
    const [entitySearch, setEntitySearch] = useState<string>('');
    const [appliedEntitySearch, setAppliedEntitySearch] = useState<string>('');
    const [includePersonal, setIncludePersonal] = useState<boolean>(false);

    const [syntheticData, setSyntheticData] = useState<any>(null);
    const [loadingSynthetic, setLoadingSynthetic] = useState<boolean>(true);
    const [categoryDisplayMode, setCategoryDisplayMode] = useState<'CARDS' | 'MATRIX'>('CARDS');
    const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
    const [rankingLimit, setRankingLimit] = useState<number>(15);

    // Export Controls
    const [exportModel, setExportModel] = useState<'executive_360' | 'category_matrix' | 'abc_ranking'>('executive_360');
    const [exportingFormat, setExportingFormat] = useState<'excel' | 'pdf' | null>(null);

    // ==================== STATE: DRE ====================
    const [dreReports, setDreReports] = useState<any[]>([]);
    const [dreAccountFilter, setDreAccountFilter] = useState('');
    const [dreMonthYear, setDreMonthYear] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
    const [dreRegime, setDreRegime] = useState<'COMPETENCIA' | 'CAIXA'>('COMPETENCIA');
    const [loadingDre, setLoadingDre] = useState(false);

    useEffect(() => {
        fetchAccounts();
        fetchCategories();
    }, []);

    useEffect(() => {
        if (activeViewTab === 'SYNTHETIC_360') {
            fetchSyntheticOverview();
        }
    }, [activeViewTab, startDate, endDate, groupBy, statusScope, typeFilter, categoryId, accountId, appliedEntitySearch, includePersonal]);

    useEffect(() => {
        if (activeViewTab === 'DRE') {
            fetchDreReports();
        }
    }, [activeViewTab, dreAccountFilter, dreMonthYear, dreRegime]);

    const fetchAccounts = async () => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/accounts?active_only=true`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (res.ok) setAccounts(await res.json());
        } catch (e) {
            toast.error("Erro ao carregar contas");
        }
    };

    const fetchCategories = async () => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/categories`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (res.ok) setCategories(await res.json());
        } catch (e) {
            toast.error("Erro ao carregar categorias");
        }
    };

    const sortedCategories = useMemo(() => {
        return [...categories]
            .filter(c => !typeFilter || c.type === typeFilter)
            .map(c => ({ ...c, fullName: getCategoryHierarchyName(c, categories) }))
            .sort((a, b) => a.fullName.localeCompare(b.fullName));
    }, [categories, typeFilter]);

    const fetchSyntheticOverview = async () => {
        setLoadingSynthetic(true);
        try {
            const url = new URL(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/reports/synthetic-overview`);
            if (startDate) url.searchParams.append('start_date', startDate);
            if (endDate) url.searchParams.append('end_date', endDate);
            url.searchParams.append('group_by', groupBy);
            url.searchParams.append('status_scope', statusScope);
            if (typeFilter) url.searchParams.append('type', typeFilter);
            if (categoryId) url.searchParams.append('category_id', categoryId);
            if (accountId) url.searchParams.append('account_id', accountId);
            if (appliedEntitySearch) url.searchParams.append('entity_search', appliedEntitySearch);
            if (includePersonal) url.searchParams.append('include_personal', 'true');

            const res = await fetch(url.toString(), {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (!res.ok) throw new Error("Falha ao carregar relatório sintético.");
            setSyntheticData(await res.json());
        } catch (e: any) {
            toast.error(e.message || "Erro ao carregar relatório sintético");
        } finally {
            setLoadingSynthetic(false);
        }
    };

    const handleExportSynthetic = async (format: 'excel' | 'pdf') => {
        setExportingFormat(format);
        try {
            const url = new URL(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/reports/synthetic-overview/export`);
            url.searchParams.append('format', format);
            url.searchParams.append('model', exportModel);
            if (startDate) url.searchParams.append('start_date', startDate);
            if (endDate) url.searchParams.append('end_date', endDate);
            url.searchParams.append('group_by', groupBy);
            url.searchParams.append('status_scope', statusScope);
            if (typeFilter) url.searchParams.append('type', typeFilter);
            if (categoryId) url.searchParams.append('category_id', categoryId);
            if (accountId) url.searchParams.append('account_id', accountId);
            if (appliedEntitySearch) url.searchParams.append('entity_search', appliedEntitySearch);
            if (includePersonal) url.searchParams.append('include_personal', 'true');

            const res = await fetch(url.toString(), {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || "Erro ao gerar exportação.");
            }
            const blob = await res.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            const ext = format === 'excel' ? 'xlsx' : 'pdf';
            a.download = `Relatorio_Financeiro_${exportModel}.${ext}`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(downloadUrl);
            toast.success(`Relatório (${format.toUpperCase()}) gerado com sucesso!`);
        } catch (e: any) {
            toast.error(e.message || "Erro ao exportar relatório.");
        } finally {
            setExportingFormat(null);
        }
    };

    const applyPeriodPreset = (preset: 'THIS_MONTH' | 'LAST_MONTH' | 'THIS_QUARTER' | 'THIS_YEAR' | 'ALL') => {
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();
        if (preset === 'THIS_MONTH') {
            const last = new Date(y, m + 1, 0);
            setStartDate(`${y}-${String(m + 1).padStart(2, '0')}-01`);
            setEndDate(`${y}-${String(m + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`);
        } else if (preset === 'LAST_MONTH') {
            const first = new Date(y, m - 1, 1);
            const last = new Date(y, m, 0);
            setStartDate(`${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-01`);
            setEndDate(`${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`);
        } else if (preset === 'THIS_QUARTER') {
            const first = new Date(y, m - 2, 1);
            const last = new Date(y, m + 1, 0);
            setStartDate(`${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-01`);
            setEndDate(`${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`);
        } else if (preset === 'THIS_YEAR') {
            setStartDate(`${y}-01-01`);
            setEndDate(`${y}-12-31`);
        } else {
            setStartDate('');
            setEndDate('');
        }
    };

    const fetchDreReports = async () => {
        setLoadingDre(true);
        try {
            const url = new URL(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/reports/dre`);
            url.searchParams.append('month_year', dreMonthYear);
            url.searchParams.append('regime', dreRegime);
            if (dreAccountFilter) url.searchParams.append('account_id', dreAccountFilter);

            const res = await fetch(url.toString(), {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (res.ok) {
                setDreReports(await res.json());
            }
        } catch (e) {
            toast.error("Erro ao carregar DRE");
        } finally {
            setLoadingDre(false);
        }
    };

    // DRE Calculations
    const getGroupTotal = (group: string) => dreReports.filter(r => r.dre_group === group).reduce((acc, curr) => acc + curr.total, 0);
    const receitaBrutaTotal = getGroupTotal('1_Receita_Bruta');
    const deducoesTotal = getGroupTotal('2_Deducoes_Tributos');
    const receitaLiquida = receitaBrutaTotal - deducoesTotal;
    const custoVariavelTotal = getGroupTotal('3_Custo_Variavel');
    const margemContribuicao = receitaLiquida - custoVariavelTotal;
    const despesasFixasTotal = getGroupTotal('4_Despesa_Fixa_Operacional');
    const ebitda = margemContribuicao - despesasFixasTotal;
    const despesasNaoOpTotal = getGroupTotal('5_Despesa_Nao_Operacional');
    const lucroLiquido = ebitda - despesasNaoOpTotal;

    const renderGroupRows = (group: string) => {
        const items = dreReports.filter(r => r.dre_group === group).sort((a: any, b: any) => b.total - a.total);
        if (items.length === 0) return <div className="text-xs text-slate-500 italic py-1">Sem movimentações nessa conta.</div>;

        return items.map((r, i) => {
            const pct = receitaBrutaTotal > 0 ? ((r.total / receitaBrutaTotal) * 100).toFixed(1) : '0.0';
            return (
                <div key={i} className="flex justify-between items-center py-1.5 border-b border-slate-800/30 last:border-0 hover:bg-slate-800/50 -mx-4 px-8 transition">
                    <span className="text-sm text-slate-400 flex items-center pl-4">{r.category}</span>
                    <div className="flex items-center gap-4">
                        <span className="text-xs font-mono text-slate-500 hidden sm:block">{pct}%</span>
                        <span className="text-sm font-medium text-slate-300 min-w-[100px] text-right">{fmtBRL(r.total)}</span>
                    </div>
                </div>
            );
        });
    };

    const kpis = syntheticData?.kpis || {};
    const timeline: any[] = syntheticData?.timeline || [];
    const periodColumns: any[] = syntheticData?.period_columns || [];
    const categoriesPayable: any[] = syntheticData?.categories_payable || [];
    const categoriesReceivable: any[] = syntheticData?.categories_receivable || [];
    const rankingPayables: any[] = syntheticData?.ranking_payables || [];
    const rankingReceivables: any[] = syntheticData?.ranking_receivables || [];

    const maxTimelineVal = useMemo(() => {
        if (!timeline.length) return 100;
        return Math.max(...timeline.map(t => Math.max(t.receivables || 0, t.payables || 0, 1)));
    }, [timeline]);

    const toggleExpandCategory = (key: string) => {
        setExpandedCategories(prev => ({ ...prev, [key]: !prev[key] }));
    };

    return (
        <div className="p-3 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-6">
            {/* Top Bar Navigation & Mode Switcher */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <Link href="/financial" className="text-slate-500 hover:text-slate-800 flex items-center gap-2 dark:text-slate-400 dark:hover:text-white font-medium w-fit text-sm">
                    <ArrowLeft className="w-4 h-4" /> Voltar para Gestão Financeira
                </Link>

                <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-2xl border border-slate-200 dark:border-slate-800 self-start sm:self-auto">
                    <button
                        onClick={() => setActiveViewTab('SYNTHETIC_360')}
                        className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 ${
                            activeViewTab === 'SYNTHETIC_360'
                                ? 'bg-[var(--color-primary-base)] text-white shadow'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                    >
                        <Layers className="w-4 h-4" />
                        Painel Sintético & Rankings 360°
                    </button>
                    <button
                        onClick={() => setActiveViewTab('DRE')}
                        className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 ${
                            activeViewTab === 'DRE'
                                ? 'bg-[var(--color-primary-base)] text-white shadow'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                    >
                        <BarChart3 className="w-4 h-4" />
                        DRE Estruturado
                    </button>
                </div>
            </div>

            {activeViewTab === 'SYNTHETIC_360' ? (
                <>
                    {/* Header + Central de Exportação */}
                    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
                        <div>
                            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                                <BarChart3 className="h-8 w-8 text-[var(--color-primary-base)] shrink-0" />
                                Relatório Sintético & Rankings 360°
                            </h1>
                            <p className="text-xs sm:text-sm text-slate-500 mt-1.5 dark:text-slate-400">
                                Análise consolidada do que já foi pago e recebido por Categoria, Evolução Temporal (Ano, Mês, Dia) e Ranking Curva ABC de Fornecedores e Clientes.
                            </p>
                        </div>

                        {/* Export Model & Format Box */}
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-slate-50 dark:bg-slate-900/90 p-2.5 rounded-2xl border border-slate-200 dark:border-slate-800">
                            <div className="flex flex-col px-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Modelo de Exportação</span>
                                <select
                                    value={exportModel}
                                    onChange={(e) => setExportModel(e.target.value as any)}
                                    className="bg-transparent text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 outline-none py-0.5 cursor-pointer"
                                >
                                    <option value="executive_360">Modelo 1: Executivo Geral 360° (Completo)</option>
                                    <option value="category_matrix">Modelo 2: Matriz Sintética Categorias x Tempo</option>
                                    <option value="abc_ranking">Modelo 3: Ranking Curva ABC (Fornecedores & Clientes)</option>
                                </select>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleExportSynthetic('excel')}
                                    disabled={exportingFormat !== null}
                                    className="flex-1 sm:flex-initial px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm whitespace-nowrap"
                                >
                                    {exportingFormat === 'excel' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                                    Excel (.xlsx)
                                </button>
                                <button
                                    onClick={() => handleExportSynthetic('pdf')}
                                    disabled={exportingFormat !== null}
                                    className="flex-1 sm:flex-initial px-3.5 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm whitespace-nowrap"
                                >
                                    {exportingFormat === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                                    PDF (.pdf)
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Barra de Filtros e Agrupamentos */}
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm space-y-4">
                        {/* Linha 1: Agrupamento (Ano/Mês/Dia), Status (Pago/Aberto/Todos) e Atalhos de Período */}
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 mr-1">Agrupar por:</span>
                                <div className="flex bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
                                    {([
                                        { id: 'year', label: 'Ano' },
                                        { id: 'month', label: 'Mês' },
                                        { id: 'day', label: 'Dia' }
                                    ] as const).map(g => (
                                        <button
                                            key={g.id}
                                            onClick={() => setGroupBy(g.id)}
                                            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
                                                groupBy === g.id
                                                    ? 'bg-indigo-600 text-white shadow-sm'
                                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                            }`}
                                        >
                                            {g.label}
                                        </button>
                                    ))}
                                </div>

                                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 ml-2 mr-1">Regime / Status:</span>
                                <div className="flex bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
                                    {([
                                        { id: 'PAID', label: 'Já Pago / Recebido' },
                                        { id: 'OPEN', label: 'Em Aberto' },
                                        { id: 'ALL', label: 'Consolidado' }
                                    ] as const).map(st => (
                                        <button
                                            key={st.id}
                                            onClick={() => setStatusScope(st.id)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                                                statusScope === st.id
                                                    ? 'bg-emerald-600 text-white shadow-sm'
                                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                            }`}
                                        >
                                            {st.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Atalhos Rápidos de Data */}
                            <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-[11px] font-semibold text-slate-400 mr-1">Período rápido:</span>
                                {[
                                    { id: 'THIS_MONTH', label: 'Este Mês' },
                                    { id: 'LAST_MONTH', label: 'Mês Passado' },
                                    { id: 'THIS_QUARTER', label: 'Trimestre' },
                                    { id: 'THIS_YEAR', label: 'Este Ano' },
                                    { id: 'ALL', label: 'Tudo' }
                                ].map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => applyPeriodPreset(p.id as any)}
                                        className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
                                    >
                                        {p.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Linha 2: Datas, Tipo, Categoria, Fornecedor/Cliente, Conta Bancária */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                            <div>
                                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">Data Inicial</label>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500"
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">Data Final</label>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500"
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">Tipo Movimento</label>
                                <select
                                    value={typeFilter}
                                    onChange={(e) => setTypeFilter(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500"
                                >
                                    <option value="">Pagamentos & Recebimentos</option>
                                    <option value="PAYABLE">Somente Pagamentos (Saídas)</option>
                                    <option value="RECEIVABLE">Somente Recebimentos (Entradas)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">Categoria / Subcategoria</label>
                                <select
                                    value={categoryId}
                                    onChange={(e) => setCategoryId(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500"
                                >
                                    <option value="">Todas as Categorias</option>
                                    {sortedCategories.map(c => (
                                        <option key={c.id} value={c.id}>
                                            {c.type === 'RECEIVABLE' ? '🟢 ' : '🔴 '}{c.fullName}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">Conta / Banco</label>
                                <select
                                    value={accountId}
                                    onChange={(e) => setAccountId(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500"
                                >
                                    <option value="">Todas as Contas</option>
                                    {accounts.map(acc => (
                                        <option key={acc.id} value={acc.id}>{acc.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">Fornecedor / Cliente</label>
                                <div className="flex items-center gap-1">
                                    <div className="relative flex-1">
                                        <input
                                            type="text"
                                            placeholder="Buscar nome, CNPJ..."
                                            value={entitySearch}
                                            onChange={(e) => setEntitySearch(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') setAppliedEntitySearch(entitySearch);
                                            }}
                                            className="w-full pl-3 pr-7 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500"
                                        />
                                        {entitySearch && (
                                            <button
                                                onClick={() => {
                                                    setEntitySearch('');
                                                    setAppliedEntitySearch('');
                                                }}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => setAppliedEntitySearch(entitySearch)}
                                        className="p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition shrink-0"
                                        title="Filtrar Fornecedor/Cliente"
                                    >
                                        <Search className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Linha 3: Filtros ativos e toggle pessoal */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                            <div className="flex flex-wrap items-center gap-2">
                                {(categoryId || appliedEntitySearch || typeFilter || accountId) && (
                                    <button
                                        onClick={() => {
                                            setCategoryId('');
                                            setEntitySearch('');
                                            setAppliedEntitySearch('');
                                            setTypeFilter('');
                                            setAccountId('');
                                        }}
                                        className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1"
                                    >
                                        <X className="w-3.5 h-3.5" /> Limpar filtros ativos
                                    </button>
                                )}
                                {appliedEntitySearch && (
                                    <span className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-xs font-semibold border border-indigo-200 dark:border-indigo-800">
                                        Parceiro: &ldquo;{appliedEntitySearch}&rdquo;
                                    </span>
                                )}
                            </div>

                            <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={includePersonal}
                                    onChange={(e) => setIncludePersonal(e.target.checked)}
                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                Incluir contas pessoais e lançamentos ocultos
                            </label>
                        </div>
                    </div>

                    {loadingSynthetic ? (
                        <div className="flex flex-col items-center justify-center h-64 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                            <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-2" />
                            <p className="text-sm text-slate-500">Consolidando categorias, evolução temporal e rankings...</p>
                        </div>
                    ) : (
                        <>
                            {/* BLOCO 1: CARDS EXECUTIVOS (KPIs) */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                {/* Card 1: Total Recebido */}
                                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                            {statusScope === 'PAID' ? 'Total Já Recebido' : statusScope === 'OPEN' ? 'Total a Receber' : 'Recebimentos Totais'}
                                        </span>
                                        <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                                            <TrendingUp className="w-5 h-5" />
                                        </div>
                                    </div>
                                    <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                                        {fmtBRL(kpis.total_received)}
                                    </div>
                                    <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                                        <span><strong>{kpis.received_count || 0}</strong> títulos</span>
                                        <span>Ticket médio: <strong>{fmtBRL(kpis.avg_ticket_received)}</strong></span>
                                    </div>
                                </div>

                                {/* Card 2: Total Pago */}
                                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                            {statusScope === 'PAID' ? 'Total Já Pago' : statusScope === 'OPEN' ? 'Total a Pagar' : 'Pagamentos Totais'}
                                        </span>
                                        <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
                                            <TrendingDown className="w-5 h-5" />
                                        </div>
                                    </div>
                                    <div className="text-2xl font-black text-rose-600 dark:text-rose-400">
                                        {fmtBRL(kpis.total_paid)}
                                    </div>
                                    <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                                        <span><strong>{kpis.paid_count || 0}</strong> pagamentos</span>
                                        <span>Comprometimento: <strong>{kpis.expense_commitment_pct || 0}%</strong></span>
                                    </div>
                                </div>

                                {/* Card 3: Geração Líquida de Caixa */}
                                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                            Resultado Líquido (Caixa)
                                        </span>
                                        <div className={`p-2 rounded-xl ${(kpis.net_cashflow || 0) >= 0 ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400' : 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'}`}>
                                            <BarChart3 className="w-5 h-5" />
                                        </div>
                                    </div>
                                    <div className={`text-2xl font-black ${(kpis.net_cashflow || 0) >= 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                        {fmtBRL(kpis.net_cashflow)}
                                    </div>
                                    <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                                        <span>Margem de Caixa:</span>
                                        <strong className={(kpis.cash_margin_pct || 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                                            {kpis.cash_margin_pct || 0}%
                                        </strong>
                                    </div>
                                </div>

                                {/* Card 4: Destaques #1 */}
                                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                            Top Concentração (#1)
                                        </span>
                                        <Award className="w-4 h-4 text-amber-500" />
                                    </div>
                                    <div className="text-xs space-y-1.5">
                                        <div className="flex justify-between items-center gap-2">
                                            <span className="text-slate-400 shrink-0">Maior Gasto:</span>
                                            <span className="font-bold text-rose-600 dark:text-rose-400 truncate" title={kpis.top_payable_entity?.name || '-'}>
                                                {kpis.top_payable_entity ? `${kpis.top_payable_entity.name} (${kpis.top_payable_entity.pct}%)` : '-'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center gap-2">
                                            <span className="text-slate-400 shrink-0">Maior Cliente:</span>
                                            <span className="font-bold text-emerald-600 dark:text-emerald-400 truncate" title={kpis.top_receivable_entity?.name || '-'}>
                                                {kpis.top_receivable_entity ? `${kpis.top_receivable_entity.name} (${kpis.top_receivable_entity.pct}%)` : '-'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center gap-2">
                                            <span className="text-slate-400 shrink-0">Top Categoria:</span>
                                            <span className="font-bold text-slate-700 dark:text-slate-200 truncate" title={kpis.top_payable_category?.name || '-'}>
                                                {kpis.top_payable_category ? `${kpis.top_payable_category.name} (${kpis.top_payable_category.pct}%)` : '-'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* BLOCO 2: EVOLUÇÃO TEMPORAL AGRUPADA (ANO / MÊS / DIA) */}
                            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                                <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <div>
                                        <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                            <CalendarDays className="w-5 h-5 text-indigo-600" />
                                            1. Evolução Temporal por {groupBy === 'year' ? 'Ano' : groupBy === 'day' ? 'Dia' : 'Mês'}
                                        </h2>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                            Comparativo direto de entradas e saídas agrupado por {groupBy === 'year' ? 'ano' : groupBy === 'day' ? 'dia' : 'mês'} com saldo acumulado do período.
                                        </p>
                                    </div>
                                    <span className="text-xs font-bold px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 self-start sm:self-auto">
                                        {timeline.length} {timeline.length === 1 ? 'período' : 'períodos'}
                                    </span>
                                </div>

                                {timeline.length === 0 ? (
                                    <div className="p-8 text-center text-sm text-slate-500">
                                        Nenhuma movimentação encontrada para os filtros selecionados.
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                                    <th className="py-3 px-4">Período</th>
                                                    <th className="py-3 px-4 hidden md:table-cell w-48">Termômetro (Entradas vs Saídas)</th>
                                                    <th className="py-3 px-4 text-right">Recebimentos (R$)</th>
                                                    <th className="py-3 px-4 text-right">Pagamentos (R$)</th>
                                                    <th className="py-3 px-4 text-right">Resultado Período</th>
                                                    <th className="py-3 px-4 text-right">Saldo Acumulado</th>
                                                    <th className="py-3 px-4 text-right">% Margem</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 text-xs sm:text-sm">
                                                {timeline.map((item) => {
                                                    const recPct = Math.min(100, Math.round((item.receivables / maxTimelineVal) * 100));
                                                    const payPct = Math.min(100, Math.round((item.payables / maxTimelineVal) * 100));
                                                    return (
                                                        <tr key={item.period_key} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                                                            <td className="py-3 px-4 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                                                                {item.period_label}
                                                            </td>
                                                            <td className="py-3 px-4 hidden md:table-cell">
                                                                <div className="space-y-1">
                                                                    <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                                                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${recPct}%` }} />
                                                                    </div>
                                                                    <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                                                        <div className="h-full bg-rose-500 rounded-full" style={{ width: `${payPct}%` }} />
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="py-3 px-4 text-right font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                                                                {fmtBRL(item.receivables)}
                                                                <span className="block text-[10px] font-normal text-slate-400">{item.receivables_count} baixas</span>
                                                            </td>
                                                            <td className="py-3 px-4 text-right font-semibold text-rose-600 dark:text-rose-400 whitespace-nowrap">
                                                                {fmtBRL(item.payables)}
                                                                <span className="block text-[10px] font-normal text-slate-400">{item.payables_count} baixas</span>
                                                            </td>
                                                            <td className={`py-3 px-4 text-right font-bold whitespace-nowrap ${item.net_result >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                                                {item.net_result >= 0 ? '+' : ''}{fmtBRL(item.net_result)}
                                                            </td>
                                                            <td className={`py-3 px-4 text-right font-semibold whitespace-nowrap ${item.cumulative_balance >= 0 ? 'text-slate-800 dark:text-slate-200' : 'text-rose-500'}`}>
                                                                {fmtBRL(item.cumulative_balance)}
                                                            </td>
                                                            <td className="py-3 px-4 text-right font-mono text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                                                {item.margin_pct}%
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            {/* BLOCO 3: SINTÉTICO POR CATEGORIA (O QUE JÁ PAGUEI / O QUE JÁ RECEBI + MATRIZ) */}
                            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                                <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div>
                                        <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                            <FolderTree className="w-5 h-5 text-indigo-600" />
                                            2. Relatório Sintético por Categoria (Pagamentos e Recebimentos)
                                        </h2>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                            Clique em qualquer categoria para expandir os principais fornecedores/clientes ou alterne para a Matriz Temporal.
                                        </p>
                                    </div>

                                    <div className="flex bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800 self-start sm:self-auto">
                                        <button
                                            onClick={() => setCategoryDisplayMode('CARDS')}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                                                categoryDisplayMode === 'CARDS'
                                                    ? 'bg-indigo-600 text-white shadow-sm'
                                                    : 'text-slate-600 dark:text-slate-400'
                                            }`}
                                        >
                                            Sintético + Drill-down
                                        </button>
                                        <button
                                            onClick={() => setCategoryDisplayMode('MATRIX')}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                                                categoryDisplayMode === 'MATRIX'
                                                    ? 'bg-indigo-600 text-white shadow-sm'
                                                    : 'text-slate-600 dark:text-slate-400'
                                            }`}
                                        >
                                            Matriz Categoria x {groupBy === 'year' ? 'Ano' : groupBy === 'day' ? 'Dia' : 'Mês'}
                                        </button>
                                    </div>
                                </div>

                                {categoryDisplayMode === 'CARDS' ? (
                                    <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
                                        {/* Coluna Esquerda: O QUE JÁ PAGUEI POR CATEGORIA */}
                                        <div className="p-4 sm:p-5 space-y-3">
                                            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                                                <h3 className="text-sm font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider flex items-center gap-2">
                                                    🔴 O Que Já Paguei por Categoria ({categoriesPayable.length})
                                                </h3>
                                                <span className="text-sm font-black text-rose-600 dark:text-rose-400">
                                                    {fmtBRL(kpis.total_paid)}
                                                </span>
                                            </div>

                                            {categoriesPayable.length === 0 ? (
                                                <p className="text-xs text-slate-400 italic py-4">Nenhum pagamento registrado para este filtro.</p>
                                            ) : (
                                                <div className="space-y-2 max-h-[540px] overflow-y-auto pr-1">
                                                    {categoriesPayable.map((cat, idx) => {
                                                        const expKey = `PAY_${cat.category_id}`;
                                                        const isExp = !!expandedCategories[expKey];
                                                        return (
                                                            <div key={expKey} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 overflow-hidden">
                                                                <div
                                                                    onClick={() => toggleExpandCategory(expKey)}
                                                                    className="p-3 cursor-pointer hover:bg-slate-100/70 dark:hover:bg-slate-800/40 transition"
                                                                >
                                                                    <div className="flex items-center justify-between gap-2">
                                                                        <div className="flex items-center gap-2 min-w-0">
                                                                            {isExp ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                                                                            <span className="text-xs font-black text-slate-400">#{idx + 1}</span>
                                                                            <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 truncate" title={cat.category_name}>
                                                                                {cat.category_name}
                                                                            </span>
                                                                        </div>
                                                                        <div className="text-right shrink-0">
                                                                            <span className="text-xs sm:text-sm font-black text-rose-600 dark:text-rose-400">
                                                                                {fmtBRL(cat.total)}
                                                                            </span>
                                                                            <span className="ml-2 text-[11px] font-mono font-bold px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300">
                                                                                {cat.share_pct}%
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                                                                        <span>{cat.count} lançamentos</span>
                                                                        <span>Média/{groupBy === 'year' ? 'ano' : groupBy === 'day' ? 'dia' : 'mês'}: <strong>{fmtBRL(cat.avg_per_period)}</strong></span>
                                                                    </div>
                                                                    <div className="mt-1.5 h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                                                                        <div className="h-full bg-rose-500 rounded-full" style={{ width: `${Math.min(100, cat.share_pct)}%` }} />
                                                                    </div>
                                                                </div>

                                                                {isExp && (
                                                                    <div className="px-4 py-2.5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 text-xs space-y-1.5">
                                                                        <div className="flex items-center justify-between">
                                                                            <span className="font-bold text-slate-500 uppercase text-[10px]">Principais Fornecedores / Favorecidos nesta Categoria:</span>
                                                                            {cat.category_id > 0 && (
                                                                                <button
                                                                                    onClick={() => setCategoryId(String(cat.category_id))}
                                                                                    className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                                                                                >
                                                                                    Isolar Categoria
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                        {cat.top_entities?.map((ent: any, i: number) => (
                                                                            <div key={i} className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                                                                                <span className="text-slate-700 dark:text-slate-300 truncate pr-2">
                                                                                    • {ent.name} <span className="text-slate-400">({ent.count}x)</span>
                                                                                </span>
                                                                                <span className="font-bold text-slate-900 dark:text-white shrink-0">{fmtBRL(ent.total)}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>

                                        {/* Coluna Direita: O QUE JÁ RECEBI POR CATEGORIA */}
                                        <div className="p-4 sm:p-5 space-y-3">
                                            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                                                <h3 className="text-sm font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                                                    🟢 O Que Já Recebi por Categoria ({categoriesReceivable.length})
                                                </h3>
                                                <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                                                    {fmtBRL(kpis.total_received)}
                                                </span>
                                            </div>

                                            {categoriesReceivable.length === 0 ? (
                                                <p className="text-xs text-slate-400 italic py-4">Nenhum recebimento registrado para este filtro.</p>
                                            ) : (
                                                <div className="space-y-2 max-h-[540px] overflow-y-auto pr-1">
                                                    {categoriesReceivable.map((cat, idx) => {
                                                        const expKey = `REC_${cat.category_id}`;
                                                        const isExp = !!expandedCategories[expKey];
                                                        return (
                                                            <div key={expKey} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 overflow-hidden">
                                                                <div
                                                                    onClick={() => toggleExpandCategory(expKey)}
                                                                    className="p-3 cursor-pointer hover:bg-slate-100/70 dark:hover:bg-slate-800/40 transition"
                                                                >
                                                                    <div className="flex items-center justify-between gap-2">
                                                                        <div className="flex items-center gap-2 min-w-0">
                                                                            {isExp ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                                                                            <span className="text-xs font-black text-slate-400">#{idx + 1}</span>
                                                                            <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 truncate" title={cat.category_name}>
                                                                                {cat.category_name}
                                                                            </span>
                                                                        </div>
                                                                        <div className="text-right shrink-0">
                                                                            <span className="text-xs sm:text-sm font-black text-emerald-600 dark:text-emerald-400">
                                                                                {fmtBRL(cat.total)}
                                                                            </span>
                                                                            <span className="ml-2 text-[11px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                                                                                {cat.share_pct}%
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                                                                        <span>{cat.count} lançamentos</span>
                                                                        <span>Média/{groupBy === 'year' ? 'ano' : groupBy === 'day' ? 'dia' : 'mês'}: <strong>{fmtBRL(cat.avg_per_period)}</strong></span>
                                                                    </div>
                                                                    <div className="mt-1.5 h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                                                                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, cat.share_pct)}%` }} />
                                                                    </div>
                                                                </div>

                                                                {isExp && (
                                                                    <div className="px-4 py-2.5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 text-xs space-y-1.5">
                                                                        <div className="flex items-center justify-between">
                                                                            <span className="font-bold text-slate-500 uppercase text-[10px]">Principais Clientes nesta Categoria:</span>
                                                                            {cat.category_id > 0 && (
                                                                                <button
                                                                                    onClick={() => setCategoryId(String(cat.category_id))}
                                                                                    className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                                                                                >
                                                                                    Isolar Categoria
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                        {cat.top_entities?.map((ent: any, i: number) => (
                                                                            <div key={i} className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                                                                                <span className="text-slate-700 dark:text-slate-300 truncate pr-2">
                                                                                    • {ent.name} <span className="text-slate-400">({ent.count}x)</span>
                                                                                </span>
                                                                                <span className="font-bold text-slate-900 dark:text-white shrink-0">{fmtBRL(ent.total)}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    /* VISÃO MATRIZ: CATEGORIAS x PERÍODO */
                                    <div className="p-4 sm:p-5 space-y-6">
                                        {[
                                            { title: 'Matriz de Pagamentos (Saídas) por Categoria', list: categoriesPayable, color: 'text-rose-600 dark:text-rose-400' },
                                            { title: 'Matriz de Recebimentos (Entradas) por Categoria', list: categoriesReceivable, color: 'text-emerald-600 dark:text-emerald-400' }
                                        ].map((sec, sIdx) => (
                                            <div key={sIdx} className="space-y-2">
                                                <h3 className={`text-xs sm:text-sm font-bold uppercase tracking-wider ${sec.color}`}>
                                                    {sec.title}
                                                </h3>
                                                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                                                    <table className="w-full text-left border-collapse text-xs">
                                                        <thead>
                                                            <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 font-bold text-slate-500">
                                                                <th className="py-2.5 px-3 min-w-[200px]">Categoria</th>
                                                                {periodColumns.map(p => (
                                                                    <th key={p.key} className="py-2.5 px-3 text-right whitespace-nowrap">{p.label}</th>
                                                                ))}
                                                                <th className="py-2.5 px-3 text-right font-black text-slate-800 dark:text-white whitespace-nowrap">Total</th>
                                                                <th className="py-2.5 px-3 text-right whitespace-nowrap">% Vert.</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                                            {sec.list.map((c: any) => (
                                                                <tr key={c.category_id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                                                                    <td className="py-2 px-3 font-semibold text-slate-800 dark:text-slate-200">{c.category_name}</td>
                                                                    {periodColumns.map(p => (
                                                                        <td key={p.key} className="py-2 px-3 text-right font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                                                            {c.by_period?.[p.key] ? fmtBRL(c.by_period[p.key]) : '-'}
                                                                        </td>
                                                                    ))}
                                                                    <td className={`py-2 px-3 text-right font-bold whitespace-nowrap ${sec.color}`}>
                                                                        {fmtBRL(c.total)}
                                                                    </td>
                                                                    <td className="py-2 px-3 text-right font-mono text-slate-500 whitespace-nowrap">
                                                                        {c.share_pct}%
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* BLOCO 4: RANKINGS CURVA ABC — QUEM MAIS PAGO vs QUEM MAIS RECEBO */}
                            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                                <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div>
                                        <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                            <Award className="w-5 h-5 text-amber-500" />
                                            3. Ranking Curva ABC — Para Quem Mais Pago vs. De Quem Mais Recebo
                                        </h2>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                            Classificação automática por volume financeiro. Clique em qualquer fornecedor ou cliente para filtrar a visão 360° apenas para ele.
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-2 self-start sm:self-auto">
                                        <span className="text-xs font-bold text-slate-400">Exibir:</span>
                                        {[10, 25, 100].map(lim => (
                                            <button
                                                key={lim}
                                                onClick={() => setRankingLimit(lim)}
                                                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                                                    rankingLimit === lim
                                                        ? 'bg-indigo-600 text-white'
                                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                                }`}
                                            >
                                                {lim === 100 ? 'Todos' : `Top ${lim}`}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
                                    {/* Ranking 1: PARA QUEM MAIS PAGO (Fornecedores / Favorecidos) */}
                                    <div className="p-4 sm:p-5 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-sm font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                                                💸 Ranking: Para Quem Mais Pago ({rankingPayables.length})
                                            </h3>
                                            <span className="text-xs text-slate-400">Fornecedores / Favorecidos</span>
                                        </div>

                                        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                                            <table className="w-full text-left border-collapse text-xs">
                                                <thead>
                                                    <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 font-bold text-slate-500 uppercase">
                                                        <th className="py-2.5 px-3 w-10">#</th>
                                                        <th className="py-2.5 px-3">Fornecedor / Favorecido</th>
                                                        <th className="py-2.5 px-3 text-center">Qtd</th>
                                                        <th className="py-2.5 px-3 text-right">Total Pago</th>
                                                        <th className="py-2.5 px-3 text-right">% Peso</th>
                                                        <th className="py-2.5 px-3 text-center">ABC</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                                    {rankingPayables.slice(0, rankingLimit).map((item) => (
                                                        <tr
                                                            key={item.rank}
                                                            onClick={() => {
                                                                setEntitySearch(item.entity_name);
                                                                setAppliedEntitySearch(item.entity_name);
                                                            }}
                                                            className="hover:bg-rose-50/40 dark:hover:bg-rose-950/20 cursor-pointer transition"
                                                            title="Clique para filtrar este fornecedor/favorecido"
                                                        >
                                                            <td className="py-2.5 px-3 font-black text-slate-400">#{item.rank}</td>
                                                            <td className="py-2.5 px-3">
                                                                <div className="font-bold text-slate-800 dark:text-slate-100 truncate max-w-[200px]" title={item.entity_name}>
                                                                    {item.entity_name}
                                                                </div>
                                                                <div className="text-[10px] text-slate-400 truncate max-w-[200px]">
                                                                    {item.main_category} {item.document ? `• ${item.document}` : ''}
                                                                </div>
                                                            </td>
                                                            <td className="py-2.5 px-3 text-center font-semibold text-slate-600 dark:text-slate-400">
                                                                {item.count}
                                                            </td>
                                                            <td className="py-2.5 px-3 text-right font-bold text-rose-600 dark:text-rose-400 whitespace-nowrap">
                                                                {fmtBRL(item.total)}
                                                            </td>
                                                            <td className="py-2.5 px-3 text-right font-mono text-slate-500 whitespace-nowrap">
                                                                {item.share_pct}%
                                                            </td>
                                                            <td className="py-2.5 px-3 text-center">
                                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                                                    item.abc_class === 'A'
                                                                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                                                        : item.abc_class === 'B'
                                                                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                                                                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                                                                }`}>
                                                                    {item.abc_class}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {rankingPayables.length === 0 && (
                                                        <tr>
                                                            <td colSpan={6} className="py-6 text-center text-slate-400 italic">
                                                                Nenhum pagamento encontrado.
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Ranking 2: DE QUEM MAIS RECEBO (Clientes) */}
                                    <div className="p-4 sm:p-5 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-sm font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                                                🏆 Ranking: De Quem Mais Recebo ({rankingReceivables.length})
                                            </h3>
                                            <span className="text-xs text-slate-400">Clientes / Pagadores</span>
                                        </div>

                                        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                                            <table className="w-full text-left border-collapse text-xs">
                                                <thead>
                                                    <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 font-bold text-slate-500 uppercase">
                                                        <th className="py-2.5 px-3 w-10">#</th>
                                                        <th className="py-2.5 px-3">Cliente / Razão Social</th>
                                                        <th className="py-2.5 px-3 text-center">Qtd</th>
                                                        <th className="py-2.5 px-3 text-right">Total Recebido</th>
                                                        <th className="py-2.5 px-3 text-right">% Share</th>
                                                        <th className="py-2.5 px-3 text-center">ABC</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                                    {rankingReceivables.slice(0, rankingLimit).map((item) => (
                                                        <tr
                                                            key={item.rank}
                                                            onClick={() => {
                                                                setEntitySearch(item.entity_name);
                                                                setAppliedEntitySearch(item.entity_name);
                                                            }}
                                                            className="hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 cursor-pointer transition"
                                                            title="Clique para filtrar este cliente"
                                                        >
                                                            <td className="py-2.5 px-3 font-black text-slate-400">#{item.rank}</td>
                                                            <td className="py-2.5 px-3">
                                                                <div className="font-bold text-slate-800 dark:text-slate-100 truncate max-w-[200px]" title={item.entity_name}>
                                                                    {item.entity_name}
                                                                </div>
                                                                <div className="text-[10px] text-slate-400 truncate max-w-[200px]">
                                                                    {item.main_category} {item.document ? `• ${item.document}` : ''}
                                                                </div>
                                                            </td>
                                                            <td className="py-2.5 px-3 text-center font-semibold text-slate-600 dark:text-slate-400">
                                                                {item.count}
                                                            </td>
                                                            <td className="py-2.5 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                                                                {fmtBRL(item.total)}
                                                            </td>
                                                            <td className="py-2.5 px-3 text-right font-mono text-slate-500 whitespace-nowrap">
                                                                {item.share_pct}%
                                                            </td>
                                                            <td className="py-2.5 px-3 text-center">
                                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                                                    item.abc_class === 'A'
                                                                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                                                        : item.abc_class === 'B'
                                                                        ? 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300'
                                                                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                                                                }`}>
                                                                    {item.abc_class}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {rankingReceivables.length === 0 && (
                                                        <tr>
                                                            <td colSpan={6} className="py-6 text-center text-slate-400 italic">
                                                                Nenhum recebimento encontrado.
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </>
            ) : (
                /* ==================== ABA 2: DRE ESTRUTURADO ==================== */
                <>
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-slate-200 dark:border-slate-800">
                        <div>
                            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                                <BarChart3 className="h-8 w-8 text-[var(--color-primary-base)]" />
                                DRE Estruturado
                            </h1>
                            <p className="text-sm text-slate-500 mt-2 dark:text-slate-400">
                                Demonstrativo de Resultados do Exercício
                            </p>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3">
                            <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl shrink-0 border border-slate-200 dark:border-slate-800">
                                <button onClick={() => setDreRegime('COMPETENCIA')} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition ${dreRegime === 'COMPETENCIA' ? 'bg-[var(--color-primary-base)] text-white shadow' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>Competência</button>
                                <button onClick={() => setDreRegime('CAIXA')} className={`px-4 py-1.5 text-xs font-bold rounded-lg transition ${dreRegime === 'CAIXA' ? 'bg-[var(--color-primary-base)] text-white shadow' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>Caixa (Realizado)</button>
                            </div>

                            <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 flex-1 min-w-[200px]">
                                <CalendarDays className="w-4 h-4 text-slate-400 shrink-0" />
                                <input type="month" value={dreMonthYear} onChange={(e) => setDreMonthYear(e.target.value)} className="w-full bg-transparent py-2.5 text-sm font-semibold outline-none text-slate-700 dark:text-slate-200" />
                            </div>

                            <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 flex-1 min-w-[180px]">
                                <Filter className="w-4 h-4 text-slate-400 shrink-0" />
                                <select value={dreAccountFilter} onChange={(e) => setDreAccountFilter(e.target.value)} className="w-full bg-transparent py-2.5 text-sm font-semibold outline-none text-slate-700 dark:text-slate-200">
                                    <option value="">Consolidado global</option>
                                    {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                    {loadingDre ? (
                        <div className="flex justify-center items-center h-48">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-primary-base)]"></div>
                        </div>
                    ) : (
                        <div className="bg-slate-950 rounded-2xl border border-slate-800 shadow-xl text-slate-100 overflow-hidden">
                            <div className="px-4 py-3 bg-slate-900 flex justify-between items-center border-b border-slate-800">
                                <span className="text-xs uppercase font-black tracking-widest text-[var(--color-primary-base)]">Indicadores / Contas</span>
                                <span className="text-xs uppercase font-black tracking-widest text-slate-500">Valores</span>
                            </div>

                            <div className="flex flex-col">
                                <div className="flex justify-between items-center px-4 py-2.5 border-b border-slate-800 border-l-2 border-l-emerald-500/80 bg-slate-900/40">
                                    <h3 className="font-semibold text-emerald-400 text-sm">1. Receita Bruta Total</h3>
                                    <span className="font-bold text-emerald-400 text-sm">{fmtBRL(receitaBrutaTotal)}</span>
                                </div>
                                <div className="px-4 py-1 border-b border-slate-800 border-l-2 border-l-transparent bg-slate-950">
                                    {renderGroupRows('1_Receita_Bruta')}
                                </div>

                                <div className="flex justify-between items-center px-4 py-2.5 border-b border-slate-800 border-l-2 border-l-rose-500/80 bg-slate-900/40">
                                    <h3 className="font-semibold text-rose-400 text-sm">2. Deduções, Abatimento e Impostos (-)</h3>
                                    <span className="font-bold text-rose-400 text-sm">{fmtBRL(deducoesTotal)}</span>
                                </div>
                                <div className="px-4 py-1 border-b border-slate-800 border-l-2 border-l-transparent bg-slate-950">
                                    {renderGroupRows('2_Deducoes_Tributos')}
                                </div>

                                <div className="flex justify-between items-center px-4 py-3 bg-[var(--color-primary-base)]/10 border-b border-[var(--color-primary-base)]/30 border-l-2 border-l-[var(--color-primary-base)]">
                                    <h3 className="font-bold text-slate-100 text-sm uppercase tracking-wide">= Receita Operacional Líquida (ROL)</h3>
                                    <span className="font-bold text-[var(--color-primary-base)] text-sm">{fmtBRL(receitaLiquida)}</span>
                                </div>

                                <div className="flex justify-between items-center px-4 py-2.5 border-b border-slate-800 border-l-2 border-l-amber-500/80 bg-slate-900/40 mt-3 border-t">
                                    <h3 className="font-semibold text-amber-400 text-sm">3. Custos Variáveis (CPV/CMV) (-)</h3>
                                    <span className="font-bold text-amber-400 text-sm">{fmtBRL(custoVariavelTotal)}</span>
                                </div>
                                <div className="px-4 py-1 border-b border-slate-800 border-l-2 border-l-transparent bg-slate-950">
                                    {renderGroupRows('3_Custo_Variavel')}
                                </div>

                                <div className="flex justify-between items-center px-4 py-3 bg-[var(--color-primary-base)]/10 border-b border-[var(--color-primary-base)]/30 border-l-2 border-l-[var(--color-primary-base)]">
                                    <h3 className="font-bold text-slate-100 text-sm uppercase tracking-wide">= Margem de Contribuição</h3>
                                    <span className="font-bold text-[var(--color-primary-base)] text-sm">{fmtBRL(margemContribuicao)}</span>
                                </div>

                                <div className="flex justify-between items-center px-4 py-2.5 border-b border-slate-800 border-l-2 border-l-rose-500/80 bg-slate-900/40 mt-3 border-t">
                                    <h3 className="font-semibold text-rose-400 text-sm">4. Despesas Fixas / Operacionais (-)</h3>
                                    <span className="font-bold text-rose-400 text-sm">{fmtBRL(despesasFixasTotal)}</span>
                                </div>
                                <div className="px-4 py-1 border-b border-slate-800 border-l-2 border-l-transparent bg-slate-950">
                                    {renderGroupRows('4_Despesa_Fixa_Operacional')}
                                </div>

                                <div className="flex justify-between items-center px-4 py-3 bg-indigo-500/10 border-b border-indigo-500/30 border-l-2 border-l-indigo-400">
                                    <h3 className="font-bold text-indigo-100 text-sm uppercase tracking-wide">= Resultado Operacional (LAJIDA)</h3>
                                    <span className="font-bold text-indigo-400 text-sm">{fmtBRL(ebitda)}</span>
                                </div>

                                <div className="flex justify-between items-center px-4 py-2.5 border-b border-slate-800 border-l-2 border-l-rose-500/80 bg-slate-900/40 mt-3 border-t">
                                    <h3 className="font-semibold text-rose-400 text-sm">5. Resultado Não Operacional e IRPJ/CSLL (-)</h3>
                                    <span className="font-bold text-rose-400 text-sm">{fmtBRL(despesasNaoOpTotal)}</span>
                                </div>
                                <div className="px-4 py-1 border-b border-slate-800 border-l-2 border-l-transparent bg-slate-950">
                                    {renderGroupRows('5_Despesa_Nao_Operacional')}
                                </div>

                                <div className={`flex justify-between items-center px-5 py-4 border-l-4 ${lucroLiquido >= 0 ? 'bg-emerald-900/40 border-l-emerald-500' : 'bg-rose-900/40 border-l-rose-500'}`}>
                                    <h3 className="font-bold text-sm uppercase tracking-widest text-white">= {lucroLiquido >= 0 ? 'Lucro Líquido' : 'Prejuízo Líquido'} Final</h3>
                                    <span className={`font-black text-lg ${lucroLiquido >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{fmtBRL(lucroLiquido)}</span>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
