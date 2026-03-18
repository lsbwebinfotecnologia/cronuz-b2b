'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Plus, Loader2, Building, DollarSign, Wallet, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner'; // Assuming toast is imported from sonner or similar library

interface Customer {
  id: number;
  name: string;
  document: string;
  credit_limit: number;
  consignment_status: string;
  open_debts: number;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  
  // Pagination
  const [page, setPage] = useState(1);
  const limit = 25;
  const [hasMore, setHasMore] = useState(true);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // reset to first page on new search
    }, 500);
    return () => clearTimeout(handler);
  }, [search]);

  useEffect(() => {
    fetchCustomers(page, debouncedSearch);
  }, [page, debouncedSearch]);

  async function fetchCustomers(currentPage: number, searchTerm: string) {
    setLoading(true);
    try {
      const token = getToken();
      if (!token) return;

      const skip = (currentPage - 1) * limit;
      let url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/customers?skip=${skip}&limit=${limit}`;
      if (searchTerm) {
        url += `&search=${encodeURIComponent(searchTerm)}`;
      }

      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setCustomers(data);
        setHasMore(data.length === limit); // basic heuristic for next page
      }
    } catch (error) {
      toast.error('Erro ao listar clientes');
    } finally {
      setLoading(false);
    }
  }

  if (loading && page === 1 && !debouncedSearch) { // Only show full page loader on initial load
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  const totalCredit = customers.reduce((sum, c) => sum + c.credit_limit, 0);
  const totalDebts = customers.reduce((sum, c) => sum + c.open_debts, 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="h-6 w-6 text-[var(--color-primary-base)]" />
            Meus Clientes B2B
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Gestão de clientes, limites de crédito e consignação da sua empresa.
          </p>
        </div>
        
        <Link 
          href="/customers/new"
          className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-medium py-2.5 px-4 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-[var(--color-primary-base)]/20 hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          Novo Cliente
        </Link>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar clientes por nome ou CNPJ..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent transition-all shadow-sm dark:bg-slate-800/50 dark:border-slate-700 dark:text-white"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 flex items-center gap-4 dark:border-slate-800 dark:bg-slate-900/40 shadow-sm">
          <div className="p-3 bg-slate-100 rounded-xl dark:bg-slate-800/50">
            <Building className="h-6 w-6 text-slate-500 dark:text-slate-300" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total de Clientes</p>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">{customers.length}</h3>
          </div>
        </div>
        
        <div className="rounded-2xl border border-slate-200 bg-white p-5 flex items-center gap-4 dark:border-slate-800 dark:bg-slate-900/40 shadow-sm">
          <div className="p-3 bg-emerald-50 rounded-xl dark:bg-emerald-500/10">
            <DollarSign className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Crédito Liberado</p>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalCredit)}
            </h3>
          </div>
        </div>
        
        <div className="rounded-2xl border border-slate-200 bg-white p-5 flex items-center gap-4 dark:border-slate-800 dark:bg-slate-900/40 shadow-sm">
          <div className="p-3 bg-rose-50 rounded-xl dark:bg-rose-500/10">
            <Wallet className="h-6 w-6 text-rose-600 dark:text-rose-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Débitos B2B (Múltiplos Clientes)</p>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalDebts)}
            </h3>
          </div>
        </div>
      </div>

      {/* Datagrid */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm dark:border-slate-800 dark:bg-slate-900/40 dark:backdrop-blur-xl"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 font-medium dark:bg-slate-950/50 dark:text-slate-400">
              <tr>
                <th className="px-6 py-4">Cliente</th>
                <th className="px-6 py-4">CNPJ</th>
                <th className="px-6 py-4 text-right">Limite de Crédito</th>
                <th className="px-6 py-4 text-right">Débitos Abertos</th>
                <th className="px-6 py-4">Consignação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
              {loading ? (
                 <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400 mb-2" />
                    Buscando clientes...
                  </td>
                 </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    {debouncedSearch ? 'Nenhum cliente encontrado para sua pesquisa.' : 'Nenhum cliente na sua carteira ainda.'}
                  </td>
                </tr>
              ) : (
                customers.map((customer, i) => (
                  <motion.tr 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    key={customer.id} 
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <Link href={`/customers/${customer.id}`} className="font-medium text-slate-900 dark:text-slate-200 hover:text-[var(--color-primary-base)] dark:hover:text-[var(--color-primary-base)] hover:underline transition-colors block">
                        {customer.name}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-slate-500 dark:text-slate-400 font-mono text-xs">
                      <Link href={`/customers/${customer.id}`} className="hover:text-[var(--color-primary-base)] dark:hover:text-[var(--color-primary-base)] transition-colors block">
                        {customer.document}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-right text-emerald-600 dark:text-emerald-400 font-mono">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(customer.credit_limit)}
                    </td>
                    <td className="px-6 py-4 text-right text-rose-600 dark:text-rose-400 font-mono">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(customer.open_debts)}
                    </td>
                    <td className="px-6 py-4">
                      {customer.consignment_status === 'ACTIVE' ? (
                        <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20">
                          Liberada
                        </span>
                      ) : customer.consignment_status === 'BLOCKED' ? (
                         <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20">
                          Bloqueada
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-slate-50 text-slate-600 border border-slate-200 dark:bg-slate-500/10 dark:text-slate-400 dark:border-slate-500/20">
                          Inativa
                        </span>
                      )}
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination Controls */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800/60 flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
          <div>
            Mostrando página {page} {loading && <Loader2 className="inline ml-2 h-3 w-3 animate-spin text-[var(--color-primary-base)]"/>}
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:bg-slate-700 dark:text-slate-300 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button 
              onClick={() => setPage(p => p + 1)}
              disabled={!hasMore || loading}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:bg-slate-700 dark:text-slate-300 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
