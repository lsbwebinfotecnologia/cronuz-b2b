'use client';

import { useEffect, useState, useMemo } from 'react';
import { getToken, getUser } from '@/lib/auth';
import { motion } from 'framer-motion';
import { 
    ShoppingCart, 
    DollarSign, 
    TrendingUp, 
    TrendingDown, 
    Calendar, 
    ArrowUpRight, 
    AlertCircle, 
    Layers, 
    CheckCircle2, 
    XCircle, 
    Clock, 
    Wrench, 
    Package, 
    Building2,
    Store,
    Search,
    BarChart3
} from 'lucide-react';

interface MasterSeller {
    id: number;
    name: string;
    razao_social: string | null;
    document: string | null;
    domain: string | null;
    active: boolean;
    active_modules_count: number;
    modules: Array<{
        key: string;
        label: string;
        color: string;
    }>;
}

interface MasterOverviewData {
    total_sellers: number;
    active_sellers: number;
    inactive_sellers: number;
    total_module_assignments: number;
    module_stats: Array<{
        key: string;
        label: string;
        color: string;
        count: number;
    }>;
    sellers: MasterSeller[];
}

interface BackendDashboardMetrics {
    is_master: boolean;
    active_products: number;
    total_customers: number;
    active_orders: number;
    orders_by_status: Record<string, number>;
    orders_revenue: {
        invoiced: number;
        pending: number;
        invoiced_count: number;
        pending_count: number;
        average_ticket: number;
    };
    consolidated_revenue: {
        total: number;
        orders: number;
        services: number;
    };
    revenue_history: Array<{
        year_month: string;
        month: string;
        label: string;
        month_label: string;
        orders_revenue: number;
        orders: number;
        orders_count: number;
        services_revenue: number;
        services: number;
        services_count: number;
        total_revenue: number;
        total: number;
    }>;
    financial_metrics: {
        payable: { paid: number; pending: number };
        receivable: { paid: number; pending: number };
    };
    service_metrics: {
        pending: { count: number; value: number };
        completed: { count: number; value: number };
    };
    module_b2b_native: boolean;
    module_horus_erp: boolean;
    module_products: boolean;
    module_orders: boolean;
    module_customers: boolean;
    module_financial: boolean;
    module_services: boolean;
}

