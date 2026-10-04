'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ScanBarcode,
  Search,
  RefreshCw,
  Loader2,
  Building2,
  Smartphone,
  Globe,
  Clock,
  Filter,
  CheckCircle2,
  XCircle,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Package,
  ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { getToken, getUser } from '@/lib/auth';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface MetricsSummary {
  total_searches: number;
  searches_web: number;
  searches_app: number;
  total_sellers_active: number;
  matched_searches: number;
  unmatched_searches: number;
  success_rate_percent: number;
}

interface TopProduct {
  search_term: string;
  isbn: string | null;
  product_name: string;
  cod_item: number | null;
  total_searches: number;
  last_searched_at: string | null;
  searches_web: number;
  searches_app: number;
  unique_sellers_count: number;
}

interface TopSeller {
  company_id: number;
  company_name: string;
  company_document: string | null;
  company_logo: string | null;
  total_searches: number;
  last_searched_at: string | null;
  searches_web: number;
  searches_app: number;
}

interface LogEntry {
  id: number;
  company_id: number;
  company_name: string;
  company_document: string | null;
  user_id: number | null;
  user_name: string | null;
  user_email: string | null;
  search_term: string;
  search_option: string;
  source: string;
  matched_cod_item: number | null;
  matched_isbn: string | null;
  matched_name: string | null;
  total_results: number;
  created_at: string | null;
}

interface CompanyOption {
  id: number;
  name: string;
  document?: string;
}

