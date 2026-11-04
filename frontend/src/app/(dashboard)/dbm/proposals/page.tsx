'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  FileText,
  Search,
  Plus,
  ArrowLeft,
  RefreshCw,
  Edit3,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Calendar,
  Building2,
  CheckCircle2,
  Clock,
  Send,
  XCircle,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface DbmProposalRow {
  id: number;
  local_id: number;
  customer_id?: number | null;
  customer_name: string;
  customer_corporate_name?: string | null;
  customer_document?: string | null;
  customer_horus_cod_cli?: number | null;
  status_id: string;
  status_name: string;
  status_phase: string;
  total_titles: number;
  total_requested_qty: number;
  total_approved_qty: number;
  total_cover_value: number;
  total_net_value: number;
  average_discount: number;
  global_discount: number;
  min_order_value: number;
  horus_order_number?: string | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

const PHASE_FILTERS = [
  { key: 'ALL', label: 'Todos' },
  { key: 'RASCUNHO', label: 'Rascunho' },
  { key: 'EM_ANALISE', label: 'Em Análise' },
  { key: 'NEGOCIACAO', label: 'Negociação' },
  { key: 'APROVADO', label: 'Aprovado' },
  { key: 'CONVERTIDO', label: 'Convertido' },
  { key: 'CANCELADO', label: 'Cancelado' },
];

function getPhaseStyle(phase: string) {
  switch ((phase || '').toUpperCase()) {
    case 'RASCUNHO':
      return {
        bg: 'bg-slate-100 dark:bg-slate-800',
        text: 'text-slate-700 dark:text-slate-300',
        border: 'border-slate-300 dark:border-slate-700',
        dot: 'bg-slate-500'
      };
    case 'EM_ANALISE':
      return {
        bg: 'bg-amber-50 dark:bg-amber-950/40',
        text: 'text-amber-800 dark:text-amber-300',
        border: 'border-amber-200 dark:border-amber-800',
        dot: 'bg-amber-500'
      };
    case 'NEGOCIACAO':
      return {
        bg: 'bg-sky-50 dark:bg-sky-950/40',
        text: 'text-sky-800 dark:text-sky-300',
        border: 'border-sky-200 dark:border-sky-800',
        dot: 'bg-sky-500'
      };
    case 'APROVADO':
      return {
        bg: 'bg-emerald-50 dark:bg-emerald-950/40',
        text: 'text-emerald-800 dark:text-emerald-300',
        border: 'border-emerald-200 dark:border-emerald-800',
        dot: 'bg-emerald-500'
      };
    case 'CONVERTIDO':
      return {
        bg: 'bg-indigo-50 dark:bg-indigo-950/40',
        text: 'text-indigo-800 dark:text-indigo-300',
        border: 'border-indigo-200 dark:border-indigo-800',
        dot: 'bg-indigo-500'
      };
    case 'CANCELADO':
      return {
        bg: 'bg-rose-50 dark:bg-rose-950/40',
        text: 'text-rose-800 dark:text-rose-300',
        border: 'border-rose-200 dark:border-rose-800',
        dot: 'bg-rose-500'
      };
    default:
      return {
        bg: 'bg-slate-100 dark:bg-slate-800',
        text: 'text-slate-700 dark:text-slate-300',
        border: 'border-slate-200 dark:border-slate-700',
        dot: 'bg-slate-400'
      };
  }
}

function formatDateTimeBR(iso?: string | null) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    const datePart = d.toLocaleDateString('pt-BR');
    const timePart = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `${datePart} ${timePart}`;
  } catch {
    return '—';
  }
}

