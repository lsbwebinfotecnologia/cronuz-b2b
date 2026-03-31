"use client";

import { useEffect, useState } from "react";
import { Package, ArrowLeft, Download, CheckCircle2, FileText, Truck, MessageSquare, Send, Check, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getToken } from "@/lib/auth";
import { ProductImage } from "@/components/store/ProductImage";

interface OrderItem {
    id: number;
    name: string;
    sku: string;
    ean_isbn: string;
    quantity: number;
    quantity_requested: number;
    quantity_fulfilled: number;
    unit_price: number;
    total_price: number;
}

interface OrderLog {
    id: number;
    old_status?: string;
    new_status: string;
    created_at: string;
}

interface OrderInteraction {
    id: number;
    user_type: string;
    user_id?: number;
    customer_id?: number;
    message: string;
    created_at: string;
    read_at?: string;
}

interface OrderDetail {
    id: number;
    created_at: string;
    total: number;
    subtotal: number;
    discount: number;
    status: string;
    horus_pedido_venda?: string;
    tracking_code?: string;
    invoice_xml_available: boolean;
    invoice_xml?: string;
    items: OrderItem[];
    logs: OrderLog[];
    interactions: OrderInteraction[];
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

export default function StoreOrderDetailPage() {
    const params = useParams();
    const [order, setOrder] = useState<OrderDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [replyMessage, setReplyMessage] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const fetchOrder = async () => {
            try {
                const token = getToken();
                const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/storefront/orders/${params.id}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    setOrder(data);
                }
            } catch (error) {
                console.error("Error fetching order detail:", error);
            } finally {
                setLoading(false);
            }
        };

