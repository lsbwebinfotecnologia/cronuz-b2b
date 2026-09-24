'use client';

import { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Building2, Plus, Users, ShieldAlert, Loader2, Globe, Building, Search, X, ArrowDownAZ, Clock, SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';
import { getToken, getUser } from '@/lib/auth';
import { getImageUrl } from '@/lib/image_helper';

interface Company {
  id: string | number;
  name: string;
  document: string;
  domain: string;
  custom_domain?: string;
  logo: string | null;
  login_background_url?: string | null;
  active: boolean;
  created_at: string;
  module_horus_erp?: boolean;
  tenant_id?: string;
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'alphabetical' | 'name_desc'>('recent');

  useEffect(() => {
    async function fetchCompanies() {
      let apiUrl = '';
      try {
        const token = getToken();
        if(!token) return;
        apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const res = await fetch(`${apiUrl}/companies?order_by=recent`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          let data = await res.json();
          const user = getUser();
          
          if (user?.tenant_id === 'horus') {
            data = data.filter((c: any) => c.module_horus_erp === true || c.tenant_id === 'horus' || c.domain?.includes('horus'));
          }
          
          setCompanies(data);
        }
      } catch (error: any) {
        console.error("Erro ao buscar empresas", error, "URL:", `${apiUrl}/companies`);
        alert(`Erro ao acessar: ${apiUrl}/companies. O backend pode estar offline ou bloqueado.`);
      } finally {
        setLoading(false);
      }
    }
    fetchCompanies();
  }, []);

  const filteredAndSortedCompanies = useMemo(() => {
    let result = [...companies];

    const term = searchQuery.trim().toLowerCase();
    if (term) {
      const cleanTerm = term.replace(/\D/g, '');
      result = result.filter(c => {
        const nameMatch = c.name?.toLowerCase().includes(term);
        const docMatch = c.document?.toLowerCase().includes(term) || (cleanTerm.length >= 3 && c.document?.replace(/\D/g, '').includes(cleanTerm));
        const domainMatch = c.domain?.toLowerCase().includes(term) || c.custom_domain?.toLowerCase().includes(term);
        return Boolean(nameMatch || docMatch || domainMatch);
      });
    }

    if (sortBy === 'alphabetical') {
      result.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' }));
    } else if (sortBy === 'name_desc') {
      result.sort((a, b) => (b.name || '').localeCompare(a.name || '', 'pt-BR', { sensitivity: 'base' }));
    } else {
      result.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        if (dateB !== dateA) return dateB - dateA;
        return Number(b.id) - Number(a.id);
      });
    }

    return result;
  }, [companies, searchQuery, sortBy]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Building2 className="h-6 w-6 text-[var(--color-primary-base)]" />
            Parceiros B2B
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Gerencie todas as organizações cadastradas no portal Cronuz.
          </p>
        </div>
        
        <Link 
          href="/companies/new"
          className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-medium py-2.5 px-4 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-[var(--color-primary-base)]/20 hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          Novo Parceiro
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 flex items-center gap-4 dark:border-slate-800 dark:bg-slate-900/40 shadow-sm">
          <div className="p-3 bg-slate-100 rounded-xl dark:bg-slate-800/50">
            <Building className="h-6 w-6 text-slate-500 dark:text-slate-300" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total de Parceiros</p>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">{companies.length}</h3>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 flex items-center gap-4 dark:border-slate-800 dark:bg-slate-900/40 shadow-sm">
          <div className="p-3 bg-emerald-50 rounded-xl dark:bg-emerald-500/10">
            <Globe className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Ambientes Ativos</p>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">{companies.filter(c => c.active).length}</h3>
          </div>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Pesquisar por nome, CNPJ ou domínio..."
              className="w-full pl-10 pr-9 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)]/20 focus:border-[var(--color-primary-base)] transition-all shadow-sm"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Limpar pesquisa"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Sort Controls */}
          <div className="flex items-center gap-2">
            <div className="relative flex items-center w-full sm:w-auto">
              <label htmlFor="company-sort-select" className="sr-only">Ordenar parceiros</label>
              <div className="absolute left-3 pointer-events-none text-slate-400">
                {sortBy === 'recent' ? (
                  <Clock className="h-4 w-4 text-[var(--color-primary-base)]" />
                ) : (
                  <ArrowDownAZ className="h-4 w-4 text-[var(--color-primary-base)]" />
                )}
              </div>
              <select
                id="company-sort-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full sm:w-auto pl-9 pr-9 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)]/20 focus:border-[var(--color-primary-base)] transition-all shadow-sm cursor-pointer appearance-none"
              >
                <option value="recent">Última Registrada</option>
                <option value="alphabetical">Ordem Alfabética (A-Z)</option>
                <option value="name_desc">Ordem Alfabética (Z-A)</option>
              </select>
              <div className="absolute right-3 pointer-events-none text-slate-400">
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </div>
            </div>
          </div>
        </div>

        {/* Results summary if searching */}
        {searchQuery && (
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1 pt-1">
            <span>
              Exibindo <strong>{filteredAndSortedCompanies.length}</strong> de <strong>{companies.length}</strong> parceiro(s) encontrado(s)
            </span>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-[var(--color-primary-base)] hover:underline font-medium"
            >
              Limpar busca
            </button>
          </div>
        )}
      </div>

      {/* Datagrid */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm dark:border-slate-800 dark:bg-slate-900/40 dark:backdrop-blur-xl transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 font-medium dark:bg-slate-950/50 dark:text-slate-400">
              <tr>
                <th className="px-6 py-4">Parceiro</th>
                <th className="px-6 py-4">CNPJ</th>
                <th className="px-6 py-4">Domínio</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Membros</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
              {filteredAndSortedCompanies.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    {searchQuery ? (
                      <div className="space-y-2">
                        <Search className="h-8 w-8 mx-auto text-slate-300 dark:text-slate-600 mb-1" />
                        <p className="font-semibold text-slate-700 dark:text-slate-300">
                          Nenhum parceiro encontrado para &ldquo;{searchQuery}&rdquo;
                        </p>
                        <p className="text-xs text-slate-500">Tente buscar por outro termo ou limpe a pesquisa.</p>
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--color-primary-base)] bg-[var(--color-primary-base)]/10 hover:bg-[var(--color-primary-base)]/20 rounded-lg transition-colors"
                        >
                          Limpar pesquisa
                        </button>
                      </div>
                    ) : (
                      'Nenhum parceiro encontrado debaixo do seu cadastro.'
                    )}
                  </td>
                </tr>
              ) : (
                filteredAndSortedCompanies.map((company, i) => (
                  <motion.tr 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    key={company.id} 
                    className="hover:bg-slate-50 transition-colors dark:hover:bg-slate-800/20"
                  >
                    <td className="px-6 py-4">
                      <Link href={`/companies/${company.id}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer group">
                        {company.logo ? (
                          <img src={getImageUrl(company.logo)} alt={company.name} className="h-8 w-8 rounded-lg object-contain bg-slate-100 p-1 dark:bg-white/5" />
                        ) : (
                          <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center group-hover:bg-slate-200 transition-colors dark:bg-slate-800 dark:group-hover:bg-slate-700">
                            <Building2 className="h-4 w-4 text-slate-400 group-hover:text-slate-600 transition-colors dark:group-hover:text-white" />
                          </div>
                        )}
                        <span className="font-medium text-slate-900 group-hover:text-[var(--color-primary-base)] transition-colors dark:text-slate-200 dark:group-hover:text-indigo-300">{company.name}</span>
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-slate-500 font-mono text-xs dark:text-slate-400">{company.document}</td>
                    <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                      {company.domain ? (
                        <a href={company.domain.startsWith('http') ? company.domain : `https://${company.domain}`} target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-indigo-600 transition-colors">
                          {company.domain}
                        </a>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-4">
                      {company.active ? (
                        <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
                          Ativa
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20">
                          Inativa
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link 
                        href={`/companies/${company.id}/users/new`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors dark:text-indigo-300 dark:hover:text-white dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 dark:border-indigo-500/20"
                      >
                        <ShieldAlert className="h-3.5 w-3.5" />
                        Criar Admin
                      </Link>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