export default function DashboardPage() {
    const [user, setUser] = useState<any>(null);
    const [token, setTokenState] = useState<string | null>(null);
    const [historyMonths, setHistoryMonths] = useState<number>(6);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    // Master state
    const [masterData, setMasterData] = useState<MasterOverviewData | null>(null);
    const [sellerSearch, setSellerSearch] = useState<string>('');
    const [moduleFilter, setModuleFilter] = useState<string>('all');

    // Seller state
    const [sellerData, setSellerData] = useState<BackendDashboardMetrics | null>(null);

    useEffect(() => {
        const currentUser = getUser();
        const currentToken = getToken();
        setUser(currentUser);
        setTokenState(currentToken || null);
    }, []);

    const isMaster = user?.type === 'MASTER';

    useEffect(() => {
        if (!token) return;

        const fetchDashboard = async () => {
            setLoading(true);
            setError(null);
            try {
                const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
                
                if (isMaster) {
                    const res = await fetch(`${apiBase}/dashboard/master-overview`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (!res.ok) throw new Error('Erro ao carregar dados consolidados do Master.');
                    const data = await res.json();
                    setMasterData(data);
                } else {
                    const res = await fetch(`${apiBase}/dashboard/metrics?history_months=${historyMonths}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (!res.ok) throw new Error('Erro ao carregar métricas operacionais.');
                    const data = await res.json();
                    setSellerData(data);
                }
            } catch (err: any) {
                console.error(err);
                setError(err.message || 'Falha na requisição.');
            } finally {
                setLoading(false);
            }
        };

        fetchDashboard();
    }, [token, historyMonths, isMaster]);

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(val || 0);
    };



    if (loading && !masterData && !sellerData) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[450px] gap-3">
                <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                <p className="text-sm text-slate-500 font-medium">Sincronizando painel...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6 max-w-xl mx-auto my-12 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-2xl text-center">
                <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-red-800 dark:text-red-300">Não foi possível carregar o dashboard</h3>
                <p className="text-sm text-red-600 dark:text-red-400 mt-1">{error}</p>
            </div>
        );
    }

    // ==========================================
    // RENDER: DASHBOARD MASTER (GOVERNANÇA)
    // ==========================================
    if (isMaster && masterData) {
        const filteredSellers = masterData.sellers.filter(s => {
            const matchesSearch = 
                (s.name.toLowerCase().includes(sellerSearch.toLowerCase())) ||
                (s.razao_social?.toLowerCase().includes(sellerSearch.toLowerCase())) ||
                (s.document?.includes(sellerSearch));
            
            const matchesModule = 
                moduleFilter === 'all' ? true : s.modules.some(m => m.key === moduleFilter);

            return matchesSearch && matchesModule;
        });

        return (
            <div className="space-y-6">
                {/* Header Master */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wider uppercase bg-primary/10 text-primary border border-primary/20">
                                Gestão Master
                            </span>
                        </div>
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white mt-1">
                            Visão Geral da Plataforma
                        </h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Acompanhamento de sellers licenciados, ativação e distribuição de recursos por empresa.
                        </p>
                    </div>
                </div>

                {/* KPIs Master */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
                    <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total de Sellers</p>
                            <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 text-blue-600 rounded-xl">
                                <Store className="w-5 h-5" />
                            </div>
                        </div>
                        <p className="text-3xl font-black text-slate-900 dark:text-white mt-2">
                            {masterData.total_sellers}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">Empresas cadastradas no ecossistema</p>
                    </div>

                    <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Sellers Ativos</p>
                            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 rounded-xl">
                                <CheckCircle2 className="w-5 h-5" />
                            </div>
                        </div>
                        <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-2">
                            {masterData.active_sellers}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">Com operação regular habilitada</p>
                    </div>

                    <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Sellers Inativos</p>
                            <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 text-rose-600 rounded-xl">
                                <XCircle className="w-5 h-5" />
                            </div>
                        </div>
                        <p className="text-3xl font-black text-rose-600 dark:text-rose-400 mt-2">
                            {masterData.inactive_sellers}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">Aguardando liberação ou suspensos</p>
                    </div>

                    <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Módulos Alocados</p>
                            <div className="p-2.5 bg-purple-50 dark:bg-purple-950/40 text-purple-600 rounded-xl">
                                <Layers className="w-5 h-5" />
                            </div>
                        </div>
                        <p className="text-3xl font-black text-purple-600 dark:text-purple-400 mt-2">
                            {masterData.total_module_assignments}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">Instâncias ativas em produção</p>
                    </div>
                </div>

                {/* Painel de Módulos & Distribuição */}
                <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
                        <Layers className="w-4 h-4 text-primary" />
                        Adoção de Recursos pelos Sellers
                    </h3>
                    <p className="text-xs text-slate-500 mb-5">
                        Quantidade de sellers operando com cada recurso do sistema
                    </p>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                        {masterData.module_stats.map((mod) => (
                            <div key={mod.key} className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 flex flex-col justify-between">
                                <span className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate" title={mod.label}>
                                    {mod.label}
                                </span>
                                <div className="flex items-baseline justify-between mt-2">
                                    <span className="text-xl font-bold text-slate-900 dark:text-white">{mod.count}</span>
                                    <span className="text-[11px] text-slate-400">
                                        {masterData.total_sellers > 0 ? `${Math.round((mod.count / masterData.total_sellers) * 100)}%` : '0%'}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Tabela de Sellers e seus Módulos */}
                <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <Store className="w-4 h-4 text-primary" />
                                Sellers Cadastrados & Módulos Ativos
                            </h3>
                            <p className="text-xs text-slate-500">
                                Listagem completa com mapeamento de licenças individuais
                            </p>
                        </div>

                        {/* Filtros */}
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="relative w-full sm:w-64">
                                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    placeholder="Buscar por nome ou CNPJ..."
                                    value={sellerSearch}
                                    onChange={(e) => setSellerSearch(e.target.value)}
                                    className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20"
                                />
                            </div>

                            <select
                                value={moduleFilter}
                                onChange={(e) => setModuleFilter(e.target.value)}
                                className="px-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 focus:outline-none"
                            >
                                <option value="all">Todos os Módulos</option>
                                {masterData.module_stats.map((mod) => (
                                    <option key={mod.key} value={mod.key}>{mod.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200 dark:border-slate-800">
                                <tr>
                                    <th className="py-3 px-4">Seller / Empresa</th>
                                    <th className="py-3 px-4">CNPJ / CPF</th>
                                    <th className="py-3 px-4">Status</th>
                                    <th className="py-3 px-4">Módulos Habilitados</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {filteredSellers.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="py-8 text-center text-slate-400">
                                            Nenhum seller encontrado com os critérios de busca.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredSellers.map((s) => (
                                        <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                                            <td className="py-3.5 px-4">
                                                <div className="font-bold text-slate-900 dark:text-white">
                                                    {s.name}
                                                </div>
                                                {s.razao_social && s.razao_social !== s.name && (
                                                    <div className="text-[11px] text-slate-400">{s.razao_social}</div>
                                                )}
                                            </td>
                                            <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 font-mono">
                                                {s.document || '--'}
                                            </td>
                                            <td className="py-3.5 px-4">
                                                {s.active ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 border border-emerald-200 dark:border-emerald-800">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                                        Ativo
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-600 border border-rose-200 dark:border-rose-800">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                                        Inativo
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-3.5 px-4">
                                                <div className="flex flex-wrap gap-1.5 max-w-xl">
                                                    {s.modules.length === 0 ? (
                                                        <span className="text-[11px] text-slate-400 italic">Nenhum módulo ativo</span>
                                                    ) : (
                                                        s.modules.map((m) => (
                                                            <span 
                                                                key={m.key} 
                                                                className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                                                            >
                                                                {m.label}
                                                            </span>
                                                        ))
                                                    )}
                                                </div>
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

    // ==========================================
    // RENDER: DASHBOARD SELLER (EQUILIBRADO)
    // ==========================================
    const hasOrders = sellerData?.module_orders;
    const hasServices = sellerData?.module_services;
    const hasFinancial = sellerData?.module_financial;

    const invoicedOrders = sellerData?.orders_revenue?.invoiced || 0;
    const pendingOrders = sellerData?.orders_revenue?.pending || 0;
    const invoicedOrdersCount = sellerData?.orders_revenue?.invoiced_count || 0;
    const pendingOrdersCount = sellerData?.orders_revenue?.pending_count || 0;
    const averageTicket = sellerData?.orders_revenue?.average_ticket || 0;

    const completedServicesValue = sellerData?.service_metrics?.completed?.value || 0;
    const pendingServicesCount = sellerData?.service_metrics?.pending?.count || 0;

    const cashReceived = sellerData?.financial_metrics?.receivable?.paid || 0;
    const cashExpenses = sellerData?.financial_metrics?.payable?.paid || 0;
    const cashBalance = cashReceived - cashExpenses;

    return (
        <div className="space-y-6">
            {/* Top Header Seller com Seletor de Período */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                        Painel de Controle
                    </h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Resumo consolidado das operações e desempenho da sua empresa.
                    </p>
                </div>

                <div className="flex items-center gap-2 self-start md:self-auto bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200 dark:border-slate-700/60">
                    <Calendar className="w-4 h-4 text-slate-400 ml-2" />
                    {[3, 6, 12].map((months) => (
                        <button
                            key={months}
                            onClick={() => setHistoryMonths(months)}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                                historyMonths === months
                                    ? 'bg-white dark:bg-slate-900 text-primary shadow-sm'
                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                        >
                            {months} meses
                        </button>
                    ))}
                </div>
            </div>

            {/* SEÇÃO 1: CARDS DE FATURAMENTO / RECEITA PRINCIPAL */}
            {hasOrders && !hasServices && !hasFinancial ? (
                /* CASO ESPECIAL: Seller com foco exclusivo em PEDIDOS/B2B (Ex: Cidade do Livro) */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
                    {/* Faturamento Faturado */}
                    <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Faturamento (Pedidos)</p>
                            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 rounded-xl">
                                <DollarSign className="w-5 h-5" />
                            </div>
                        </div>
                        <p className="text-2xl font-black text-slate-900 dark:text-white mt-2">
                            {formatCurrency(invoicedOrders)}
                        </p>
                        <p className="text-xs text-slate-500 mt-2">
                            Total de pedidos faturados no período
                        </p>
                    </div>

                    {/* Pedidos Faturados */}
                    <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Pedidos Faturados</p>
                            <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 text-blue-600 rounded-xl">
                                <ShoppingCart className="w-5 h-5" />
                            </div>
                        </div>
                        <p className="text-2xl font-black text-slate-900 dark:text-white mt-2">
                            {invoicedOrdersCount}
                        </p>
                        <p className="text-xs text-slate-500 mt-2">
                            Concluídos com sucesso
                        </p>
                    </div>

                    {/* Ticket Médio */}
                    <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Ticket Médio</p>
                            <div className="p-2.5 bg-purple-50 dark:bg-purple-950/40 text-purple-600 rounded-xl">
                                <ArrowUpRight className="w-5 h-5" />
                            </div>
                        </div>
                        <p className="text-2xl font-black text-slate-900 dark:text-white mt-2">
                            {formatCurrency(averageTicket)}
                        </p>
                        <p className="text-xs text-slate-500 mt-2">
                            Média por pedido faturado
                        </p>
                    </div>

                    {/* Aguardando Faturamento */}
                    <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Aguardando Faturamento</p>
                            <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 text-amber-600 rounded-xl">
                                <Clock className="w-5 h-5" />
                            </div>
                        </div>
                        <p className="text-2xl font-black text-slate-900 dark:text-white mt-2">
                            {formatCurrency(pendingOrders)}
                        </p>
                        <p className="text-xs text-amber-600 font-medium mt-2">
                            {pendingOrdersCount} pedidos pendentes
                        </p>
                    </div>
                </div>
            ) : (
                /* CASO GERAL: Multimódulos (Pedidos, Serviços e/ou Financeiro) */
                <div className={`grid gap-4 md:gap-5 ${
                    (hasOrders && hasServices && hasFinancial)
                        ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
                        : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
                }`}>
                    {hasOrders && (
                        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
                            <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Faturamento (Pedidos)</p>
                                <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 rounded-xl">
                                    <ShoppingCart className="w-5 h-5" />
                                </div>
                            </div>
                            <p className="text-2xl font-black text-slate-900 dark:text-white mt-2">
                                {formatCurrency(invoicedOrders)}
                            </p>
                            <p className="text-xs text-slate-500 mt-2">
                                {invoicedOrdersCount} pedidos faturados
                            </p>
                        </div>
                    )}

                    {hasServices && (
                        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
                            <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Serviços (OS Concluídas)</p>
                                <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 text-blue-600 rounded-xl">
                                    <Wrench className="w-5 h-5" />
                                </div>
                            </div>
                            <p className="text-2xl font-black text-slate-900 dark:text-white mt-2">
                                {formatCurrency(completedServicesValue)}
                            </p>
                            <p className="text-xs text-slate-500 mt-2">
                                Ordens de serviço entregues
                            </p>
                        </div>
                    )}

                    {hasFinancial && (
                        <>
                            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
                                <div className="flex items-center justify-between">
                                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Resultado Caixa (Líquido)</p>
                                    <div className="p-2.5 bg-purple-50 dark:bg-purple-950/40 text-purple-600 rounded-xl">
                                        <DollarSign className="w-5 h-5" />
                                    </div>
                                </div>
                                <p className={`text-2xl font-black mt-2 ${
                                    cashBalance >= 0 
                                        ? 'text-slate-900 dark:text-white' 
                                        : 'text-rose-600'
                                }`}>
                                    {formatCurrency(cashBalance)}
                                </p>
                                <p className="text-xs text-slate-500 mt-2">
                                    Recebimentos ({formatCurrency(cashReceived)}) - Pagamentos
                                </p>
                            </div>

                            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
                                <div className="flex items-center justify-between">
                                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Despesas Período</p>
                                    <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 text-rose-600 rounded-xl">
                                        <TrendingDown className="w-5 h-5" />
                                    </div>
                                </div>
                                <p className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-2">
                                    {formatCurrency(cashExpenses)}
                                </p>
                                <p className="text-xs text-slate-500 mt-2">Contas pagas liquidadas</p>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* SEÇÃO 2: GRÁFICO DE EVOLUÇÃO + PAINEL OPERACIONAL */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Gráfico Grade com Hover Tooltip */}
                <div className="lg:col-span-2 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                    <div>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                            <div>
                                <h3 className="text-base font-bold text-slate-900 dark:text-white">Evolução Mensal</h3>
                                <p className="text-xs text-slate-500">Faturamento consolidado por mês de competência</p>
                            </div>

                            {/* Legenda Dinâmica de Módulos Ativos */}
                            <div className="flex items-center gap-3 text-xs">
                                {hasOrders && (
                                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                                        <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                                        <span>Pedidos</span>
                                    </div>
                                )}
                                {hasServices && (
                                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                                        <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                                        <span>Serviços</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Área das Barras em Grade */}
                        {(() => {
                            const history = sellerData?.revenue_history || [];
                            if (history.length === 0) {
                                return (
                                    <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-sm">
                                        <BarChart3 className="w-10 h-10 mb-2 text-slate-300 dark:text-slate-700" />
                                        Sem dados de faturamento para o período selecionado.
                                    </div>
                                );
                            }

                            const maxVal = Math.max(...history.map(h => Number(h.total_revenue || h.total || 0)), 1);

                            return (
                                <div className="mt-2">
                                    <div className="grid grid-flow-col auto-cols-fr gap-2 sm:gap-3 items-end min-h-[220px] overflow-x-auto pb-2 pt-14">
                                        {history.map((item, idx) => {
                                            const itemLabel = item.month_label || item.label || item.month || '';
                                            const itemTotal = Number(item.total_revenue ?? item.total ?? 0);
                                            const itemOrders = Number(item.orders_revenue ?? item.orders ?? 0);
                                            const itemServices = Number(item.services_revenue ?? item.services ?? 0);

                                            const totalPct = maxVal > 0 ? Math.min(Math.round((itemTotal / maxVal) * 100), 100) : 0;
                                            
                                            // Proporção dos módulos dentro da barra
                                            let ordersHeightPct = 0;
                                            let servicesHeightPct = 0;

                                            if (hasOrders && hasServices) {
                                                ordersHeightPct = itemTotal > 0 ? (itemOrders / itemTotal) * 100 : 0;
                                                servicesHeightPct = itemTotal > 0 ? (itemServices / itemTotal) * 100 : 0;
                                            } else if (hasOrders) {
                                                ordersHeightPct = 100;
                                                servicesHeightPct = 0;
                                            } else if (hasServices) {
                                                ordersHeightPct = 0;
                                                servicesHeightPct = 100;
                                            }

                                            return (
                                                <div 
                                                    key={item.year_month || idx}
                                                    className="group relative flex flex-col items-center p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-all cursor-default"
                                                >
                                                    {/* Tooltip flutuante no Hover */}
                                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none absolute -top-20 z-30 bg-slate-900 text-white text-[11px] p-2.5 rounded-xl shadow-xl border border-slate-700 whitespace-nowrap min-w-[150px] left-1/2 -translate-x-1/2">
                                                        <p className="font-bold text-slate-200 border-b border-slate-700 pb-1 mb-1">
                                                            {itemLabel}
                                                        </p>
                                                        {hasOrders && (
                                                            <div className="flex justify-between gap-3 text-blue-300">
                                                                <span>📦 Pedidos:</span>
                                                                <span className="font-mono font-bold">{formatCurrency(itemOrders)}</span>
                                                            </div>
                                                        )}
                                                        {hasServices && (
                                                            <div className="flex justify-between gap-3 text-purple-300">
                                                                <span>🛠️ Serviços:</span>
                                                                <span className="font-mono font-bold">{formatCurrency(itemServices)}</span>
                                                            </div>
                                                        )}
                                                        {hasOrders && hasServices && (
                                                            <div className="flex justify-between gap-3 text-white font-bold border-t border-slate-700 pt-1 mt-1">
                                                                <span>Total:</span>
                                                                <span className="font-mono text-emerald-400">{formatCurrency(itemTotal)}</span>
                                                            </div>
                                                        )}
                                                        {!hasOrders && !hasServices && itemTotal > 0 && (
                                                            <div className="flex justify-between gap-3 text-white font-bold">
                                                                <span>Total:</span>
                                                                <span className="font-mono text-emerald-400">{formatCurrency(itemTotal)}</span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Valor compacto acima da barra */}
                                                    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-2 truncate max-w-full">
                                                        {itemTotal >= 1000 ? `R$ ${(itemTotal / 1000).toFixed(1)}k` : formatCurrency(itemTotal)}
                                                    </span>

                                                    {/* Barra com animação */}
                                                    <div className="w-full max-w-[48px] h-36 bg-slate-100 dark:bg-slate-800/60 rounded-xl p-1 flex items-end justify-center">
                                                        <motion.div
                                                            initial={{ height: 0 }}
                                                            animate={{ height: `${Math.max(totalPct, 4)}%` }}
                                                            transition={{ duration: 0.6, delay: idx * 0.05 }}
                                                            className="w-full rounded-lg overflow-hidden flex flex-col justify-end shadow-sm"
                                                        >
                                                            {/* Segmento de Serviços (Topo) */}
                                                            {hasServices && servicesHeightPct > 0 && (
                                                                <div 
                                                                    style={{ height: `${servicesHeightPct}%` }}
                                                                    className="w-full bg-purple-500 hover:bg-purple-400 transition-colors"
                                                                    title={`Serviços: ${formatCurrency(itemServices)}`}
                                                                />
                                                            )}
                                                            {/* Segmento de Pedidos (Base) */}
                                                            {hasOrders && ordersHeightPct > 0 && (
                                                                <div 
                                                                    style={{ height: `${ordersHeightPct}%` }}
                                                                    className="w-full bg-blue-500 hover:bg-blue-400 transition-colors"
                                                                    title={`Pedidos: ${formatCurrency(itemOrders)}`}
                                                                />
                                                            )}
                                                            {!hasOrders && !hasServices && itemTotal > 0 && (
                                                                <div 
                                                                    style={{ height: '100%' }}
                                                                    className="w-full bg-sky-500 hover:bg-sky-400 transition-colors"
                                                                />
                                                            )}
                                                            {itemTotal === 0 && (
                                                                <div className="w-full h-1 bg-slate-300 dark:bg-slate-700 rounded-full" />
                                                            )}
                                                        </motion.div>
                                                    </div>

                                                    {/* Rótulo do Mês na Base */}
                                                    <div className="mt-2.5 text-center">
                                                        <span className="text-xs block font-medium text-slate-600 dark:text-slate-400">
                                                            {itemLabel}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Rodapé com Dica e Máximo */}
                                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                                        <span className="flex items-center gap-1 text-[11px]">
                                            💡 <em>Passe o cursor sobre as colunas para ver o detalhamento por módulo.</em>
                                        </span>
                                        <span className="font-mono text-[11px] hidden sm:inline font-semibold">
                                            Máx: {formatCurrency(maxVal)}
                                        </span>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                </div>

                {/* Resumo Operacional Equilibrado */}
                <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                    <div>
                        <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">Resumo da Operação</h3>
                        <p className="text-xs text-slate-500 mb-5">Atividades em andamento e base cadastral</p>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600">
                                        <Building2 className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Empresas Clientes</p>
                                        <p className="text-[11px] text-slate-400">Cadastros na sua base</p>
                                    </div>
                                </div>
                                <span className="text-base font-bold text-slate-900 dark:text-white">
                                    {sellerData?.total_customers || 0}
                                </span>
                            </div>

                            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/40 text-purple-600">
                                        <Package className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Produtos Ativos</p>
                                        <p className="text-[11px] text-slate-400">Itens no catálogo</p>
                                    </div>
                                </div>
                                <span className="text-base font-bold text-slate-900 dark:text-white">
                                    {sellerData?.active_products || 0}
                                </span>
                            </div>

                            {hasOrders && (
                                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600">
                                            <Clock className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Pedidos em Aberto</p>
                                            <p className="text-[11px] text-slate-400">Aguardando faturamento</p>
                                        </div>
                                    </div>
                                    <span className="text-base font-bold text-amber-600">
                                        {pendingOrdersCount}
                                    </span>
                                </div>
                            )}

                            {hasServices && (
                                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-lg bg-cyan-100 dark:bg-cyan-900/40 text-cyan-600">
                                            <Wrench className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Ordens de Serviço</p>
                                            <p className="text-[11px] text-slate-400">OS pendentes / em execução</p>
                                        </div>
                                    </div>
                                    <span className="text-base font-bold text-cyan-600">
                                        {pendingServicesCount}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
                        <span className="text-[11px] text-slate-400">
                            Atualizado em tempo real com base nas permissões da sua conta.
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
