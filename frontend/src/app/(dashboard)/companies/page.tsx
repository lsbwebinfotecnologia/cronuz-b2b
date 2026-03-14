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
      try {
        const token = getToken();
        if(!token) return;
        const res = await fetch('http://localhost:8000/companies', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setCompanies(data);
        }
      } catch (error) {
        console.error("Erro ao buscar empresas", error);
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
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Building2 className="h-6 w-6 text-[var(--color-primary-base)]" />
            Empresas B2B
          </h1>
          <p className="text-slate-400 text-sm mt-1">
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
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 flex items-center gap-4">
          <div className="p-3 bg-slate-800/50 rounded-xl">
            <Building className="h-6 w-6 text-slate-300" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-400">Total de Empresas</p>
            <h3 className="text-2xl font-bold text-white mt-0.5">{companies.length}</h3>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 flex items-center gap-4">
          <div className="p-3 bg-emerald-500/10 rounded-xl">
            <Globe className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-400">Ambientes Ativos</p>
            <h3 className="text-2xl font-bold text-white mt-0.5">{companies.filter(c => c.active).length}</h3>
          </div>
        </div>
      </div>

      {/* Datagrid */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-950/50 text-slate-400 font-medium">
              <tr>
                <th className="px-6 py-4">Empresa</th>
                <th className="px-6 py-4">CNPJ</th>
                <th className="px-6 py-4">Domínio</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Membros</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
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
                    className="hover:bg-slate-800/20 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <Link href={`/companies/${company.id}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer group">
                        {company.logo ? (
                          <img src={company.logo} alt={company.name} className="h-8 w-8 rounded-lg object-contain bg-white/5 p-1" />
                        ) : (
                          <div className="h-8 w-8 rounded-lg bg-slate-800 flex items-center justify-center group-hover:bg-slate-700 transition-colors">
                            <Building2 className="h-4 w-4 text-slate-400 group-hover:text-white transition-colors" />
                          </div>
                        )}
                        <span className="font-medium text-slate-200 group-hover:text-indigo-300 transition-colors">{company.name}</span>
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-slate-400 font-mono text-xs">{company.document}</td>
                    <td className="px-6 py-4 text-slate-400">{company.domain}</td>
                    <td className="px-6 py-4">
                      {company.active ? (
                        <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Ativa
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          Inativa
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link 
                        href={`/companies/${company.id}/users/new`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-300 hover:text-white bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-lg transition-colors"
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
