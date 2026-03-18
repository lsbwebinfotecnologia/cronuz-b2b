"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Layers, ArrowLeft, Loader2, Save } from 'lucide-react';
import Link from 'next/link';
import HotsiteBuilder from '@/components/HotsiteBuilder';
import { getToken } from '@/lib/auth';
import { toast } from 'sonner';

export default function NewSubscriptionPlanPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    
    const [formData, setFormData] = useState({
        name: '',
        hotsite_slug: '',
        description: '',
        price_per_issue: '',
        issues_per_delivery: 1,
        max_subscribers_limit: '',
        is_active: true,
        presale_start_date: '',
        presale_discount_percent: '',
        launch_date: '',
        launch_discount_percent: '',
        postlaunch_date: '',
        postlaunch_discount_percent: '',
        hotsite_config: {
            global: { logoUrl: '', primaryColor: '#e11d48', topMenu: [] as {label: string, targetId: string}[] },
            blocks: [] as any[]
        }
    });

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
                presale_discount_percent: formData.presale_discount_percent ? parseFloat(formData.presale_discount_percent.replace(',', '.')) : 0,
                launch_discount_percent: formData.launch_discount_percent ? parseFloat(formData.launch_discount_percent.replace(',', '.')) : 0,
                postlaunch_discount_percent: formData.postlaunch_discount_percent ? parseFloat(formData.postlaunch_discount_percent.replace(',', '.')) : 0,
                presale_start_date: formData.presale_start_date ? new Date(formData.presale_start_date).toISOString() : null,
                launch_date: formData.launch_date ? new Date(formData.launch_date).toISOString() : null,
                postlaunch_date: formData.postlaunch_date ? new Date(formData.postlaunch_date).toISOString() : null,
            };

            const response = await fetch(`${apiUrl}/subscriptions`, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            
            if (response.ok) {
                toast.success("Plano de assinatura criado com sucesso!");
                router.push('/subscriptions');
                router.refresh();
            } else {
                const err = await response.json();
                toast.error(err.detail || "Erro ao criar o plano.");
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
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                        Criar Plano de Assinatura
                    </h1>
                    <p className="text-sm text-slate-500 mt-1 dark:text-slate-400">
                        Configure os detalhes, limites e preços do novo plano de recorrência.
                    </p>
                </div>
            </div>

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

                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-slate-800/60 dark:bg-slate-900/40 backdrop-blur-xl">
                    <div className="p-6 border-b border-slate-200 dark:border-slate-800/60">
                         <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                            <Layers className="h-5 w-5 text-indigo-500 dark:text-indigo-400" />
                            Campanhas e Descontos Tiers
                         </h2>
                         <p className="text-sm text-slate-500 mt-1">Configure descontos automáticos na primeira entrega baseados na data que o cliente acessa o hotsite.</p>
                    </div>
                    <div className="p-6 space-y-8">
                        {/* Pre-sale */}
                        <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/50 dark:border-indigo-500/20 dark:bg-indigo-500/5">
                            <h3 className="font-medium text-slate-900 dark:text-white mb-4">1. Pré-Venda</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Data de Início da Pré-Venda</label>
                                    <input
                                        type="date"
                                        name="presale_start_date"
                                        value={formData.presale_start_date}
                                        onChange={handleChange}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all text-sm dark:bg-slate-950/50 dark:border-slate-800/60 dark:text-white"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">% Desconto Primeira Entrega</label>
                                    <input
                                        type="text"
                                        name="presale_discount_percent"
                                        value={formData.presale_discount_percent}
                                        onChange={handleChange}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all text-sm placeholder:text-slate-400 dark:bg-slate-950/50 dark:border-slate-800/60 dark:text-white"
                                        placeholder="Ex: 25"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Launch */}
                        <div className="p-4 rounded-xl border border-emerald-100 bg-emerald-50/50 dark:border-emerald-500/20 dark:bg-emerald-500/5">
                            <h3 className="font-medium text-slate-900 dark:text-white mb-4">2. Lançamento</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Data de Início do Lançamento</label>
                                    <input
                                        type="date"
                                        name="launch_date"
                                        value={formData.launch_date}
                                        onChange={handleChange}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all text-sm dark:bg-slate-950/50 dark:border-slate-800/60 dark:text-white"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">% Desconto Primeira Entrega</label>
                                    <input
                                        type="text"
                                        name="launch_discount_percent"
                                        value={formData.launch_discount_percent}
                                        onChange={handleChange}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all text-sm placeholder:text-slate-400 dark:bg-slate-950/50 dark:border-slate-800/60 dark:text-white"
                                        placeholder="Ex: 15"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Post-Launch Default */}
                        <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 dark:border-slate-700/50 dark:bg-slate-800/20">
                            <h3 className="font-medium text-slate-900 dark:text-white mb-4">3. Venda Padrão (Pós-Lancamento)</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">Data de Início Venda Normal</label>
                                    <input
                                        type="date"
                                        name="postlaunch_date"
                                        value={formData.postlaunch_date}
                                        onChange={handleChange}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all text-sm dark:bg-slate-950/50 dark:border-slate-800/60 dark:text-white"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block">% Desconto Fixo Primeira Entrega</label>
                                    <input
                                        type="text"
                                        name="postlaunch_discount_percent"
                                        value={formData.postlaunch_discount_percent}
                                        onChange={handleChange}
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] transition-all text-sm placeholder:text-slate-400 dark:bg-slate-950/50 dark:border-slate-800/60 dark:text-white"
                                        placeholder="Ex: 7"
                                    />
                                </div>
                            </div>
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
                        Salvar e Criar Coleção
                    </button>
                </div>
            </form>
        </div>
    );
}
