"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
    ArrowLeft, User, MapPin, Package, CheckCircle2, XCircle, 
    Clock, AlertCircle, CreditCard, Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { getToken } from '@/lib/auth';

type Billing = {
    id: number;
    delivery_number: number;
    amount: number;
    status: string;
    efi_charge_id: string | null;
    due_date: string | null;
    paid_at: string | null;
};

type SubscriberDetail = {
    id: number;
    plan_name: string;
    customer_id: number;
    customer_name: string;
    customer_document?: string;
    customer_email?: string;
    customer_phone?: string;
    status: string;
    current_delivery: number;
    shipping_address: {
        street: string;
        number: string;
        complement: string | null;
        neighborhood: string;
        city: string;
        state: string;
        zipcode: string;
    };
    created_at: string;
    billings: Billing[];
};

export default function SubscriberDetailPage() {
    const params = useParams();
    const router = useRouter();
    const [subscriber, setSubscriber] = useState<SubscriberDetail | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchSubscriber = async () => {
            if (!params.id) return;
            
            setLoading(true);
            try {
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
                const token = getToken();
                const res = await fetch(`${apiUrl}/subscriptions/subscribers/${params.id}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                if (res.ok) {
                    const data = await res.json();
                    setSubscriber(data);
                } else if (res.status === 404) {
                    toast.error("Assinatura não encontrada");
                    router.push('/subscribers');
                } else {
                    toast.error("Erro ao carregar detalhes da assinatura");
                }
            } catch (err) {
                console.error(err);
                toast.error("Erro de conexão com o servidor");
            } finally {
                setLoading(false);
            }
        };
        fetchSubscriber();
    }, [params.id, router]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mb-4" />
                <p className="text-slate-500 font-medium animate-pulse">Carregando detalhes...</p>
            </div>
        );
    }

    if (!subscriber) return null;

    const isActive = subscriber.status === 'ACTIVE';

    return (
        <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-6 animate-in">
            {/* Header */}
            <div className="flex items-center gap-4">
                <button 
                    onClick={() => router.back()}
                    className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
                >
                    <ArrowLeft className="h-6 w-6" />
                </button>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
                        Assinatura #{subscriber.id}
                        <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                            isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                        }`}>
                            {isActive ? 'Ativa' : 'Cancelada'}
                        </span>
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">
                        Desde {new Date(subscriber.created_at).toLocaleDateString('pt-BR')}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Left Column: Customer and Plan Details */}
                <div className="md:col-span-1 space-y-6">
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                                <User className="h-5 w-5" />
                            </div>
                            <h2 className="font-bold text-slate-900">Cliente</h2>
                        </div>
                        <div className="space-y-3 text-sm">
                            <div>
                                <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Nome</p>
                                <p className="font-medium text-slate-900">{subscriber.customer_name}</p>
                            </div>
                            {(subscriber.customer_document) && (
                            <div>
                                <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Documento</p>
                                <p className="font-medium text-slate-900 break-all">{subscriber.customer_document.replace(/^(\d{3})(\d{3})(\d{3})(\d{2}).*/, '$1.$2.$3-$4')}</p>
                            </div>
                            )}
                            {subscriber.customer_email && (
                            <div>
                                <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">E-mail</p>
                                <p className="font-medium text-slate-900 break-all">{subscriber.customer_email}</p>
                            </div>
                            )}
                            {subscriber.customer_phone && (
                            <div>
                                <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Telefone</p>
                                <p className="font-medium text-slate-900 break-all">{subscriber.customer_phone}</p>
                            </div>
                            )}
                            <div>
                                <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">ID CRM</p>
                                <p className="font-medium text-slate-900">#{subscriber.customer_id}</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
                                <Package className="h-5 w-5" />
                            </div>
                            <h2 className="font-bold text-slate-900">Plano Físico</h2>
                        </div>
                        <div className="space-y-3 text-sm">
                            <div>
                                <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Nome do Plano</p>
                                <p className="font-medium text-slate-900">{subscriber.plan_name}</p>
                            </div>
                            <div>
                                <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Etapa Atual</p>
                                <p className="font-medium text-slate-900">Remessa nº {subscriber.current_delivery}</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                                <MapPin className="h-5 w-5" />
                            </div>
                            <h2 className="font-bold text-slate-900">Endereço de Entrega</h2>
                        </div>
                        <div className="space-y-1 text-sm text-slate-700">
                            <p className="font-medium text-slate-900 bg-slate-50 p-3 rounded-lg border border-slate-100">
                                {subscriber.shipping_address.street}, {subscriber.shipping_address.number}
                                {subscriber.shipping_address.complement ? ` - ${subscriber.shipping_address.complement}` : ''}
                                <br />
                                {subscriber.shipping_address.neighborhood}
                                <br />
                                {subscriber.shipping_address.city} - {subscriber.shipping_address.state}
                                <br />
                                CEP: {subscriber.shipping_address.zipcode}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Right Column: Billing History */}
                <div className="md:col-span-2 space-y-6">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
                        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-slate-100 text-slate-600 rounded-xl">
                                    <CreditCard className="h-5 w-5" />
                                </div>
                                <h2 className="font-bold text-slate-900 text-lg">Histórico de Cobranças</h2>
                            </div>
                        </div>

                        <div className="p-0 overflow-x-auto flex-1">
                            <table className="w-full text-left text-sm text-slate-600">
                                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 font-semibold text-xs tracking-wider uppercase">
                                    <tr>
                                        <th className="px-6 py-4">Remessa</th>
                                        <th className="px-6 py-4">Valor</th>
                                        <th className="px-6 py-4">Status</th>
                                        <th className="px-6 py-4">Vencimento / Pago</th>
                                        <th className="px-6 py-4">ID Efí</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {subscriber.billings.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                                                Nenhuma cobrança registrada.
                                            </td>
                                        </tr>
                                    ) : (
                                        subscriber.billings.map(bill => (
                                            <tr key={bill.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-6 py-4 font-semibold text-slate-900">#{bill.delivery_number}</td>
                                                <td className="px-6 py-4 font-mono">
                                                    R$ {bill.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold leading-none ${
                                                        bill.status === 'PAID' ? 'bg-emerald-100 text-emerald-800' :
                                                        bill.status === 'PENDING' ? 'bg-amber-100 text-amber-800' :
                                                        'bg-rose-100 text-rose-800'
                                                    }`}>
                                                        {bill.status === 'PAID' ? <CheckCircle2 className="h-3.5 w-3.5" /> : 
                                                         bill.status === 'PENDING' ? <Clock className="h-3.5 w-3.5" /> : 
                                                         <XCircle className="h-3.5 w-3.5" />}
                                                        {bill.status === 'PAID' ? 'Pago' : 
                                                         bill.status === 'PENDING' ? 'Pendente' : 'Falha'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-xs">
                                                    {bill.status === 'PAID' ? (
                                                        <span className="text-emerald-600 font-medium">
                                                            {bill.paid_at ? new Date(bill.paid_at).toLocaleDateString('pt-BR') : 'Sem data'}
                                                        </span>
                                                    ) : (
                                                        <span className="text-slate-500">
                                                            {bill.due_date ? new Date(bill.due_date).toLocaleDateString('pt-BR') : '-'}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 font-mono text-xs text-slate-400">
                                                    {bill.efi_charge_id || '-'}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
