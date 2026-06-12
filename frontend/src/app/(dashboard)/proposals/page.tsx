"use client";

import { useState, useEffect } from 'react';
import { 
  FileText, Search, Plus, Filter, Eye, Edit3, Trash2, Calendar, CheckCircle2, AlertTriangle, Play, RefreshCw, TrendingUp, Sparkles, User, Inbox, ArrowRight, Loader2
} from 'lucide-react';
import Link from 'next/link';
import { getToken } from '@/lib/auth';
import CustomerAutocomplete from '@/components/CustomerAutocomplete';

interface Proposal {
  id: number;
  local_id: number;
  title: string;
  relation_type: 'CUSTOMER' | 'LEAD' | 'MANUAL';
  customer_id?: number;
  lead_id?: string;
  manual_name?: string;
  manual_document?: string;
  manual_email?: string;
  manual_phone?: string;
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CONVERTED';
  subtotal: number;
  discount: number;
  shipping_cost: number;
  total: number;
  valid_from: string;
  valid_until: string;
  created_at: string;
}

const statusColorMap: Record<string, string> = {
  "DRAFT": "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700",
  "SENT": "bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300 border-sky-100 dark:border-sky-900/50",
  "ACCEPTED": "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 border-emerald-100 dark:border-emerald-900/50",
  "REJECTED": "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300 border-rose-100 dark:border-rose-900/50",
  "EXPIRED": "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300 border-amber-100 dark:border-amber-900/50",
  "CONVERTED": "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300 border-indigo-100 dark:border-indigo-900/50"
};

const statusLabelMap: Record<string, string> = {
  "DRAFT": "Rascunho",
  "SENT": "Enviada",
  "ACCEPTED": "Aceita",
  "REJECTED": "Recusada",
  "EXPIRED": "Expirada",
  "CONVERTED": "Convertida em Pedido"
};

