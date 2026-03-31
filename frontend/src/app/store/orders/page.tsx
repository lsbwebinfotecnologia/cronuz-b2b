"use client";

import { useEffect, useState } from "react";
import { Package, Search, ChevronRight, FileText } from "lucide-react";
import Link from "next/link";
import { getToken } from "@/lib/auth";

interface Order {
    id: number;
    created_at: string;
    total: number;
    status: string;
    horus_pedido_venda?: string;
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
    "PROCESSING": "Aguardando Pagamento",
    "SENT_TO_HORUS": "Pago",
    "DISPATCH": "Em Separação",
    "INVOICED": "Faturado",
    "COMPLETED": "Concluído",
    "CANCELLED": "Cancelado"
};

export default function StoreOrdersPage() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchOrders = async () => {
            try {
                const token = getToken();
                const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/storefront/orders`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    setOrders(data);
                }
            } catch (error) {
                console.error("Error fetching orders:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchOrders();
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pt-24 pb-12">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                            <Package className="w-7 h-7 text-indigo-500" />
                            Meus Pedidos
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 mt-1">Acompanhe o status das suas compras</p>
                    </div>
                </div>

                {orders.length === 0 ? (
                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-12 text-center border border-slate-200 dark:border-slate-700">
                        <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
                            <FileText className="w-8 h-8 text-slate-400" />
                        </div>
                        <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">Nenhum pedido encontrado</h3>
                        <p className="text-slate-500 dark:text-slate-400 mb-6 max-w-sm mx-auto">
                            Você ainda não realizou nenhuma compra. Explore nosso catálogo e faça seu primeiro pedido!
                        </p>
                        <Link href="/store" className="inline-flex items-center px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors">
                            Explorar Catálogo
                        </Link>
                    </div>
                ) : (
                    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                                        <th className="py-4 px-6 text-sm font-semibold text-slate-900 dark:text-white whitespace-nowrap">Pedido</th>
                                        <th className="py-4 px-6 text-sm font-semibold text-slate-900 dark:text-white whitespace-nowrap">Data</th>
                                        <th className="py-4 px-6 text-sm font-semibold text-slate-900 dark:text-white whitespace-nowrap">Status</th>
                                        <th className="py-4 px-6 text-sm font-semibold text-slate-900 dark:text-white whitespace-nowrap text-right">Total</th>
                                        <th className="py-4 px-6 text-center"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {orders.map((order) => (
                                        <tr key={order.id} className="border-b border-slate-100 dark:border-slate-700/50 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors">
                                            <td className="py-4 px-6">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-medium text-slate-900 dark:text-white">#{order.id}</span>
                                                    {order.horus_pedido_venda && (
                                                        <span className="text-xs text-slate-500 dark:text-slate-400">ERP: {order.horus_pedido_venda}</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="py-4 px-6">
                                                <span className="text-sm text-slate-600 dark:text-slate-300">
                                                    {new Date(order.created_at).toLocaleDateString('pt-BR')}
                                                </span>
                                            </td>
                                            <td className="py-4 px-6">
                                                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${statusColorMap[order.status] || "bg-slate-100 text-slate-800"}`}>
                                                    {statusLabelMap[order.status] || order.status}
                                                </span>
                                            </td>
                                            <td className="py-4 px-6 text-right">
                                                <span className="text-sm font-medium text-slate-900 dark:text-white">
                                                    R$ {order.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </span>
                                            </td>
                                            <td className="py-4 px-6 text-right">
                                                <Link 
                                                    href={`/store/orders/${order.id}`}
                                                    className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-indigo-100 hover:text-indigo-600 dark:hover:bg-indigo-900/30 dark:hover:text-indigo-400 transition-colors"
                                                >
                                                    <ChevronRight className="w-4 h-4" />
                                                </Link>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
