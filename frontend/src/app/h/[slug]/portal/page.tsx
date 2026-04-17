"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, LogOut, Package, CreditCard, AlertTriangle, Calendar, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Database } from 'lucide-react';
import HorusConsignmentManager from '@/components/HorusConsignmentManager';
import Link from 'next/link';

export default function CustomerPortalPage() {
    const params = useParams();
    const router = useRouter();
    const slug = params.slug as string;
    
    const [loading, setLoading] = useState(true);
    const [planData, setPlanData] = useState<any>(null);
    const [subscriptions, setSubscriptions] = useState<any[]>([]);
    const [customerInfo, setCustomerInfo] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    const [cancelingId, setCancelingId] = useState<number | null>(null);
    const [activeTab, setActiveTab] = useState<'subscriptions' | 'consignment'>('subscriptions');

    useEffect(() => {
        const token = localStorage.getItem(`customer_token_${slug}`);
        if (!token) {
            router.push(`/h/${slug}/login`);
            return;
        }

        const cInfo = localStorage.getItem(`customer_data_${slug}`);
        if (cInfo) setCustomerInfo(JSON.parse(cInfo));

        const fetchData = async () => {
            try {
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
                
                // Fetch Branding
                const brandRes = await fetch(`${apiUrl}/subscriptions/hotsite/${slug}`);
                if (brandRes.ok) {
                    setPlanData(await brandRes.json());
                }

                // Fetch Subscriptions
                const subRes = await fetch(`${apiUrl}/me/subscriptions`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                if (subRes.ok) {
                    const data = await subRes.json();
                    setSubscriptions(data.subscriptions || []);
                } else if (subRes.status === 401) {
                    handleLogout();
                } else {
                    setError("Erro ao carregar assinaturas.");
                }
            } catch (err) {
                setError("Falha de conexão com o servidor.");
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [slug, router]);

    const handleLogout = () => {
        localStorage.removeItem(`customer_token_${slug}`);
        localStorage.removeItem(`customer_data_${slug}`);
        router.push(`/h/${slug}/login`);
    };

    const handleCancel = async (subId: number) => {
        if (!confirm("Tem certeza que deseja cancelar esta assinatura? Você não será mais cobrado e o serviço será interrompido.")) return;

        setCancelingId(subId);
        const token = localStorage.getItem(`customer_token_${slug}`);
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

        try {
            const res = await fetch(`${apiUrl}/me/subscriptions/${subId}/cancel`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const data = await res.json();

            if (res.ok) {
                toast.success("Sua assinatura foi cancelada com sucesso.");
                setSubscriptions(prev => prev.map(s => s.id === subId ? { ...s, status: 'CANCELED' } : s));
            } else {
                toast.error(data.detail || "Erro ao tentar cancelar a assinatura.");
            }
        } catch (err) {
            toast.error("Ocorreu um erro na requisição de cancelamento.");
        } finally {
            setCancelingId(null);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <Loader2 className="h-10 w-10 animate-spin text-[var(--color-primary-base)]" />
            </div>
        );
    }

    const rawConfig = planData?.config || {};
    const globalConfig = rawConfig.global || {
        logoUrl: '',
        primaryColor: rawConfig.primaryColor || '#dc2626'
    };
    const primaryColor = globalConfig.primaryColor;

    return (
        <div 
            className="min-h-screen bg-slate-50 font-sans"
            style={{ 
                '--color-primary-base': primaryColor, 
                '--color-primary-hover': primaryColor + 'cc' 
            } as React.CSSProperties}
        >
            {/* Navbar */}
            <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        {globalConfig.logoUrl ? (
                             <Link href={`/h/${slug}`}>
                                <img src={globalConfig.logoUrl} alt="Logo" className="h-8 object-contain cursor-pointer" />
                             </Link>
                        ) : (
                             <Link href={`/h/${slug}`}>
                                <span className="text-xl font-black uppercase italic tracking-tighter text-slate-900 cursor-pointer">{planData?.name || 'Portal'}</span>
                            </Link>
                        )}
                    </div>
                    
                    <div className="flex items-center gap-6">
                        <div className="hidden md:flex flex-col items-end">
                            <span className="text-sm font-bold text-slate-800">{customerInfo?.name || "Cliente"}</span>
                            <span className="text-xs text-slate-500">{customerInfo?.email || ""}</span>
                        </div>
                        <button 
                            onClick={handleLogout}
                            className="flex items-center gap-2 text-rose-600 hover:text-rose-700 font-bold text-sm bg-rose-50 hover:bg-rose-100 px-4 py-2 rounded-lg transition-colors"
                        >
                            <LogOut className="h-4 w-4" />
                            <span className="hidden sm:inline">Sair</span>
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
                {/* Tabs */}
                {customerInfo?.consignment_status === 'ACTIVE' && (
                    <div className="flex border-b border-slate-200 mb-8 overflow-x-auto hide-scrollbar">
                        <button 
                            onClick={() => setActiveTab('subscriptions')}
                            className={`flex items-center gap-2 py-4 px-6 border-b-2 font-bold whitespace-nowrap transition-colors ${activeTab === 'subscriptions' ? 'border-[var(--color-primary-base)] text-[var(--color-primary-base)]' : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'}`}
                        >
                            <Package className="w-5 h-5" /> Minhas Assinaturas
                        </button>
                        <button 
                            onClick={() => setActiveTab('consignment')}
                            className={`flex items-center gap-2 py-4 px-6 border-b-2 font-bold whitespace-nowrap transition-colors ${activeTab === 'consignment' ? 'border-[var(--color-primary-base)] text-[var(--color-primary-base)]' : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'}`}
                        >
                            <Database className="w-5 h-5" /> Consignação
                        </button>
                    </div>
                )}

                
                {activeTab === 'subscriptions' && (
                    <>
<div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Minhas Assinaturas</h1>
                            <p className="text-slate-500 mt-1">Gerencie seus planos e faturamentos recorrentes.</p>
                        </div>
                        
                        <Link href={`/h/${slug}`} className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold px-6 py-2.5 rounded-xl shadow-sm transition-all text-center">
                            Explorar Planos
                        </Link>
                    </div>
    
                    {error ? (
                        <div className="p-6 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-4 text-rose-700">
                            <AlertTriangle className="h-6 w-6" />
                            <span className="font-semibold">{error}</span>
                        </div>
                    ) : subscriptions.length === 0 ? (
                        <div className="bg-white border border-slate-200 rounded-3xl p-16 text-center shadow-sm">
                            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                <Package className="h-10 w-10 text-slate-400" />
                            </div>
                            <h2 className="text-2xl font-bold text-slate-800 mb-2">Nenhuma assinatura ativa</h2>
                            <p className="text-slate-500 max-w-sm mx-auto mb-8">Você ainda não contratou nenhum plano nesta loja. Explore os planos disponíveis e aproveite.</p>
                            <Link href={`/h/${slug}`} className="inline-flex bg-[var(--color-primary-base)] hover:bg-[var(--color-primary-hover)] text-white font-bold text-sm uppercase tracking-wider px-8 py-4 rounded-xl shadow-lg shadow-[var(--color-primary-base)]/20 transition-all">
                                Ver Planos Disponíveis
                            </Link>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {subscriptions.map(sub => (
                                <div key={sub.id} className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden flex flex-col group hover:shadow-md transition-shadow">
                                    <div className={`h-2 w-full ${sub.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                                    <div className="p-6 sm:p-8 flex-1 flex flex-col">
                                        <div className="flex justify-between items-start mb-6">
                                            <div>
                                                <div className="flex items-center gap-3 mb-2">
                                                    <h3 className="text-xl font-black text-slate-900 uppercase">{sub.product_name}</h3>
                                                    {sub.status === 'ACTIVE' && (
                                                        <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-1 rounded flex items-center gap-1">
                                                            <CheckCircle2 className="h-3 w-3" /> ATIVO
                                                        </span>
                                                    )}
                                                    {sub.status === 'CANCELED' && (
                                                        <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2 py-1 rounded flex items-center gap-1">
                                                            <XCircle className="h-3 w-3" /> CANCELADO
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-slate-500 font-medium text-sm">Identificador: #{sub.external_reference || sub.id}</p>
                                            </div>
                                        </div>
                                        
                                        <div className="grid grid-cols-2 gap-4 mb-8 bg-slate-50 p-4 rounded-2xl">
                                            <div>
                                                <span className="text-xs text-slate-500 font-bold uppercase block mb-1">Valor do Plano</span>
                                                <div className="flex items-center gap-2 text-slate-900 font-black">
                                                    <CreditCard className="h-4 w-4 text-[var(--color-primary-base)]" />
                                                    R$ {sub.amount.toFixed(2).replace('.', ',')}
                                                </div>
                                            </div>
                                            <div>
                                                <span className="text-xs text-slate-500 font-bold uppercase block mb-1">Ciclo de Cobrança</span>
                                                <div className="flex items-center gap-2 text-slate-900 font-bold">
                                                    <Calendar className="h-4 w-4 text-slate-400" />
                                                    {sub.periodicity === 1 ? 'Mensal' : 
                                                     sub.periodicity === 2 ? 'Bimestral' : 
                                                     sub.periodicity === 3 ? 'Trimestral' :
                                                     sub.periodicity === 6 ? 'Semestral' :
                                                     sub.periodicity === 12 ? 'Anual' : `${sub.periodicity} Meses`}
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="mt-auto pt-6 border-t border-slate-100 flex items-center justify-between">
                                            <div className="text-sm">
                                                {sub.status === 'ACTIVE' && sub.next_billing_date ? (
                                                    <span className="text-slate-600">Próxima renovação em <strong className="text-slate-900">{new Date(sub.next_billing_date).toLocaleDateString('pt-BR')}</strong></span>
                                                ) : (
                                                    <span className="text-slate-400">Assinatura inativa</span>
                                                )}
                                            </div>
                                            
                                            {sub.status === 'ACTIVE' && (
                                                <button 
                                                    onClick={() => handleCancel(sub.id)}
                                                    disabled={cancelingId === sub.id}
                                                    className="text-sm font-bold text-rose-600 hover:text-rose-700 bg-white border border-rose-200 hover:border-rose-300 hover:bg-rose-50 px-4 py-2 rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:bg-slate-100 disabled:border-slate-200 disabled:text-slate-400 flex items-center gap-2"
                                                >
                                                    {cancelingId === sub.id ? (
                                                        <><Loader2 className="h-4 w-4 animate-spin" /> Cancelando...</>
                                                    ) : (
                                                        "Cancelar Assinatura"
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                
                    </>
                )}
                
                {activeTab === 'consignment' && (
                    <div className="h-[75vh]">
                        <HorusConsignmentManager 
                             apiBaseUrl="/me/consignment"
                             token={typeof window !== 'undefined' ? localStorage.getItem(`customer_token_${slug}`) || '' : ''}
                        />
                    </div>
                )}
</main>
        </div>
    );
}