export default function DbmProposalsListPage() {
  const router = useRouter();
  const [companyId, setCompanyId] = useState<number | undefined>(() => getUser()?.company_id);

  const [proposals, setProposals] = useState<DbmProposalRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [phaseFilter, setPhaseFilter] = useState<string>('ALL');
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    const u = getUser();
    if (u?.company_id) setCompanyId(u.company_id);
  }, []);

  const fetchProposals = useCallback(async () => {
    setLoading(true);
    try {
      const token = getToken();
      const params = new URLSearchParams();
      params.append('limit', '100');
      params.append('skip', '0');
      if (companyId) params.append('company_id', String(companyId));
      if (searchTerm.trim()) params.append('search', searchTerm.trim());
      if (phaseFilter && phaseFilter !== 'ALL') params.append('status_phase', phaseFilter);

      const res = await fetch(`${API_URL}/dbm/proposals?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        const items: DbmProposalRow[] = data.items || [];
        setProposals(items);
        setTotalCount(data.total ?? items.length);
        setSelectedIndex(items.length > 0 ? 0 : -1);
      } else {
        setProposals([]);
        setTotalCount(0);
      }
    } catch (e) {
      console.error('Erro ao carregar orçamentos DBM:', e);
      setProposals([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [companyId, searchTerm, phaseFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProposals();
    }, 200);
    return () => clearTimeout(timer);
  }, [fetchProposals]);

  const handleOpenProposal = useCallback((prop: DbmProposalRow) => {
    const params = new URLSearchParams();
    params.set('proposal_id', String(prop.id));
    if (prop.customer_id) {
      params.set('customer_id', String(prop.customer_id));
    }
    router.push(`/proposals/desk?${params.toString()}`);
  }, [router]);

  const handleDeleteProposal = async (prop: DbmProposalRow, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!window.confirm(`Deseja realmente excluir o Orçamento #${prop.local_id} de "${prop.customer_name}"?`)) {
      return;
    }

    setDeletingId(prop.id);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/dbm/proposals/${prop.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success(`Orçamento #${prop.local_id} excluído.`);
        fetchProposals();
      } else {
        toast.error('Não foi possível excluir o orçamento.');
      }
    } catch {
      toast.error('Erro de conexão ao excluir orçamento.');
    } finally {
      setDeletingId(null);
    }
  };

  // Navegação por teclado estilo Access / Excel (↑, ↓, Enter)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if (proposals.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(proposals.length - 1, prev + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(0, prev - 1));
      } else if (e.key === 'Enter' && selectedIndex >= 0 && proposals[selectedIndex]) {
        e.preventDefault();
        handleOpenProposal(proposals[selectedIndex]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [proposals, selectedIndex, handleOpenProposal]);

  const handleNavigateRecord = (direction: 'first' | 'prev' | 'next' | 'last') => {
    if (proposals.length === 0) return;
    if (direction === 'first') setSelectedIndex(0);
    if (direction === 'prev') setSelectedIndex(prev => Math.max(0, prev - 1));
    if (direction === 'next') setSelectedIndex(prev => Math.min(proposals.length - 1, prev + 1));
    if (direction === 'last') setSelectedIndex(proposals.length - 1);
  };

  return (
    <div className="space-y-4 pb-16">
      {/* ── Barra Superior Estilo Access Moderno (Menu | Orçamentos & Propostas | + Novo) ── */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 p-1.5 rounded-2xl backdrop-blur-sm overflow-x-auto scrollbar-none">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => router.push('/dbm')}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition-colors shrink-0"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Menu DBM
          </button>

          <span className="text-slate-300 dark:text-slate-700">|</span>

          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/60 shadow-xs shrink-0">
            <FileText className="h-3.5 w-3.5" />
            Orçamentos & Propostas
          </div>

          <span className="text-slate-300 dark:text-slate-700">|</span>

          <button
            onClick={() => router.push('/dbm/companies')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition-colors shrink-0"
          >
            <Building2 className="h-3.5 w-3.5" />
            Empresas
          </button>
        </div>

        <Link
          href="/proposals/desk"
          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-500 transition-colors shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          Novo Orçamento
        </Link>
      </div>

      {/* ── Painel de Filtro Limpo e Direto ───────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-sm dark:border-slate-800/80 dark:bg-slate-900 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
              Orçamentos & Propostas
            </h1>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono">
              Folha de Dados
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchProposals}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              title="Atualizar lista"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
              Atualizar
            </button>
          </div>
        </div>

        {/* Busca + Filtro Rápido de Status */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por cliente, apelido, CNPJ ou nº do orçamento..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-9 pr-8 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
            {PHASE_FILTERS.map((pf) => (
              <button
                key={pf.key}
                type="button"
                onClick={() => setPhaseFilter(pf.key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                  phaseFilter === pf.key
                    ? 'bg-slate-900 text-white dark:bg-indigo-600 shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {pf.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Grade Estilo Access Moderno (Enxuta, Direta e Relevante) ──────── */}
      <div className="rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-800/90 dark:bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-2.5 px-3 w-20 text-center">Nº</th>
                <th className="py-2.5 px-3 w-36">Data</th>
                <th className="py-2.5 px-3">Cliente / Empresa</th>
                <th className="py-2.5 px-3 w-32 text-center">Itens / Peças</th>
                <th className="py-2.5 px-3 w-32 text-right">Total Líquido</th>
                <th className="py-2.5 px-3 w-48 text-center">Status</th>
                <th className="py-2.5 px-3 w-36 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-[12px]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-indigo-500" />
                    Carregando orçamentos e propostas...
                  </td>
                </tr>
              ) : proposals.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 space-y-1.5">
                    <FileText className="h-8 w-8 mx-auto opacity-30" />
                    <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      Nenhum orçamento encontrado.
                    </div>
                  </td>
                </tr>
              ) : (
                proposals.map((prop, idx) => {
                  const isSelected = selectedIndex === idx;
                  const phaseStyle = getPhaseStyle(prop.status_phase);
                  return (
                    <tr
                      key={prop.id}
                      onClick={() => setSelectedIndex(idx)}
                      onDoubleClick={() => handleOpenProposal(prop)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-100'
                          : idx % 2 === 0
                            ? 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                            : 'bg-slate-50/40 dark:bg-slate-800/20 hover:bg-slate-100/60 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      {/* Nº do Orçamento */}
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-700 dark:text-slate-300">
                        #{prop.local_id}
                      </td>

                      {/* Data */}
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {formatDateTimeBR(prop.updated_at || prop.created_at)}
                      </td>

                      {/* Cliente */}
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900 dark:text-white truncate max-w-md">
                          {prop.customer_name}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono flex items-center gap-2">
                          {prop.customer_corporate_name && prop.customer_corporate_name !== prop.customer_name && (
                            <span className="font-sans truncate max-w-xs">{prop.customer_corporate_name}</span>
                          )}
                          {prop.customer_horus_cod_cli && (
                            <span className="px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 text-[10px] font-bold">
                              CLI #{prop.customer_horus_cod_cli}
                            </span>
                          )}
                          {prop.horus_order_number && (
                            <span className="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 text-[10px] font-bold">
                              Ped. Hórus #{prop.horus_order_number}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Itens / Peças */}
                      <td className="py-2.5 px-3 text-center font-mono text-[11px] text-slate-700 dark:text-slate-300">
                        <span className="font-bold">{prop.total_titles}</span> tít. •{' '}
                        <span className="font-bold">{prop.total_approved_qty}</span> un
                      </td>

                      {/* Total Líquido */}
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                        {(prop.total_net_value || 0).toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL'
                        })}
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${phaseStyle.bg} ${phaseStyle.border} ${phaseStyle.text}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${phaseStyle.dot}`} />
                          {prop.status_name}
                        </span>
                      </td>

                      {/* Ações */}
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenProposal(prop);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold text-indigo-600 bg-indigo-50/70 hover:bg-indigo-100 dark:text-indigo-300 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 transition-colors"
                            title="Abrir orçamento na Mesa Comercial"
                          >
                            <Edit3 className="h-3 w-3" />
                            Abrir
                          </button>

                          <button
                            type="button"
                            disabled={deletingId === prop.id}
                            onClick={(e) => handleDeleteProposal(prop, e)}
                            className="inline-flex items-center justify-center rounded-lg p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors disabled:opacity-40"
                            title="Excluir orçamento"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé da Grade (Navegação Estilo Access) */}
        <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 dark:text-slate-400 font-semibold mr-1">
              Registro:
            </span>
            <button
              type="button"
              onClick={() => handleNavigateRecord('first')}
              disabled={proposals.length === 0 || selectedIndex <= 0}
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30"
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => handleNavigateRecord('prev')}
              disabled={proposals.length === 0 || selectedIndex <= 0}
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-1 px-1.5">
              <span className="font-mono font-bold text-slate-800 dark:text-white">
                {selectedIndex >= 0 ? selectedIndex + 1 : 0}
              </span>
              <span className="text-slate-400">de</span>
              <span className="font-mono font-bold text-slate-800 dark:text-white">
                {proposals.length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleNavigateRecord('next')}
              disabled={proposals.length === 0 || selectedIndex >= proposals.length - 1}
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => handleNavigateRecord('last')}
              disabled={proposals.length === 0 || selectedIndex >= proposals.length - 1}
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30"
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-4 text-slate-500 dark:text-slate-400">
            <span className="hidden sm:inline text-[11px]">
              Dica: Duplo clique ou <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-white dark:bg-slate-900 rounded border border-slate-300 dark:border-slate-700">Enter</kbd> para abrir
            </span>
            <span className="flex items-center gap-1 font-semibold">
              <span className="h-2 w-2 rounded-full bg-indigo-500" />
              Total: {totalCount} orçamento(s)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