export default function MasterProductSearchLogsPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

  // Filtros
  const [days, setDays] = useState<number>(30);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [selectedSource, setSelectedSource] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'ranking' | 'logs' | 'sellers'>('ranking');

  // Dados
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [topSellers, setTopSellers] = useState<TopSeller[]>([]);
  
  // Logs paginados
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [page, setPage] = useState<number>(1);
  const [pageSize] = useState<number>(25);
  const [totalLogs, setTotalLogs] = useState<number>(0);

  // Estados de carregamento
  const [loadingMetrics, setLoadingMetrics] = useState<boolean>(true);
  const [loadingLogs, setLoadingLogs] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Validação de acesso Master
  useEffect(() => {
    const user = getUser();
    setCurrentUser(user);
    if (!user || user.type !== 'MASTER') {
      setIsAuthorized(false);
    } else {
      setIsAuthorized(true);
    }
  }, []);

  // Busca lista de sellers para o dropdown de filtro
  useEffect(() => {
    if (!isAuthorized) return;
    const fetchCompanies = async () => {
      try {
        const token = getToken();
        const res = await fetch(`${API}/companies?order_by=name`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setCompanies(data);
        }
      } catch (err) {
        console.error('Erro ao carregar lista de sellers:', err);
      }
    };
    fetchCompanies();
  }, [isAuthorized]);

  // Carrega métricas agregadas (Top produtos, Top sellers, KPIs)
  const fetchMetrics = useCallback(async () => {
    if (!isAuthorized) return;
    setLoadingMetrics(true);
    try {
      const token = getToken();
      const params = new URLSearchParams({
        days: days.toString(),
        limit: '30',
      });
      if (selectedCompanyId) params.append('company_id', selectedCompanyId);
      if (selectedSource) params.append('source', selectedSource);

      const res = await fetch(`${API}/product-search/master/metrics?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error('Falha ao carregar métricas gerenciais.');
      }

      const data = await res.json();
      setSummary(data.summary);
      setTopProducts(data.top_products || []);
      setTopSellers(data.top_sellers || []);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao carregar métricas.');
    } finally {
      setLoadingMetrics(false);
    }
  }, [isAuthorized, days, selectedCompanyId, selectedSource]);

  // Carrega logs detalhados paginados
  const fetchLogs = useCallback(async () => {
    if (!isAuthorized) return;
    setLoadingLogs(true);
    try {
      const token = getToken();
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: pageSize.toString(),
      });
      if (selectedCompanyId) params.append('company_id', selectedCompanyId);
      if (selectedSource) params.append('source', selectedSource);
      if (searchQuery.trim()) params.append('q', searchQuery.trim());

      const res = await fetch(`${API}/product-search/master/logs?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error('Falha ao carregar histórico de logs.');
      }

      const data = await res.json();
      setLogs(data.items || []);
      setTotalLogs(data.total || 0);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao carregar logs.');
    } finally {
      setLoadingLogs(false);
    }
  }, [isAuthorized, page, pageSize, selectedCompanyId, selectedSource, searchQuery]);

  // Atualiza métricas quando filtros mudam
  useEffect(() => {
    if (isAuthorized) {
      fetchMetrics();
    }
  }, [isAuthorized, fetchMetrics]);

  // Atualiza logs quando aba de logs estiver ativa ou filtros mudarem
  useEffect(() => {
    if (isAuthorized && activeTab === 'logs') {
      fetchLogs();
    }
  }, [isAuthorized, activeTab, fetchLogs]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([fetchMetrics(), fetchLogs()]);
    setIsRefreshing(false);
    toast.success('Métricas atualizadas!');
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLogs();
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return '-';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  // Se não for MASTER, bloqueia visualização
  if (isAuthorized === false) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-rose-100 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center mb-4">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">
          Acesso Restrito
        </h1>
        <p className="text-slate-500 dark:text-slate-400 max-w-md mb-6 text-sm">
          Esta tela é de uso exclusivo dos administradores <strong>Master Cronuz</strong> para análise gerencial de demanda e logs da plataforma.
        </p>
        <button
          onClick={() => router.push('/dashboard')}
          className="px-4 py-2 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-xl font-medium text-sm hover:opacity-90 transition-opacity"
        >
          Voltar para o Painel
        </button>
      </div>
    );
  }

  const totalPages = Math.ceil(totalLogs / pageSize) || 1;

  return (
    <div className="space-y-6 pb-12">
      {/* ── HEADER ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-primary-base)]">
            <ScanBarcode className="w-4 h-4" />
            <span>Módulo Gerencial Master</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mt-1">
            Logs & Inteligência de Busca Preço
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Monitore o que sellers e vendedores estão pesquisando na Web e no App para dimensionar a demanda de catálogo.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing || loadingMetrics}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[var(--color-primary-base)]' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* ── BARRA DE FILTROS ─────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
          <Filter className="w-3.5 h-3.5" />
          <span>Filtros Globais</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Período */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
              Período de Análise
            </label>
            <select
              value={days}
              onChange={(e) => {
                setDays(Number(e.target.value));
                setPage(1);
              }}
              className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)]"
            >
              <option value={7}>Últimos 7 dias</option>
              <option value={15}>Últimos 15 dias</option>
              <option value={30}>Últimos 30 dias</option>
              <option value={60}>Últimos 60 dias</option>
              <option value={90}>Últimos 90 dias</option>
              <option value={365}>Último 1 ano</option>
            </select>
          </div>

          {/* Seller */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
              Seller / Organização
            </label>
            <select
              value={selectedCompanyId}
              onChange={(e) => {
                setSelectedCompanyId(e.target.value);
                setPage(1);
              }}
              className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)]"
            >
              <option value="">Todos os Sellers ({companies.length})</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.document ? `(${c.document})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Canal de Origem */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
              Canal de Consulta
            </label>
            <select
              value={selectedSource}
              onChange={(e) => {
                setSelectedSource(e.target.value);
                setPage(1);
              }}
              className="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)]"
            >
              <option value="">Todos os Canais</option>
              <option value="app">Apenas Mobile (App)</option>
              <option value="web">Apenas Painel Web</option>
              <option value="physical_scanner">Leitor Físico</option>
            </select>
          </div>

          {/* Busca Textual */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
              Pesquisar Termo / ISBN
            </label>
            <form onSubmit={handleSearchSubmit} className="relative">
              <input
                type="text"
                placeholder="Ex: 97885... ou Nome"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)]"
              />
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400 pointer-events-none" />
            </form>
          </div>
        </div>
      </div>

      {/* ── KPI CARDS ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Buscas */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Total de Consultas
            </span>
            <div className="w-8 h-8 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900 dark:text-white">
              {loadingMetrics ? '—' : (summary?.total_searches || 0).toLocaleString('pt-BR')}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              nos últimos {days} dias
            </span>
          </div>
          <div className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{summary?.success_rate_percent || 0}% encontraram produtos</span>
          </div>
        </div>

        {/* Divisão Web vs App */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Canais (Web vs App)
            </span>
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Smartphone className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <Smartphone className="w-3.5 h-3.5 text-indigo-500" />
                <span>App: {(summary?.searches_app || 0).toLocaleString('pt-BR')}</span>
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <Globe className="w-3.5 h-3.5 text-sky-500" />
                <span>Web: {(summary?.searches_web || 0).toLocaleString('pt-BR')}</span>
              </div>
            </div>
          </div>
          {/* Barra de Proporção */}
          <div className="mt-3 w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
            {summary?.total_searches ? (
              <>
                <div
                  style={{ width: `${(summary.searches_app / summary.total_searches) * 100}%` }}
                  className="bg-indigo-500 h-full"
                  title={`App: ${summary.searches_app}`}
                />
                <div
                  style={{ width: `${(summary.searches_web / summary.total_searches) * 100}%` }}
                  className="bg-sky-500 h-full"
                  title={`Web: ${summary.searches_web}`}
                />
              </>
            ) : (
              <div className="w-full bg-slate-200 dark:bg-slate-700 h-full" />
            )}
          </div>
        </div>

        {/* Sellers Ativos */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Sellers Pesquisando
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900 dark:text-white">
              {loadingMetrics ? '—' : (summary?.total_sellers_active || 0)}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              de {companies.length} cadastrados
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Empresas utilizando ativamente a busca
          </div>
        </div>

        {/* Itens Não Encontrados */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Itens Sem Correspondência
            </span>
            <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <XCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-rose-600 dark:text-rose-400">
              {loadingMetrics ? '—' : (summary?.unmatched_searches || 0).toLocaleString('pt-BR')}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              buscas sem acervo
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Demanda reprimida / oportunidade de catálogo
          </div>
        </div>
      </div>

      {/* ── NAVEGAÇÃO POR ABAS ───────────────────────────────────── */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6">
        <button
          onClick={() => setActiveTab('ranking')}
          className={`pb-3 text-sm font-semibold transition border-b-2 flex items-center gap-2 ${
            activeTab === 'ranking'
              ? 'border-[var(--color-primary-base)] text-[var(--color-primary-base)]'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Mais Pesquisados ({topProducts.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`pb-3 text-sm font-semibold transition border-b-2 flex items-center gap-2 ${
            activeTab === 'logs'
              ? 'border-[var(--color-primary-base)] text-[var(--color-primary-base)]'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Histórico em Tempo Real ({totalLogs.toLocaleString('pt-BR')})</span>
        </button>

        <button
          onClick={() => setActiveTab('sellers')}
          className={`pb-3 text-sm font-semibold transition border-b-2 flex items-center gap-2 ${
            activeTab === 'sellers'
              ? 'border-[var(--color-primary-base)] text-[var(--color-primary-base)]'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Sellers Mais Ativos ({topSellers.length})</span>
        </button>
      </div>

      {/* ── ABA 1: RANKING DOS MAIS PESQUISADOS ─────────────────── */}
      {activeTab === 'ranking' && (
        <div className="space-y-4">
          {loadingMetrics ? (
            <div className="flex flex-col items-center justify-center p-12 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin mb-2" />
              <p className="text-sm">Consolidando ranking dos mais pesquisados...</p>
            </div>
          ) : topProducts.length === 0 ? (
            <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
              <Package className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="font-semibold text-slate-700 dark:text-slate-200">
                Nenhuma busca registrada no período selecionado.
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Tente selecionar um período maior nos filtros acima.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-5 py-3.5 w-12 text-center">#</th>
                    <th className="px-5 py-3.5">Termo / Produto</th>
                    <th className="px-5 py-3.5">ISBN / Barras</th>
                    <th className="px-5 py-3.5">Cód. Horus</th>
                    <th className="px-5 py-3.5 text-center">Total de Buscas</th>
                    <th className="px-5 py-3.5 text-center">Canais</th>
                    <th className="px-5 py-3.5 text-center">Sellers Distintos</th>
                    <th className="px-5 py-3.5 text-right">Última Consulta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {topProducts.map((p, idx) => (
                    <tr
                      key={`${p.search_term}-${p.isbn}-${idx}`}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition"
                    >
                      <td className="px-5 py-4 text-center font-bold text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-900 dark:text-white max-w-sm truncate" title={p.product_name}>
                          {p.product_name}
                        </div>
                        {p.product_name !== p.search_term && (
                          <div className="text-xs text-slate-400 truncate max-w-xs">
                            Termo pesquisado: &ldquo;{p.search_term}&rdquo;
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4 font-mono text-xs text-slate-600 dark:text-slate-300">
                        {p.isbn || '—'}
                      </td>
                      <td className="px-5 py-4 font-mono text-xs text-slate-500">
                        {p.cod_item || '—'}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                          {p.total_searches} buscas
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <div className="inline-flex items-center gap-1.5 text-xs">
                          {p.searches_app > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-semibold" title={`App: ${p.searches_app}`}>
                              App: {p.searches_app}
                            </span>
                          )}
                          {p.searches_web > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200 dark:border-sky-800 font-semibold" title={`Web: ${p.searches_web}`}>
                              Web: {p.searches_web}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-center font-medium text-slate-700 dark:text-slate-300">
                        {p.unique_sellers_count} seller(s)
                      </td>
                      <td className="px-5 py-4 text-right text-xs text-slate-500">
                        {formatDate(p.last_searched_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── ABA 2: HISTÓRICO EM TEMPO REAL (LOGS) ───────────────── */}
      {activeTab === 'logs' && (
        <div className="space-y-4">
          {loadingLogs ? (
            <div className="flex flex-col items-center justify-center p-12 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin mb-2" />
              <p className="text-sm">Buscando histórico detalhado de logs...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
              <Clock className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="font-semibold text-slate-700 dark:text-slate-200">
                Nenhum registro de log encontrado com os filtros atuais.
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Tente ajustar os filtros de seller, canal ou termo de busca.
              </p>
            </div>
          ) : (
            <>
              {/* Tabela Desktop */}
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-5 py-3.5">Data & Hora</th>
                      <th className="px-5 py-3.5">Seller (Organização)</th>
                      <th className="px-5 py-3.5">Usuário / Operador</th>
                      <th className="px-5 py-3.5">Canal</th>
                      <th className="px-5 py-3.5">Termo Pesquisado</th>
                      <th className="px-5 py-3.5">Produto Correspondente</th>
                      <th className="px-5 py-3.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                        {/* Data */}
                        <td className="px-5 py-3.5 text-xs text-slate-600 dark:text-slate-400 font-mono">
                          {formatDate(log.created_at)}
                        </td>

                        {/* Seller */}
                        <td className="px-5 py-3.5">
                          <div className="font-semibold text-slate-900 dark:text-white max-w-[200px] truncate" title={log.company_name}>
                            {log.company_name}
                          </div>
                          {log.company_document && (
                            <div className="text-[11px] text-slate-400 font-mono">
                              CNPJ: {log.company_document}
                            </div>
                          )}
                        </td>

                        {/* Usuário */}
                        <td className="px-5 py-3.5 text-xs">
                          <div className="font-medium text-slate-700 dark:text-slate-300 max-w-[160px] truncate">
                            {log.user_name || 'Usuário Desconhecido'}
                          </div>
                          {log.user_email && (
                            <div className="text-[11px] text-slate-400 truncate max-w-[160px]">
                              {log.user_email}
                            </div>
                          )}
                        </td>

                        {/* Canal */}
                        <td className="px-5 py-3.5">
                          {log.source === 'app' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                              <Smartphone className="w-3 h-3" />
                              <span>App</span>
                            </span>
                          ) : log.source === 'physical_scanner' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                              <ScanBarcode className="w-3 h-3" />
                              <span>Scanner</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                              <Globe className="w-3 h-3" />
                              <span>Web</span>
                            </span>
                          )}
                        </td>

                        {/* Termo */}
                        <td className="px-5 py-3.5">
                          <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md">
                            {log.search_term}
                          </span>
                          <span className="ml-2 text-[10px] text-slate-400 uppercase">
                            ({log.search_option})
                          </span>
                        </td>

                        {/* Produto */}
                        <td className="px-5 py-3.5">
                          {log.matched_name ? (
                            <div className="max-w-[220px] truncate font-medium text-slate-800 dark:text-slate-200" title={log.matched_name}>
                              {log.matched_name}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 italic">Não vinculado</span>
                          )}
                          {log.matched_isbn && (
                            <div className="text-[11px] text-slate-500 font-mono">
                              ISBN: {log.matched_isbn}
                            </div>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-5 py-3.5 text-center">
                          {log.total_results > 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{log.total_results} item(ns)</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-500">
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Não localizado</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Paginação */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-2">
                <span className="text-xs text-slate-500">
                  Mostrando página <strong>{page}</strong> de <strong>{totalPages}</strong> ({totalLogs.toLocaleString('pt-BR')} registros no total)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1 || loadingLogs}
                    className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 disabled:opacity-40 transition"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-semibold px-2">
                    {page} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages || loadingLogs}
                    className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 disabled:opacity-40 transition"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── ABA 3: SELLERS MAIS ATIVOS ──────────────────────────── */}
      {activeTab === 'sellers' && (
        <div className="space-y-4">
          {loadingMetrics ? (
            <div className="flex flex-col items-center justify-center p-12 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin mb-2" />
              <p className="text-sm">Carregando métricas de engajamento dos sellers...</p>
            </div>
          ) : topSellers.length === 0 ? (
            <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
              <Building2 className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="font-semibold text-slate-700 dark:text-slate-200">
                Nenhum seller realizou buscas no período selecionado.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {topSellers.map((seller, idx) => (
                <div
                  key={seller.company_id}
                  className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm relative overflow-hidden flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <span className="text-xs font-bold text-slate-400">
                        #{idx + 1} Mais Ativo
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                        {seller.total_searches} buscas
                      </span>
                    </div>

                    <h3 className="font-bold text-slate-900 dark:text-white line-clamp-1" title={seller.company_name}>
                      {seller.company_name}
                    </h3>
                    {seller.company_document && (
                      <p className="text-xs text-slate-500 font-mono mt-0.5">
                        CNPJ: {seller.company_document}
                      </p>
                    )}

                    <div className="mt-4 flex items-center gap-2 text-xs">
                      <div className="flex-1 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-center">
                        <span className="text-slate-400 block text-[10px] font-semibold uppercase">Mobile App</span>
                        <span className="font-bold text-indigo-600 dark:text-indigo-400 text-sm">
                          {seller.searches_app}
                        </span>
                      </div>
                      <div className="flex-1 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-center">
                        <span className="text-slate-400 block text-[10px] font-semibold uppercase">Painel Web</span>
                        <span className="font-bold text-sky-600 dark:text-sky-400 text-sm">
                          {seller.searches_web}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
                    <span>Última consulta:</span>
                    <span className="font-medium text-slate-600 dark:text-slate-300">
                      {formatDate(seller.last_searched_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