export default function ProposalsPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [viewMode, setViewMode] = useState<string>('VIGOR');

  // Get initial range (current month)
  const getInitialDates = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    const format = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    return { start: format(first), end: format(last) };
  };

  const [startDate, setStartDate] = useState<string>(() => getInitialDates().start);
  const [endDate, setEndDate] = useState<string>(() => getInitialDates().end);
  const [filterType, setFilterType] = useState<'ALL' | 'CUSTOMER' | 'LEAD'>('ALL');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [selectedLeadId, setSelectedLeadId] = useState<string>('');
  const [leadsList, setLeadsList] = useState<any[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);

  // Local metric summaries
  const [metrics, setMetrics] = useState({
    total_count: 0,
    converted_count: 0,
    accepted_count: 0,
    sent_count: 0,
    draft_count: 0,
    total_value: 0,
    converted_value: 0
  });

  // Load leads list when filterType === 'LEAD'
  useEffect(() => {
    if (filterType === 'LEAD' && leadsList.length === 0) {
      const fetchLeads = async () => {
        setLoadingLeads(true);
        try {
          const token = getToken();
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
          const res = await fetch(`${apiUrl}/leads`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            setLeadsList(data || []);
          }
        } catch (e) {
          console.error("Error fetching leads", e);
        } finally {
          setLoadingLeads(false);
        }
      };
      fetchLeads();
    }
  }, [filterType, leadsList.length]);

  const fetchProposals = async () => {
    setLoading(true);
    try {
      const limit = 25;
      const skip = page * limit;
      const params = new URLSearchParams({
        skip: skip.toString(),
        limit: limit.toString()
      });

      if (searchTerm) {
        params.append('search', searchTerm);
      }
      if (viewMode !== 'ALL') {
        if (viewMode === 'VIGOR') {
          params.append('status', 'DRAFT,SENT');
        } else if (viewMode === 'REJECTED_EXPIRED') {
          params.append('status', 'REJECTED,EXPIRED');
        } else {
          params.append('status', viewMode);
        }
      }
      if (startDate) {
        params.append('start_date', startDate);
      }
      if (endDate) {
        params.append('end_date', endDate);
      }
      if (filterType === 'CUSTOMER' && selectedCustomerId) {
        params.append('customer_id', selectedCustomerId);
      }
      if (filterType === 'LEAD' && selectedLeadId) {
        params.append('lead_id', selectedLeadId);
      }

      const token = getToken();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${apiUrl}/proposals?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setProposals(data.items || []);
        setTotal(data.total || 0);
        if (data.metrics) {
          setMetrics(data.metrics);
        }
      }
    } catch (error) {
      console.error("Error fetching proposals:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchProposals();
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [searchTerm, page, viewMode, startDate, endDate, filterType, selectedCustomerId, selectedLeadId]);

  const getRecipientLabel = (proposal: Proposal) => {
    if (proposal.relation_type === 'CUSTOMER') {
      return (
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
            <Building2Icon className="w-3.5 h-3.5 text-[var(--color-primary-base)]" />
            Cliente ID #{proposal.customer_id}
          </span>
          <span className="text-xs text-slate-400 font-mono">B2B Base</span>
        </div>
      );
    }
    if (proposal.relation_type === 'LEAD') {
      return (
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-sky-600 dark:text-sky-400 flex items-center gap-1.5">
            <Inbox className="w-3.5 h-3.5" />
            Lead: {proposal.lead_id}
          </span>
          <span className="text-xs text-slate-400">Canal inbound</span>
        </div>
      );
    }
    return (
      <div className="flex flex-col">
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
          <User className="w-3.5 h-3.5 text-slate-500" />
          {proposal.manual_name}
        </span>
        {proposal.manual_document && (
          <span className="text-xs text-slate-500 font-mono">{proposal.manual_document}</span>
        )}
      </div>
    );
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <FileText className="w-8 h-8 text-[var(--color-primary-base)]" />
            Módulo de Propostas Comerciais
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Gere, negocie e converta orçamentos com clientes, leads ou contatos manuais de forma centralizada.
          </p>
        </div>
        <Link
          href="/proposals/new"
          className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white px-5 py-2.5 rounded-xl font-medium transition-colors flex items-center gap-2 shadow-sm w-full sm:w-auto justify-center"
        >
          <Plus className="w-5 h-5" />
          Nova Proposta
        </Link>
      </div>

      {/* Metrics Summary Panels */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-[var(--color-primary-base)]/10 to-transparent rounded-bl-full pointer-events-none" />
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total em Negociações</p>
          <p className="text-3xl font-black text-slate-800 dark:text-white mt-2">
            R$ {metrics.total_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
          <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Engloba propostas rascunhadas e enviadas</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-indigo-500/10 to-transparent rounded-bl-full pointer-events-none" />
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Efetivadas (Aceitas / Convertidas)</p>
          <p className="text-3xl font-black text-indigo-600 dark:text-indigo-400 mt-2">
            R$ {metrics.converted_value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </p>
          <div className="mt-4 flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400 font-medium">
            <TrendingUp className="w-3.5 h-3.5 animate-pulse" />
            <span>Faturamento aceito/gerado a partir de propostas</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-emerald-500/10 to-transparent rounded-bl-full pointer-events-none" />
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Taxa de Sucesso</p>
          <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-2">
            {metrics.total_count > 0 
              ? `${Math.round(((metrics.converted_count + metrics.accepted_count) / metrics.total_count) * 100)}%`
              : "0%"
            }
          </p>
          <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>Percentual de propostas aceitas/convertidas</span>
          </div>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col">
        
        {/* Status Tabs */}
        <div className="flex gap-2 border-b border-slate-200 overflow-x-auto px-4 pt-4 bg-slate-50/50 dark:bg-slate-900/50 dark:border-slate-800">
          {[
            { id: 'VIGOR', label: 'Em Vigor' },
            { id: 'ALL', label: 'Todas as Propostas' },
            { id: 'DRAFT', label: 'Rascunhos' },
            { id: 'SENT', label: 'Enviadas' },
            { id: 'ACCEPTED', label: 'Aceitas' },
            { id: 'CONVERTED', label: 'Convertidas' },
            { id: 'REJECTED_EXPIRED', label: 'Recusadas / Expiradas' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => { setViewMode(tab.id); setPage(0); }}
              className={`pb-3 px-4 font-medium transition-colors border-b-2 flex items-center gap-2 whitespace-nowrap text-sm ${
                viewMode === tab.id 
                  ? 'border-[var(--color-primary-base)] text-slate-900 dark:text-white' 
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
            
            {/* Search Input */}
            <div className="lg:col-span-4 space-y-1">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide">Buscar</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por título ou contato manual..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPage(0);
                  }}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent transition-all text-sm"
                />
              </div>
            </div>

            {/* Date Filters */}
            <div className="lg:col-span-4 grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide">Período De</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setPage(0);
                    }}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-950 dark:text-white outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] text-sm"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide">Até</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setPage(0);
                    }}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-950 dark:text-white outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Recipient Filter Container */}
            <div className="lg:col-span-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide">Destinatário</label>
                  <select
                    value={filterType}
                    onChange={(e) => {
                      const val = e.target.value as 'ALL' | 'CUSTOMER' | 'LEAD';
                      setFilterType(val);
                      setSelectedCustomerId('');
                      setSelectedLeadId('');
                      setPage(0);
                    }}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-950 dark:text-white outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] text-sm"
                  >
                    <option value="ALL">Todos</option>
                    <option value="CUSTOMER">Filtrar por Cliente</option>
                    <option value="LEAD">Filtrar por Lead</option>
                  </select>
                </div>

                {filterType === 'CUSTOMER' && (
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide">Selecionar Cliente</label>
                    <CustomerAutocomplete
                      value={selectedCustomerId}
                      onChange={(id) => {
                        setSelectedCustomerId(id);
                        setPage(0);
                      }}
                      placeholder="Buscar cliente..."
                      className="[&>div:first-of-type]:py-1.5 [&>div:first-of-type]:rounded-xl [&>div:first-of-type]:bg-slate-50 dark:[&>div:first-of-type]:bg-slate-950"
                    />
                  </div>
                )}

                {filterType === 'LEAD' && (
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide">Selecionar Lead</label>
                    {loadingLeads ? (
                      <div className="flex items-center gap-2 h-9 text-xs text-slate-500"><Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--color-primary-base)]"/> Carregando...</div>
                    ) : (
                      <select
                        value={selectedLeadId}
                        onChange={(e) => {
                          setSelectedLeadId(e.target.value);
                          setPage(0);
                        }}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-950 dark:text-white outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] text-sm"
                      >
                        <option value="">-- Selecione o Lead --</option>
                        {leadsList.map(ld => (
                          <option key={ld.id} value={ld.id}>
                            {ld.name} {ld.company_name ? `(${ld.company_name})` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* Grid/Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                <th className="py-3 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Cód. Proposta</th>
                <th className="py-3 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Assunto/Título</th>
                <th className="py-3 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Destinatário</th>
                <th className="py-3 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Criação / Validade</th>
                <th className="py-3 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                <th className="py-3 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Total</th>
                <th className="py-3 px-6 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500 dark:text-slate-400">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-5 h-5 animate-spin text-[var(--color-primary-base)]" />
                      <span>Carregando propostas...</span>
                    </div>
                  </td>
                </tr>
              ) : proposals.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-500 dark:text-slate-400">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <FileText className="h-12 w-12 text-slate-300 dark:text-slate-700" />
                      <p className="font-medium text-slate-600 dark:text-slate-300">Nenhuma proposta encontrada</p>
                      <p className="text-xs text-slate-400">Use o botão no topo direito para criar uma proposta.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                proposals.map((proposal) => (
                  <tr key={proposal.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="py-4 px-6">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">#{proposal.local_id}</span>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex flex-col max-w-[240px]">
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate" title={proposal.title}>
                          {proposal.title}
                        </span>
                        <span className="text-[10px] text-slate-400">Sistema ID: {proposal.id}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      {getRecipientLabel(proposal)}
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex flex-col gap-0.5 text-xs text-slate-600 dark:text-slate-300">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          Criada: {new Date(proposal.created_at).toLocaleDateString('pt-BR')}
                        </span>
                        <span className="flex items-center gap-1 font-medium">
                          <ClockIcon className="w-3 h-3 text-slate-400" />
                          Vence: {new Date(proposal.valid_until).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${statusColorMap[proposal.status] || "bg-slate-100 text-slate-800 border-slate-200"}`}>
                        {statusLabelMap[proposal.status] || proposal.status}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right text-sm font-bold text-slate-950 dark:text-white">
                      R$ {proposal.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link 
                          href={`/proposals/${proposal.id}`}
                          className="inline-flex items-center p-2 text-slate-400 hover:text-[var(--color-primary-base)] hover:bg-[var(--color-primary-base)]/10 rounded-xl transition-colors"
                          title="Visualizar Proposta / Orçamento"
                        >
                          <Eye className="w-5 h-5" />
                        </Link>
                        {proposal.status !== 'CONVERTED' && (
                          <Link 
                            href={`/proposals/new?proposal_id=${proposal.id}`}
                            className="inline-flex items-center p-2 text-slate-400 hover:text-indigo-500 hover:bg-indigo-500/10 rounded-xl transition-colors"
                            title="Editar Proposta"
                          >
                            <Edit3 className="w-5 h-5" />
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && proposals.length > 0 && (
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between text-sm">
            <span className="text-slate-500 dark:text-slate-400">
              Mostrando {page * 25 + 1} a {Math.min((page + 1) * 25, total)} de {total}
            </span>
            <div className="flex gap-2">
              <button 
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-300 disabled:opacity-50 hover:bg-slate-50 transition-colors"
              >
                Anterior
              </button>
              <button 
                onClick={() => setPage(p => p + 1)}
                disabled={(page + 1) * 25 >= total}
                className="px-4 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-300 disabled:opacity-50 hover:bg-slate-50 transition-colors"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>
      
    </div>
  );
}

// Inline SVGs for consistent React flow
function Building2Icon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18" />
      <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
      <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
      <path d="M10 6h4" />
      <path d="M10 10h4" />
      <path d="M10 14h4" />
      <path d="M10 18h4" />
    </svg>
  );
}

function ClockIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
