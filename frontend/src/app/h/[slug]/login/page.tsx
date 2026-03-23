"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, AlertCircle, Lock, Mail, User, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

export default function CustomerLoginPage() {
    const params = useParams();
    const router = useRouter();
    const slug = params.slug as string;
    
    const [loading, setLoading] = useState(true);
    const [planData, setPlanData] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const [mode, setMode] = useState<'LOGIN' | 'SETUP'>('LOGIN');

    const [formData, setFormData] = useState({
        email: '',
        password: '',
        document: ''
    });

    useEffect(() => {
        const fetchPlan = async () => {
            try {
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
                const response = await fetch(`${apiUrl}/subscriptions/hotsite/${slug}`);
                
                if (response.ok) {
                    const data = await response.json();
                    setPlanData(data);
                } else if (response.status === 404) {
                    setError("Página não encontrada.");
                } else {
                    setError("Ocorreu um erro ao carregar os dados.");
                }
            } catch (err) {
                setError("Falha de conexão.");
            } finally {
                setLoading(false);
            }
        };
        fetchPlan();
    }, [slug]);

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let { name, value } = e.target;
        
        if (name === 'document') {
            value = value.replace(/\D/g, '');
            if (value.length <= 11) {
                value = value.replace(/(\d{3})(\d)/, '$1.$2');
                value = value.replace(/(\d{3})(\d)/, '$1.$2');
                value = value.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
            } else {
                value = value.substring(0, 14);
                value = value.replace(/^(\d{2})(\d)/, '$1.$2');
                value = value.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
                value = value.replace(/\.(\d{3})(\d)/, '.$1/$2');
                value = value.replace(/(\d{4})(\d)/, '$1-$2');
            }
        }
        
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);

        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

        try {
            if (mode === 'LOGIN') {
                const response = await fetch(`${apiUrl}/auth/customer/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: formData.email,
                        password: formData.password,
                        tenant_slug: slug
                    })
                });

                const data = await response.json();

                if (response.ok) {
                    toast.success("Login efetuado com sucesso!");
                    localStorage.setItem(`customer_token_${slug}`, data.access_token);
                    localStorage.setItem(`customer_data_${slug}`, JSON.stringify(data.customer));
                    router.push(`/h/${slug}/portal`);
                } else {
                    if (response.status === 403) {
                        toast.error(data.detail);
                        setMode('SETUP');
                    } else {
                        toast.error(data.detail || "E-mail ou senha incorretos.");
                    }
                }
            } else {
                const response = await fetch(`${apiUrl}/auth/customer/set-password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: formData.email,
                        document: formData.document,
                        password: formData.password,
                        tenant_slug: slug
                    })
                });

                const data = await response.json();

                if (response.ok) {
                    toast.success("Senha cadastrada! Faça login para continuar.");
                    setMode('LOGIN');
                    setFormData(prev => ({ ...prev, password: '', document: '' }));
                } else {
                    toast.error(data.detail || "Erro ao definir senha. Verifique seus dados.");
                }
            }
        } catch (err) {
            console.error(err);
            toast.error("Ocorreu um erro interno. Tente novamente.");
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <Loader2 className="h-10 w-10 animate-spin text-[var(--color-primary-base)]" />
            </div>
        );
    }

    if (error || !planData) {
        // generic error layout
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
                <div className="text-center max-w-md w-full p-8 bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100">
                    <div className="w-16 h-16 mx-auto bg-rose-50 rounded-full flex items-center justify-center mb-6">
                        <AlertCircle className="h-8 w-8 text-rose-500" />
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900 mb-2">Ops!</h1>
                    <p className="text-slate-500">{error}</p>
                </div>
            </div>
        );
    }

    const rawConfig = planData.config || {};
    const globalConfig = rawConfig.global || {
        logoUrl: '',
        primaryColor: rawConfig.primaryColor || '#dc2626'
    };
    const primaryColor = globalConfig.primaryColor;

    return (
        <div 
            className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative overflow-hidden"
            style={{ 
                '--color-primary-base': primaryColor, 
                '--color-primary-hover': primaryColor + 'cc' 
            } as React.CSSProperties}
        >
            <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-[var(--color-primary-base)]/5 to-transparent skew-x-12 blur-3xl pointer-events-none"></div>

            <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 relative z-10 border border-slate-100">
                <div className="text-center mb-10">
                    {globalConfig.logoUrl ? (
                         <Link href={`/h/${slug}`}>
                            <img src={globalConfig.logoUrl} alt={planData.name} className="h-12 mx-auto object-contain cursor-pointer" />
                         </Link>
                    ) : (
                         <Link href={`/h/${slug}`}>
                            <span className="text-2xl font-black uppercase italic tracking-tighter text-slate-900 cursor-pointer">{planData.name}</span>
                        </Link>
                    )}
                </div>

                <div className="mb-8 text-center">
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                        {mode === 'LOGIN' ? 'Área do Assinante' : 'Primeiro Acesso'}
                    </h1>
                    <p className="text-slate-500 text-sm mt-2">
                        {mode === 'LOGIN' 
                            ? 'Acesse seu portal para gerenciar sua assinatura.'
                            : 'Crie uma senha de acesso informando seus dados cadastrais.'}
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="space-y-1.5">
                        <label className="text-sm font-bold text-slate-700">E-mail Cadastrado</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <Mail className="h-5 w-5 text-slate-400" />
                            </div>
                            <input 
                                type="email" 
                                name="email" 
                                required 
                                value={formData.email} 
                                onChange={handleFormChange} 
                                className="w-full bg-slate-50 flex-1 border border-slate-200 rounded-xl pl-12 pr-4 py-3 text-slate-900 focus:outline-none focus:border-[var(--color-primary-base)] focus:ring-1 focus:ring-[var(--color-primary-base)] transition-colors" 
                                placeholder="seu@email.com" 
                            />
                        </div>
                    </div>

                    {mode === 'SETUP' && (
                        <div className="space-y-1.5 animate-in slide-in-from-bottom-2 fade-in">
                            <label className="text-sm font-bold text-slate-700">CPF ou CNPJ</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <User className="h-5 w-5 text-slate-400" />
                                </div>
                                <input 
                                    type="text" 
                                    name="document" 
                                    required 
                                    value={formData.document} 
                                    onChange={handleFormChange} 
                                    className="w-full bg-slate-50 flex-1 border border-slate-200 rounded-xl pl-12 pr-4 py-3 text-slate-900 focus:outline-none focus:border-[var(--color-primary-base)] focus:ring-1 focus:ring-[var(--color-primary-base)] transition-colors" 
                                    placeholder="000.000.000-00" 
                                />
                            </div>
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <label className="text-sm font-bold text-slate-700">Senha</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <Lock className="h-5 w-5 text-slate-400" />
                            </div>
                            <input 
                                type="password" 
                                name="password" 
                                required 
                                value={formData.password} 
                                onChange={handleFormChange} 
                                minLength={6}
                                className="w-full bg-slate-50 flex-1 border border-slate-200 rounded-xl pl-12 pr-4 py-3 text-slate-900 focus:outline-none focus:border-[var(--color-primary-base)] focus:ring-1 focus:ring-[var(--color-primary-base)] transition-colors" 
                                placeholder="••••••••" 
                            />
                        </div>
                    </div>

                    <div className="pt-4">
                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-[var(--color-primary-base)]/30 disabled:opacity-50"
                        >
                            {submitting ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                            ) : mode === 'LOGIN' ? (
                                "Entrar Seguro"
                            ) : (
                                "Salvar Senha e Voltar"
                            )}
                        </button>
                    </div>
                </form>

                <div className="mt-8 text-center select-none">
                    {mode === 'LOGIN' ? (
                        <p className="text-sm text-slate-500">
                            Ainda não tem uma senha?{" "}
                            <span 
                                onClick={() => setMode('SETUP')}
                                className="font-bold text-[var(--color-primary-base)] hover:underline cursor-pointer"
                            >
                                Crie no seu primeiro acesso
                            </span>
                        </p>
                    ) : (
                        <p className="text-sm text-slate-500">
                            Já possui uma senha?{" "}
                            <span 
                                onClick={() => setMode('LOGIN')}
                                className="font-bold text-[var(--color-primary-base)] hover:underline cursor-pointer"
                            >
                                Faça Login aqui
                            </span>
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
