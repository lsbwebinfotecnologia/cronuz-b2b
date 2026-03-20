'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Building2, Plus, Users, ShieldAlert, Loader2, Globe, Building } from 'lucide-react';
import Link from 'next/link';
import { getToken } from '@/lib/auth';

interface Company {
  id: number;
  name: string;
  document: string;
  domain: string;
  logo: string | null;
  active: boolean;
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCompanies() {
      let apiUrl = '';
      try {
        const token = getToken();
        if(!token) return;
        apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const res = await fetch(`${apiUrl}/companies`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
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
            Empresas B2B
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
          Nova Empresa
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 flex items-center gap-4 dark:border-slate-800 dark:bg-slate-900/40 shadow-sm">
          <div className="p-3 bg-slate-100 rounded-xl dark:bg-slate-800/50">
            <Building className="h-6 w-6 text-slate-500 dark:text-slate-300" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total de Empresas</p>
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

      {/* Datagrid */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm dark:border-slate-800 dark:bg-slate-900/40 dark:backdrop-blur-xl transition-colors">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 font-medium dark:bg-slate-950/50 dark:text-slate-400">
              <tr>
                <th className="px-6 py-4">Empresa</th>
                <th className="px-6 py-4">CNPJ</th>
                <th className="px-6 py-4">Domínio</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Membros</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
              {companies.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    Nenhuma empresa encontrada debaixo do seu cadastro.
                  </td>
                </tr>
              ) : (
                companies.map((company, i) => (
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
                          <img src={company.logo} alt={company.name} className="h-8 w-8 rounded-lg object-contain bg-slate-100 p-1 dark:bg-white/5" />
                        ) : (
                          <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center group-hover:bg-slate-200 transition-colors dark:bg-slate-800 dark:group-hover:bg-slate-700">
                            <Building2 className="h-4 w-4 text-slate-400 group-hover:text-slate-600 transition-colors dark:group-hover:text-white" />
                          </div>
                        )}
                        <span className="font-medium text-slate-900 group-hover:text-[var(--color-primary-base)] transition-colors dark:text-slate-200 dark:group-hover:text-indigo-300">{company.name}</span>
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-slate-500 font-mono text-xs dark:text-slate-400">{company.document}</td>
                    <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{company.domain}</td>
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
