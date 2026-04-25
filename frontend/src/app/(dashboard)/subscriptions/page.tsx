"use client";

import { useState, useEffect } from 'react';
import { 
  Layers, Search, Plus, ExternalLink, CheckCircle2, XCircle, MoreVertical, Copy, ShoppingCart
} from 'lucide-react';
import Link from 'next/link';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';

interface SubscriptionPlan {
    id: number;
    name: string;
    description: string;
    price_per_issue: number;
    issues_per_delivery: number;
    delivery_frequency: string;
    max_subscribers_limit: number | null;
    current_subscribers_count: number;
    is_active: boolean;
    hotsite_slug: string;
    presale_discount_percent: number;
    launch_discount_percent: number;
}

export default function SubscriptionsPage() {
    const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchPlans = async () => {
        setLoading(true);
        try {
            const token = getToken();
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const response = await fetch(`${apiUrl}/subscriptions`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                const data = await response.json();
                setPlans(data);
            }
        } catch (error) {
            console.error("Error fetching subscription plans:", error);
            toast.error("Erro ao comunicar com o servidor");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPlans();
    }, []);

    const copyHotsiteLink = (slug: string) => {
        const url = `${window.location.origin}/h/${slug}`;
        navigator.clipboard.writeText(url);
        toast.success("Link do Hotsite copiado para a área de transferência!");
    };

    return (
        <div className="space-y-6 animate-in py-6 max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
                        <Layers className="h-6 w-6 text-[var(--color-primary-base)]" />
                        Planos de Assinatura
                    </h1>
                    <p className="text-slate-500 mt-1 dark:text-slate-400">
                        Gerencie as assinaturas, limites de exemplares e conteúdos do Hotsite.
                    </p>
                </div>
                
                <div className="flex items-center gap-3">
                    <Link
                        href="/subscriptions/abandoned"
                        className="bg-white hover:bg-slate-50 text-rose-500 font-medium py-2.5 px-4 rounded-xl flex items-center gap-2 transition-all shadow-sm border border-slate-200 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
                    >
                        <ShoppingCart className="h-4 w-4" />
                        Abandonados
                    </Link>
                    <Link
                        href="/subscriptions/new"
                        className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-medium py-2.5 px-4 rounded-xl flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-sm"
                    >
                        <Plus className="h-4 w-4" />
                        Novo Plano
                    </Link>
                </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-slate-800 dark:bg-slate-900/50 backdrop-blur-xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-slate-50 text-slate-500 font-medium dark:bg-slate-950/50 dark:text-slate-400">
                            <tr>
                                <th className="px-6 py-4">Plano</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Limites (Assinantes)</th>
                                <th className="px-6 py-4">Preço (Fascículo)</th>
                                <th className="px-6 py-4">Descontos Base</th>
                                <th className="px-6 py-4 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
                            {loading ? (
                                Array(3).fill(0).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td className="px-6 py-4"><div className="h-4 w-48 bg-slate-200 rounded dark:bg-slate-700"></div></td>
                                        <td className="px-6 py-4"><div className="h-4 w-24 bg-slate-200 rounded dark:bg-slate-700"></div></td>
                                        <td className="px-6 py-4"><div className="h-4 w-20 bg-slate-200 rounded dark:bg-slate-700"></div></td>
                                        <td className="px-6 py-4"><div className="h-4 w-24 bg-slate-200 rounded dark:bg-slate-700"></div></td>
                                        <td className="px-6 py-4"><div className="h-4 w-24 bg-slate-200 rounded dark:bg-slate-700"></div></td>
                                        <td className="px-6 py-4"><div className="h-4 w-12 bg-slate-200 rounded ml-auto dark:bg-slate-700"></div></td>
                                    </tr>
                                ))
                            ) : plans.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center">
                                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 mb-4">
                                            <Layers className="h-6 w-6 text-slate-400" />
                                        </div>
                                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Nenhum plano encontrado</h3>
                                        <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1 dark:text-slate-400">
                                            Você ainda não criou nenhum plano de assinatura recorrente.
                                        </p>
                                    </td>
                                </tr>
                            ) : (
                                plans.map((plan) => (
                                    <tr key={plan.id} className="hover:bg-slate-50/50 transition-colors dark:hover:bg-slate-800/20">
                                        <td className="px-6 py-4">
                                            <div className="font-semibold text-slate-900 dark:text-white">
                                                {plan.name}
                                            </div>
                                            <div className="flex items-center gap-1.5 mt-1 text-slate-500 text-xs dark:text-slate-400 hover:text-indigo-500 cursor-pointer" onClick={() => copyHotsiteLink(plan.hotsite_slug)}>
                                                <ExternalLink className="h-3 w-3" />
                                                /h/{plan.hotsite_slug}
                                                <Copy className="h-3 w-3 ml-1" />
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md border ${
                                                plan.is_active 
                                                    ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' 
                                                    : 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20'
                                            }`}>
                                                {plan.is_active ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                                                {plan.is_active ? 'Hotsite Ativo' : 'Pausado'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-1 items-start">
                                                <span className="font-medium text-slate-900 dark:text-white">
                                                    {plan.current_subscribers_count} 
                                                    <span className="text-slate-400 font-normal"> / {plan.max_subscribers_limit || 'Ilimitado'}</span>
                                                </span>
                                                {plan.max_subscribers_limit && (
                                                    <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden dark:bg-slate-800">
                                                        <div 
                                                            className="h-full bg-[var(--color-primary-base)]" 
                                                            style={{ width: `${Math.min(100, (plan.current_subscribers_count / plan.max_subscribers_limit) * 100)}%` }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-semibold text-slate-900 dark:text-white">
                                                R$ {Number(plan.price_per_issue).toFixed(2).replace('.', ',')}
                                            </div>
                                            <div className="text-xs text-slate-500 mt-0.5">
                                                {plan.issues_per_delivery} fascículos/envio
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-1 text-xs">
                                                {plan.presale_discount_percent > 0 && (
                                                    <span className="text-amber-600 dark:text-amber-400">Pré-venda: -{plan.presale_discount_percent}%</span>
                                                )}
                                                {plan.launch_discount_percent > 0 && (
                                                    <span className="text-emerald-600 dark:text-emerald-400">Lançamento: -{plan.launch_discount_percent}%</span>
                                                )}
                                                {plan.presale_discount_percent === 0 && plan.launch_discount_percent === 0 && (
                                                     <span className="text-slate-400">-</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <Link
                                                href={`/subscriptions/${plan.id}`}
                                                className="inline-flex items-center justify-center p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-colors dark:hover:text-indigo-400 dark:hover:bg-slate-800"
                                            >
                                                <MoreVertical className="h-5 w-5" />
                                            </Link>
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
