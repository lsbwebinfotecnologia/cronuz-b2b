'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Database, Trash2, RefreshCw, Loader2, FileCode2, ExternalLink, Search, CheckCircle2, FileUp, Download, Check, X, Terminal, AlertCircle } from 'lucide-react';
import { getToken, getUser } from '@/lib/auth';
import { toast } from 'sonner';

export default function BookinfoSyncQueuePage() {
    const [user, setUser] = useState<any>(null);
    const [companies, setCompanies] = useState<any[]>([]);
    const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState<number | null>(null);

    // Consult & Timeline Modal state
    const [consultModalOpen, setConsultModalOpen] = useState(false);
    const [consultData, setConsultData] = useState<any>(null);
    const [consultLoading, setConsultLoading] = useState(false);

    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const limit = 50;

    const [syncStatusParam, setSyncStatusParam] = useState('NOVO');
    const [manualSyncLoading, setManualSyncLoading] = useState(false);
    const [manualSyncPreviewModalOpen, setManualSyncPreviewModalOpen] = useState(false);
    const [manualSyncPreviewData, setManualSyncPreviewData] = useState<any[] | null>(null);
    const [manualSyncImporting, setManualSyncImporting] = useState(false);

    // Queue Filters
    const [searchBookinfoId, setSearchBookinfoId] = useState('');
    const [searchHorusId, setSearchHorusId] = useState('');
    const [searchStatus, setSearchStatus] = useState('');

    // Logs state
    const [showLogs, setShowLogs] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [loadingLogs, setLoadingLogs] = useState(false);

    // Debug Modal state
    const [isDebugModalOpen, setIsDebugModalOpen] = useState(false);
    const [debugOrderId, setDebugOrderId] = useState<number | null>(null);
    const [debugSearchType, setDebugSearchType] = useState<'venda' | 'origem'>('venda');
    const [horusPreviewData, setHorusPreviewData] = useState<any>(null);
    const [horusPreviewLoading, setHorusPreviewLoading] = useState(false);
    const [horusSyncing, setHorusSyncing] = useState(false);


    const [activeTab, setActiveTab] = useState<'queue' | 'import'>('queue');
    const [importing, setImporting] = useState(false);
    const [updateTarget, setUpdateTarget] = useState<'horus_id' | 'bookinfo_id'>('horus_id');
    const [previewData, setPreviewData] = useState<{
        metrics: { updated: number, not_found: number };
        results: any[];
        mappings: any[];
    } | null>(null);

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
            setPage(1);
            fetchQueue(1);
            // Reset preview data when changing company
            setPreviewData(null);
            setSearchBookinfoId('');
            setSearchHorusId('');
            setSearchStatus('');
        } else {
            setOrders([]);
            setTotalPages(1);
        }
    }, [selectedCompanyId]);

    const fetchCompanies = async () => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies?limit=100&uses_bookinfo=true`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (res.ok) {
                const data = await res.json();
                setCompanies(Array.isArray(data) ? data : (data.items || []));
            }
        } catch (error) {
            console.error("Failed to load companies", error);
        }
    };

    const fetchQueue = async (pageNum = page) => {
        if (!selectedCompanyId) return;
        setLoading(true);
        const skip = (pageNum - 1) * limit;
        try {
            const queryParams = new URLSearchParams({
                company_id: selectedCompanyId,
                skip: skip.toString(),
                limit: limit.toString()
            });
            if (searchBookinfoId) queryParams.append('bookinfo_id', searchBookinfoId);
            if (searchHorusId) queryParams.append('horus_id', searchHorusId);
            if (searchStatus) queryParams.append('status', searchStatus);

            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/bookinfo/queue?${queryParams.toString()}`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            
            if (res.ok) {
                const data = await res.json();
                setOrders(data.items || []);
                setTotalPages(Math.ceil((data.total || 0) / limit) || 1);
            } else {
                toast.error('Erro ao buscar fila de importação.');
            }
        } catch (error) {
            toast.error('Ocorreu um erro na requisição.');
        } finally {
            setLoading(false);
        }
    };

    const handleManualSync = async () => {
        if (!selectedCompanyId) return;
        setManualSyncLoading(true);
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/bookinfo/manual-sync/preview?company_id=${selectedCompanyId}&status=${syncStatusParam}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (res.ok) {
                const data = await res.json();
                setManualSyncPreviewData(data.results || []);
                setManualSyncPreviewModalOpen(true);
            } else {
                toast.error('Erro ao consultar a Bookinfo.');
            }
        } catch(e) {
            toast.error('Falha de rede.');
        } finally {
            setManualSyncLoading(false);
        }
    };

    const handleImportManualSync = async () => {
        if (!selectedCompanyId || !manualSyncPreviewData || manualSyncPreviewData.length === 0) return;
        setManualSyncImporting(true);
        try {
            // Filter out items already imported to prevent redundant inserts if the API didn't block it initially
            // Though the backend handles skip if existing_order
            const pendingOrders = manualSyncPreviewData.filter(o => !o.already_imported);
            
            if (pendingOrders.length === 0) {
                toast.info('Todos os pedidos encontrados já foram importados.');
                setManualSyncPreviewModalOpen(false);
                return;
            }

            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/bookinfo/manual-sync/import`, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${getToken()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    company_id: Number(selectedCompanyId),
                    target_status: syncStatusParam, // Save them as the status they were queried or RECEBIDO? Usually save as same status.
                    orders: pendingOrders
                })
            });
            if (res.ok) {
                const data = await res.json();
                toast.success(`Pedidos importados com sucesso!`);
                setManualSyncPreviewModalOpen(false);
                fetchQueue();
            } else {
                toast.error('Erro ao importar pedidos.');
            }
        } catch(e) {
            toast.error('Falha de rede.');
        } finally {
            setManualSyncImporting(false);
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

    const fetchLogs = async () => {
        setLoadingLogs(true);
        setShowLogs(true);
        try {
            const token = getToken();
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/bookinfo/logs?limit=50`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            setLogs(data.logs || []);
        } catch (err) {
            setLogs(["Falha ao carregar logs."]);
        } finally {
            setLoadingLogs(false);
        }
    };

    const fetchDebugPreview = async (orderId: number, searchType: 'venda' | 'origem') => {
        setHorusPreviewLoading(true);
        setHorusPreviewData(null);
        
        try {
            const token = getToken();
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/orders/${orderId}/horus-debug-preview?search_type=${searchType}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const data = await res.json();
            setHorusPreviewData(data);
        } catch (error: any) {
            console.error("Debug error:", error);
            setHorusPreviewData({ error: error.message });
        } finally {
            setHorusPreviewLoading(false);
        }
    };

    const handleOpenDebugModal = async (orderId: number) => {
        setDebugOrderId(orderId);
        setDebugSearchType('venda');
        setIsDebugModalOpen(true);
        await fetchDebugPreview(orderId, 'venda');
    };

    const handleSyncHorus = async () => {
        if (!debugOrderId) return;
        if (!confirm("Isso atualizará os itens do pedido no Cronuz com base nos dados que você está vendo agora retornados do ERP Horus. Deseja continuar?")) return;
        
        setHorusSyncing(true);
        try {
            const token = getToken();
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/orders/${debugOrderId}/sync-horus`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const data = await res.json();
            
            if (res.ok) {
                toast.success('Pedido sincronizado com Horus com sucesso!');
                setIsDebugModalOpen(false);
                fetchQueue();
            } else {
                toast.error(data.detail || 'Erro ao sincronizar');
            }
        } catch (error) {
            console.error("Sync error:", error);
            toast.error('Erro de conexão ao sincronizar.');
        } finally {
            setHorusSyncing(false);
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

    const handleConsultOrder = async (orderId: number) => {
        setConsultModalOpen(true);
        setConsultData(null);
        setConsultLoading(true);
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/bookinfo/queue/${orderId}/details`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (res.ok) {
                const data = await res.json();
                setConsultData(data);
            } else {
                toast.error('Erro ao consultar dados na API.');
                setConsultData(null);
            }
        } catch(e) {
            toast.error('Erro de rede ao consultar detalhes.');
        } finally {
            setConsultLoading(false);
        }
    };

    const handleManualComplete = async (orderId: number) => {
        setActionLoading(orderId);
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/bookinfo/queue/${orderId}/complete`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            
            const data = await res.json();
            
            if (res.ok && data.status === 'success') {
                toast.success('Pedido marcado como CONCLUÍDO!');
                fetchQueue();
            } else {
                toast.error(data.message || 'Falha ao concluir: Requer status FATURADO na retaguarda da Bookinfo.');
            }
        } catch (error) {
            toast.error('Erro de rede.');
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

    // --- CSV UPLOAD HANDLERS ---
    const handleDownloadTemplate = () => {
        const csvContent = "Numero Pedido Bookinfo,Referencia,Numero Pedido Horus\n";
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'modelo_importacao_bookinfo.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
      
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.name.endsWith('.csv')) {
            toast.error('O arquivo precisa ser um CSV.');
            return;
        }

        setImporting(true);
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const text = event.target?.result as string;
                const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l);
                if (lines.length <= 1) {
                    toast.error('O arquivo parece vazio ou inválido.');
                    setImporting(false);
                    return;
                }

                const separator = lines[0].includes(';') ? ';' : ',';
                const mappings: { bookinfo_id: string, reference: string, horus_id: string }[] = [];

                for (let i = 1; i < lines.length; i++) {
                    const cols = lines[i].split(separator).map(c => c.trim().replace(/^"|"$/g, ''));
                    if (cols.length >= 3) {
                        const b_id = cols[0];
                        const ref = cols[1];
                        const h_id = cols[2];
                        if (b_id && h_id) {
                            mappings.push({ bookinfo_id: b_id, reference: ref, horus_id: h_id });
                        }
                    } else if (cols.length === 2 && separator === ',') {
                        const b_id = cols[0];
                        const h_id = cols[1];
                        if (b_id && h_id) {
                            mappings.push({ bookinfo_id: b_id, reference: '', horus_id: h_id });
                        }
                    }
                }

                if (mappings.length === 0) {
                    toast.error('Nenhum dado válido encontrado para importar.');
                    setImporting(false);
                    return;
                }

                const authToken = getToken();
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/bookinfo/validate-horus-orders`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
                    body: JSON.stringify({ company_id: Number(selectedCompanyId), mappings, update_target: updateTarget })
                });

                if (res.ok) {
                    const result = await res.json();
                    setPreviewData({
                        metrics: { updated: result.updated, not_found: result.not_found },
                        results: result.results,
                        mappings: mappings
                    });
                    toast.info('Planilha carregada. Verifique os dados antes de confirmar.');
                } else {
                    const erroData = await res.json();
                    toast.error(erroData.detail || 'Falha ao validar planilha.');
                }
            } catch (err) {
                toast.error('Falha ao ler ou processar o arquivo.');
            } finally {
                setImporting(false);
                e.target.value = '';
            }
        };
        reader.readAsText(file);
    };

    const handleConfirmImport = async () => {
        if (!previewData || !previewData.mappings.length) return;
        setImporting(true);
        try {
            const authToken = getToken();
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/bookinfo/import-horus-orders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
                body: JSON.stringify({ company_id: Number(selectedCompanyId), mappings: previewData.mappings, update_target: updateTarget })
            });

            if (res.ok) {
                const result = await res.json();
                toast.success('Sincronização Concluída!', {
                    description: `Atualizados com sucesso: ${result.updated}\nNão encontrados no B2B: ${result.not_found}`,
                    duration: 10000
                });
                setPreviewData(null);
                fetchQueue(); // refresh queue automatically
                setActiveTab('queue'); // go back to queue after finish
            } else {
                const erroData = await res.json();
                toast.error(erroData.detail || 'Falha ao sincronizar planilha.');
            }
        } catch (err) {
            toast.error('Falha na requisição final.');
        } finally {
            setImporting(false);
        }
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
        <>
        <div className="w-full h-full p-4 lg:p-8 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-white flex items-center gap-2">
                        <Database className="w-6 h-6 text-indigo-400" />
                        Hub de Sincronismo (Bookinfo)
                    </h1>
                    <p className="text-slate-400 mt-1">Gerencie a fila de faturamento e importe vínculos ausentes por planilha.</p>
                </div>
                <button
                    onClick={fetchLogs}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-200 border border-slate-700/50 rounded-lg text-sm font-semibold hover:bg-slate-700 transition shadow-sm mt-4 md:mt-0"
                >
                    <Search className="w-4 h-4" />
                    Ver Logs (Background)
                </button>
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex flex-col sm:flex-row gap-4 w-full">
                    <div className="w-full md:w-72">
                        <label className="text-sm font-medium text-slate-400 mb-1 block">Empresa Alvo</label>
                        <select
                            className="w-full bg-[#1a1b2d] border border-slate-700/50 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            value={selectedCompanyId}
                            onChange={(e) => setSelectedCompanyId(e.target.value)}
                        >
                            <option value="">Selecione a Organização</option>
                            {companies.map(c => (
                                <option key={c.id} value={c.id.toString()}>#{c.id} {c.name}</option>
                            ))}
                        </select>
                    </div>

                    {selectedCompanyId && activeTab === 'queue' && (
                        <div>
                            <label className="text-sm font-medium text-slate-400 mb-1 block">Consultar Bookinfo</label>
                            <div className="flex bg-[#1a1b2d] border border-slate-700/50 rounded-lg p-1">
                                <select 
                                    value={syncStatusParam}
                                    onChange={(e) => setSyncStatusParam(e.target.value)}
                                    className="bg-transparent text-sm text-white px-3 py-1.5 focus:outline-none focus:ring-0 mr-2 border-r border-slate-800"
                                >
                                    <option value="NOVO">NOVO</option>
                                    <option value="AGUARDANDO">AGUARDANDO</option>
                                    <option value="PROCESSADO">PROCESSADO</option>
                                    <option value="FATURADO">FATURADO</option>
                                </select>
                                <button 
                                    onClick={handleManualSync}
                                    disabled={manualSyncLoading}
                                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-md text-sm font-medium transition flex items-center gap-2 disabled:opacity-50"
                                >
                                    {manualSyncLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                    Consultar
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {!selectedCompanyId ? (
                <div className="w-full bg-[#0B0C10] border border-slate-800/60 rounded-xl p-12 text-center">
                    <Search className="w-12 h-12 text-slate-500 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-white">Nenhuma Empresa Selecionada</h3>
                    <p className="text-slate-400">Selecione uma organização no menu acima para carregar as ferramentas.</p>
                </div>
            ) : (
                <div className="w-full bg-[#0B0C10] border border-slate-800/60 rounded-xl overflow-hidden shadow-2xl">
                    
                    {/* TABS */}
                    <div className="flex items-center border-b border-slate-800/60 bg-white/[0.02] px-2 pt-2">
                        <button 
                            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'queue' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-300'}`}
                            onClick={() => setActiveTab('queue')}
                        >
                            Fila de Processamento
                        </button>
                        <button 
                            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'import' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-300'}`}
                            onClick={() => setActiveTab('import')}
                        >
                            Importar Lote (CSV)
                            {previewData && <span className="w-2 h-2 rounded-full bg-emerald-500"></span>}
                        </button>
                    </div>

                    {activeTab === 'queue' && (
                        <div className="overflow-x-auto">
                            {/* QUEUE FILTERS */}
                            <div className="bg-[#1a1b2d]/50 p-4 border-b border-slate-800/60 flex flex-wrap gap-4 items-end">
                                <div className="w-full sm:w-48">
                                    <label className="text-xs text-slate-400 mb-1 block">Filtro ID Bookinfo</label>
                                    <input 
                                        type="text" 
                                        placeholder="Ex: UUID..."
                                        value={searchBookinfoId}
                                        onChange={(e) => setSearchBookinfoId(e.target.value)}
                                        className="w-full bg-[#0a0b10] border border-slate-700/50 rounded flex-1 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-indigo-500 transition-colors"
                                    />
                                </div>
                                <div className="w-full sm:w-48">
                                    <label className="text-xs text-slate-400 mb-1 block">Filtro Pedido Horus</label>
                                    <input 
                                        type="text" 
                                        placeholder="Ex: 345417"
                                        value={searchHorusId}
                                        onChange={(e) => setSearchHorusId(e.target.value)}
                                        className="w-full bg-[#0a0b10] border border-slate-700/50 rounded flex-1 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-indigo-500 transition-colors"
                                    />
                                </div>
                                <div className="w-full sm:w-48">
                                    <label className="text-xs text-slate-400 mb-1 block">Status B2B</label>
                                    <select
                                        value={searchStatus}
                                        onChange={(e) => setSearchStatus(e.target.value)}
                                        className="w-full bg-[#0a0b10] border border-slate-700/50 rounded flex-1 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-indigo-500 transition-colors"
                                    >
                                        <option value="">Todos Pendentes</option>
                                        <option value="AGUARDANDO">Aguardando</option>
                                        <option value="PROCESSADO">Processado</option>
                                        <option value="FATURADO">Faturado</option>
                                        <option value="RECEBIDO">Recebido</option>
                                    </select>
                                </div>
                                <button 
                                    onClick={() => fetchQueue(1)}
                                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-1.5 rounded text-sm transition-colors flex items-center gap-2 border border-slate-700"
                                >
                                    <Search className="w-4 h-4" /> Buscar
                                </button>
                            </div>

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
                                                Nenhum pedido de Bookinfo foi identificado na base do Cronuz para esta empresa.
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
                                                    {order.status === 'INVOICED' && order.invoice_key && (
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
                                                    )}
                                                    
                                                    {order.status !== 'CONCLUIDO' && (
                                                        <>
                                                            <button
                                                                onClick={() => handleSync(order.id)}
                                                                disabled={actionLoading === order.id || !order.horus_pedido_venda}
                                                                className={`px-3 py-1.5 text-[11px] font-medium rounded-lg flex items-center justify-center gap-1.5 transition-colors border ${
                                                                    actionLoading === order.id || !order.horus_pedido_venda
                                                                    ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed'
                                                                    : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500'
                                                                }`}
                                                                title={!order.horus_pedido_venda ? 'Vincule ao Horus via CSV primeiro!' : 'Enviar a NFe baseada no Horus (Faturar na Bookinfo)'}
                                                            >
                                                                {actionLoading === order.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                                                Enviar XML
                                                            </button>

                                                            <button
                                                                onClick={() => handleManualComplete(order.id)}
                                                                disabled={actionLoading === order.id}
                                                                className="px-3 py-1.5 text-[11px] font-medium rounded-lg flex items-center justify-center gap-1.5 transition-colors border border-emerald-500/50 bg-emerald-500/10 hover:bg-emerald-500 hover:text-white text-emerald-400"
                                                                title="Valida se está FATURADO na Bookinfo e conclui o pedido."
                                                            >
                                                                <CheckCircle2 className="w-3 h-3" />
                                                                Concluir
                                                            </button>
                                                        </>
                                                    )}
                                                    <button
                                                        onClick={() => handleConsultOrder(order.id)}
                                                        className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors border border-transparent hover:border-indigo-500/30"
                                                        title="Ver API Bookinfo (Modal de Inspeção & Histórico)"
                                                    >
                                                        <Search className="w-4 h-4" />
                                                    </button>
                                                    
                                                    {user?.type === 'MASTER' && order.horus_pedido_venda && (
                                                        <button
                                                            onClick={() => handleOpenDebugModal(order.id)}
                                                            className="p-1.5 text-slate-400 hover:text-purple-400 hover:bg-purple-500/10 rounded-lg transition-colors border border-transparent hover:border-purple-500/30"
                                                            title="Sincronizar com ERP (Debug) - MASTER ONLY"
                                                        >
                                                            <Terminal className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    
                                                    <div className="w-px h-6 bg-slate-700 mx-1"></div>

                                                    <button
                                                        onClick={() => handleDelete(order.id)}
                                                        disabled={actionLoading === order.id || (!!order.horus_pedido_venda && !!order.external_id)}
                                                        className={`p-1.5 rounded-lg transition-colors ${
                                                            (!!order.horus_pedido_venda && !!order.external_id)
                                                            ? 'text-slate-600 bg-transparent cursor-not-allowed'
                                                            : 'text-slate-500 hover:text-red-400 hover:bg-red-500/10'
                                                        }`}
                                                        title={(!!order.horus_pedido_venda && !!order.external_id) ? "Não é possível excluir um pedido que já possui vínculo com Horus e Bookinfo." : "Excluir o pedido do banco de dados (Forçar sumiço da fila)"}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </motion.tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                            
                            {/* Pagination */}
                            {totalPages > 1 && (
                                <div className="flex items-center justify-between px-5 py-4 border-t border-slate-800 bg-[#1a1b2d]/50">
                                    <span className="text-sm text-slate-400">Página {page} de {totalPages}</span>
                                    <div className="flex items-center gap-2">
                                        <button 
                                            disabled={page === 1 || loading}
                                            onClick={() => { setPage(p => p - 1); fetchQueue(page - 1); }}
                                            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Anterior
                                        </button>
                                        <button 
                                            disabled={page === totalPages || loading}
                                            onClick={() => { setPage(p => p + 1); fetchQueue(page + 1); }}
                                            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Próxima
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'import' && (
                        <div className="p-6">
                            <div className="max-w-2xl">
                                <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-2">
                                    Migrador de Vínculos (Legado)
                                </h3>
                                <p className="text-sm text-slate-400 mb-6 leading-relaxed">
                                    Utilize esta ferramenta para importar uma planilha relacionando o "ID Reserva da Bookinfo" com o seu equivalente gerado no "Horus ERP". Isso serve para não deixar órfãos os pedidos importados no Cronuz antes do vínculo automático.
                                </p>

                                <div className="mb-6 p-4 rounded-xl border border-slate-700/50 bg-[#1a1b2d]/50">
                                    <h4 className="text-sm font-medium text-slate-300 mb-3 block">Direção da Atualização:</h4>
                                    <div className="flex flex-col sm:flex-row gap-4">
                                        <label className="flex items-center gap-2 cursor-pointer group">
                                            <input 
                                                type="radio" 
                                                name="updateTarget" 
                                                value="horus_id"
                                                checked={updateTarget === 'horus_id'}
                                                onChange={() => setUpdateTarget('horus_id')}
                                                className="w-4 h-4 text-indigo-600 bg-slate-800 border-slate-600 focus:ring-indigo-600 focus:ring-2"
                                            />
                                            <span className="text-sm text-slate-300 group-hover:text-white transition-colors">
                                                Encontrar por Bookinfo ID <br/><span className="text-xs text-slate-500">➜ Atualizar Pedido Horus</span>
                                            </span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer group">
                                            <input 
                                                type="radio" 
                                                name="updateTarget" 
                                                value="bookinfo_id"
                                                checked={updateTarget === 'bookinfo_id'}
                                                onChange={() => setUpdateTarget('bookinfo_id')}
                                                className="w-4 h-4 text-indigo-600 bg-slate-800 border-slate-600 focus:ring-indigo-600 focus:ring-2"
                                            />
                                            <span className="text-sm text-slate-300 group-hover:text-white transition-colors">
                                                Encontrar por Pedido Horus <br/><span className="text-xs text-slate-500">➜ Atualizar Bookinfo ID</span>
                                            </span>
                                        </label>
                                    </div>
                                </div>

                                <div className="flex flex-col sm:flex-row gap-4 items-center">
                                    <button 
                                        onClick={handleDownloadTemplate}
                                        type="button"
                                        className="w-full sm:w-auto px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition flex items-center justify-center gap-2"
                                    >
                                        <Download className="w-4 h-4" /> Baixar Modelo
                                    </button>

                                    <div className="relative w-full sm:w-auto">
                                        <button 
                                        disabled={importing}
                                        type="button"
                                        className="w-full sm:w-auto px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-500 shadow-lg shadow-indigo-600/20 transition flex items-center justify-center gap-2 disabled:opacity-50"
                                        >
                                            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
                                            {importing ? 'Lendo CSV...' : 'Fazer Upload CSV'}
                                        </button>
                                        <input 
                                        disabled={importing}
                                        title="Enviar arquivo CSV"
                                        type="file" 
                                        accept=".csv"
                                        onChange={handleFileUpload}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed" 
                                        />
                                    </div>
                                </div>
                            </div>

                            {previewData && (
                                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-8 border-t border-slate-800/60 pt-8">
                                    <div className="bg-[#1a1b2d]/50 border border-slate-700/50 rounded-xl overflow-hidden shadow-sm">
                                        <div className="p-4 bg-slate-900/50 border-b border-slate-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                            <div>
                                                <h4 className="font-semibold text-white">Pré-visualização da Importação</h4>
                                                <p className="text-xs text-slate-400 mt-1">
                                                <strong className="text-emerald-400">{previewData.metrics.updated}</strong> encontrados e prontos • <strong className="text-rose-400">{previewData.metrics.not_found}</strong> não localizados no Cronuz B2B.
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <button
                                                type="button"
                                                onClick={() => setPreviewData(null)}
                                                className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition"
                                                >
                                                    Descartar
                                                </button>
                                                <button
                                                type="button"
                                                disabled={importing}
                                                onClick={handleConfirmImport}
                                                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 shadow-md shadow-emerald-500/20"
                                                >
                                                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                                Salvar Sincronização
                                                </button>
                                            </div>
                                        </div>
                                        
                                        <div className="max-h-[400px] overflow-y-auto">
                                            <table className="w-full text-left border-collapse">
                                                <thead className="bg-[#1a1b2d] sticky top-0 z-10 backdrop-blur-md">
                                                <tr>
                                                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 border-b border-slate-800">Status</th>
                                                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 border-b border-slate-800">
                                                        {updateTarget === 'horus_id' ? 'ID Bookinfo (Filtro)' : 'ID Bookinfo'}
                                                    </th>
                                                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 border-b border-slate-800">
                                                        {updateTarget === 'bookinfo_id' ? 'Pedido ERP (Filtro)' : 'Pedido ERP'}
                                                    </th>
                                                    <th className="px-4 py-3 text-xs font-semibold text-slate-400 border-b border-slate-800 hidden md:table-cell">Referência</th>
                                                </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-800/60">
                                                {previewData.results.map((row: any, idx: number) => (
                                                    <tr key={idx} className={!row.found ? 'bg-rose-900/10' : 'hover:bg-slate-800/30'}>
                                                    <td className="px-4 py-2.5">
                                                        {row.found ? (
                                                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-400">
                                                            <Check className="w-3 h-3" /> Encontrado
                                                        </span>
                                                        ) : (
                                                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-rose-500/10 text-rose-400">
                                                            <X className="w-3 h-3" /> Não há no B2B
                                                        </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-sm font-medium text-slate-300">
                                                        {row.bookinfo_id}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-sm text-slate-400">
                                                        <span className="font-mono bg-black/20 px-1.5 py-0.5 rounded text-xs">{row.horus_id}</span>
                                                    </td>
                                                    <td className="px-4 py-2.5 text-sm text-slate-500 hidden md:table-cell truncate max-w-[150px]">
                                                        {row.reference || '-'}
                                                    </td>
                                                    </tr>
                                                ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
            {consultModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-[#1a1b2d] border border-slate-700 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
                    >
                        <div className="p-4 border-b border-slate-700 flex items-center justify-between bg-slate-800/40">
                            <h3 className="text-lg font-bold text-slate-200">Inspeção Bookinfo & Histórico</h3>
                            <button onClick={() => setConsultModalOpen(false)} className="text-slate-400 hover:text-white p-1">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 flex flex-col md:flex-row gap-6">
                            {consultLoading ? (
                                <div className="flex-1 flex flex-col items-center justify-center py-20 text-slate-400">
                                    <Loader2 className="w-10 h-10 animate-spin mb-4 text-indigo-500" />
                                    Buscando dados na Bookinfo...
                                </div>
                            ) : consultData ? (
                                <>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                            <Database className="w-4 h-4 text-emerald-400" />
                                            Resposta da API (Live)
                                        </h4>
                                        <div className="bg-slate-900 rounded-lg border border-slate-700/60 p-4">
                                            {consultData.bookinfo_api ? (
                                                <pre className="text-xs font-mono text-emerald-400/90 whitespace-pre-wrap break-words">
                                                    {JSON.stringify(consultData.bookinfo_api, null, 2)}
                                                </pre>
                                            ) : (
                                                <div className="text-xs text-rose-400 py-4">Erro ao consultar a Bookinfo.</div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="w-full md:w-1/3 min-w-[280px]">
                                        <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                            <RefreshCw className="w-4 h-4 text-indigo-400" />
                                            Timeline (Cronuz)
                                        </h4>
                                        <div className="space-y-4">
                                            {consultData.timeline?.map((log: any, idx: number) => (
                                                <div key={idx} className="relative pl-6 pb-4 border-l-2 border-indigo-500/30 last:border-transparent last:pb-0">
                                                    <div className="absolute -left-[5px] top-0 w-2 h-2 rounded-full bg-indigo-500 ring-4 ring-[#1a1b2d]"></div>
                                                    <div className="text-xs text-slate-500 mb-1">
                                                        {log.created_at ? new Date(log.created_at).toLocaleString() : 'Data Desconhecida'}
                                                    </div>
                                                    <div className="bg-slate-800/50 p-2.5 rounded text-sm text-slate-300 border border-slate-700/50">
                                                        {log.old_status && <div className="text-xs text-slate-400 line-through">{log.old_status}</div>}
                                                        <div className="text-xs text-indigo-300 font-bold uppercase tracking-wider">
                                                            {log.new_status}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                            {(!consultData.timeline || consultData.timeline.length === 0) && (
                                                <div className="text-sm text-slate-500 italic">Nenhum log encontrado.</div>
                                            )}
                                        </div>
                                    </div>
                                </>
                            ) : null}
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Logs Modal */}
            {showLogs && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-[#0B0C10]/80 backdrop-blur-sm p-4 animate-in fade-in duration-200 cursor-auto">
                    <div className="bg-[#1a1b2d] rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[85vh] border border-slate-700/50">
                        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <Search className="w-5 h-5 text-indigo-400" />
                                Logs da Integração (Scheduler)
                            </h2>
                            <button 
                                onClick={() => setShowLogs(false)}
                                className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400"
                                type="button"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="p-6 flex-1 overflow-auto bg-[#0a0b10] font-mono text-sm border-y border-slate-800">
                            {loadingLogs ? (
                                <div className="flex items-center justify-center h-40 text-slate-400">
                                    <Loader2 className="w-6 h-6 animate-spin mr-2" />
                                    Carregando...
                                </div>
                            ) : logs.length === 0 ? (
                                <div className="text-slate-500 text-center py-10">Nenhum log encontrado.</div>
                            ) : (
                                <div className="flex flex-col gap-1 text-slate-300">
                                    {logs.map((log, i) => (
                                        <div key={i} className="whitespace-pre-wrap break-all">
                                            {log.includes('ERROR') ? (
                                                <span className="text-rose-400">{log}</span>
                                            ) : log.includes('INFO') ? (
                                                <span className="text-emerald-400">{log}</span>
                                            ) : (
                                                log
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="p-4 bg-slate-900/50 flex justify-end gap-3 rounded-b-2xl">
                            <button
                                onClick={fetchLogs}
                                className="px-6 py-2.5 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-xl text-sm font-semibold hover:bg-indigo-600/30 transition-colors"
                                type="button"
                            >
                                Atualizar
                            </button>
                            <button
                                onClick={() => setShowLogs(false)}
                                className="px-6 py-2.5 bg-slate-800 text-slate-300 rounded-xl text-sm font-semibold hover:bg-slate-700 transition-colors"
                                type="button"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Horus Debug Modal */}
            {isDebugModalOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-[#0B0C10]/80 backdrop-blur-sm">
                    <div className="bg-[#1a1b2d] rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-700/50">
                        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                            <div>
                                <h2 className="text-xl font-bold flex items-center gap-2 text-white">
                                    <Terminal className="w-6 h-6 text-purple-400" />
                                    Debug de Sincronização Horus
                                </h2>
                                <p className="text-sm text-slate-400 mt-1">
                                    Visualização dos dados retornados pela API do Horus antes de aplicar localmente.
                                </p>
                                <div className="mt-4 flex gap-2">
                                    <button
                                        onClick={() => {
                                            setDebugSearchType('venda');
                                            if (debugOrderId) fetchDebugPreview(debugOrderId, 'venda');
                                        }}
                                        className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                                            debugSearchType === 'venda' 
                                                ? 'bg-purple-600 text-white' 
                                                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                        }`}
                                    >
                                        Consulta por ERP (COD_PED_VENDA)
                                    </button>
                                    <button
                                        onClick={() => {
                                            setDebugSearchType('origem');
                                            if (debugOrderId) fetchDebugPreview(debugOrderId, 'origem');
                                        }}
                                        className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                                            debugSearchType === 'origem' 
                                                ? 'bg-purple-600 text-white' 
                                                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                                        }`}
                                    >
                                        Consulta pela Origem (COD_PED_ORIGEM)
                                    </button>
                                </div>
                            </div>
                            <button onClick={() => setIsDebugModalOpen(false)} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 self-start">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-6 bg-[#0a0b10] border-y border-slate-800">
                            {horusPreviewLoading ? (
                                <div className="flex flex-col items-center justify-center h-64 space-y-4">
                                    <RefreshCw className="w-8 h-8 animate-spin text-purple-400" />
                                    <p className="text-slate-400 font-medium">Consultando API do Horus em tempo real...</p>
                                </div>
                            ) : horusPreviewData?.error ? (
                                <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-6 flex items-start gap-4">
                                    <AlertCircle className="w-6 h-6 text-rose-400 shrink-0" />
                                    <div>
                                        <h3 className="font-bold text-rose-400 mb-1">Erro na Consulta</h3>
                                        <p className="text-rose-300 text-sm whitespace-pre-wrap">{horusPreviewData.error}</p>
                                    </div>
                                </div>
                            ) : horusPreviewData ? (
                                <div className="space-y-6">
                                    {horusPreviewData.params_enviados && (
                                        <div>
                                            <h3 className="font-bold text-white mb-3 text-sm flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                                                Parâmetros Enviados
                                            </h3>
                                            <pre className="bg-[#11121d] text-yellow-400 p-4 rounded-xl overflow-x-auto text-xs font-mono border border-slate-800/80">
                                                {JSON.stringify(horusPreviewData.params_enviados, null, 2)}
                                            </pre>
                                        </div>
                                    )}
                                    <div>
                                        <h3 className="font-bold text-white mb-3 text-sm flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                            Payload do Pedido (Busca_PedidosVenda)
                                        </h3>
                                        <pre className="bg-[#11121d] text-emerald-400 p-4 rounded-xl overflow-x-auto text-xs font-mono border border-slate-800/80">
                                            {JSON.stringify(horusPreviewData.order_details, null, 2)}
                                        </pre>
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-white mb-3 text-sm flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                            Payload dos Itens (Busca_ItensPedidosVenda)
                                        </h3>
                                        <pre className="bg-[#11121d] text-blue-400 p-4 rounded-xl overflow-x-auto text-xs font-mono border border-slate-800/80">
                                            {JSON.stringify(horusPreviewData.order_items, null, 2)}
                                        </pre>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                        
                        <div className="p-6 bg-slate-900/50 flex justify-end gap-3 rounded-b-2xl">
                            <button
                                onClick={() => setIsDebugModalOpen(false)}
                                className="px-6 py-2.5 rounded-xl text-sm font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSyncHorus}
                                disabled={horusPreviewLoading || !!horusPreviewData?.error || horusSyncing}
                                className="px-6 py-2.5 rounded-xl text-sm font-bold bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 border border-purple-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {horusSyncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                Aplicar Sincronização
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Manual Sync Preview Modal */}
            {manualSyncPreviewModalOpen && manualSyncPreviewData && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-[#1a1b2d] rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-slate-700/50"
                    >
                        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-[#11121d]">
                            <div>
                                <h2 className="text-xl font-bold flex items-center gap-2 text-white">
                                    <Database className="w-6 h-6 text-indigo-400" />
                                    Preview de Importação Bookinfo
                                </h2>
                                <p className="text-sm text-slate-400 mt-1">
                                    Foram encontrados {manualSyncPreviewData.length} pedidos em status {syncStatusParam}.
                                </p>
                            </div>
                            <button onClick={() => setManualSyncPreviewModalOpen(false)} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-[#0a0b10]">
                            {manualSyncPreviewData.length === 0 ? (
                                <div className="text-center text-slate-400 py-10 italic">
                                    Nenhum pedido encontrado na consulta para {syncStatusParam}.
                                </div>
                            ) : (
                                <div className="rounded-xl border border-slate-700/50 overflow-hidden bg-[#1a1b2d]">
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full text-left text-sm text-slate-300 whitespace-nowrap">
                                            <thead className="text-xs uppercase bg-[#11121d]/80 text-slate-400 border-b border-slate-800">
                                                <tr>
                                                    <th className="px-4 py-3 font-medium">B2B Tracking</th>
                                                    <th className="px-4 py-3 font-medium">Cliente Bookinfo</th>
                                                    <th className="px-4 py-3 font-medium text-center">Status Vínculo</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-800/60">
                                                {manualSyncPreviewData.map((order, idx) => (
                                                    <tr key={idx} className={order.already_imported ? 'opacity-50 bg-[#11121d]' : 'hover:bg-slate-800/30'}>
                                                        <td className="px-4 py-3 font-mono text-xs">
                                                            {order.id}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="font-medium text-slate-200 truncate max-w-[200px]" title={order.customer_name}>
                                                                {order.customer_name}
                                                            </div>
                                                            <div className="text-[11px] text-slate-500">
                                                                CNPJ: {order.customer_cnpj} {order.customer_found_locally ? <span className="text-emerald-400">(Registrado B2B)</span> : <span className="text-rose-400">(Sem Cadastro B2B)</span>}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            {order.already_imported ? (
                                                                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold bg-amber-500/10 text-amber-500">
                                                                    <Check className="w-3 h-3" /> Já Importado
                                                                </span>
                                                            ) : !order.customer_found_locally ? (
                                                                 <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold bg-blue-500/10 text-blue-400" title="Cliente será cadastrado automaticamente com CNPJ!">
                                                                    <AlertCircle className="w-3 h-3" /> Auto-Cadastrar
                                                                 </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400">
                                                                    Na Fila p/ Importar
                                                                </span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        <div className="p-6 bg-[#11121d] flex justify-between items-center border-t border-slate-800">
                            <span className="text-sm text-slate-400">
                                Serão importados: <span className="text-white font-bold">{manualSyncPreviewData.filter(o => !o.already_imported).length}</span> pedidos.
                            </span>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setManualSyncPreviewModalOpen(false)}
                                    className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleImportManualSync}
                                    disabled={manualSyncImporting || manualSyncPreviewData.filter(o => !o.already_imported).length === 0}
                                    className="px-6 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-indigo-900/20"
                                >
                                    {manualSyncImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                    Importar para Cronuz
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </>
    );
}
