"use client";

import { useState, useEffect } from "react";
import { Loader2, Download, Search, FileSpreadsheet, RefreshCw, Filter } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { getToken } from '@/lib/auth';

type Subscriber = {
    id: number;
    plan_name: string;
    customer_name: string;
    status: string;
    current_delivery: number;
    shipping_address: string;
    plan_frequency?: string;
    efi_subscription_id?: number;
    latest_payment_status: string;
    latest_payment_date: string | null;
    created_at: string;
    customer_document?: string;
    customer_email?: string;
};

export default function SubscribersPage() {
    const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState("ALL");

    const fetchSubscribers = async () => {
        setLoading(true);
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const token = getToken();
            
            let url = `${apiUrl}/subscriptions/subscribers/list`;
            if (statusFilter !== "ALL") {
                url += `?status=${statusFilter}`;
            }

            const response = await fetch(url, {
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                setSubscribers(data.items || []);
            } else {
                toast.error("Falha ao carregar assinantes.");
            }
        } catch (error) {
            toast.error("Erro de conexão ao carregar assinantes.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSubscribers();
    }, [statusFilter]);

    const handleExportExcel = () => {
        if (subscribers.length === 0) {
            toast.error("Nenhum dado para exportar.");
            return;
        }

        const dataToExport = subscribers.map(sub => ({
            "ID da Assinatura": sub.id,
            "Plano": sub.plan_name,
            "Periodicidade": sub.plan_frequency === 'MONTHLY' ? 'Mensal' : 
                             sub.plan_frequency === 'BIMONTHLY' ? 'Bimestral' :
                             sub.plan_frequency === 'QUARTERLY' ? 'Trimestral' :
                             sub.plan_frequency === 'SEMIANNUAL' ? 'Semestral' :
                             sub.plan_frequency === 'ANNUAL' ? 'Anual' : 
                             sub.plan_frequency || 'Mensal',
            "ID Efí": sub.efi_subscription_id || '-',
            "Cliente": sub.customer_name,
            "Status da Assinatura": sub.status === 'ACTIVE' ? 'Ativo' : sub.status === 'CANCELED' ? 'Cancelado' : sub.status,
            "Mod. Entrega Atual": sub.current_delivery,
            "Status do Último Pagamento": sub.latest_payment_status === 'PAID' ? 'Pago' : sub.latest_payment_status === 'PENDING' ? 'Pendente' : 'Falhou',
            "Data Pagamento": sub.latest_payment_date ? new Date(sub.latest_payment_date).toLocaleDateString('pt-BR') : '-',
            "Endereço de Entrega": sub.shipping_address,
            "Data de Adesão": new Date(sub.created_at).toLocaleDateString('pt-BR')
        }));

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Assinantes");

        // Geração do arquivo
        XLSX.writeFile(wb, `Relatorio_Assinantes_${new Date().toISOString().split('T')[0]}.xlsx`);
        toast.success("Relatório exportado com sucesso!");
    };

    const filteredSubscribers = subscribers.filter(sub => 
        sub.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sub.plan_name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="p-6 md:p-10 space-y-8 max-w-7xl mx-auto">
            <div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">Gestão de Assinaturas</h1>
                <p className="text-slate-500 mt-2">Acompanhe os clientes com pagamentos recorrentes ativos e gere as etiquetas de envio.</p>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200">
                <div className="p-6 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row gap-4 justify-between items-center rounded-t-2xl">
                    <div className="flex w-full sm:w-auto gap-4 flex-col sm:flex-row">
                        <div className="relative w-full sm:w-80">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <input 
                                type="text" 
                                placeholder="Buscar por cliente ou plano..." 
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                            />
                        </div>
                        <div className="relative w-full sm:w-48">
                            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <select 
                                value={statusFilter}
                                onChange={e => setStatusFilter(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-lg pl-10 pr-4 py-2.5 text-sm appearance-none focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors cursor-pointer"
                            >
                                <option value="ALL">Todos os Status</option>
                                <option value="ACTIVE">Ativos</option>
                                <option value="CANCELED">Cancelados</option>
                                <option value="SUSPENDED">Suspensos</option>
                            </select>
                        </div>
                    </div>
                    
                    <div className="flex gap-3 w-full sm:w-auto">
                        <button 
                            onClick={fetchSubscribers} 
                            disabled={loading}
                            className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 p-2.5 rounded-lg transition-colors"
                        >
                            <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                        <button 
                            onClick={handleExportExcel}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg text-sm font-bold transition-colors shadow-sm shadow-emerald-600/20"
                        >
                            <FileSpreadsheet className="h-4 w-4" />
                            Exportar Excel
                        </button>
                    </div>
                </div>

                <div className="p-0 overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-600">
                        <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 font-semibold sticky top-0 uppercase tracking-wider text-xs">
                            <tr>
                                <th className="px-6 py-4">ID</th>
                                <th className="px-6 py-4">Cliente</th>
                                <th className="px-6 py-4">Plano</th>
                                <th className="px-6 py-4">Periodicidade</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Pagamento Atual</th>
                                <th className="px-6 py-4">Local de Entrega</th>
                                <th className="px-6 py-4">Data Adesão</th>
                                <th className="px-6 py-4 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading && subscribers.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="px-6 py-12 text-center text-slate-400">
                                        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-indigo-500" />
                                        Carregando assinaturas...
                                    </td>
                                </tr>
                            ) : filteredSubscribers.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="px-6 py-12 text-center text-slate-500 bg-slate-50/50">
                                        Nenhum assinante encontrado com os filtros atuais.
                                    </td>
                                </tr>
                            ) : (
                                filteredSubscribers.map((sub) => (
                                    <tr key={sub.id} className="hover:bg-slate-50 transition-colors group">
                                        <td className="px-6 py-4 font-mono text-xs text-slate-400">#{sub.id}</td>
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-slate-900">{sub.customer_name}</div>
                                            {(sub.customer_document || sub.customer_email) && (
                                                <div className="text-xs text-slate-500 mt-1 flex flex-col gap-0.5">
                                                    {sub.customer_document && <span>{sub.customer_document.replace(/^(\d{3})(\d{3})(\d{3})(\d{2}).*/, '$1.$2.$3-$4')}</span>}
                                                    {sub.customer_email && <span>{sub.customer_email}</span>}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 font-medium">{sub.plan_name}</td>
                                        <td className="px-6 py-4 text-sm text-slate-500 font-medium whitespace-nowrap">
                                            {sub.plan_frequency === 'MONTHLY' ? 'Mensal' : 
                                             sub.plan_frequency === 'BIMONTHLY' ? 'Bimestral' :
                                             sub.plan_frequency === 'QUARTERLY' ? 'Trimestral' :
                                             sub.plan_frequency === 'SEMIANNUAL' ? 'Semestral' :
                                             sub.plan_frequency === 'ANNUAL' ? 'Anual' : 
                                             sub.plan_frequency || 'Mensal'}
                                             {sub.efi_subscription_id && (
                                                <div className="text-xs text-slate-400 font-mono mt-0.5">ID Efí: {sub.efi_subscription_id}</div>
                                             )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold leading-none ${
                                                sub.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' :
                                                sub.status === 'CANCELED' ? 'bg-rose-100 text-rose-800' :
                                                'bg-amber-100 text-amber-800'
                                            }`}>
                                                {sub.status === 'ACTIVE' ? 'Ativo' : sub.status === 'CANCELED' ? 'Cancelado' : sub.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-2 h-2 rounded-full ${
                                                    sub.latest_payment_status === 'PAID' ? 'bg-emerald-500' :
                                                    sub.latest_payment_status === 'PENDING' ? 'bg-amber-500' :
                                                    'bg-rose-500'
                                                }`} />
                                                <span className="font-medium text-slate-700">
                                                    {sub.latest_payment_status === 'PAID' ? 'Pago' :
                                                     sub.latest_payment_status === 'PENDING' ? 'Pendente' : 'Falha'}
                                                </span>
                                            </div>
                                            <div className="text-xs text-slate-400 mt-1">
                                                Etapa {sub.current_delivery}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="truncate max-w-[200px]" title={sub.shipping_address}>
                                                {sub.shipping_address}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-slate-500">
                                            {new Date(sub.created_at).toLocaleDateString('pt-BR')}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <a
                                                href={`/subscribers/${sub.id}`}
                                                className="inline-flex items-center justify-center p-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-colors"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                                            </a>
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
