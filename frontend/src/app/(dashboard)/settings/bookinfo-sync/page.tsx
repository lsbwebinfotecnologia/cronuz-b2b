'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Database, Trash2, RefreshCw, Loader2, FileCode2, ExternalLink, Search, CheckCircle2 } from 'lucide-react';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';

export default function BookinfoSyncQueuePage() {
    const [user, setUser] = useState<any>(null);
    const [companies, setCompanies] = useState<any[]>([]);
    const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState<number | null>(null);

    useEffect(() => {
        const u = getUser();
        if (u) {
            if (u.type !== 'MASTER') {
                window.location.href = '/dashboard';
            }
            setUser(u);
            fetchCompanies();
        }
    }, []);

    useEffect(() => {
        if (selectedCompanyId) {
            fetchQueue();
        } else {
            setOrders([]);
        }
    }, [selectedCompanyId]);

    const fetchCompanies = async () => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies?limit=100`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (res.ok) {
                const data = await res.json();
                setCompanies(data.items || []);
            }
        } catch (error) {
            console.error("Failed to load companies", error);
        }
    };

    const fetchQueue = async () => {
        if (!selectedCompanyId) return;
        setLoading(true);
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/bookinfo/queue?company_id=${selectedCompanyId}`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            
            if (res.ok) {
                const data = await res.json();
                setOrders(data.items || []);
            } else {
                toast.error('Erro ao buscar fila de importação.');
            }
        } catch (error) {
            toast.error('Ocorreu um erro na requisição.');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (orderId: number) => {
        if (!confirm('Tem certeza que deseja excluir esse vínculo de pedido permanentemente? Isso não apaga no ERP Horus, apenas no Cronuz.')) {
            return;
        }
        setActionLoading(orderId);
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/bookinfo/queue/${orderId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (res.ok) {
                toast.success('Pedido removido da fila.');
                setOrders(orders.filter(o => o.id !== orderId));
            } else {
                toast.error('Erro ao excluir pedido.');
            }
        } catch (error) {
            toast.error('Falha de rede.');
        } finally {
            setActionLoading(null);
        }
    };

    const handleSync = async (orderId: number) => {
        setActionLoading(orderId);
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/bookinfo/queue/${orderId}/sync`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            
            const data = await res.json();
            
            if (res.ok && data.status === 'success') {
                toast.success(data.message);
                fetchQueue(); // Refresh to get invoice key
            } else if (res.ok && data.status === 'partial') {
                toast.warning(data.message);
                fetchQueue();
            } else {
                toast.info(data.message || 'Houve um problema na tentativa de sincronização.');
            }
        } catch (error) {
            toast.error('Falha de rede. O Horus pode estar indisponível.');
        } finally {
            setActionLoading(null);
        }
    };

    const handleDownloadXml = async (orderId: number) => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/orders/${orderId}`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (res.ok) {
                const orderData = await res.json();
                if (orderData.invoice_xml) {
                    const xmlData = atob(orderData.invoice_xml);
                    const blob = new Blob([xmlData], { type: 'application/xml' });
                    const url = window.URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.setAttribute('download', `NFe_${orderData.invoice_number || orderId}.xml`);
                    document.body.appendChild(link);
                    link.click();
                    link.parentNode?.removeChild(link);
                } else {
                    toast.error('XML não localizado.');
                }
            }
        } catch(e) {
            toast.error('Falha ao baixar XML');
        }
    };

    const handleViewDanfe = (invoiceKey: string) => {
        if (!invoiceKey) {
            toast.error('Chave de acesso não localizada!');
            return;
        }
        const url = `https://nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx?tipoConsulta=resumo&tipoConteudo=7PhJ%2BgAVw2g=&chNFe=${invoiceKey}`;
        window.open(url, '_blank');
    };

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'NEW': return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
            case 'PROCESSING': return 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20';
            case 'INVOICED': return 'bg-green-500/10 text-green-400 border border-green-500/20';
            case 'SENT_TO_HORUS': return 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20';
            case 'DISPATCH': return 'bg-purple-500/10 text-purple-400 border border-purple-500/20';
            default: return 'bg-slate-700 text-slate-300 border border-slate-600';
        }
    };

    const translateStatus = (status: string) => {
        switch (status) {
            case 'NEW': return 'Aguardando';
            case 'PROCESSING': return 'Processando';
            case 'INVOICED': return 'Faturado';
            case 'SENT_TO_HORUS': return 'Proc. Horus';
            case 'DISPATCH': return 'Expedição';
            default: return status;
        }
    };

    return (
        <div className="w-full h-full p-4 lg:p-8 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-white flex items-center gap-2">
                        <Database className="w-6 h-6 text-indigo-400" />
                        Acompanhamento de Importação (Bookinfo)
                    </h1>
                    <p className="text-slate-400 mt-1">Gerencie a fila de sincronização manual, baixe notas fiscais e aplique exclusões pontuais.</p>
                </div>

                <div className="w-full md:w-72">
                    <label className="text-sm font-medium text-slate-400 mb-1 block">Filtrar por Empresa Alvo</label>
                    <select
                        className="w-full bg-[#1a1b2d] border border-slate-700/50 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        value={selectedCompanyId}
                        onChange={(e) => setSelectedCompanyId(e.target.value)}
                    >
                        <option value="">Selecione a Organização</option>
                        {companies.map(c => (
                            <option key={c.id} value={c.id.toString()}>#{c.id} {c.corporate_name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {!selectedCompanyId ? (
                <div className="w-full bg-[#0B0C10] border border-slate-800/60 rounded-xl p-12 text-center">
                    <Search className="w-12 h-12 text-slate-500 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-white">Nenhuma Empresa Selecionada</h3>
                    <p className="text-slate-400">Selecione uma organização no menu acima para carregar sua fila.</p>
                </div>
            ) : (
                <div className="w-full bg-[#0B0C10] border border-slate-800/60 rounded-xl overflow-hidden shadow-2xl">
                    <div className="p-4 border-b border-slate-800/60 flex items-center justify-between bg-white/[0.02]">
                        <h2 className="text-lg font-medium text-white">Fila de Processamento</h2>
                        <span className="bg-indigo-500/20 text-indigo-300 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-indigo-500/30">
                            {orders.length} pedidos
                        </span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-slate-300 whitespace-nowrap">
                            <thead className="text-xs uppercase bg-[#1a1b2d]/50 text-slate-400 border-b border-slate-800">
                                <tr>
                                    <th className="px-5 py-4 font-medium tracking-wider">B2B Tracking</th>
                                    <th className="px-5 py-4 font-medium tracking-wider">Bookinfo / Ref</th>
                                    <th className="px-5 py-4 font-medium tracking-wider">Horus ERP</th>
                                    <th className="px-5 py-4 font-medium tracking-wider">Cliente</th>
                                    <th className="px-5 py-4 font-medium tracking-wider">Status B2B</th>
                                    <th className="px-5 py-4 font-medium tracking-wider text-right">Ações de Resolução</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60">
                                {loading ? (
                                    <tr>
                                        <td colSpan={6} className="px-5 py-12 text-center text-slate-400">
                                            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-400" />
                                            Buscando dados da fila...
                                        </td>
                                    </tr>
                                ) : orders.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-5 py-12 text-center text-slate-400">
                                            Nenhum pedido de Bookinfo pendente/faturado encontrado para esta empresa.
                                        </td>
                                    </tr>
                                ) : (
                                    orders.map(order => (
                                        <motion.tr 
                                            key={order.id} 
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className="hover:bg-slate-800/30 transition-colors"
                                        >
                                            <td className="px-5 py-4 font-medium text-slate-200">
                                                #{order.id}
                                                <div className="text-xs text-slate-500 font-normal mt-0.5">
                                                    {new Date(order.created_at).toLocaleDateString()}
                                                </div>
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="font-mono text-slate-300 bg-black/20 px-2 py-0.5 rounded text-xs truncate max-w-[150px]" title={order.external_id || 'N/A'}>
                                                    {order.external_id || <span className="text-slate-500 italic">Sem ID Bookinfo</span>}
                                                </div>
                                                {order.partner_reference && (
                                                    <div className="text-xs text-sky-400 mt-1 border border-sky-900/50 bg-sky-900/10 px-1 inline-block rounded">
                                                        Ref: {order.partner_reference}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-5 py-4">
                                                {order.horus_pedido_venda ? (
                                                    <span className="font-mono text-white bg-indigo-500/20 px-2 py-1 rounded text-xs border border-indigo-500/30">
                                                        {order.horus_pedido_venda}
                                                    </span>
                                                ) : (
                                                    <span className="text-red-400 text-xs italic">Não vinculado</span>
                                                )}
                                            </td>
                                            <td className="px-5 py-4 text-slate-300 max-w-[180px] truncate">
                                                {order.customer_name}
                                                <div className="text-xs text-slate-500 font-medium">
                                                    R$ {order.total.toFixed(2).replace('.', ',')}
                                                </div>
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="flex flex-col gap-1 items-start">
                                                    <span className={`px-2.5 py-1 rounded-md text-xs font-semibold ${getStatusStyle(order.status)}`}>
                                                        {translateStatus(order.status)}
                                                    </span>
                                                    {order.bookinfo_nfe_sent && (
                                                        <span className="text-[10px] text-green-400 flex items-center gap-1">
                                                            <CheckCircle2 className="w-3 h-3" /> API Notificada
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-5 py-4 text-right flex items-center justify-end gap-2">
                                                {order.status === 'INVOICED' && order.invoice_key ? (
                                                    <>
                                                        <button
                                                            onClick={() => handleDownloadXml(order.id)}
                                                            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors border border-slate-700/50"
                                                            title="Baixar XML Bruto"
                                                        >
                                                            <FileCode2 className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleViewDanfe(order.invoice_key)}
                                                            className="p-1.5 text-sky-400 hover:text-white hover:bg-sky-500 border border-sky-500/30 rounded-lg transition-colors flex items-center gap-1.5"
                                                            title="Consultar DANFE (SEFAZ Nacional)"
                                                        >
                                                            <ExternalLink className="w-4 h-4" />
                                                            <span className="text-xs font-medium hidden lg:inline">DANFE</span>
                                                        </button>
                                                    </>
                                                ) : (
                                                    <button
                                                        onClick={() => handleSync(order.id)}
                                                        disabled={actionLoading === order.id || !order.horus_pedido_venda}
                                                        className={`px-3 py-1.5 text-sm font-medium rounded-lg flex items-center gap-2 transition-colors border ${
                                                            actionLoading === order.id || !order.horus_pedido_venda
                                                            ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed'
                                                            : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500'
                                                        }`}
                                                        title={!order.horus_pedido_venda ? 'Vincule ao Horus via CSV primeiro!' : 'Forçar verificação de Faturamento Base Horus'}
                                                    >
                                                        {actionLoading === order.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                                        Verificar NF
                                                    </button>
                                                )}
                                                
                                                <div className="w-px h-6 bg-slate-700 mx-1"></div>

                                                <button
                                                    onClick={() => handleDelete(order.id)}
                                                    disabled={actionLoading === order.id}
                                                    className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                                    title="Excluir o pedido do banco de dados (Forçar sumiço da fila)"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </motion.tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
