'use client';

import { useState, useEffect } from 'react';
import { Plus, Search, Briefcase, FileText, Activity } from 'lucide-react';
import { toast } from 'sonner';
import { getToken } from '@/lib/auth';
import Link from 'next/link';

export default function ServicesPage() {
    const [services, setServices] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);

    const fetchServices = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/services?skip=${(page - 1) * 50}&limit=50&search=${search}`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (res.ok) {
                const data = await res.json();
                setServices(data.items);
                setTotal(data.total);
            }
        } catch (e) {
            toast.error("Erro ao carregar serviços");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchServices();
    }, [page]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
        fetchServices();
    };

    return (
        <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                        <Briefcase className="w-8 h-8 text-[var(--color-primary-base)]" />
                        Catálogo de Serviços
                    </h1>
                    <p className="text-sm text-slate-500 mt-2 dark:text-slate-400">
                        Gerencie serviços prestados, valores padrão e obrigações fiscais.
                    </p>
                </div>
                
                <div className="flex gap-2">
                    <Link href="/services/orders" className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition flex items-center gap-2 text-sm shadow-sm">
                        <FileText className="w-4 h-4"/> Ordens de Serviço
                    </Link>
                    <Link href="/services/create" className="px-5 py-2.5 bg-[var(--color-primary-base)] text-white rounded-xl font-semibold hover:opacity-90 shadow-sm transition flex items-center gap-2 text-sm">
                        <Plus className="w-4 h-4"/> Novo Serviço
                    </Link>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm flex items-center">
                <form onSubmit={handleSearch} className="flex gap-3 w-full max-w-md">
                    <div className="flex-1 relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
                        <input 
                            type="text" 
                            placeholder="Buscar serviço por nome..." 
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:border-[var(--color-primary-base)] transition-colors dark:text-slate-200"
                        />
                    </div>
                    <button type="submit" className="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 transition">
                        Buscar
                    </button>
                </form>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold uppercase text-xs">
                            <tr>
                                <th className="px-6 py-4">Serviço</th>
                                <th className="px-6 py-4">Valor Base</th>
                                <th className="px-6 py-4 text-center">Config. Fiscal / Retenções</th>
                                <th className="px-6 py-4 text-right">Ação</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={4} className="text-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-primary-base)] mx-auto"></div></td></tr>
                            ) : services.length === 0 ? (
                                <tr><td colSpan={4} className="text-center py-12 text-slate-500">Nenhum serviço encontrado.</td></tr>
                            ) : (
                                services.map(svc => {
                                    const hasRetentions = svc.reter_iss || svc.reter_inss || svc.reter_ir || svc.reter_pis || svc.reter_cofins || svc.reter_csll;
                                    return (
                                        <tr key={svc.id} className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-slate-900 dark:text-white">{svc.name}</div>
                                                {svc.codigo_lc116 && (
                                                    <div className="text-[10px] uppercase font-bold text-slate-500 mt-1">LC 116: {svc.codigo_lc116}</div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 font-bold text-emerald-600 dark:text-emerald-400">
                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL'}).format(svc.base_value)}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {hasRetentions ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/40 dark:text-amber-400 dark:border-amber-800/50">
                                                        <Activity className="w-3 h-3" /> COM RETENÇÃO
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
                                                        SEM RETENÇÃO
                                                    </span>
                                                )}
                                                {svc.aliquota_iss > 0 && <span className="ml-2 text-[10px] font-semibold text-slate-500">ISS: {svc.aliquota_iss}%</span>}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <Link href={`/services/${svc.id}/edit`} className="text-sm font-semibold text-[var(--color-primary-base)] hover:underline">
                                                    Editar
                                                </Link>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
