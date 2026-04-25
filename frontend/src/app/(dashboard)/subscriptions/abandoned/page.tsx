"use client";

import { useState, useEffect } from 'react';
import { ShoppingCart, Users, Search, Calendar, Mail, Phone } from 'lucide-react';
import Link from 'next/link';
import { getToken } from '@/lib/auth';

interface AbandonedCheckout {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    plan_name: string;
    created_at: string;
}

export default function AbandonedCheckoutsPage() {
    const [leads, setLeads] = useState<AbandonedCheckout[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchAbandoned = async () => {
        setLoading(true);
        try {
            const token = getToken();
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const response = await fetch(`${apiUrl}/subscriptions/abandoned`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                const data = await response.json();
                setLeads(data);
            }
        } catch (error) {
            console.error("Error fetching abandoned checkouts:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAbandoned();
    }, []);

    return (
        <div className="space-y-6 animate-in py-6 max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
                        <ShoppingCart className="h-6 w-6 text-rose-500" />
                        Checkouts Abandonados
                    </h1>
                    <p className="text-slate-500 mt-1 dark:text-slate-400">
                        Clientes que iniciaram o preenchimento de assinatura mas não finalizaram.
                    </p>
                </div>
                
                <div className="flex items-center gap-3">
                    <Link
                        href="/subscriptions"
                        className="bg-white border border-slate-200 dark:bg-slate-800 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium py-2.5 px-4 rounded-xl flex items-center gap-2 transition-all shadow-sm"
                    >
                        Voltar para Planos
                    </Link>
                </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-slate-800 dark:bg-slate-900/50 backdrop-blur-xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-slate-50 text-slate-500 font-medium dark:bg-slate-950/50 dark:text-slate-400">
                            <tr>
                                <th className="px-6 py-4">Nome do Contato</th>
                                <th className="px-6 py-4">E-mail</th>
                                <th className="px-6 py-4">Telefone</th>
                                <th className="px-6 py-4">Plano Abandonado</th>
                                <th className="px-6 py-4 text-right">Data/Hora</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
                            {loading ? (
                                Array(3).fill(0).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td className="px-6 py-4"><div className="h-4 w-48 bg-slate-200 rounded dark:bg-slate-700"></div></td>
                                        <td className="px-6 py-4"><div className="h-4 w-32 bg-slate-200 rounded dark:bg-slate-700"></div></td>
                                        <td className="px-6 py-4"><div className="h-4 w-24 bg-slate-200 rounded dark:bg-slate-700"></div></td>
                                        <td className="px-6 py-4"><div className="h-4 w-32 bg-slate-200 rounded dark:bg-slate-700"></div></td>
                                        <td className="px-6 py-4"><div className="h-4 w-24 bg-slate-200 rounded ml-auto dark:bg-slate-700"></div></td>
                                    </tr>
                                ))
                            ) : leads.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center">
                                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 mb-4">
                                            <Users className="h-6 w-6 text-slate-400" />
                                        </div>
                                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Nenhum abandono registrado</h3>
                                        <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1 dark:text-slate-400">
                                            Ainda não há registros de clientes que abandonaram o checkout.
                                        </p>
                                    </td>
                                </tr>
                            ) : (
                                leads.map((lead) => (
                                    <tr key={lead.id} className="hover:bg-slate-50/50 transition-colors dark:hover:bg-slate-800/20">
                                        <td className="px-6 py-4">
                                            <div className="font-semibold text-slate-900 dark:text-white">
                                                {lead.name}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <a href={`mailto:${lead.email}`} className="flex items-center gap-2 text-slate-600 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400">
                                                <Mail className="h-3.5 w-3.5 opacity-70" />
                                                {lead.email}
                                            </a>
                                        </td>
                                        <td className="px-6 py-4">
                                            {lead.phone ? (
                                                <a href={`https://wa.me/55${lead.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-slate-600 hover:text-green-600 dark:text-slate-300 dark:hover:text-green-400">
                                                    <Phone className="h-3.5 w-3.5 opacity-70" />
                                                    {lead.phone}
                                                </a>
                                            ) : (
                                                <span className="text-slate-400">-</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-md border bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                                                {lead.plan_name}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right text-slate-500 dark:text-slate-400">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <Calendar className="h-3.5 w-3.5 opacity-70" />
                                                {new Date(lead.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
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
