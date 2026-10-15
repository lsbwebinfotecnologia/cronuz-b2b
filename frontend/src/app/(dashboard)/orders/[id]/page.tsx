"use client";

import { useEffect, useState } from "react";
import { Package, ArrowLeft, Building2, User, FileText, Download, Truck, MessageSquare, Send, Check, CheckCheck, Terminal, X, RefreshCw, AlertCircle, QrCode, Copy, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getToken, getUser } from "@/lib/auth";
import { ProductImage } from "@/components/store/ProductImage";

interface Customer {
    id: number;
    corporate_name: string;
    fantasy_name: string;
    document: string;
    email: string;
    phone: string;
    id_guid?: string;
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
    const router = useRouter();
    const [order, setOrder] = useState<OrderDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [replyMessage, setReplyMessage] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Horus Debug Modal State
    const [isDebugModalOpen, setIsDebugModalOpen] = useState(false);
    const [horusPreviewLoading, setHorusPreviewLoading] = useState(false);
    const [horusPreviewData, setHorusPreviewData] = useState<any>(null);
    const [horusSyncing, setHorusSyncing] = useState(false);
    const [isSendingToHorus, setIsSendingToHorus] = useState(false);
    const [interEnabled, setInterEnabled] = useState(false);
    const [debugTab, setDebugTab] = useState<'overview' | 'raw' | 'params'>('overview');
    const [copiedJson, setCopiedJson] = useState(false);

