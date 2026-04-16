'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Save, Briefcase, Calendar, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { getToken } from '@/lib/auth';
import Link from 'next/link';

export default function NewServiceOrderPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const initialCustomerId = searchParams?.get('customer_id') || '';

    const [customers, setCustomers] = useState<any[]>([]);
    const [services, setServices] = useState<any[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [newOrder, setNewOrder] = useState({
        customer_id: initialCustomerId,
        service_id: '',
        negotiated_value: '',
        custom_description: '',
        execution_date: new Date().toISOString().split('T')[0],
        is_recurrent: false,
        recurrence_end_date: ''
    });

    useEffect(() => {
        const fetchAuxData = async () => {
            try {
                const resCust = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/customers`, { headers: { 'Authorization': `Bearer ${getToken()}` }});
                if (resCust.ok) setCustomers(await resCust.json());
                
                const resSvc = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/services`, { headers: { 'Authorization': `Bearer ${getToken()}` }});
                if (resSvc.ok) setServices((await resSvc.json()).items);
            } catch (e) {
                toast.error('Erro ao carregar dados auxiliares');
            }
        };
        fetchAuxData();
    }, []);

    const handleServiceSelect = (svcId: string) => {
        const svc = services.find(s => s.id === parseInt(svcId));
        if (svc) {
            setNewOrder({
                ...newOrder,
                service_id: svcId,
                negotiated_value: new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(svc.base_value)
            });
        } else {
            setNewOrder({ ...newOrder, service_id: svcId });
        }
    };

    const handleCreateOrder = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const payload = {
                ...newOrder,
                customer_id: parseInt(newOrder.customer_id),
                service_id: parseInt(newOrder.service_id),
                negotiated_value: parseFloat(newOrder.negotiated_value.replace(/\./g, '').replace(',', '.')),
                recurrence_end_date: newOrder.is_recurrent && newOrder.recurrence_end_date ? newOrder.recurrence_end_date : null
            };
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/service-orders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                toast.success('Ordem de Serviço criada com sucesso!');
                router.push('/services/orders');
            } else {
                toast.error('Erro ao criar O.S.');
            }
        } catch (e) { 
            toast.error('Servidor offline'); 
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <Link href={`/customers/${newOrder.customer_id || ''}`} className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl transition dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-400">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                            <Briefcase className="w-6 h-6 text-indigo-500" />
                            Nova Ordem de Serviço
                        </h1>
                        <p className="text-sm text-slate-500 mt-1 dark:text-slate-400">
                            Crie uma ordem de execução de serviço para faturamento avulso ou recorrente.
                        </p>
                    </div>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
                <form onSubmit={handleCreateOrder} className="p-6 md:p-8 flex-1 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Cliente (Tomador do Serviço) <span className="text-rose-500">*</span></label>
                            <select 
                                required 
                                value={newOrder.customer_id} 
                                onChange={(e) => setNewOrder({...newOrder, customer_id: e.target.value})} 
                                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:border-[var(--color-primary-base)] transition-colors shadow-sm"
                            >
                                <option value="">Selecione...</option>
                                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Serviço <span className="text-rose-500">*</span></label>
                            <select 
                                required 
                                value={newOrder.service_id} 
                                onChange={(e) => handleServiceSelect(e.target.value)} 
                                className="w-full px-4 py-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:border-[var(--color-primary-base)] transition-colors shadow-sm"
                            >
                                <option value="">Selecione...</option>
                                {services.map(s => <option key={s.id} value={s.id}>{s.name} (R$ {new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(s.base_value)})</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Valor Negociado (R$) <span className="text-rose-500">*</span></label>
                            <input 
                                required 
                                type="text" 
                                value={newOrder.negotiated_value} 
                                onChange={(e) => {
                                    let v = e.target.value.replace(/\D/g, '');
                                    if(!v) return setNewOrder({...newOrder, negotiated_value: ''});
                                    setNewOrder({...newOrder, negotiated_value: (parseInt(v)/100).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2})});
                                }} 
                                className="w-full px-4 py-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-medium focus:outline-none focus:border-[var(--color-primary-base)] transition-colors shadow-sm" 
                                placeholder="0,00" 
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Data Base da Execução <span className="text-rose-500">*</span></label>
                            <div className="relative">
                                <Calendar className="w-5 h-5 absolute left-4 top-3.5 text-slate-400" />
                                <input 
                                    required 
                                    type="date" 
                                    value={newOrder.execution_date} 
                                    onChange={(e) => setNewOrder({...newOrder, execution_date: e.target.value})} 
                                    className="w-full pl-12 pr-4 py-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:border-[var(--color-primary-base)] transition-colors shadow-sm" 
                                />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                            <FileText className="w-4 h-4 text-slate-400" />
                            Detalhes Adicionais (Opcional p/ Corpo da NF-e)
                        </label>
                        <textarea 
                            value={newOrder.custom_description} 
                            onChange={(e) => setNewOrder({...newOrder, custom_description: e.target.value})} 
                            className="w-full px-4 py-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:border-[var(--color-primary-base)] transition-colors shadow-sm resize-none" 
                            rows={4}
                            placeholder="Descreva detalhes específicos da cobrança que irão na descrição da NF-e..."
                        />
                    </div>

                    <div className="border border-purple-200 dark:border-purple-900/30 bg-purple-50/50 dark:bg-purple-900/10 rounded-2xl p-6 space-y-4">
                        <div className="flex items-center gap-3">
                            {/* CUSTOM TAILWIND SWITCH */}
                            <button 
                                type="button"
                                onClick={() => setNewOrder({...newOrder, is_recurrent: !newOrder.is_recurrent})}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                                    newOrder.is_recurrent ? 'bg-purple-600' : 'bg-slate-300 dark:bg-slate-700'
                                }`}
                            >
                                <span 
                                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                                        newOrder.is_recurrent ? 'translate-x-6' : 'translate-x-1'
                                    }`}
                                />
                            </button>
                            <label className="text-base font-bold text-purple-900 dark:text-purple-300 cursor-pointer select-none" onClick={() => setNewOrder({...newOrder, is_recurrent: !newOrder.is_recurrent})}>
                                Tornar O.S Recorrente Mensalmente
                            </label>
                        </div>
                        {newOrder.is_recurrent && (
                            <div className="pt-2 pl-14">
                                <label className="block text-sm font-semibold text-purple-800 dark:text-purple-400 mb-2">Até quando esta O.S deve se repetir? (Data Final)</label>
                                <input 
                                    required={newOrder.is_recurrent} 
                                    type="date" 
                                    value={newOrder.recurrence_end_date} 
                                    onChange={(e) => setNewOrder({...newOrder, recurrence_end_date: e.target.value})} 
                                    className="w-full md:w-1/2 px-4 py-3 bg-white dark:bg-slate-950 border rounded-xl border-purple-200 dark:border-purple-800 text-sm focus:outline-none focus:border-purple-500 transition-colors shadow-sm" 
                                />
                                <p className="text-xs text-purple-600/80 mt-2 leading-relaxed">
                                    O sistema irá clonar esta O.S no dia 1º de cada mês automaticamente para o seu painel, 
                                    facilitando a emissão da NFS-e.
                                </p>
                            </div>
                        )}
                    </div>
                </form>

                <div className="mt-auto border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-6 flex justify-end gap-3 rounded-b-3xl">
                    <Link 
                        href={`/customers/${newOrder.customer_id || ''}`}
                        className="px-6 py-3 font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition dark:text-slate-300 dark:hover:bg-slate-800 text-sm"
                    >
                        Cancelar
                    </Link>
                    <button 
                        type="submit" 
                        onClick={handleCreateOrder}
                        disabled={isSubmitting} 
                        className="px-8 py-3 bg-[var(--color-primary-base)] hover:opacity-90 text-white text-sm font-bold rounded-xl shadow-md transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isSubmitting ? (
                            <>Gerando O.S...</>
                        ) : (
                            <><Save className="w-4 h-4"/> Criar Ordem</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