        if (params.id) {
            fetchOrder();
        }
    }, [params.id]);

    // Mark incoming messages as read
    useEffect(() => {
        if (!order) return;
        
        const unreadSellerMessages = order.interactions.filter(
            i => i.user_type === "SELLER" && !i.read_at
        );

        if (unreadSellerMessages.length > 0) {
            const markAsRead = async () => {
                const token = getToken();
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
                
                let updatedInteractions = [...order.interactions];
                let hasChanges = false;

                for (const msg of unreadSellerMessages) {
                    try {
                        const res = await fetch(`${apiUrl}/storefront/orders/${order.id}/interactions/${msg.id}/read`, {
                            method: 'PUT',
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                        if (res.ok) {
                            const updatedMsg = await res.json();
                            updatedInteractions = updatedInteractions.map(i => i.id === updatedMsg.id ? updatedMsg : i);
                            hasChanges = true;
                        }
                    } catch (e) {
                        console.error("Failed to mark message as read", e);
                    }
                }

                if (hasChanges) {
                    setOrder({ ...order, interactions: updatedInteractions });
                }
            };
            markAsRead();
        }
    }, [order]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!replyMessage.trim() || !order) return;
        
        setIsSubmitting(true);
        try {
            const token = getToken();
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/storefront/orders/${order.id}/interactions`, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ message: replyMessage.trim() })
            });

            if (response.ok) {
                const newInteraction = await response.json();
                setOrder({
                    ...order,
                    interactions: [...order.interactions, newInteraction]
                });
                setReplyMessage("");
            } else {
                alert("Falha ao enviar mensagem.");
            }
        } catch (error) {
            console.error("Error sending interaction:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDownloadInvoice = () => {
        if (!order || !order.invoice_xml) return;
        
        // Decode base64
        try {
            const binaryString = window.atob(order.invoice_xml);
            const binaryLen = binaryString.length;
            const bytes = new Uint8Array(binaryLen);
            for (let i = 0; i < binaryLen; i++) {
                const ascii = binaryString.charCodeAt(i);
                bytes[i] = ascii;
            }
            
            const blob = new Blob([bytes], { type: "application/xml" });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `NotaFiscal_${order.id}_${order.horus_pedido_venda || ''}.xml`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (e) {
            console.error("Error downloading XML", e);
            alert("Erro ao decodificar a Nota Fiscal");
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!order) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pt-24 pb-12 text-center">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">Pedido não encontrado</h1>
                <Link href="/store/orders" className="text-indigo-600 hover:text-indigo-700 font-medium">
                    Voltar para meus pedidos
                </Link>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pt-24 pb-12">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                
                {/* Header Actions */}
                <div className="flex items-center gap-4 mb-6">
                    <Link
                        href="/store/orders"
                        className="p-2 -ml-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex border-l-2 border-slate-300 dark:border-slate-700 pl-4 items-center gap-3">
                        Pedido #{order.id}
                    </h1>
                    
                    <span className={`ml-auto inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusColorMap[order.status] || "bg-slate-100 text-slate-800"}`}>
                        {statusLabelMap[order.status] || order.status}
                    </span>
                </div>

                {/* Timeline UI */}
                {order.status === "CANCELLED" ? (
                    <div className="mb-8 bg-red-50 dark:bg-red-900/10 rounded-2xl p-6 border border-red-200 dark:border-red-900/30 flex items-center justify-center">
                        <h2 className="text-xl font-bold text-red-600 dark:text-red-400 flex items-center gap-2">
                             Pedido Cancelado no B2B / ERP
                        </h2>
                    </div>
                ) : (
                    <div className="mb-8 bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm overflow-x-auto">
                        <div className="min-w-[600px]">
                            <div className="flex items-center justify-between relative">
                                <div className="absolute left-[10%] right-[10%] top-1/2 -translate-y-1/2 h-1 bg-slate-200 dark:bg-slate-700 -z-10"></div>
                                
                                {[
                                    { key: "NEW", label: "Novo", i: 0 },
                                    { key: "PROCESSING", label: "Aguardando Pagamento", i: 1 },
                                    { key: "SENT_TO_HORUS", label: "Pago", i: 2 },
                                    { key: "INVOICED", label: "Faturado", i: 3 },
                                    { key: "COMPLETED", label: "Concluído", i: 4 }
                                ].map((step) => {
                                    const currentStatusIndex = ["NEW", "PROCESSING", "SENT_TO_HORUS", "INVOICED", "COMPLETED"].indexOf(
                                        ["DISPATCH"].includes(order.status) ? "INVOICED" : order.status
                                    );
                                    const isCompleted = step.i <= currentStatusIndex;
                                    const isCurrent = step.key === order.status;
                                    
                                    return (
                                        <div key={step.key} className="flex flex-col items-center gap-2 relative z-10 w-1/5">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center border-4 border-white dark:border-slate-800 ${isCurrent ? "bg-indigo-600 scale-125" : isCompleted ? "bg-indigo-600" : "bg-slate-300 dark:bg-slate-600"}`}>
                                                {isCompleted && !isCurrent ? <CheckCircle2 className="w-4 h-4 text-white" /> : <div className="w-2 h-2 rounded-full bg-white"></div>}
                                            </div>
                                            <span className={`text-xs font-medium text-center ${isCurrent ? "text-indigo-600 dark:text-indigo-400 font-bold" : isCompleted ? "text-slate-700 dark:text-slate-300" : "text-slate-400"}`}>
                                                {step.label}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    
                    {/* Left Column (Items) */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                <Package className="w-5 h-5 text-indigo-500" />
                                Itens do Pedido ({order.items.length})
                            </h2>
                            <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                {order.items.map((item) => (
                                    <div key={item.id} className={`py-4 flex gap-4 items-center ${order.status === "CANCELLED" ? "opacity-50" : ""}`}>
                                        <div className="w-16 h-20 bg-slate-100 dark:bg-slate-700 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden border border-slate-200 dark:border-slate-600/50">
                                           <ProductImage eanGtin={item.ean_isbn} alt={item.name} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className={`text-sm font-semibold text-slate-900 dark:text-white truncate ${order.status === "CANCELLED" ? "line-through" : ""}`}>
                                                {item.name || "Produto"}
                                            </h3>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                                    SKU/ISBN: {item.ean_isbn || item.sku}
                                                </span>
                                            </div>
                                            <div className="flex flex-col gap-1 mt-2">
                                                <span className="text-sm font-medium text-slate-900 dark:text-slate-300">
                                                    Qtd Pedida: {item.quantity_requested || item.quantity} | <span className={item.quantity_fulfilled < (item.quantity_requested || item.quantity) ? "text-amber-600 font-bold" : "text-emerald-600 font-bold"}>Atendida: {item.quantity_fulfilled}</span>
                                                </span>
                                                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                                                    Valor un: R$ {item.unit_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="text-right flex-shrink-0">
                                            <span className="text-sm font-bold text-slate-900 dark:text-white">
                                                R$ {item.total_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right Column (Summary & Logistics) */}
                    <div className="space-y-6">
                        
                        {/* Summary */}
                        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Resumo</h2>
                            <div className="space-y-3">
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500 dark:text-slate-400">Data do Pedido</span>
                                    <span className="font-medium text-slate-900 dark:text-white">
                                        {new Date(order.created_at).toLocaleDateString('pt-BR')}
                                    </span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500 dark:text-slate-400">Subtotal</span>
                                    <span className="font-medium text-slate-900 dark:text-white">
                                        R$ {order.subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                                {order.discount > 0 && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500 dark:text-slate-400">Descontos</span>
                                        <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                            - R$ {order.discount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                )}
                                <div className="pt-3 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
                                    <span className="text-base font-bold text-slate-900 dark:text-white">Total</span>
                                    <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
                                        R$ {order.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Integration Details */}
                        {order.horus_pedido_venda && (
                            <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
                                <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2 uppercase tracking-wider">
                                    <Truck className="w-4 h-4 text-slate-400" />
                                    Integração ERP
                                </h2>
                                <div className="space-y-4">
                                    <div>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Cód. Rastreio Interno</p>
                                        <p className="text-sm font-medium text-slate-900 dark:text-white font-mono bg-slate-50 dark:bg-slate-900 p-2 rounded border border-slate-100 dark:border-slate-800">
                                            {order.horus_pedido_venda}
                                        </p>
                                    </div>
                                    
                                    {order.tracking_code && (
                                        <div>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Rastreio Logística</p>
                                            <p className="text-sm font-medium text-slate-900 dark:text-white">
                                                {order.tracking_code}
                                            </p>
                                        </div>
                                    )}

                                    {order.invoice_xml_available && (
                                        <div className="pt-4 border-t border-slate-100 dark:border-slate-700">
                                            <button
                                                onClick={handleDownloadInvoice}
                                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50 rounded-xl transition-colors font-medium text-sm"
                                            >
                                                <FileText className="w-4 h-4" />
                                                Baixar XML da Nota
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        
                    </div>
                </div>

                {/* Interaction and Logs */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col h-[500px]">
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2 shrink-0">
                            <MessageSquare className="w-5 h-5 text-indigo-500" />
                            Mensagens do Pedido
                        </h2>
                        
                        <div className="flex-1 overflow-y-auto space-y-4 mb-4 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                            {order?.interactions.length === 0 ? (
                                <p className="text-sm text-slate-500 text-center py-8">Nenhuma mensagem registrada. Inicie a conversa abaixo.</p>
                            ) : (
                                order?.interactions.map(interaction => {
                                    const isCustomer = interaction.user_type === "CUSTOMER";
                                    return (
                                        <div key={interaction.id} className={`flex ${isCustomer ? "justify-end" : "justify-start"}`}>
                                            <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${isCustomer ? "bg-indigo-600 text-white" : "bg-white border text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200"}`}>
                                                <p className="text-xs font-bold mb-1 opacity-75">{isCustomer ? "Você" : "Vendedor"}</p>
                                                <p className="text-sm whitespace-pre-wrap">{interaction.message}</p>
                                                <div className="flex items-center justify-end gap-1 mt-1 opacity-70">
                                                    <p className="text-[10px] text-right">
                                                        {new Date(interaction.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                                                    </p>
                                                    {isCustomer && (
                                                        interaction.read_at ? (
                                                            <CheckCheck className="w-3 h-3 text-white" />
                                                        ) : (
                                                            <Check className="w-3 h-3 text-white opacity-70" />
                                                        )
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                        </div>
                        
                        {order.status !== "INVOICED" && order.status !== "CANCELLED" ? (
                            <form onSubmit={handleSendMessage} className="shrink-0 flex gap-2">
                                <input
                                    type="text"
                                    value={replyMessage}
                                    onChange={(e) => setReplyMessage(e.target.value)}
                                    placeholder="Digite uma mensagem..."
                                    className="flex-1 px-4 py-2 text-sm border border-slate-300 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-700 dark:text-white"
                                    disabled={isSubmitting}
                                />
                                <button
                                    type="submit"
                                    disabled={isSubmitting || !replyMessage.trim()}
                                    className="bg-indigo-600 text-white p-3 rounded-xl disabled:opacity-50 hover:bg-indigo-700 transition-colors"
                                >
                                    <Send className="w-4 h-4" />
                                </button>
                            </form>
                        ) : (
                            <div className="shrink-0 text-center p-3 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-xl text-sm">
                                Interação desabilitada. Pedido {statusLabelMap[order.status]}.
                            </div>
                        )}
                    </div>
                    
                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm h-[500px] overflow-y-auto">
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2 opacity-80">
                             Histórico de Status do Horus
                        </h2>
                        
                        <div className="space-y-4 relative before:absolute before:inset-0 before:ml-2 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 dark:before:via-slate-700 before:to-transparent">
                            {order?.logs.length === 0 ? (
                                <p className="text-sm text-slate-500 ml-6 relative z-10">Nenhuma mudança de status registrada nativamente pelo sistema.</p>
                            ) : (
                                order?.logs.map(log => (
                                    <div key={log.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group md:is-active">
                                        <div className="flex items-center justify-center w-5 h-5 rounded-full border-2 border-slate-300 bg-white dark:bg-slate-800 dark:border-slate-600 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 relative z-10"></div>
                                        <div className="w-[calc(100%-2rem)] md:w-[calc(50%-1.5rem)] bg-slate-50 dark:bg-slate-800/50 p-3 rounded shadow-sm border border-slate-200 dark:border-slate-600/50">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="font-bold text-slate-900 dark:text-white text-sm">{statusLabelMap[log.new_status] || log.new_status}</span>
                                                <time className="text-xs font-mono text-indigo-500">{new Date(log.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</time>
                                            </div>
                                            <div className="text-slate-500 dark:text-slate-400 text-xs text-left">Pedido avançou para <strong className="font-semibold text-slate-700 dark:text-slate-300">{statusLabelMap[log.new_status] || log.new_status}</strong>{log.old_status ? ` (anteriormente ${statusLabelMap[log.old_status] || log.old_status})` : ''}.</div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