    const fetchSettings = async (companyId: number) => {
        try {
            const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${companyId}/settings`, { headers: { 'Authorization': `Bearer ${getToken()}` }});
            if (r.ok) {
                const d = await r.json();
                setInterEnabled(d.inter_enabled || false);
            }
        } catch(e) {}
    };

    const fetchOrder = async () => {
        try {
            const token = getToken();
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const response = await fetch(`${apiUrl}/orders/${params.id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                if ((data.origin || '').toLowerCase() === 'bookinfo' && data.external_id) {
                    router.replace(`/bookinfo/orders/${data.external_id}`);
                    return;
                }
                setOrder(data);
                if (data.company_id) {
                    fetchSettings(data.company_id);
                } else {
                    const u = getUser();
                    if(u?.company_id) fetchSettings(u.company_id);
                }
            }
        } catch (error) {
            console.error("Error fetching order detail:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (params.id) {
            fetchOrder();
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
        const loadingToast = toast.loading("Sincronizando com o Hórus ERP...");
        try {
            const token = getToken();
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const res = await fetch(`${apiUrl}/orders/${order?.id}/sync-horus`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok) {
                toast.success(data.message || "Pedido sincronizado com sucesso com o Hórus!", { id: loadingToast });
                setIsDebugModalOpen(false);
                fetchOrder(); // reload
            } else {
                toast.error("Erro ao sincronizar: " + (data.detail || "Erro desconhecido"), { id: loadingToast });
            }
        } catch (e) {
            toast.error("Falha de conexão com o servidor ao sincronizar.", { id: loadingToast });
        } finally {
            setHorusSyncing(false);
        }
    };

    const handleSendToHorus = async () => {
        if (!order) return;
        setIsSendingToHorus(true);
        try {
            const token = getToken();
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const res = await fetch(`${apiUrl}/orders/${order.id}/send-horus`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok && data.success) {
                toast.success(`Pedido enviado ao Hórus com sucesso! Código: #${data.horus_id}`);
                fetchOrder();
            } else {
                toast.error(`Falha ao enviar ao Hórus: ${data.detail || data.msg || 'Erro desconhecido'}`);
            }
        } catch (e: any) {
            toast.error("Falha de conexão ao enviar pedido ao Hórus.");
        } finally {
            setIsSendingToHorus(false);
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
                            <span 
                                onDoubleClick={handleOpenDebugModal}
                                className="cursor-pointer select-none"
                                title="Dê dois cliques para forçar consulta detalhada ao Hórus ERP"
                            >
                                Pedido Interno: #{order.id}
                            </span>
                            <button 
                                onClick={handleOpenDebugModal} 
                                className="text-slate-300 dark:text-slate-700 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" 
                                title="Consultar situação no Hórus ERP (Debug & Sincronização)"
                            >
                                <Terminal className="w-4 h-4" />
                            </button>
                        </h1>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 mt-1">
                            {order.horus_pedido_venda ? (
                                <div 
                                    onDoubleClick={handleOpenDebugModal}
                                    className="group flex items-center gap-1.5 text-slate-500 font-mono text-sm cursor-pointer select-none"
                                    title="Dê dois cliques para forçar consulta ao Hórus ERP"
                                >
                                    <span>Integração Horus: <strong className="text-slate-700 dark:text-slate-200 font-semibold">{order.horus_pedido_venda}</strong></span>
                                    <button 
                                        onClick={handleOpenDebugModal}
                                        className="opacity-70 group-hover:opacity-100 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-0.5 rounded transition-all"
                                        title="Consultar situação no Hórus ERP"
                                    >
                                        <RefreshCw className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={handleOpenDebugModal}
                                    onDoubleClick={handleOpenDebugModal}
                                    className="text-xs font-mono text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer flex items-center gap-1"
                                    title="Dê dois cliques para forçar consulta ao Hórus ERP"
                                >
                                    <span>Hórus: Não integrado</span>
                                    <RefreshCw className="w-3.5 h-3.5" />
                                </button>
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
                    <span 
                        onDoubleClick={handleOpenDebugModal}
                        className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-semibold uppercase tracking-wide cursor-pointer select-none transition-transform hover:scale-105 active:scale-95 ${statusColorMap[order.status] || "bg-slate-100 text-slate-800"}`}
                        title="Dê dois cliques para forçar consulta ao Hórus ERP"
                    >
                        {statusLabelMap[order.status] || order.status}
                    </span>

                    {!order.horus_pedido_venda && (
                        order.customer?.id_guid ? (
                            <button
                                onClick={handleSendToHorus}
                                disabled={isSendingToHorus}
                                className="bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm shadow-indigo-500/20 disabled:opacity-50 cursor-pointer"
                                title="Enviar este pedido para o ERP Hórus"
                            >
                                {isSendingToHorus ? (
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                    <Send className="w-3.5 h-3.5" />
                                )}
                                Enviar ao Hórus
                            </button>
                        ) : (
                            <span className="inline-flex items-center px-3 py-1 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700" title="Cliente exclusivo Cronuz (sem integração com Hórus ERP)">
                                Venda Interna Cronuz
                            </span>
                        )
                    )}

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
                <div 
                    onDoubleClick={handleOpenDebugModal}
                    className="mb-4 bg-red-50 dark:bg-red-900/10 rounded-2xl p-6 border border-red-200 dark:border-red-900/30 flex flex-col sm:flex-row items-center justify-between gap-4 select-none cursor-pointer"
                    title="Dê dois cliques para forçar consulta ao Hórus ERP"
                >
                    <h2 className="text-xl font-bold text-red-600 dark:text-red-400 flex items-center gap-2">
                        <AlertCircle className="w-5 h-5" />
                        Pedido Cancelado no B2B / ERP
                    </h2>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDebugModal();
                        }}
                        className="text-xs bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 font-medium px-3.5 py-1.5 rounded-xl transition-colors flex items-center gap-1.5"
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Consultar Situação no Hórus
                    </button>
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
            
            {/* Debug Modal / Consulta Hórus ERP */}
            {isDebugModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800">
                        {/* Header */}
                        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
                            <div>
                                <h2 className="text-lg font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                                    <Terminal className="w-5 h-5 text-indigo-500" />
                                    Situação do Pedido no Hórus ERP
                                </h2>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Pedido Cronuz #{order.id} {order.horus_pedido_venda ? `| ERP: #${order.horus_pedido_venda}` : ''}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleOpenDebugModal}
                                    disabled={horusPreviewLoading}
                                    className="p-2 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                    title="Recarregar consulta ao Hórus"
                                >
                                    <RefreshCw className={`w-4 h-4 ${horusPreviewLoading ? 'animate-spin text-indigo-500' : ''}`} />
                                </button>
                                <button onClick={() => setIsDebugModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-xl">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Navigation Tabs */}
                        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-800/40 px-4 pt-2 gap-2 text-xs font-semibold">
                            <button
                                onClick={() => setDebugTab('overview')}
                                className={`px-3 py-2 rounded-t-xl transition-all border-b-2 ${debugTab === 'overview' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}
                            >
                                Diagnóstico & NF
                            </button>
                            <button
                                onClick={() => setDebugTab('raw')}
                                className={`px-3 py-2 rounded-t-xl transition-all border-b-2 ${debugTab === 'raw' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}
                            >
                                Payload Bruto (JSON)
                            </button>
                            <button
                                onClick={() => setDebugTab('params')}
                                className={`px-3 py-2 rounded-t-xl transition-all border-b-2 ${debugTab === 'params' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}
                            >
                                Parâmetros Enviados
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-4 sm:p-6 overflow-y-auto flex-1">
                            {horusPreviewLoading ? (
                                <div className="flex flex-col items-center justify-center py-16 gap-3">
                                    <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
                                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Consultando API do Hórus ERP em tempo real...</p>
                                </div>
                            ) : horusPreviewData?.error ? (
                                <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm flex items-start gap-3">
                                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-bold">Erro ao consultar Hórus:</p>
                                        <p className="mt-1 font-mono text-xs">{horusPreviewData.error}</p>
                                    </div>
                                </div>
                            ) : debugTab === 'overview' ? (
                                <div className="space-y-4">
                                    {/* Divergence alert banner */}
                                    {horusPreviewData?.status_horus_raw === 'FAT' && order.status !== 'INVOICED' && (
                                        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 text-sm flex items-start gap-3">
                                            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                                            <div>
                                                <p className="font-bold">Divergência detectada!</p>
                                                <p className="text-xs mt-0.5">
                                                    No Cronuz o pedido consta como <strong>{statusLabelMap[order.status] || order.status}</strong>, mas no Hórus ERP ele já está <strong>FATURADO (FAT)</strong>{horusPreviewData?.nota_fiscal?.NRO_NOTA_FISCAL ? ` com NF ${horusPreviewData.nota_fiscal.NRO_NOTA_FISCAL}` : ''}.
                                                </p>
                                                <p className="text-xs mt-1 text-amber-800 dark:text-amber-300">
                                                    Clique em <strong>"Sincronizar e Atualizar Pedido Agora"</strong> abaixo para corrigir o status e baixar a Nota Fiscal.
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Grid de Métricas */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                                        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
                                            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Status no Hórus</p>
                                            <div className="mt-1.5 flex items-center gap-1.5">
                                                <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${
                                                    horusPreviewData?.status_horus_raw === 'FAT'
                                                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                                        : horusPreviewData?.status_horus_raw === 'CAN'
                                                        ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                                                        : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                                                }`}>
                                                    {horusPreviewData?.status_horus_raw || 'N/A'}
                                                </span>
                                                <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
                                                    {horusPreviewData?.status_horus_label || 'Sem retorno'}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
                                            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Cód. Pedido ERP</p>
                                            <p className="text-base font-bold text-slate-900 dark:text-white mt-1">
                                                {horusPreviewData?.horus_pedido_venda ? `#${horusPreviewData.horus_pedido_venda}` : 'Não vinculado'}
                                            </p>
                                        </div>

                                        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
                                            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Nota Fiscal</p>
                                            <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                                                {horusPreviewData?.nota_fiscal?.NRO_NOTA_FISCAL ? `NF ${horusPreviewData.nota_fiscal.NRO_NOTA_FISCAL}` : 'Não emitida'}
                                            </p>
                                            {horusPreviewData?.nota_fiscal?.DAT_EMISSAO_NF && (
                                                <p className="text-[10px] text-slate-400 mt-0.5">{horusPreviewData.nota_fiscal.DAT_EMISSAO_NF}</p>
                                            )}
                                        </div>

                                        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
                                            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Itens Atendidos</p>
                                            <p className="text-base font-bold text-slate-900 dark:text-white mt-1">
                                                {horusPreviewData?.order_details?.QTD_ITENS_ATENDIDOS ?? 0} <span className="text-xs font-normal text-slate-500">de {horusPreviewData?.order_details?.QTD_ITENS_TOTAL ?? 0} itens</span>
                                            </p>
                                        </div>
                                    </div>

                                    {/* Nota Fiscal Card detalhado se existir */}
                                    {horusPreviewData?.nota_fiscal && (
                                        <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-950/20">
                                            <h3 className="text-xs font-bold text-emerald-900 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                                                <FileText className="w-4 h-4" />
                                                Dados da Nota Fiscal Emitida
                                            </h3>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mt-3 text-xs">
                                                <div>
                                                    <span className="text-slate-500">Número da NF:</span>
                                                    <p className="font-bold text-slate-800 dark:text-slate-200">{horusPreviewData.nota_fiscal.NRO_NOTA_FISCAL}</p>
                                                </div>
                                                <div>
                                                    <span className="text-slate-500">Série:</span>
                                                    <p className="font-bold text-slate-800 dark:text-slate-200">{horusPreviewData.nota_fiscal.SERIE_FISCAL || '1'}</p>
                                                </div>
                                                <div>
                                                    <span className="text-slate-500">Valor Líquido:</span>
                                                    <p className="font-bold text-slate-800 dark:text-slate-200">R$ {horusPreviewData.nota_fiscal.VLR_LIQUIDO_NF || '0,00'}</p>
                                                </div>
                                                <div className="sm:col-span-2 md:col-span-3">
                                                    <span className="text-slate-500">Chave de Acesso NFe:</span>
                                                    <p className="font-mono text-[11px] text-slate-700 dark:text-slate-300 break-all select-all">{horusPreviewData.nota_fiscal.CHAVE_ACESSO_NFE || 'N/A'}</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Detalhes do Pedido Hórus */}
                                    {horusPreviewData?.order_details && (
                                        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs space-y-2">
                                            <h3 className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[11px]">Resumo do Pedido no ERP</h3>
                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                <div><span className="text-slate-500">Cliente ERP:</span> <p className="font-medium text-slate-700 dark:text-slate-300 truncate">{horusPreviewData.order_details.NOM_CLI || 'N/A'}</p></div>
                                                <div><span className="text-slate-500">CNPJ/CPF:</span> <p className="font-medium text-slate-700 dark:text-slate-300">{horusPreviewData.order_details.CNPJ || horusPreviewData.order_details.CPF || 'N/A'}</p></div>
                                                <div><span className="text-slate-500">Total Líquido:</span> <p className="font-medium text-slate-700 dark:text-slate-300">R$ {horusPreviewData.order_details.VLR_TOTAL_LIQUIDO || '0,00'}</p></div>
                                                <div><span className="text-slate-500">Data Pedido:</span> <p className="font-medium text-slate-700 dark:text-slate-300">{horusPreviewData.order_details.DAT_PEDIDO ? new Date(horusPreviewData.order_details.DAT_PEDIDO).toLocaleString('pt-BR') : 'N/A'}</p></div>
                                                <div><span className="text-slate-500">Última Atualização:</span> <p className="font-medium text-slate-700 dark:text-slate-300">{horusPreviewData.order_details.DAT_ULT_ATL ? new Date(horusPreviewData.order_details.DAT_ULT_ATL).toLocaleString('pt-BR') : 'N/A'}</p></div>
                                                <div><span className="text-slate-500">Forma Pgto:</span> <p className="font-medium text-slate-700 dark:text-slate-300">{horusPreviewData.order_details.COD_FORMA || 'N/A'}</p></div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : debugTab === 'raw' ? (
                                <div className="relative">
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(JSON.stringify(horusPreviewData, null, 2));
                                            setCopiedJson(true);
                                            setTimeout(() => setCopiedJson(false), 2000);
                                        }}
                                        className="absolute right-3 top-3 bg-slate-800 hover:bg-slate-700 text-white text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 z-10 transition-colors"
                                    >
                                        <Copy className="w-3.5 h-3.5" />
                                        {copiedJson ? 'Copiado!' : 'Copiar JSON'}
                                    </button>
                                    <pre className="p-4 rounded-xl bg-slate-950 text-emerald-400 font-mono text-xs overflow-x-auto max-h-[450px]">
                                        {JSON.stringify(horusPreviewData, null, 2)}
                                    </pre>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <p className="text-xs text-slate-500">Estes foram os parâmetros enviados para a chamada <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">Busca_PedidosVenda</code> e <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">Busca_notafiscal</code>:</p>
                                    <pre className="p-4 rounded-xl bg-slate-950 text-indigo-300 font-mono text-xs overflow-x-auto">
                                        {JSON.stringify(horusPreviewData?.params_enviados || {}, null, 2)}
                                    </pre>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex flex-col sm:flex-row justify-between items-center gap-3">
                            <p className="text-[11px] text-slate-500">
                                Dica: Dê dois cliques em "Integração Horus", no título ou no status para abrir este painel a qualquer momento.
                            </p>
                            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                                <button
                                    onClick={handleOpenDebugModal}
                                    disabled={horusPreviewLoading}
                                    className="px-3 py-2 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5"
                                >
                                    <RefreshCw className={`w-3.5 h-3.5 ${horusPreviewLoading ? 'animate-spin' : ''}`} />
                                    Consultar Novamente
                                </button>
                                <button
                                    onClick={handleSyncHorus}
                                    disabled={horusSyncing || horusPreviewLoading}
                                    className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm shadow-indigo-500/20 disabled:opacity-50"
                                >
                                    <RefreshCw className={`w-3.5 h-3.5 ${horusSyncing ? 'animate-spin' : ''}`} />
                                    Sincronizar e Atualizar Pedido Agora
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
