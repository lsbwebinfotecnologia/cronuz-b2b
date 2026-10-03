'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';
import { 
  Users, 
  Shield, 
  Store, 
  Smartphone, 
  Laptop, 
  RefreshCw, 
  Search, 
  CheckCircle2, 
  Clock, 
  LogOut, 
  AlertCircle, 
  Radio, 
  Building2, 
  Filter, 
  ChevronLeft, 
  ChevronRight,
  ShieldAlert,
  Globe
} from 'lucide-react';

interface SessionItem {
  id: number;
  role: string;
  role_label: string;
  user_id: number | null;
  customer_id: number | null;
  name: string;
  email: string;
  document: string | null;
  company_id: number | null;
  company_name: string;
  ip_address: string;
  user_agent: string | null;
  device_info: string;
  login_at: string | null;
  last_activity_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  is_online: boolean;
}

interface SessionMetrics {
  total_online: number;
  master_online: number;
  sellers_online: number;
  customers_online: number;
  logins_today: number;
  active_sessions_count: number;
  timestamp: string;
}

interface CompanyOption {
  id: number;
  name: string;
}

export default function MasterSessionsPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);

  // Dados
  const [metrics, setMetrics] = useState<SessionMetrics | null>(null);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);

  // Filtros
  const [page, setPage] = useState<number>(1);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('online');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');

  // Modal de confirmação para revogar sessão
  const [revokingSessionId, setRevokingSessionId] = useState<number | null>(null);
  const [isRevoking, setIsRevoking] = useState<boolean>(false);

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(handler);
  }, [search]);

  // Auth check
  useEffect(() => {
    const user = getUser();
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.type !== 'MASTER') {
      toast.error('Acesso restrito ao perfil Master.');
      router.push('/');
      return;
    }
    setCurrentUser(user);
  }, [router]);

  // Busca lista de empresas para o select de filtro
  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const token = getToken();
        if (!token) return;
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies?limit=200`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          const items = Array.isArray(data) ? data : (data.items || []);
          setCompanies(items.map((c: any) => ({ id: c.id, name: c.name })));
        }
      } catch (e) {
        // silencioso
      }
    };
    fetchCompanies();
  }, []);

  // Fetch de Métricas e Lista
  const fetchData = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    try {
      const token = getToken();
      if (!token) return;
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

      // 1. Métricas
      const metricsPromise = fetch(`${apiUrl}/master/sessions/metrics`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // 2. Lista de sessões
      const params = new URLSearchParams();
      params.append('page', String(page));
      params.append('page_size', '20');
      if (roleFilter !== 'all') params.append('role', roleFilter);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (companyFilter !== 'all') params.append('company_id', companyFilter);
      if (debouncedSearch.trim()) params.append('search', debouncedSearch.trim());

      const listPromise = fetch(`${apiUrl}/master/sessions?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const [metricsRes, listRes] = await Promise.all([metricsPromise, listPromise]);

      if (metricsRes.ok) {
        const mData = await metricsRes.json();
        setMetrics(mData);
      }

      if (listRes.ok) {
        const lData = await listRes.json();
        setSessions(lData.items || []);
        setTotal(lData.total || 0);
        setTotalPages(lData.total_pages || 1);
      }
    } catch (err: any) {
      if (!isSilent) toast.error('Falha ao carregar sessões.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, roleFilter, statusFilter, companyFilter, debouncedSearch]);

  // Carrega ao montar ou mudar filtros
  useEffect(() => {
    if (currentUser?.type === 'MASTER') {
      fetchData();
    }
  }, [currentUser, fetchData]);

  // Auto-refresh a cada 30 segundos
  useEffect(() => {
    if (!autoRefresh || currentUser?.type !== 'MASTER') return;
    const interval = setInterval(() => {
      fetchData(true);
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, currentUser, fetchData]);

  // Ação de revogar sessão
  const handleRevokeSession = async (sessionId: number) => {
    setIsRevoking(true);
    try {
      const token = getToken();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${apiUrl}/master/sessions/${sessionId}/revoke`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        toast.success('Sessão encerrada com sucesso! O usuário foi desconectado.');
        setRevokingSessionId(null);
        fetchData();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data?.detail || 'Erro ao encerrar sessão.');
      }
    } catch (e: any) {
      toast.error('Erro de conexão ao encerrar sessão.');
    } finally {
      setIsRevoking(false);
    }
  };

  const formatRelativeTime = (isoString: string | null) => {
    if (!isoString) return '-';
    const date = new Date(isoString);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSec < 45) return 'agora mesmo';
    if (diffSec < 90) return 'há 1 minuto';
    if (diffSec < 3600) return `há ${Math.floor(diffSec / 60)} min`;
    if (diffSec < 7200) return 'há 1 hora';
    if (diffSec < 86400) return `há ${Math.floor(diffSec / 3600)}h`;
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const formatDateTime = (isoString: string | null) => {
    if (!isoString) return '-';
    return new Date(isoString).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wider uppercase bg-primary/10 text-primary border border-primary/20">
              Governança Master
            </span>
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              Monitoramento Ativo
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white mt-1">
            Acessos e Sessões em Tempo Real
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Acompanhamento de usuários conectados (Master, Sellers/Equipe e Clientes da Loja B2B) com controle de encerramento de sessão.
          </p>
        </div>

        {/* Controles de Atualização */}
        <div className="flex items-center gap-3 self-start md:self-auto">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              autoRefresh 
                ? 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300' 
                : 'bg-slate-100 border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400'
            }`}
            title="Atualização automática a cada 30 segundos"
          >
            <Radio className={`w-3.5 h-3.5 ${autoRefresh ? 'animate-pulse text-emerald-500' : 'text-slate-400'}`} />
            Auto-refresh (30s)
          </button>

          <button
            onClick={() => fetchData()}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 shadow-sm transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-primary' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* SEÇÃO 1: CARDS DE KPIS EM TEMPO REAL */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Online Agora */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-500/20 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Online Agora
            </p>
            <div className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </div>
          </div>
          <p className="text-3xl font-black text-slate-900 dark:text-white mt-2">
            {metrics?.total_online ?? 0}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Atividade nos últimos 15 min
          </p>
        </div>

        {/* Sellers & Equipe */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Sellers & Equipe
            </p>
            <div className="p-2 bg-blue-50 dark:bg-blue-950/40 text-blue-600 rounded-xl">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-black text-blue-600 dark:text-blue-400 mt-2">
            {metrics?.sellers_online ?? 0}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Lojistas e vendedores ativos
          </p>
        </div>

        {/* Clientes B2B */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Clientes B2B (Loja)
            </p>
            <div className="p-2 bg-purple-50 dark:bg-purple-950/40 text-purple-600 rounded-xl">
              <Store className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-black text-purple-600 dark:text-purple-400 mt-2">
            {metrics?.customers_online ?? 0}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Navegando no Storefront B2B
          </p>
        </div>

        {/* Administradores Master */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Master Conectados
            </p>
            <div className="p-2 bg-amber-50 dark:bg-amber-950/40 text-amber-600 rounded-xl">
              <Shield className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-black text-amber-600 dark:text-amber-400 mt-2">
            {metrics?.master_online ?? 0}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Administradores globais
          </p>
        </div>

        {/* Logins Hoje */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Logins Hoje
            </p>
            <div className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-3xl font-black text-slate-900 dark:text-white mt-2">
            {metrics?.logins_today ?? 0}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Autenticações desde 00:00
          </p>
        </div>
      </div>

      {/* SEÇÃO 2: BARRA DE FILTROS */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Campo de Busca */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por nome, e-mail, CPF/CNPJ ou IP..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl text-sm bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
          </div>

          {/* Filtros em Abas de Papel (Role) */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
            {[
              { id: 'all', label: 'Todos os Perfis' },
              { id: 'MASTER', label: 'Master' },
              { id: 'SELLER', label: 'Sellers / Equipe' },
              { id: 'CUSTOMER', label: 'Clientes B2B' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setRoleFilter(tab.id); setPage(1); }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap transition-all ${
                  roleFilter === tab.id
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100 dark:border-slate-800/60">
          {/* Filtro de Status */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 focus:outline-none"
            >
              <option value="online">🟢 Online Agora (&lt; 15 min)</option>
              <option value="active">⚡ Todas Sessões Ativas</option>
              <option value="all">📜 Histórico Completo</option>
              <option value="inactive">🔒 Encerradas / Expiradas</option>
            </select>
          </div>

          {/* Filtro por Empresa */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Empresa:</span>
            <select
              value={companyFilter}
              onChange={(e) => { setCompanyFilter(e.target.value); setPage(1); }}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 focus:outline-none max-w-[220px] truncate"
            >
              <option value="all">Todas as Empresas</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="ml-auto text-xs text-slate-400 font-medium">
            {total} sessão(ões) encontrada(s)
          </div>
        </div>
      </div>

      {/* SEÇÃO 3: TABELA DE SESSÕES (MOBILE FIRST) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600 dark:text-slate-400">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-5 py-3.5">Usuário / Cliente</th>
                <th className="px-5 py-3.5">Empresa</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Dispositivo & IP</th>
                <th className="px-5 py-3.5">Entrada & Última Ação</th>
                <th className="px-5 py-3.5 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {loading && sessions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="w-6 h-6 animate-spin text-primary" />
                      <p className="text-xs text-slate-500">Carregando sessões...</p>
                    </div>
                  </td>
                </tr>
              ) : sessions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                      <AlertCircle className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Nenhuma sessão encontrada</p>
                      <p className="text-xs text-slate-400">
                        Não há acessos registrados com os filtros atuais. Experimente alternar para "Histórico Completo" ou limpar a busca.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                sessions.map((item) => {
                  const isMaster = item.role === 'MASTER';
                  const isSeller = item.role === 'SELLER';
                  const isAgent = item.role === 'AGENT';
                  const isCustomer = item.role === 'CUSTOMER';
                  const isApp = item.device_info.includes('App') || item.device_info.includes('Mobile');

                  return (
                    <tr 
                      key={item.id} 
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* Usuário / Cliente */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                            isMaster ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300' :
                            isSeller ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300' :
                            isAgent ? 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300' :
                            'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300'
                          }`}>
                            {item.name ? item.name.charAt(0).toUpperCase() : '?'}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-slate-900 dark:text-white truncate max-w-[200px] sm:max-w-xs">
                                {item.name}
                              </p>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                                isMaster ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60' :
                                isSeller ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800/60' :
                                isAgent ? 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-400 dark:border-cyan-800/60' :
                                'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800/60'
                              }`}>
                                {item.role_label}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 truncate max-w-[220px]">
                              {item.email}
                            </p>
                            {item.document && (
                              <p className="text-[11px] font-mono text-slate-400">
                                Doc: {item.document}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Empresa */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-[180px]">
                            {item.company_name}
                          </span>
                        </div>
                        {item.company_id && (
                          <span className="text-[10px] text-slate-400 font-mono block pl-5">
                            ID: {item.company_id}
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        {item.is_online ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                            Online Agora
                          </span>
                        ) : item.is_active ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60">
                            <span className="w-2 h-2 rounded-full bg-amber-500" />
                            Inativo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700">
                            Encerrada
                          </span>
                        )}
                      </td>

                      {/* Dispositivo & IP */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {isApp ? (
                            <Smartphone className="w-4 h-4 text-purple-500 shrink-0" />
                          ) : (
                            <Laptop className="w-4 h-4 text-slate-500 shrink-0" />
                          )}
                          <span className="font-medium text-slate-800 dark:text-slate-200 text-xs">
                            {item.device_info}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 mt-1 pl-6">
                          <Globe className="w-3 h-3 text-slate-400" />
                          <span className="text-[11px] font-mono text-slate-400">
                            {item.ip_address}
                          </span>
                        </div>
                      </td>

                      {/* Entrada & Última Ação */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div>
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                            Última ação: {formatRelativeTime(item.last_activity_at)}
                          </span>
                          <span className="text-[11px] text-slate-400 block mt-0.5" title={item.login_at || ''}>
                            Login: {formatDateTime(item.login_at)}
                          </span>
                        </div>
                      </td>

                      {/* Ação */}
                      <td className="px-5 py-4 text-right whitespace-nowrap">
                        {item.is_active ? (
                          <button
                            onClick={() => setRevokingSessionId(item.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors shadow-sm"
                            title="Desconectar usuário agora"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                            Derrubar
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400 italic">
                            Desconectado
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
            <span>
              Página <strong className="text-slate-800 dark:text-slate-200">{page}</strong> de {totalPages} ({total} sessões)
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL DE CONFIRMAÇÃO DE DERRUBADA DE SESSÃO */}
      {revokingSessionId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 rounded-xl bg-rose-100 dark:bg-rose-950/60">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Derrubar Sessão do Usuário
                </h3>
                <p className="text-xs text-slate-500">
                  Confirmação de encerramento forçado de acesso
                </p>
              </div>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300">
              Tem certeza que deseja desconectar esta sessão imediatamente? O usuário será deslogado na próxima requisição e precisará autenticar novamente.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setRevokingSessionId(null)}
                disabled={isRevoking}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleRevokeSession(revokingSessionId)}
                disabled={isRevoking}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {isRevoking ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                Desconectar Usuário
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
