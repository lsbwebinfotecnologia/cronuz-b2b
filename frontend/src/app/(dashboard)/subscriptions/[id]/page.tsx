"use client";

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { Layers, ArrowLeft, Loader2, Save, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import HotsiteBuilder from '@/components/HotsiteBuilder';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';

export default function EditSubscriptionPlanPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [pageLoading, setPageLoading] = useState(true);
    
    const [formData, setFormData] = useState({
        name: '',
        hotsite_slug: '',
        description: '',
        price_per_issue: '',
        issues_per_delivery: 1,
        max_subscribers_limit: '',
        is_active: true,
        hotsite_config: {
            global: { logoUrl: '', primaryColor: '#e11d48', topMenu: [] as {label: string, targetId: string}[] },
            blocks: [] as any[]
        }
    });

    useEffect(() => {
        async function fetchPlan() {
            try {
                const token = getToken();
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
                const response = await fetch(`${apiUrl}/subscriptions/${id}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    
                    // Normalize the config to ensure builder doesn't crash
                    let config = data.hotsite_config;
                    if (!config || !config.global) {
                        config = { global: { logoUrl: '', primaryColor: '#e11d48', topMenu: [] }, blocks: [] };
                    }
                    if (!config.blocks) config.blocks = [];
                    if (!config.global.topMenu) config.global.topMenu = [];
                    
                    setFormData({
                        name: data.name,
                        hotsite_slug: data.hotsite_slug,
                        description: data.description || '',
                        price_per_issue: data.price_per_issue.toString().replace('.', ','),
                        issues_per_delivery: data.issues_per_delivery || 1,
                        max_subscribers_limit: data.max_subscribers_limit ? data.max_subscribers_limit.toString() : '',
                        is_active: data.is_active,
                        hotsite_config: config
                    });
                }
            } catch (error) {
                console.error("Failed to load plan", error);
            } finally {
                setPageLoading(false);
            }
        }
        if (id) {
            fetchPlan();
        }
    }, [id]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        
        let parsedValue: any = value;
        if (type === 'checkbox') {
            parsedValue = (e.target as HTMLInputElement).checked;
        }

        setFormData(prev => ({
            ...prev,
            [name]: parsedValue
        }));
    };


    const handleGenerateSlug = () => {
        if (!formData.name) return;
        const slug = formData.name
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
        setFormData(prev => ({ ...prev, hotsite_slug: slug }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const token = getToken();
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            
            const payload = {
                ...formData,
                price_per_issue: parseFloat(formData.price_per_issue.replace(',', '.')),
                max_subscribers_limit: formData.max_subscribers_limit ? parseInt(formData.max_subscribers_limit) : null,
            };

            const response = await fetch(`${apiUrl}/subscriptions/${id}`, {
                method: 'PUT',
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            
            if (response.ok) {
                toast.success("Plano de assinatura atualizado com sucesso!");
                router.refresh();
            } else {
                const err = await response.json();
                toast.error(err.detail || "Erro ao atualizar o plano.");
            }
        } catch (error) {
            console.error("Error creating plan:", error);
            toast.error("Erro de comunicação com o servidor.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 animate-in py-6 max-w-4xl mx-auto">
            <div className="flex items-center gap-4 border-b border-slate-200 pb-6 dark:border-slate-800">
                <Link 
                    href="/subscriptions"
                    className="p-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors text-slate-500 hover:text-slate-900 dark:bg-slate-800/50 dark:border-transparent dark:hover:bg-slate-800 dark:text-slate-400 dark:hover:text-white"
                >
                    <ArrowLeft className="h-5 w-5" />
                </Link>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                        Editar Plano de Assinatura
                    </h1>
                    <p className="text-sm text-slate-500 mt-1 dark:text-slate-400">
                        Ajuste os valores, limites e construtor visual da landpage.
                    </p>
                </div>
                {!pageLoading && formData.hotsite_slug && (
                    <Link
                        href={`/h/${formData.hotsite_slug}`}
                        target="_blank"
                        className="hidden sm:flex items-center gap-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors mt-2 dark:bg-indigo-500/10 dark:text-indigo-400 dark:hover:bg-indigo-500/20"
                    >
                        <ExternalLink className="w-4 h-4" />
                        Ver Página no Ar
                    </Link>
                )}
            </div>

            {pageLoading ? (
                <div className="flex justify-center items-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
                </div>
            ) : (

            <form onSubmit={handleSubmit} className="space-y-8 pb-12">
                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-slate-800/60 dark:bg-slate-900/40 backdrop-blur-xl">
                    <div className="p-6 border-b border-slate-200 dark:border-slate-800/60">
                         <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                            <Layers className="h-5 w-5 text-indigo-500 dark:text-indigo-400" />
                            Definições Básicas
                         </h2>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-1.5 md:col-span-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Nome da Coleção / Plano</label>
                            <input
                                type="text"
                                name="name"
                                required
                                value={formData.name}
                                onChange={handleChange}
                                onBlur={handleGenerateSlug}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all text-sm placeholder:text-slate-400 dark:bg-slate-950/50 dark:border-slate-800/60 dark:text-white"
                                placeholder="Ex: Racing Cars Colection"
                            />
                        </div>

                        <div className="space-y-1.5 md:col-span-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Hotsite URL Slug</label>
                            <div className="flex">
                                <span className="inline-flex items-center px-4 rounded-l-xl border border-r-0 border-slate-200 bg-slate-100 text-slate-500 text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 font-mono">
                                    /h/
                                </span>
                                <input
                                    type="text"
                                    name="hotsite_slug"
                                    required
                                    value={formData.hotsite_slug}
                                    onChange={handleChange}
                                    className="flex-1 bg-slate-50 border border-slate-200 rounded-r-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all text-sm placeholder:text-slate-400 font-mono dark:bg-slate-950/50 dark:border-slate-800/60 dark:text-white"
                                    placeholder="racing-cars"
                                />
                            </div>
                        </div>
                        
                        <div className="space-y-1.5 md:col-span-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Descrição Curta</label>
                            <textarea
                                name="description"
                                rows={3}
                                value={formData.description}
                                onChange={handleChange}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all text-sm placeholder:text-slate-400 resize-none dark:bg-slate-950/50 dark:border-slate-800/60 dark:text-white"
                                placeholder="Resumo que aparecerá no cabeçalho do Hotsite..."
                            />
                        </div>
                    </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-slate-800/60 dark:bg-slate-900/40 backdrop-blur-xl">
                    <div className="p-6 border-b border-slate-200 dark:border-slate-800/60 flex items-center justify-between gap-4">
                         <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                            Valores e Limitações
                         </h2>
                         <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" name="is_active" className="sr-only peer" checked={formData.is_active} onChange={handleChange} />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 dark:bg-slate-800 dark:after:border-slate-600"></div>
                            <span className="ml-3 text-sm font-medium text-slate-700 dark:text-slate-300">Aceitar Assinantes</span>
                         </label>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Preço por Fascículo (Capa) R$</label>
                            <input
                                type="text"
                                name="price_per_issue"
                                required
                                value={formData.price_per_issue}
                                onChange={handleChange}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all text-sm placeholder:text-slate-400 dark:bg-slate-950/50 dark:border-slate-800/60 dark:text-white"
                                placeholder="Ex: 269,90"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Fascículos entregues por Envio</label>
                            <input
                                type="number"
                                name="issues_per_delivery"
                                required
                                min="1"
                                value={formData.issues_per_delivery}
                                onChange={handleChange}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all text-sm placeholder:text-slate-400 dark:bg-slate-950/50 dark:border-slate-800/60 dark:text-white"
                            />
                        </div>
                        <div className="space-y-1.5 md:col-span-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Limite de Estoque da Coleção (Vagas/Assinantes)</label>
                            <input
                                type="number"
                                name="max_subscribers_limit"
                                min="1"
                                value={formData.max_subscribers_limit}
                                onChange={handleChange}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all text-sm placeholder:text-slate-400 dark:bg-slate-950/50 dark:border-slate-800/60 dark:text-white"
                                placeholder="Deixe em branco para vagas Ilimitadas (Ex: 50)"
                            />
                            <p className="text-xs text-slate-500 mt-1">Ao atingir este número, o gateway de pagamento do Hotsite será fechado com a tag "Esgotado".</p>
                        </div>
                    </div>
                </div>

                <HotsiteBuilder 
                    value={formData.hotsite_config} 
                    onChange={(val) => setFormData({...formData, hotsite_config: val})} 
                />

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800/60">
                    <Link
                        href="/subscriptions"
                        className="px-6 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium hover:bg-slate-50 transition-colors dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                        Cancelar
                    </Link>
                    <button
                        type="submit"
                        disabled={loading}
                        className="bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-medium py-2.5 px-8 rounded-xl flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-sm disabled:opacity-50 disabled:pointer-events-none"
                    >
                        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                        Salvar Alterações
                    </button>
                </div>
            </form>
            )}
        </div>
    );
}
