'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/auth';
import { 
    FileText, QrCode, Search, RefreshCw, Clock, CheckCircle, XCircle, 
    ChevronRight, ArrowRight, TrendingUp, AlertTriangle, Copy, Check,
    MoreVertical, ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';

export default function BankSlipsPage() {
    const router = useRouter();
    const [slips, setSlips] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [copied, setCopied] = useState<number | null>(null);

    const fetchSlips = async () => {
        setLoading(true);
        try {
            const token = getToken();
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/bank-slips`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setSlips(data.items || []);
            }
        } catch (e) {
            toast.error("Erro ao puxar boletos do servidor.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSlips();
    }, []);

    const copyToClipboard = (text: string, id: number) => {
        if (!text || text.startsWith("V3_REQ")) return;
        navigator.clipboard.writeText(text);
        setCopied(id);
        toast.success("Linha digitável (Nosso Número) copiada!");
        setTimeout(() => setCopied(null), 2000);
    };

    const StatusBadge = ({ status, provider, nossoNumero }: { status: string, provider: string, nossoNumero: string }) => {
        if (nossoNumero?.startsWith("V3_REQ|") || status === 'PROCESSING') {
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                    <div className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"/> PROCESSANDO
                </span>
            );
        }
        
        switch (status) {
            case 'PAID':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50">
                        <CheckCircle className="w-3.5 h-3.5" /> PAGO
                    </span>
                );
            case 'CANCELLED':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800/50">
                        <XCircle className="w-3.5 h-3.5" /> CANCELADO
                    </span>
                );
            case 'OVERDUE':
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50">
                        <AlertTriangle className="w-3.5 h-3.5" /> ATRASADO
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 border border-sky-200 dark:border-sky-800/50">
                        <Clock className="w-3.5 h-3.5" /> EM ABERTO
                    </span>
                );
        }
    };

    const filtered = slips.filter(s => 
        (s.customer_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (s.nosso_numero || '').toLowerCase().includes(search.toLowerCase()) ||
        (s.id.toString().includes(search))
    );

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <QrCode className="w-6 h-6 text-orange-500" />
                        Gestão de Cobranças
                    </h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        Acompanhe o andamento de todos os tipos de cobranças.
                    </p>
                </div>
                
                <div className="flex gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-64">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar cliente, número..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-shadow dark:text-white"
                        />
                    </div>
                    <button 
                        onClick={fetchSlips}
                        className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-750 rounded-xl transition-colors shadow-sm"
                        title="Atualizar"
                    >
                        <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin text-orange-500' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Metrics Dashboard */}
            {slips.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
                    <div className="flex flex-col gap-1 border-r border-slate-200 dark:border-slate-800 pr-4 last:border-r-0">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            <div className="w-2 h-2 rounded-full bg-emerald-500"></div> Recebido
                        </div>
                        <span className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(slips.filter(s => s.status === 'PAID').reduce((acc, s) => acc + s.amount, 0))}
                        </span>
                    </div>

                    <div className="flex flex-col gap-1 border-r border-slate-200 dark:border-slate-800 pr-4 last:border-r-0 pl-0 md:pl-4">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            <div className="w-2 h-2 rounded-full bg-sky-500"></div> A Receber
                        </div>
                        <span className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(slips.filter(s => ['OPEN', 'PROCESSING'].includes(s.status) && new Date(s.due_date) >= new Date()).reduce((acc, s) => acc + s.amount, 0))}
                        </span>
                    </div>

                    <div className="flex flex-col gap-1 border-r border-slate-200 dark:border-slate-800 pr-4 last:border-r-0 pl-0 md:pl-4">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            <div className="w-2 h-2 rounded-full bg-orange-500"></div> Atrasado
                        </div>
                        <span className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(slips.filter(s => s.status === 'OVERDUE' || (s.status === 'OPEN' && new Date(s.due_date) < new Date())).reduce((acc, s) => acc + s.amount, 0))}
                        </span>
                    </div>

                    <div className="flex flex-col gap-1 pl-0 md:pl-4 border-r border-slate-200 dark:border-slate-800 md:border-r-0">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            <div className="w-2 h-2 rounded-full bg-red-500"></div> Cancelado
                        </div>
                        <span className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(slips.filter(s => s.status === 'CANCELLED').reduce((acc, s) => acc + s.amount, 0))}
                        </span>
                    </div>
                </div>
            )}

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-slate-50 border-b border-slate-200 dark:bg-slate-800/50 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase text-xs tracking-wider">
                            <tr>
                                <th className="px-6 py-4 font-semibold">Cód / Status</th>
                                <th className="px-6 py-4 font-semibold">Cliente</th>
                                <th className="px-6 py-4 font-semibold">Vencimento</th>
                                <th className="px-6 py-4 font-semibold text-right">Valor</th>
                                <th className="px-6 py-4 font-semibold">Nosso Número (Boleto)</th>
                                <th className="px-6 py-4 font-semibold text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                            {loading && slips.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                                            <span>Buscando registros na câmara...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                                        Nenhum boleto encontrado nesta pesquisa.
                                    </td>
                                </tr>
                            ) : (
                                filtered.map(slip => {
                                    const proc = slip.status === "PROCESSING" || (slip.nosso_numero?.startsWith("V3_REQ|") && slip.nosso_numero.split("|").length === 2);
                                    let displayNumero = slip.nosso_numero || 'Não gerado';
                                    if (displayNumero.startsWith("V3_REQ|") && displayNumero.split("|").length === 3) {
                                        displayNumero = displayNumero.split("|")[2];
                                    }
                                    
                                    return (
                                        <tr key={slip.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col items-start gap-1">
                                                    <span className="font-mono text-xs text-slate-400">#{slip.id}</span>
                                                    <StatusBadge status={slip.status} provider={slip.provider} nossoNumero={displayNumero} />
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-semibold text-slate-900 dark:text-white truncate max-w-xs" title={slip.customer_name}>
                                                    {slip.customer_name}
                                                </div>
                                                <div className="text-xs text-slate-500">
                                                    Origem: {slip.order_id ? `Pedido #${slip.order_id}` : slip.service_order_id ? `O.S #${slip.service_order_id}` : `Resumo #${slip.transaction_id}`}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 font-medium">
                                                {new Date(slip.due_date).toLocaleDateString('pt-BR')}
                                            </td>
                                            <td className="px-6 py-4 text-right font-bold text-slate-900 dark:text-white">
                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(slip.amount)}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2 max-w-xs">
                                                    <div className="font-mono text-xs truncate bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                                                        {proc ? "Na Fila (Assíncrono)..." : displayNumero}
                                                    </div>
                                                    {!proc && slip.nosso_numero && (
                                                        <button 
                                                            onClick={() => copyToClipboard(displayNumero, slip.id)}
                                                            className="p-1.5 text-slate-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10 rounded-lg transition-colors"
                                                            title="Copiar Nosso Número"
                                                        >
                                                            {copied === slip.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="relative inline-block text-left h-full">
                                                    <div 
                                                        tabIndex={0}
                                                        className="group p-2 inline-flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors focus:outline-none cursor-pointer"
                                                    >
                                                        <MoreVertical className="w-4 h-4" />
                                                        
                                                        <div className="hidden group-focus-within:block absolute right-0 top-full mt-1 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 p-1 z-50 text-left">
                                                            
                                                            {(slip.provider === "INTER" || (slip.nosso_numero && slip.nosso_numero.startsWith("V3_REQ|"))) && (
                                                                <button
                                                                    onClick={async (e) => {
                                                                        e.preventDefault();
                                                                        e.stopPropagation();
                                                                        try {
                                                                            toast.info("Consultando status no Banco Inter...");
                                                                            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/bank-slips/${slip.id}/sync-status`, {
                                                                                method: 'PATCH',
                                                                                headers: { 'Authorization': `Bearer ${getToken()}` }
                                                                            });
                                                                            if (res.ok) {
                                                                                const r = await res.json();
                                                                                if (r.situacao_inter) toast.success(`Situação atualizada: ${r.situacao_inter}`);
                                                                                else toast.success(r.message || "Boleto sincronizado!");
                                                                                fetchSlips();
                                                                            } else {
                                                                                const err = await res.json();
                                                                                toast.error(err.detail || "Erro ao sincronizar");
                                                                            }
                                                                        } catch (error) { toast.error("Falha de rede."); }
                                                                    }}
                                                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/30 rounded-lg transition-colors"
                                                                >
                                                                    <RefreshCw className="w-4 h-4" /> Sincronizar Status
                                                                </button>
                                                            )}
                                                            
                                                            {!proc && (slip.nosso_numero || slip.pdf_url) && (
                                                                <a
                                                                    href={slip.pdf_url || `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/installments/${slip.id}/bank-slip-pdf`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-lg transition-colors"
                                                                >
                                                                    <FileText className="w-4 h-4" /> Baixar PDF
                                                                </a>
                                                            )}
                                                            
                                                            <button 
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    router.push(`/financial/transactions/${slip.transaction_id}`);
                                                                }}
                                                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-lg transition-colors"
                                                            >
                                                                <ExternalLink className="w-4 h-4" /> Abrir Fatura
                                                            </button>

                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
