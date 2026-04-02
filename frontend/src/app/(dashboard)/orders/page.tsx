"use client";

import { useState, useEffect } from 'react';
import { 
  Package, Search, Plus, Filter, MoreVertical, Building2, User, Eye, Download, CheckCircle2, XCircle
} from 'lucide-react';
import Link from 'next/link';
import { getToken } from '@/lib/auth';

interface Customer {
    id: number;
    corporate_name: string;
    fantasy_name: string;
    document: string;
}

interface OrderItem {
    id: number;
    name: string;
    sku: string;
    quantity: number;
    unit_price: number;
    total_price: number;
}

interface Order {
    id: number;
    created_at: string;
    total: number;
    status: string;
    origin?: string;
    horus_pedido_venda?: string;
    external_id?: string;
    customer_id: number;
    invoice_xml_available?: boolean;
    customer?: Customer; // Will be hydrated partially if available
}

const statusColorMap: Record<string, string> = {
    "NEW": "bg-slate-100 text-slate-800",
    "PROCESSING": "bg-yellow-100 text-yellow-800",
    "SENT_TO_HORUS": "bg-blue-100 text-blue-800",
    "DISPATCH": "bg-purple-100 text-purple-800",
    "INVOICED": "bg-green-100 text-green-800",
    "CANCELLED": "bg-red-100 text-red-800"
};

const statusLabelMap: Record<string, string> = {
    "NEW": "Novo",
    "PROCESSING": "Processando",
    "SENT_TO_HORUS": "Aprovado / ERP",
    "DISPATCH": "Em Separação",
    "INVOICED": "Faturado",
    "CANCELLED": "Cancelado"
};

export default function OrdersPage() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [page, setPage] = useState(0);
    const [total, setTotal] = useState(0);

    const fetchOrders = async () => {
        setLoading(true);
        try {
            const limit = 25;
            const skip = page * limit;
            const params = new URLSearchParams({
                skip: skip.toString(),
                limit: limit.toString()
            });
            if (searchTerm) {
                params.append('search', searchTerm);
            }
            
            const token = getToken();
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const response = await fetch(`${apiUrl}/orders?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                const data = await response.json();
                setOrders(data.items);
                setTotal(data.total);
            }
        } catch (error) {
            console.error("Error fetching orders:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            fetchOrders();
        }, 500);
        return () => clearTimeout(timeoutId);
    }, [searchTerm, page]);

    return (
        <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                        <Package className="w-8 h-8 text-[var(--color-primary-base)]" />
                        Gestão de Pedidos
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">
                        Acompanhe os pedidos recebidos via B2B e seus status no Horus.
                    </p>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row gap-4 justify-between bg-slate-50/50 dark:bg-slate-900/50">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar por código Horus ou cliente..."
                            value={searchTerm}
                            onChange={(e) => {
                                setSearchTerm(e.target.value);
                                setPage(0);
                            }}
                            className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-[var(--color-primary-base)] focus:border-transparent transition-all text-sm"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                                <th className="py-3 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Cód. Interno</th>
                                <th className="py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Cód. parceiro</th>
                                <th className="py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Cód. Horus</th>
                                <th className="py-3 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Cliente</th>
                                <th className="py-3 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Data</th>
                                <th className="py-3 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                                <th className="py-3 px-6 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Total</th>
                                <th className="py-3 px-4 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="py-12 text-center text-slate-500">
                                        Carregando pedidos...
                                    </td>
                                </tr>
                            ) : orders.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="py-12 text-center text-slate-500">
                                        Nenhum pedido encontrado.
                                    </td>
                                </tr>
                            ) : (
                                orders.map((order) => (
                                    <tr key={order.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                        <td className="py-3 px-6">
                                            <span className="text-sm font-semibold text-slate-900 dark:text-white">#{order.id}</span>
                                        </td>
                                        <td className="py-3 px-4">
                                            {order.external_id ? (
                                                <div className="flex flex-col">
                                                   <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono">
                                                       {order.external_id}
                                                   </span>
                                                   <span className="text-[10px] text-slate-400 uppercase mt-0.5 px-1">{order.origin}</span>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-slate-400 italic">-</span>
                                            )}
                                        </td>
                                        <td className="py-3 px-4">
                                            {order.horus_pedido_venda ? (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200 font-mono">
                                                    {order.horus_pedido_venda}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-slate-400 italic">Pendente</span>
                                            )}
                                        </td>
                                        <td className="py-3 px-6">
                                            {order.customer ? (
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-medium text-slate-900 dark:text-white truncate max-w-[200px]" title={order.customer.corporate_name}>
                                                        {order.customer.corporate_name}
                                                    </span>
                                                    <span className="text-xs text-slate-500 font-mono mt-0.5">
                                                        {order.customer.document}
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-slate-400 italic">Desconhecido</span>
                                            )}
                                        </td>
                                        <td className="py-3 px-6 text-sm text-slate-600 dark:text-slate-300">
                                            {new Date(order.created_at).toLocaleDateString('pt-BR')}
                                        </td>
                                        <td className="py-3 px-6">
                                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusColorMap[order.status] || "bg-slate-100 text-slate-800"}`}>
                                                {statusLabelMap[order.status] || order.status}
                                            </span>
                                        </td>
                                        <td className="py-3 px-6 text-right text-sm font-semibold text-slate-900 dark:text-white">
                                            R$ {order.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="py-3 px-6 text-right">
                                            <Link 
                                                href={`/orders/${order.id}`}
                                                className="inline-flex items-center p-2 text-slate-400 hover:text-[var(--color-primary-base)] hover:bg-[var(--color-primary-base)]/10 rounded-lg transition-colors"
                                                title="Visualizar Pedido"
                                            >
                                                <Eye className="w-5 h-5" />
                                            </Link>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {!loading && orders.length > 0 && (
                    <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between text-sm">
                        <span className="text-slate-500">
                            Mostrando {page * 25 + 1} a {Math.min((page + 1) * 25, total)} de {total}
                        </span>
                        <div className="flex gap-2">
                            <button 
                                onClick={() => setPage(p => Math.max(0, p - 1))}
                                disabled={page === 0}
                                className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 disabled:opacity-50 hover:bg-white transition-colors"
                            >
                                Anterior
                            </button>
                            <button 
                                onClick={() => setPage(p => p + 1)}
                                disabled={(page + 1) * 25 >= total}
                                className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 disabled:opacity-50 hover:bg-white transition-colors"
                            >
                                Próxima
                            </button>
                        </div>
                    </div>
                )}
            </div>
            
        </div>
    );
}
