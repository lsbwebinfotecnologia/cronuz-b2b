"use client";

import { useEffect, useState } from "react";
import { Package, ArrowLeft, Building2, User, FileText, Download, Truck, MessageSquare, Send, Check, CheckCheck, Terminal, X, RefreshCw, AlertCircle, QrCode } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getToken, getUser } from "@/lib/auth";
import { ProductImage } from "@/components/store/ProductImage";

interface Customer {
    id: number;
    corporate_name: string;
    fantasy_name: string;
    document: string;
    email: string;
    phone: string;
}

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
    company_id: number;
    created_at: string;
    total: number;
    subtotal: number;
    discount: number;
    status: string;
    horus_pedido_venda?: string;
    tracking_code?: string;
    invoice_xml_available: boolean;
    invoice_xml?: string;
    origin?: string;
    external_id?: string;
    partner_reference?: string;
    items: OrderItem[];
    customer?: Customer;
    logs: OrderLog[];
    interactions: OrderInteraction[];
    cover_image_base_url?: string;
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
    "SENT_TO_HORUS": "Em Processamento",
    "DISPATCH": "Em Separação",
    "INVOICED": "Faturado",
    "CANCELLED": "Cancelado"
};

export default function OrderDetailPage() {
    const params = useParams();
    const [order, setOrder] = useState<OrderDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [replyMessage, setReplyMessage] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Horus Debug Modal State
    const [isDebugModalOpen, setIsDebugModalOpen] = useState(false);
    const [horusPreviewLoading, setHorusPreviewLoading] = useState(false);
    const [horusPreviewData, setHorusPreviewData] = useState<any>(null);
    const [horusSyncing, setHorusSyncing] = useState(false);
    const [interEnabled, setInterEnabled] = useState(false);

    const fetchOrder = async () => {
        try {
            const token = getToken();
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const response = await fetch(`${apiUrl}/orders/${params.id}`, {
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
    
    const fetchSettings = async () => {
        const u = getUser();
        if (u?.company_id) {
            try {
                const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${u.company_id}/settings`, { headers: { 'Authorization': `Bearer ${getToken()}` }});
                if (r.ok) {
                    const d = await r.json();
                    setInterEnabled(d.inter_enabled || false);
                }
            } catch(e) {}
        }
    };

    useEffect(() => {
        if (params.id) {
            fetchOrder();
            fetchSettings();
        }
    }, [params.id]);

    // Mark incoming messages as read
    useEffect(() => {
        if (!order) return;
        
        const unreadCustomerMessages = order.interactions.filter(
            i => i.user_type === "CUSTOMER" && !i.read_at
        );

        if (unreadCustomerMessages.length > 0) {
            const markAsRead = async () => {
                const token = getToken();
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
                
                let updatedInteractions = [...order.interactions];
                let hasChanges = false;

                for (const msg of unreadCustomerMessages) {
                    try {
                        const res = await fetch(`${apiUrl}/orders/${order.id}/interactions/${msg.id}/read`, {
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
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const response = await fetch(`${apiUrl}/orders/${order.id}/interactions`, {
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

    const handleIssueInterSlip = async () => {
        if (!order) return;
        const loadingId = toast.loading("Gerando Boleto Banco Inter...");
        try {
            const token = getToken();
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const res = await fetch(`${apiUrl}/orders/${order.id}/issue-inter-slip`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                toast.success("Boleto emitido! Acesse o painel financeiro para visualizar o PDF.", { id: loadingId });
            } else {
                const data = await res.json();
                toast.error(data.detail || "Erro ao emitir boleto.", { id: loadingId });
            }
        } catch (e) {
            toast.error("Erro de conexão.", { id: loadingId });
        }
    };

    const handleDownloadInvoice = () => {
        if (!order || !order.invoice_xml) return;
        
        try {
            const binaryString = window.atob(order.invoice_xml);
            const binaryLen = binaryString.length;
            const bytes = new Uint8Array(binaryLen);
            for (let i = 0; i < binaryLen; i++) {
                bytes[i] = binaryString.charCodeAt(i);
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

    const handleOpenDebugModal = async () => {
        setIsDebugModalOpen(true);
        setHorusPreviewLoading(true);
        setHorusPreviewData(null);
        try {
            const token = getToken();
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const res = await fetch(`${apiUrl}/orders/${order?.id}/horus-debug-preview`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok) {
                setHorusPreviewData(data);
            } else {
                setHorusPreviewData({ error: data.detail || "Erro desconhecido ao consultar Horus" });
            }
        } catch (e) {
            setHorusPreviewData({ error: "Falha de conexão com a API local ao consultar Horus" });
        } finally {
            setHorusPreviewLoading(false);
        }
    };

    const handleSyncHorus = async () => {
        setHorusSyncing(true);
        try {
            const token = getToken();
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const res = await fetch(`${apiUrl}/orders/${order?.id}/sync-horus`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok) {
                alert("Sincronizado com sucesso!");
                setIsDebugModalOpen(false);
                fetchOrder(); // reload
            } else {
                alert("Erro ao sincronizar: " + (data.detail || "Erro desconhecido"));
            }
        } catch (e) {
            alert("Falha de conexão com o servidor ao sincronizar.");
        } finally {
            setHorusSyncing(false);
        }
    };

    if (loading) {
        return (
            <div className="p-8 flex items-center justify-center h-64">
                <div className="w-8 h-8 border-4 border-[var(--color-primary-base)] border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!order) {
        return (
            <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 mx-6 mt-6">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">Pedido não encontrado</h1>
                <Link href="/orders" className="bg-[var(--color-primary-base)] text-white px-6 py-2 rounded-xl inline-flex items-center hover:bg-[var(--color-primary-hover)] transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Voltar para lista
                </Link>
            </div>
        );
    }

    return (
        <>
        <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
            
            {/* Header Actions */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-4">
                    <Link
                        href="/orders"
                        className="p-2 -ml-2 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div>
                         <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                            Pedido Interno: #{order.id}
                            <button onClick={handleOpenDebugModal} className="text-slate-200 dark:text-slate-800 hover:text-indigo-500 transition-colors p-1" title="Debug Horus">
                                <Terminal className="w-4 h-4" />
                            </button>
                        </h1>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 mt-1">
                            {order.horus_pedido_venda && (
                                <p className="text-slate-500 font-mono text-sm">Integração Horus: {order.horus_pedido_venda}</p>
                            )}
                            {order.external_id && (
                                <p className="text-slate-500 font-mono text-sm">
                                    Cód Parceiro ({order.origin || 'Externo'}): <span className="font-bold text-indigo-600 dark:text-indigo-400">{order.external_id}</span>
                                    {order.partner_reference && (
                                        <span className="ml-2 font-medium text-slate-500 text-xs">Ref: {order.partner_reference}</span>
                                    )}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-semibold uppercase tracking-wide ${statusColorMap[order.status] || "bg-slate-100 text-slate-800"}`}>
                        {statusLabelMap[order.status] || order.status}
                    </span>

                    {interEnabled && (
                        <button
                            onClick={() => window.confirm("Emitir boleto para este pedido no Banco Inter?") && handleIssueInterSlip()}
                            className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 shadow-sm shadow-orange-500/20"
                        >
                            <QrCode className="w-4 h-4" />
                            Boleto Inter
                        </button>
                    )}

                    {order.invoice_xml_available && (
                        <button
                            onClick={handleDownloadInvoice}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
                        >
                            <Download className="w-4 h-4" />
                            Baixar NFe (XML)
                        </button>
                    )}
                </div>
            </div>

            {/* Timeline UI */}
            {order.status === "CANCELLED" ? (
                <div className="mb-4 bg-red-50 dark:bg-red-900/10 rounded-2xl p-6 border border-red-200 dark:border-red-900/30 flex items-center justify-center">
                    <h2 className="text-xl font-bold text-red-600 dark:text-red-400 flex items-center gap-2">
                         Pedido Cancelado no B2B / ERP
                    </h2>
                </div>
            ) : (
                <div className="mb-4 bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm overflow-x-auto">
                    <div className="min-w-[600px]">
                        <div className="flex items-center justify-between relative">
                            <div className="absolute left-[10%] right-[10%] top-1/2 -translate-y-1/2 h-1 bg-slate-200 dark:bg-slate-800 -z-10"></div>
                            
                            {[
                                { key: "NEW", label: "Realizado", i: 0 },
                                { key: "SENT_TO_HORUS", label: "Em Processamento", i: 1 },
                                { key: "INVOICED", label: "Faturado", i: 2 },
                                { key: "CONCLUIDO", label: "Concluído", i: 3 }
                            ].map((step) => {
                                const currentStatusIndex = ["NEW", "SENT_TO_HORUS", "INVOICED", "CONCLUIDO"].indexOf(
                                    ["DISPATCH", "PROCESSING"].includes(order.status) ? "SENT_TO_HORUS" : order.status
                                );
                                const isCompleted = step.i <= currentStatusIndex;
                                const isCurrent = step.key === order.status;
                                
                                return (
                                    <div key={step.key} className="flex flex-col items-center gap-2 relative z-10 w-1/5">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center border-4 border-white dark:border-slate-900 ${isCurrent ? "bg-[var(--color-primary-base)] scale-125" : isCompleted ? "bg-[var(--color-primary-base)]" : "bg-slate-300 dark:bg-slate-700"}`}>
                                            {isCompleted && !isCurrent ? <div className="w-2 h-2 rounded-full bg-white"></div> : <div className="w-2 h-2 rounded-full bg-white"></div>}
                                        </div>
                                        <span className={`text-xs font-medium text-center ${isCurrent ? "text-[var(--color-primary-base)] font-bold" : isCompleted ? "text-slate-700 dark:text-slate-300" : "text-slate-400"}`}>
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
                    <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                            <Package className="w-5 h-5 text-[var(--color-primary-base)]" />
                            Itens do Pedido ({order.items.length})
                        </h2>
                        <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
                            {order.items.map((item) => (
                                <div key={item.id} className={`py-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center ${order.status === "CANCELLED" ? "opacity-50" : ""}`}>
                                    <div className="w-16 h-16 shrink-0 bg-slate-50 dark:bg-slate-800 rounded-lg overflow-hidden border border-slate-100 dark:border-slate-700">
                                        <ProductImage 
                                            eanGtin={item.ean_isbn} 
                                            alt={item.name}
                                            companyIdProp={order.company_id} 
                                            baseUrl={order.cover_image_base_url}
                                        />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className={`text-sm font-bold text-slate-900 dark:text-white truncate ${order.status === "CANCELLED" ? "line-through" : ""}`}>
                                            {item.name || "Produto não identificado"}
                                        </h3>
                                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                            <span className="text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-mono">
                                                {item.sku}
                                            </span>
                                            {item.ean_isbn && (
                                                <span className="text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-mono">
                                                    {item.ean_isbn}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-6 justify-between w-full sm:w-auto">
                                        <div className="text-right">
                                            <span className="text-xs text-slate-500 block mb-0.5">Vlr. Unit.</span>
                                            <span className="text-sm font-medium text-slate-900 dark:text-slate-200">
                                                R$ {item.unit_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-xs text-slate-500 block mb-0.5">Qtd Pedida</span>
                                            <span className="text-sm font-bold text-slate-900 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded-lg">
                                                x{item.quantity_requested || item.quantity}
                                            </span>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-xs text-slate-500 block mb-0.5">Qtd Atendida</span>
                                            <span className={`text-sm font-bold bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded-lg ${item.quantity_fulfilled < (item.quantity_requested || item.quantity) ? 'text-amber-600' : 'text-emerald-600'}`}>
                                                x{item.quantity_fulfilled}
                                            </span>
                                        </div>
                                        <div className="text-right min-w-[100px]">
                                            <span className="text-xs text-slate-500 block mb-0.5">Subtotal</span>
                                            <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                                                R$ {item.total_price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Column (Customer & Summary) */}
                <div className="space-y-6">
                    
                    {/* Customer Info */}
                    {order.customer && (
                        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                <User className="w-5 h-5 text-[var(--color-primary-base)]" />
                                Cliente B2B
                            </h2>
                            <div className="space-y-3">
                                <div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">Razão Social</p>
                                    <Link href={`/customers/${order.customer.id}`} className="text-sm font-bold text-slate-900 dark:text-white hover:text-[var(--color-primary-base)] transition-colors flex items-center gap-1 group">
                                        {order.customer.corporate_name}
                                        <ArrowLeft className="w-3 h-3 opacity-0 group-hover:opacity-100 rotate-135 transition-opacity" style={{ transform: 'rotate(135deg)' }} />
                                    </Link>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                     <div>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">CNPJ</p>
                                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300 font-mono">{order.customer.document}</p>
                                    </div>
                                     <div>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">Contato</p>
                                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{order.customer.phone || 'Não informado'}</p>
                                    </div>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">E-mail</p>
                                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{order.customer.email}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Summary */}
                    <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-800/80">
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Resumo Financeiro</h2>
                        <div className="space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500 dark:text-slate-400">Data de Entrada</span>
                                <span className="font-medium text-slate-900 dark:text-white">
                                    {new Date(order.created_at).toLocaleDateString('pt-BR')}
                                </span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-500 dark:text-slate-400">Subtotal dos Itens</span>
                                <span className="font-medium text-slate-900 dark:text-white">
                                    R$ {order.subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                            </div>
                            {order.discount > 0 && (
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500 dark:text-slate-400">Descontos Aplicados</span>
                                    <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                        - R$ {order.discount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                            )}
                            <div className="pt-4 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center mt-2">
                                <span className="text-base font-bold text-slate-900 dark:text-white">Total Faturado</span>
                                <span className="text-xl font-black text-[var(--color-primary-base)]">
                                    R$ {order.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Logistics */}
                    {order.tracking_code && (
                         <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl p-6 border border-emerald-100 dark:border-emerald-800/50 shadow-sm">
                            <h2 className="text-sm font-bold text-emerald-900 dark:text-emerald-400 mb-3 flex items-center gap-2 uppercase tracking-wide">
                                <Truck className="w-4 h-4" />
                                Código de Rastreio
                            </h2>
                            <p className="text-base font-mono font-bold text-emerald-800 dark:text-emerald-300">
                                {order.tracking_code}
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Interaction and Logs */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col h-[500px]">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2 shrink-0">
                        <MessageSquare className="w-5 h-5 text-[var(--color-primary-base)]" />
                        Mensagens do Pedido
                    </h2>
                    
                    <div className="flex-1 overflow-y-auto space-y-4 mb-4 bg-slate-50 dark:bg-slate-800/20 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                        {order?.interactions.length === 0 ? (
                            <p className="text-sm text-slate-500 text-center py-8">Nenhuma mensagem registrada. Inicie a conversa abaixo.</p>
                        ) : (
                            order?.interactions.map(interaction => {
                                const isCustomer = interaction.user_type === "CUSTOMER";
                                return (
                                    <div key={interaction.id} className={`flex ${isCustomer ? "justify-start" : "justify-end"}`}>
                                        <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${isCustomer ? "bg-white border text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200" : "bg-[var(--color-primary-base)] text-white"}`}>
                                            <p className="text-xs font-bold mb-1 opacity-75">{isCustomer ? "Cliente" : "Vendedor"}</p>
                                            <p className="text-sm whitespace-pre-wrap">{interaction.message}</p>
                                            <div className="flex items-center justify-end gap-1 mt-1 opacity-70">
                                                <p className="text-[10px] text-right">
                                                    {new Date(interaction.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                                                </p>
                                                {!isCustomer && (
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
                                placeholder="Digite uma mensagem para o cliente..."
                                className="flex-1 px-4 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-base)] dark:bg-slate-800 dark:text-white"
                                disabled={isSubmitting}
                            />
                            <button
                                type="submit"
                                disabled={isSubmitting || !replyMessage.trim()}
                                className="bg-[var(--color-primary-base)] text-white p-3 rounded-xl disabled:opacity-50 hover:bg-[var(--color-primary-hover)] transition-colors"
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
                
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm h-[500px] overflow-y-auto">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2 opacity-80">
                         Histórico de Status do Pedido
                    </h2>
                    
                    <div className="space-y-4 relative before:absolute before:inset-0 before:ml-2 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 dark:before:via-slate-700 before:to-transparent">
                        {order?.logs.length === 0 ? (
                            <p className="text-sm text-slate-500 ml-6 relative z-10">Nenhuma mudança de status registrada nativamente pelo sistema.</p>
                        ) : (
                            order?.logs.map(log => (
                                <div key={log.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                                    <div className="flex items-center justify-center w-5 h-5 rounded-full border-2 border-slate-300 bg-white dark:bg-slate-800 dark:border-slate-600 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 relative z-10"></div>
                                    <div className="w-[calc(100%-2rem)] md:w-[calc(50%-1.5rem)] bg-slate-50 dark:bg-slate-800/50 p-3 rounded shadow-sm border border-slate-200 dark:border-slate-700">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="font-bold text-slate-900 dark:text-white text-sm">{statusLabelMap[log.new_status] || log.new_status}</span>
                                            <time className="text-xs font-mono text-[var(--color-primary-base)]">{new Date(log.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</time>
                                        </div>
                                        <div className="text-slate-500 text-xs">O pedido mudou para <strong className="font-semibold text-slate-600 dark:text-slate-400">{statusLabelMap[log.new_status] || log.new_status}</strong>{log.old_status ? ` (anteriormente ${statusLabelMap[log.old_status] || log.old_status})` : ''}.</div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

        </div>
            
            {/* Debug Modal */}
            {isDebugModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800">
                        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
                            <h2 className="text-lg font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                                <Terminal className="w-5 h-5 text-indigo-500" />
                                Debug Integração Horus ERP
                            </h2>
                            <button onClick={() => setIsDebugModalOpen(false)} className="text-slate-500 hover:text-slate-800 dark:hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1 font-mono text-sm bg-slate-950 text-green-400">
                            {horusPreviewLoading ? (
                                <div className="flex items-center justify-center h-40">
                                    <RefreshCw className="w-8 h-8 animate-spin text-slate-500" />
                                </div>
                            ) : (
                                <pre className="whitespace-pre-wrap break-all">
                                    {JSON.stringify(horusPreviewData, null, 2)}
                                </pre>
                            )}
                        </div>
                        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end">
                            <button 
                                onClick={handleSyncHorus}
                                disabled={horusSyncing}
                                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-50"
                            >
                                {horusSyncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                Sincronizar Forçadamente
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
