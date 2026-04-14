'use client';

import { useState, useEffect } from 'react';
import { FileText, Plus, Search, DollarSign, ExternalLink, Calendar, Receipt, X, CheckCircle, RefreshCw, Code, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { getToken } from '@/lib/auth';
import Link from 'next/link';

export default function ServiceOrdersPage() {
    const [orders, setOrders] = useState<any[]>([]);
    const [customers, setCustomers] = useState<any[]>([]);
    const [services, setServices] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [accounts, setAccounts] = useState<any[]>([]);
    
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = String(currentDate.getMonth() + 1).padStart(2, '0');
    const [monthFilter, setMonthFilter] = useState<string>(new Date().toISOString().slice(0, 7)); // YYYY-MM
    const [statusFilter, setStatusFilter] = useState<string>('Ativas'); // Changed to only show Ativas by default
    const [totalExpected, setTotalExpected] = useState(0);
    const [totalCompleted, setTotalCompleted] = useState(0);
    const [totalCancelled, setTotalCancelled] = useState(0);
    
    // Create new Order Modal
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [newOrder, setNewOrder] = useState({
        customer_id: '',
        service_id: '',
        negotiated_value: '',
        custom_description: '',
        execution_date: new Date().toISOString().split('T')[0],
        is_recurrent: false,
        recurrence_end_date: ''
    });
    
    // Billing Modal
    const [isBillOpen, setIsBillOpen] = useState(false);
    const [billData, setBillData] = useState<{
        order_id: number;
        order_ids?: number[];
        bulk_sum?: number;
        installments_count: string;
        first_due_date: string;
        account_id: string;
        print_point_id: string;
    }>({
        order_id: 0,
        installments_count: '1',
        first_due_date: new Date().toISOString().split('T')[0],
        account_id: '',
        print_point_id: ''
    });
    
    // Print Points Modal
    // Print Points Modal
    const [isPrintPointModalOpen, setIsPrintPointModalOpen] = useState(false);
    const [selectedOrderIdForNF, setSelectedOrderIdForNF] = useState<number | null>(null);
    const [printPoints, setPrintPoints] = useState<any[]>([]);

    // Cancel NFSe Modal
    const [isCancelNfseOpen, setIsCancelNfseOpen] = useState(false);
    const [cancelNfseData, setCancelNfseData] = useState({
        order_id: null as number | null,
        motivo: ''
    });
    const [isConsultModalOpen, setIsConsultModalOpen] = useState(false);
    const [consultData, setConsultData] = useState<any>(null);
    const [consultingOrderId, setConsultingOrderId] = useState<number | null>(null);

    const [selectedPrintPointId, setSelectedPrintPointId] = useState<number | ''>('');
    const [sefazLog, setSefazLog] = useState<{status: number|null, body: string, xml: string} | null>(null);

    useEffect(() => {
        fetchOrders();
    }, [page, monthFilter]);

    useEffect(() => {
        fetchAuxData();
    }, []);

    const fetchOrders = async () => {
        setLoading(true);
        try {
            let url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/service-orders?skip=${(page-1)*50}&limit=50&search=${search}`;
            if (monthFilter) {
                const year = parseInt(monthFilter.split('-')[0]);
                const month = parseInt(monthFilter.split('-')[1]);
                const start_date = `${year}-${String(month).padStart(2, '0')}-01`;
                const end_date = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`;
                url += `&start_date=${start_date}&end_date=${end_date}`;
            }
            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (res.ok) {
                const data = await res.json();
                setOrders(data.items);
                setTotal(data.total);
                setTotalExpected(data.total_expected || 0);
                setTotalCompleted(data.total_completed || 0);
                setTotalCancelled(data.total_cancelled || 0);
            }
        } catch (e) {
            toast.error("Erro ao carregar O.S.");
        } finally {
            setLoading(false);
        }
    };

    const [errorModalInfo, setErrorModalInfo] = useState<string | null>(null);

    const fetchAuxData = async () => {
        try {
            const resCust = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/customers`, { headers: { 'Authorization': `Bearer ${getToken()}` }});
            if (resCust.ok) setCustomers(await resCust.json());
            
            const resSvc = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/services`, { headers: { 'Authorization': `Bearer ${getToken()}` }});
            if (resSvc.ok) setServices((await resSvc.json()).items);
            
            const resAcc = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/accounts`, { headers: { 'Authorization': `Bearer ${getToken()}` }});
            if (resAcc.ok) setAccounts(await resAcc.json());

            const resPoints = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/print-points`, { headers: { 'Authorization': `Bearer ${getToken()}` }});
            if (resPoints.ok) {
                const points = await resPoints.json();
                setPrintPoints(points.filter((p: any) => p.is_active && p.is_electronic));
            }
        } catch (e) {}
    };

    const handleCreateOrder = async (e: React.FormEvent) => {
        e.preventDefault();
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
                setIsCreateOpen(false);
                setNewOrder({ customer_id: '', service_id: '', negotiated_value: '', custom_description: '', execution_date: new Date().toISOString().split('T')[0], is_recurrent: false, recurrence_end_date: '' });
                fetchOrders();
            } else {
                toast.error('Erro ao criar O.S.');
            }
        } catch (e) { toast.error('Servidor offline'); }
    };

    const handleStatusChange = async (orderId: number, status: string) => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/service-orders/${orderId}/status?status=${status}`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (res.ok) {
                toast.success('Status atualizado');
                fetchOrders();
            }
        } catch (e) {}
    };

    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [detailData, setDetailData] = useState<any>(null);

    const fetchDetails = async (orderId: number) => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/service-orders/${orderId}/details`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (res.ok) {
                const data = await res.json();
                setDetailData(data.data);
                setIsDetailOpen(true);
            } else {
                toast.error('Erro ao buscar detalhes da O.S.');
            }
        } catch (e) {
            toast.error('Erro de conexão ao buscar detalhes.');
        }
    };

    const handleCancelLocal = async (orderId: number) => {
        if (!window.confirm(`Atenção: Deseja realmente cancelar a O.S #${orderId} e seu respectivo faturamento?`)) return;
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/service-orders/${orderId}/cancel-local`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (res.ok) {
                const data = await res.json();
                toast.success(data.message || 'Cancelada localmente com sucesso');
                fetchOrders();
            } else {
                const error = await res.json();
                toast.error(error.detail || 'Erro ao cancelar localmente');
            }
        } catch (e) {
            toast.error('Erro de conexão ao cancelar.');
        }
    };

    const [selectedOrders, setSelectedOrders] = useState<number[]>([]);
    
    const handleBulkStatus = async (newStatus: string) => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/service-orders/bulk/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                body: JSON.stringify({ order_ids: selectedOrders, status: newStatus })
            });
            if (res.ok) {
                toast.success(`Status de ${selectedOrders.length} O.S atualizado!`);
                setSelectedOrders([]);
                fetchOrders();
            } else {
                toast.error('Erro ao atualizar lote.');
            }
        } catch (e) { toast.error('Servidor offline'); }
    };

    const prepareBulkBillGrouped = () => {
        const selectedObj = orders.filter(o => selectedOrders.includes(o.id));
        const customerIds = new Set(selectedObj.map(o => o.customer_id));
        if (customerIds.size > 1) {
            toast.error("Faturamento Agrupado exige que TODAS as O.S sejam do mesmo Cliente!");
            return;
        }
        const nonCompleted = selectedObj.find(o => o.status !== 'Concluido');
        if (nonCompleted) {
            toast.error("Para faturar o lote, altere o status das O.S selecionadas para 'Concluído' primeiro.");
            return;
        }
        const alreadyBilled = selectedObj.find(o => o.status_nfse !== 'Nao Emitida' && o.status_nfse !== 'Erro');
        if (alreadyBilled) {
            toast.error("Você selecionou pelo menos uma O.S que já foi faturada! Desmarque-a para prosseguir.");
            return;
        }
        const sum = selectedObj.reduce((acc, curr) => acc + curr.negotiated_value, 0);
        setBillData({ order_id: 0, order_ids: selectedOrders, bulk_sum: sum, installments_count: '1', first_due_date: new Date().toISOString().split('T')[0], account_id: '', print_point_id: '', is_grouped: true });
        setIsBillOpen(true);
    };

    const prepareBulkBillIndividual = () => {
        const selectedObj = orders.filter(o => selectedOrders.includes(o.id));
        const nonCompleted = selectedObj.find(o => o.status !== 'Concluido');
        if (nonCompleted) {
            toast.error("Para faturar o lote, altere o status das O.S selecionadas para 'Concluído' primeiro.");
            return;
        }
        const alreadyBilled = selectedObj.find(o => o.status_nfse !== 'Nao Emitida' && o.status_nfse !== 'Erro');
        if (alreadyBilled) {
            toast.error("Você selecionou pelo menos uma O.S que já foi faturada! Desmarque-a para prosseguir.");
            return;
        }
        const sum = selectedObj.reduce((acc, curr) => acc + curr.negotiated_value, 0);
        setBillData({ order_id: 0, order_ids: selectedOrders, bulk_sum: sum, installments_count: '1', first_due_date: new Date().toISOString().split('T')[0], account_id: '', print_point_id: '', is_grouped: false });
        setIsBillOpen(true);
    };

    const handleDownloadPDF = async (orderId: number) => {
        try {
            const toastId = toast.loading('Gerando PDF ou Redirecionando para Sefaz...');
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/service-orders/${orderId}/pdf`, {
                headers: { 'Authorization': `Bearer ${getToken()}` },
            });
            if (res.ok) {
                const contentType = res.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    const data = await res.json();
                    if (data.redirect) {
                        toast.success('Redirecionando para portal da Sefaz...', { id: toastId });
                        window.open(data.redirect, '_blank');
                        return;
                    }
                }
                
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `DANFSe_${orderId}.pdf`;
                a.target = '_blank';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => window.URL.revokeObjectURL(url), 5000);
                toast.success('DANFSe processado!', { id: toastId });
            } else {
                toast.dismiss(toastId);
                let errorMessage = 'Erro desconhecido ao baixar DANFSe.';
                try {
                    const errorData = await res.json();
                    errorMessage = errorData.error || errorData.detail || errorMessage;
                } catch { }
                setErrorModalInfo(errorMessage);
            }
        } catch (e) {
            toast.error('Falha de conexão.');
        }
    };

    const handleConsultNfse = async (orderId: number) => {
        const tId = toast.loading('Consultando Sefin Nacional...');
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/service-orders/${orderId}/nfse/consult`, {
                headers: { 'Authorization': `Bearer ${getToken()}` },
            });
            const data = await res.json();
            if (res.ok) {
                toast.success('NFS-e Consultada', { id: tId });
                setConsultData(data);
                setConsultingOrderId(orderId);
                setIsConsultModalOpen(true);
            } else {
                toast.error(data.detail || 'Falha na consulta', { id: tId });
            }
        } catch(e) {
            toast.error('Erro de conexão ao consultar', { id: tId });
        }
    };

    const handleSyncNfseStatus = async () => {
        if (!consultingOrderId) return;
        const tId = toast.loading('Sincronizando...');
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/service-orders/${consultingOrderId}/nfse/sync`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${getToken()}` },
            });
            const data = await res.json();
            if (res.ok) {
                toast.success(data.message || 'Sincronizado!', { id: tId });
                setIsConsultModalOpen(false);
                fetchOrders();
            } else {
                toast.error(data.detail || 'Falha na sync', { id: tId });
            }
        } catch(e) {
            toast.error('Erro de conexão', { id: tId });
        }
    };

    const handleCancelNfseSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!cancelNfseData.motivo) return toast.error('A justificativa é obrigatória.');
        const tId = toast.loading('Registrando evento de cancelamento na Sefin...');
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/service-orders/${cancelNfseData.order_id}/nfse/cancel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                body: JSON.stringify({
                    codigo_cancelamento: cancelNfseData.codigo_cancelamento,
                    motivo: cancelNfseData.motivo
                })
            });
            const data = await res.json();
            if (res.ok) {
                toast.success('NFS-e Cancelada com sucesso!', { id: tId });
                setIsCancelNfseOpen(false);
                fetchOrders();
            } else {
                toast.error(data.detail || 'Falha ao cancelar na Sefin', { id: tId });
            }
        } catch(e) {
            toast.error('Falha de conexão', { id: tId });
        }
    };

    const handleBill = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const isBulk = Array.isArray(billData.order_ids) && billData.order_ids.length > 0;
            
            let url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/service-orders/${billData.order_id}/bill`;
            if (isBulk) {
                url = billData.is_grouped 
                    ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/service-orders/bulk/bill`
                    : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/service-orders/bulk/bill-individual`;
            }
                
            const basePayload = { 
                installments_count: parseInt(billData.installments_count), 
                first_due_date: billData.first_due_date, 
                account_id: billData.account_id ? parseInt(billData.account_id) : null,
                print_point_id: billData.print_point_id ? parseInt(billData.print_point_id) : null
            };
            
            const payload = isBulk 
                ? { order_ids: billData.order_ids, ...basePayload }
                : basePayload;

            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                toast.success(isBulk ? 'Lote faturado com sucesso!' : 'Faturamento com sucesso! Parcelas criadas.');
                setIsBillOpen(false);
                setSelectedOrders([]);
                
                const data = await res.json();
                if (data.status_sefaz !== undefined) {
                    setSefazLog({
                        status: data.status_sefaz,
                        body: data.resposta_bruta,
                        xml: data.xml_enviado
                    });
                    setIsPrintPointModalOpen(true);
                } else {
                    fetchOrders();
                }
            } else {
                const data = await res.json();
                if (data.status_sefaz !== undefined) {
                    setSefazLog({
                        status: data.status_sefaz,
                        body: data.resposta_bruta,
                        xml: data.xml_enviado
                    });
                    setIsPrintPointModalOpen(true);
                } else {
                    toast.error(data.detail || 'Erro ao faturar O.S');
                }
            }
        } catch (e) { toast.error('Servidor offline'); }
    };
    
    const handleIssueNF = async (orderId: number) => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/service-orders/${orderId}/issue-nf`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (res.ok) {
                toast.success('NFS Emitida com sucesso!');
                fetchOrders();
            } else {
                toast.error('Erro ao emitir NFS');
            }
        } catch (e) { toast.error('Servidor offline'); }
    };
    
    const handleBulkIssueNF = async () => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/service-orders/bulk/issue-nf`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                body: JSON.stringify({ order_ids: selectedOrders })
            });
            if (res.ok) {
                toast.success('NFS Lote emitidas com sucesso!');
                setSelectedOrders([]);
                fetchOrders();
            } else {
                toast.error('Erro ao emitir Notas em lote');
            }
        } catch (e) {}
    };

    const handleIssueNFClick = (orderId: number) => {
        setSelectedOrderIdForNF(orderId);
        setIsPrintPointModalOpen(true);
    };

    const confirmIssueNF = async () => {
        if (!selectedOrderIdForNF && selectedOrders.length === 0) return;
        
        try {
            const payload = {
                order_ids: selectedOrderIdForNF ? [selectedOrderIdForNF] : selectedOrders,
                print_point_id: selectedPrintPointId || null
            };
            
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/service-orders/bulk/issue-nf`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                const data = await res.json();
                toast.success(data.message || 'Enviado para emissão');
                
                if (data.status_sefaz !== undefined) {
                    setSefazLog({
                        status: data.status_sefaz,
                        body: data.resposta_bruta,
                        xml: data.xml_enviado
                    });
                } else {
                    setIsPrintPointModalOpen(false);
                    setSelectedOrderIdForNF(null);
                    setSelectedOrders([]);
                    fetchOrders();
                }
            } else {
                const err = await res.json();
                if (err.status_sefaz !== undefined) {
                    setSefazLog({
                        status: err.status_sefaz,
                        body: err.resposta_bruta,
                        xml: err.xml_enviado
                    });
                } else {
                    const errorMsg = Array.isArray(err.detail) 
                        ? err.detail.map((e: any) => `${e.loc.join('.')}: ${e.msg}`).join(', ') 
                        : (err.detail || 'Erro na emissão');
                    toast.error(errorMsg);
                }
            }
        } catch (e) {
            toast.error('Erro na emissão');
        }
    };
    
    const handleServiceSelect = (svcId: string) => {
        const svc = services.find(s => s.id === parseInt(svcId));
        if (svc) {
            setNewOrder({
                ...newOrder,
                service_id: svcId,
                negotiated_value: new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(svc.base_value)
            });
        }
    };

    const getStatusColor = (status: string) => {
        switch(status) {
            case 'Pendente': return 'bg-amber-100 text-amber-700 border-amber-200';
            case 'Em Execucao': return 'bg-indigo-100 text-indigo-700 border-indigo-200';
            case 'Concluido': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
            case 'Cancelado': return 'bg-rose-100 text-rose-700 border-rose-200';
            default: return 'bg-slate-100 text-slate-700 border-slate-200';
        }
    };

    return (
        <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                        <FileText className="w-8 h-8 text-indigo-500" />
                        Ordens de Serviço (O.S.)
                    </h1>
                    <p className="text-sm text-slate-500 mt-2 dark:text-slate-400">
                        Venda de serviços, faturamento integrado e status de NFS-e.
                    </p>
                </div>
                
                <button onClick={() => setIsCreateOpen(true)} className="px-5 py-2.5 bg-[var(--color-primary-base)] text-white rounded-xl font-semibold hover:opacity-90 shadow-sm transition flex items-center gap-2 text-sm whitespace-nowrap">
                    <Plus className="w-4 h-4"/> Nova O.S.
                </button>
            </div>

            {/* Nova Action Bar de Filtros e Resumo */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">Filtrar Competência:</label>
                    <input 
                        type="month" 
                        value={monthFilter}
                        onChange={(e) => setMonthFilter(e.target.value)}
                        className="px-4 py-2 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:border-[var(--color-primary-base)] dark:bg-slate-950 dark:text-white"
                    />
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">Status:</label>
                    <select 
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="px-4 py-2 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:border-[var(--color-primary-base)] dark:bg-slate-950 dark:text-white"
                    >
                        <option value="Ativas">Ativas (sem Canceladas)</option>
                        <option value="Todas">Todas</option>
                        <option value="Pendente">Pendente</option>
                        <option value="Em Execucao">Em Execução</option>
                        <option value="Concluido">Concluído</option>
                        <option value="Cancelado">Cancelado</option>
                    </select>
                </div>
                <div className="flex items-center gap-3 ml-auto w-full md:w-auto justify-end overflow-x-auto pb-2 md:pb-0">
                    <div className="bg-indigo-50 dark:bg-indigo-900/30 px-4 py-2 rounded-xl border border-indigo-100 dark:border-indigo-800 flex flex-col items-end min-w-fit">
                        <span className="text-[9px] uppercase font-black text-indigo-500">Pendentes (Previstos)</span>
                        <span className="text-sm font-bold text-indigo-700 dark:text-indigo-400 leading-tight">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency:'BRL' }).format(totalExpected)}
                        </span>
                    </div>
                    <div className="bg-emerald-50 dark:bg-emerald-900/30 px-4 py-2 rounded-xl border border-emerald-100 dark:border-emerald-800 flex flex-col items-end min-w-fit">
                        <span className="text-[9px] uppercase font-black text-emerald-500">Concluídas (Realizado)</span>
                        <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400 leading-tight">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency:'BRL' }).format(totalCompleted)}
                        </span>
                    </div>
                    <div className="bg-rose-50 dark:bg-rose-900/30 px-4 py-2 rounded-xl border border-rose-100 dark:border-rose-800 flex flex-col items-end min-w-fit">
                        <span className="text-[9px] uppercase font-black text-rose-500">Canceladas (Estorno)</span>
                        <span className="text-sm font-bold text-rose-700 dark:text-rose-400 leading-tight">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency:'BRL' }).format(totalCancelled)}
                        </span>
                    </div>
                </div>
            </div>

            {/* BARRA DE AÇÕES EM LOTE NO TOPO */}
            {selectedOrders.length > 0 && (
                <div className="bg-indigo-50 border border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-800 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm animate-in fade-in duration-300">
                    <div className="flex items-center gap-3">
                        <div className="bg-indigo-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow-md">{selectedOrders.length}</div>
                        <span className="text-indigo-900 dark:text-indigo-300 font-bold text-sm">OS Selecionadas</span>
                    </div>
                    
                    <div className="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
                        <div className="flex items-center gap-3 bg-white dark:bg-slate-900 px-4 py-2 rounded-xl border border-indigo-100 dark:border-slate-700 shadow-sm w-full md:w-auto">
                            <span className="text-xs font-bold text-slate-500 tracking-wide uppercase">Alterar Status:</span>
                            <select 
                                onChange={(e) => { 
                                    if(e.target.value) {
                                        handleBulkStatus(e.target.value);
                                        e.target.value = '';
                                    }
                                }}
                                className="bg-transparent text-slate-800 dark:text-slate-200 rounded text-sm outline-none font-bold cursor-pointer min-w-[120px]"
                            >
                                <option value="">Selecione...</option>
                                <option value="Em Execucao">Em Execução</option>
                                <option value="Concluido">Concluir Lote</option>
                                <option value="Cancelado">Cancelar Lote</option>
                            </select>
                        </div>
                        
                        <div className="hidden md:block w-px h-8 bg-indigo-200 dark:bg-indigo-800/60"></div>
                        
                        {(() => {
                            const selectedObj = orders.filter(o => selectedOrders.includes(o.id));
                            const allNaoEmitida = selectedObj.every(o => o.status_nfse === 'Nao Emitida');
                            const allProcessando = selectedObj.every(o => o.status_nfse === 'Processando');
                            const allConcluido = selectedObj.every(o => o.status === 'Concluido');
                            const mixedNfseStatus = !allNaoEmitida && !allProcessando && selectedObj.length > 0;
                            
                            return (
                                <div className="flex flex-col md:flex-row items-center gap-3">
                                    {mixedNfseStatus && (
                                        <span className="text-xs text-rose-500 font-bold px-4 text-center md:text-left bg-rose-50 dark:bg-rose-900/30 py-2 rounded-lg">
                                            Atenção: Seleção possui mix de "Não Emitidas" e "Processando". Filtre ou selecione separadamente para aplicar ações financeiras.
                                        </span>
                                    )}
                                    
                                    {allNaoEmitida && allConcluido && (
                                        <div className="flex bg-white dark:bg-slate-900 rounded-xl p-1 shadow-sm border border-slate-200 dark:border-slate-800 w-full md:w-auto">
                                            <button onClick={prepareBulkBillIndividual} className="px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-lg text-sm transition flex items-center gap-2 flex-1 justify-center border-r border-transparent">
                                                <FileText className="w-4 h-4"/> Faturar Separadas
                                            </button>
                                            <button onClick={prepareBulkBillGrouped} className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-90 text-white font-bold rounded-lg text-sm transition shadow-sm flex items-center gap-2 flex-1 justify-center border border-indigo-500">
                                                <DollarSign className="w-4 h-4"/> Agrupar Num Boleto
                                            </button>
                                        </div>
                                    )}

                                    {allNaoEmitida && !allConcluido && !mixedNfseStatus && (
                                         <span className="text-xs text-slate-500 font-bold px-4 text-center tracking-wide">
                                             Conclua o lote selecionado para Faturar
                                         </span>
                                    )}
                                    
                                    {allProcessando && (
                                        <button onClick={() => setIsPrintPointModalOpen(true)} className="px-6 py-2.5 bg-slate-900 border border-slate-700 hover:bg-slate-800 text-white font-bold rounded-xl text-sm transition shadow-md flex items-center gap-2 justify-center w-full md:w-auto">
                                            <Receipt className="w-4 h-4"/> Transmitir NFS em Lote
                                        </button>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                </div>
            )}

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="overflow-x-auto min-h-[400px]">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold uppercase text-xs">
                            <tr>
                                <th className="px-4 py-4 w-10">
                                    <input 
                                        type="checkbox" 
                                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 dark:bg-slate-800 border-slate-300 dark:border-slate-600"
                                        checked={orders.length > 0 && selectedOrders.length === orders.length}
                                        onChange={() => {
                                            if (selectedOrders.length === orders.length) setSelectedOrders([]);
                                            else setSelectedOrders(orders.map(o => o.id));
                                        }}
                                    />
                                </th>
                                <th className="px-6 py-4">ID e Cliente</th>
                                <th className="px-6 py-4">Serviço Prestado</th>
                                <th className="px-6 py-4">Execução</th>
                                <th className="px-6 py-4 text-center">Status / NFS-e</th>
                                <th className="px-6 py-4 text-right">Ações de Faturamento</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={6} className="text-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-primary-base)] mx-auto"></div></td></tr>
                            ) : (() => {
                                const filteredOrders = orders.filter(o => 
                                    statusFilter === 'Todas' ? true : 
                                    statusFilter === 'Ativas' ? o.status !== 'Cancelado' : 
                                    o.status === statusFilter
                                ).sort((a, b) => b.id - a.id);
                                if (filteredOrders.length === 0) return <tr><td colSpan={6} className="text-center py-12 text-slate-500">Nenhuma O.S. encontrada.</td></tr>;
                                return filteredOrders.map(order => (
                                    <tr key={order.id} className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                                        <td className="px-4 py-4">
                                            <input 
                                                type="checkbox"
                                                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 dark:bg-slate-800 border-slate-300 dark:border-slate-600"
                                                checked={selectedOrders.includes(order.id)}
                                                onChange={() => {
                                                    setSelectedOrders(prev => prev.includes(order.id) ? prev.filter(x => x !== order.id) : [...prev, order.id]);
                                                }}
                                            />
                                        </td>
                                        <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">
                                            <Link 
                                                href={`/services/orders/${order.id}`}
                                                className="text-xs text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-400 mb-1 font-black flex items-center gap-2 cursor-pointer hover:underline transition"
                                                title="Ver Detalhes completos da O.S"
                                            >
                                                OS #{order.local_id || order.id}
                                                {order.is_recurrent && <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[9px] rounded-md whitespace-nowrap dark:bg-purple-900/30 no-underline">🔄 RECORRENTE</span>}
                                            </Link>
                                            <Link href={`/customers/${order.customer_id}`} className="hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline transition-colors cursor-pointer" title="Ver Perfil do Cliente">
                                                {order.customer_name}
                                            </Link>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-slate-700 dark:text-slate-200">{order.service_name}</div>
                                            <div className="text-xs font-semibold text-emerald-600 mt-1 dark:text-emerald-400">
                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency:'BRL' }).format(order.negotiated_value)}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 font-medium text-slate-600 dark:text-slate-400">
                                            <div className="flex items-center gap-1.5"><Calendar className="w-4 h-4"/> {new Date(order.execution_date).toLocaleDateString('pt-BR', {timeZone: 'UTC'})}</div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="flex flex-col gap-3">
                                                <div className="flex items-center justify-between gap-3 px-2">
                                                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Serviço</span>
                                                    <select 
                                                        value={order.status}
                                                        onChange={(e) => handleStatusChange(order.id, e.target.value)}
                                                        className={`px-2 py-1 text-xs font-bold rounded-lg border outline-none ${getStatusColor(order.status)} w-[140px] text-center`}
                                                    >
                                                        <option value="Pendente">Pendente</option>
                                                        <option value="Em Execucao">Em Execução</option>
                                                        <option value="Concluido">Concluído</option>
                                                        {order.status_nfse !== 'Nao Emitida' ? (
                                                            <option disabled value="Cancelado">Cancelado (Faturada)</option>
                                                        ) : (
                                                            <option value="Cancelado">Cancelado</option>
                                                        )}
                                                    </select>
                                                </div>
                                                
                                                <div className="flex items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800/60 pt-3 px-2">
                                                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">NFS-e</span>
                                                    <div className="flex flex-col items-center gap-1.5 w-[140px]">
                                                        <span className={`px-2.5 py-1 text-[10px] w-full text-center font-black rounded-lg uppercase
                                                            ${order.status_nfse === 'Emitida' ? 'bg-emerald-100 text-emerald-700' :
                                                              order.status_nfse === 'Processando' ? 'bg-indigo-100 text-indigo-700' :
                                                              order.status_nfse === 'Erro' ? 'bg-rose-100 text-rose-700' :
                                                              'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                                                            {order.status_nfse}
                                                        </span>
                                                        {order.nfse_number && (
                                                            <div className="flex flex-col items-center justify-center gap-0.5 mt-1" title={`Chave: ${order.nfse_number}`}>
                                                                <div className="text-[10px] text-slate-500 font-bold flex items-center gap-1">
                                                                    <FileText className="w-3 h-3 flex-shrink-0"/>
                                                                    <span className="truncate">
                                                                        Nº {(() => {
                                                                            const k = order.nfse_number;
                                                                            if (k.startsWith('SUCESS_DUMMY_')) return k.replace('SUCESS_DUMMY_', '');
                                                                            if (k.length === 50) {
                                                                                const num = parseInt(k.substring(23, 36), 10);
                                                                                return num > 0 ? num : k.slice(-9); // Fallback p/ os ultimos 9 caso seja zeros
                                                                            }
                                                                            return k;
                                                                        })()}
                                                                    </span>
                                                                </div>
                                                                <div className="text-[9px] text-slate-400 font-semibold align-middle truncate">
                                                                    RPS/Ref: {order.id}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end items-center gap-3">
                                                {order.status === 'Concluido' && order.status_nfse === 'Nao Emitida' ? (
                                                    order.is_nfse ? (
                                                        <button 
                                                            onClick={() => {
                                                                setBillData({ order_id: order.id, installments_count: '1', first_due_date: order.execution_date, account_id: '', print_point_id: '' });
                                                                setIsBillOpen(true);
                                                            }}
                                                            className="px-4 py-2 bg-[var(--color-primary-base)] hover:opacity-90 text-white font-bold rounded-xl shadow-md text-xs inline-flex items-center gap-2 whitespace-nowrap transition"
                                                        >
                                                            <DollarSign className="w-3.5 h-3.5"/> Faturar e Emitir
                                                        </button>
                                                    ) : (
                                                        <div className="flex items-center gap-2">
                                                            <button 
                                                                onClick={() => {
                                                                    setBillData({ order_id: order.id, installments_count: '1', first_due_date: order.execution_date, account_id: '', print_point_id: '' });
                                                                    setIsBillOpen(true);
                                                                }}
                                                                className="px-4 py-2 bg-[var(--color-primary-base)] hover:opacity-90 text-white font-bold rounded-xl shadow-md text-xs inline-flex items-center gap-2 whitespace-nowrap transition"
                                                            >
                                                                <DollarSign className="w-3.5 h-3.5"/> Faturar
                                                            </button>
                                                        </div>
                                                    )
                                                ) : order.status_nfse === 'Processando' ? (
                                                    <>
                                                        <span className="text-xs font-bold text-slate-400 inline-flex items-center gap-1"><Receipt className="w-3 h-3"/> Faturado</span>
                                                        <button 
                                                            onClick={() => handleIssueNFClick(order.id)}
                                                            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl shadow-md text-xs inline-flex items-center gap-2 whitespace-nowrap border border-slate-600"
                                                        >
                                                            📜 Emitir NFS-e
                                                        </button>
                                                    </>
                                                ) : order.status_nfse === 'Emitida' || order.status_nfse === 'EMITIDA' ? (

                                                    <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/10 p-1 rounded-xl border border-emerald-100 dark:border-emerald-800/30">
                                                        <button 
                                                            onClick={() => handleDownloadPDF(order.id)}
                                                            className="p-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow-sm text-xs inline-flex items-center gap-1.5 transition cursor-pointer"
                                                            title="Baixar DANFSe"
                                                        >
                                                            <Receipt className="w-3.5 h-3.5"/> PDF
                                                        </button>
                                                        <button 
                                                            onClick={() => handleConsultNfse(order.id)}
                                                            className="p-2 border border-emerald-200 hover:bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:hover:bg-emerald-800 dark:text-emerald-300 font-bold rounded-lg text-xs inline-flex items-center transition cursor-pointer"
                                                            title="Consultar na Sefaz"
                                                        >
                                                            <Search className="w-3.5 h-3.5"/>
                                                        </button>
                                                        <button 
                                                            onClick={() => {
                                                                setCancelNfseData({...cancelNfseData, order_id: order.id});
                                                                setIsCancelNfseOpen(true);
                                                            }}
                                                            className="p-2 border border-rose-200 hover:bg-rose-100 text-rose-600 dark:border-rose-800 dark:hover:bg-rose-800/50 dark:text-rose-400 font-bold rounded-lg text-xs inline-flex items-center transition cursor-pointer"
                                                            title="Cancelar NFS-e"
                                                        >
                                                            <X className="w-3.5 h-3.5"/>
                                                        </button>
                                                    </div>
                                                ) : order.status_nfse === 'Erro' || order.status_nfse === 'ERROR' ? (
                                                    <>
                                                        <span className="text-[10px] uppercase font-bold text-rose-500">Falha</span>
                                                        {order.status !== 'Cancelado' && (
                                                            <button 
                                                                onClick={() => handleIssueNFClick(order.id)}
                                                                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-md text-xs inline-flex items-center gap-2 whitespace-nowrap transition border border-rose-800"
                                                            >
                                                                ↻ Tentar Novamente
                                                            </button>
                                                        )}
                                                    </>
                                                ) : (
                                                    <span className="text-[10px] uppercase font-bold text-slate-400">
                                                        {order.status === 'Cancelado' && !order.is_nfse ? 'Avulsa Cancelada' : 
                                                         order.status === 'Cancelado' ? 'Cancelado / Sincronizado' : 'Aguardando Conclusão'}
                                                    </span>
                                                )}
                                                
                                                <div className="flex gap-2 items-center ml-2 border-l border-slate-200 dark:border-slate-700 pl-3">
                                                    {order.status_nfse === 'Nao Emitida' && order.status !== 'Cancelado' && order.status !== 'Pendente' && (
                                                        <button 
                                                            onClick={() => handleCancelLocal(order.id)}
                                                            className="p-2 bg-rose-100 hover:bg-rose-200 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 font-bold rounded-lg transition"
                                                            title="Cancelar O.S do Sistema"
                                                        >
                                                            <X className="w-4 h-4"/>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ));
                            })()}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* CREATE MODAL */}
            {isCreateOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
                    <div className="bg-white dark:bg-slate-950 rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Nova Ordem de Serviço</h2>
                            <button onClick={()=>setIsCreateOpen(false)} className="text-slate-400"><X className="w-5 h-5"/></button>
                        </div>
                        <form onSubmit={handleCreateOrder} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Cliente</label>
                                <select required value={newOrder.customer_id} onChange={(e) => setNewOrder({...newOrder, customer_id: e.target.value})} className="w-full px-4 py-2.5 border rounded-xl dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-sm">
                                    <option value="">Selecione...</option>
                                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Serviço</label>
                                <select required value={newOrder.service_id} onChange={(e) => handleServiceSelect(e.target.value)} className="w-full px-4 py-2.5 border rounded-xl dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-sm">
                                    <option value="">Selecione...</option>
                                    {services.map(s => <option key={s.id} value={s.id}>{s.name} (R$ {s.base_value})</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Vlr Negociado (R$)</label>
                                    <input required type="text" value={newOrder.negotiated_value} onChange={(e) => {
                                        let v = e.target.value.replace(/\D/g, '');
                                        if(!v) return setNewOrder({...newOrder, negotiated_value: ''});
                                        setNewOrder({...newOrder, negotiated_value: (parseInt(v)/100).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2})});
                                    }} className="w-full px-4 py-2.5 border rounded-xl dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-sm" placeholder="0,00" />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Data Execução</label>
                                    <input required type="date" value={newOrder.execution_date} onChange={(e) => setNewOrder({...newOrder, execution_date: e.target.value})} className="w-full px-4 py-2.5 border rounded-xl dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-sm" />
                                </div>
                            </div>
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Detalhes (Opcional p/ Nota)</label>
                                    <textarea value={newOrder.custom_description} onChange={(e) => setNewOrder({...newOrder, custom_description: e.target.value})} className="w-full px-4 py-2.5 border rounded-xl dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-sm resize-none" rows={3}/>
                                </div>
                                <div className="border border-purple-100 dark:border-purple-900/30 bg-purple-50/50 dark:bg-purple-900/10 rounded-xl p-4 space-y-3">
                                    <div className="flex items-center gap-2">
                                        <input type="checkbox" id="os-recurrent" checked={newOrder.is_recurrent} onChange={(e) => setNewOrder({...newOrder, is_recurrent: e.target.checked})} className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500"/>
                                        <label htmlFor="os-recurrent" className="text-sm font-bold text-purple-900 dark:text-purple-300 cursor-pointer">Serviço Recorrente Mensal</label>
                                    </div>
                                    {newOrder.is_recurrent && (
                                        <div>
                                            <label className="block text-xs font-semibold text-purple-800 dark:text-purple-400 mb-1">Até quando durará o contrato? (Data Fim)</label>
                                            <input required type="date" value={newOrder.recurrence_end_date} onChange={(e) => setNewOrder({...newOrder, recurrence_end_date: e.target.value})} className="w-full px-3 py-2 border rounded-lg dark:bg-slate-900 border-purple-200 dark:border-purple-800 text-sm" />
                                            <p className="text-[10px] text-slate-500 mt-1 leading-tight">O sistema irá clonar esta O.S todo mês automaticamente para seu controle de NFS-e.</p>
                                        </div>
                                    )}
                                </div>
                                <div className="pt-2">
                                <button type="submit" className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition">Criar Ordem</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* BILLING MODAL */}
            {isBillOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
                    <div className="bg-white dark:bg-slate-950 rounded-3xl max-w-sm w-full shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-indigo-50 dark:bg-indigo-900/30">
                            <h2 className="text-lg font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-2">
                                <DollarSign className="w-5 h-5"/> 
                                {billData.order_ids?.length 
                                    ? (billData.is_grouped ? 'Faturamento Agrupado' : 'Faturamento em Lote') 
                                    : 'Faturamento de OS'}
                            </h2>
                            <button type="button" onClick={()=>setIsBillOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white"><X className="w-5 h-5"/></button>
                        </div>
                        <form onSubmit={handleBill} className="p-6 space-y-4">
                            {billData.order_ids && billData.order_ids.length > 0 && billData.bulk_sum !== undefined && (
                                <div className="bg-indigo-100 text-indigo-900 p-4 rounded-xl border border-indigo-200 flex justify-between items-center dark:bg-indigo-900/40 dark:border-indigo-800 dark:text-indigo-300">
                                    <div className="text-[11px] uppercase font-bold text-indigo-600 dark:text-indigo-400">
                                        {billData.is_grouped ? 'Total da Agrupação:' : 'Somatório do Lote:'}
                                    </div>
                                    <div className="text-xl font-black">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency:'BRL' }).format(billData.bulk_sum)}</div>
                                </div>
                            )}
                            
                            {billData.order_ids && billData.order_ids.length > 0 && !billData.is_grouped && (
                                <div className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                                    <strong>Atenção:</strong> Serão geradas {billData.order_ids.length} contas financeiras separadamente. A parametrização abaixo será aplicada a cada uma delas individualmente.
                                </div>
                            )}
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Qtd Parcelas</label>
                                <input required type="number" min="1" max="60" value={billData.installments_count} onChange={(e) => setBillData({...billData, installments_count: e.target.value})} className="w-full px-4 py-2.5 border rounded-xl dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-sm font-bold text-center text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">1º Vencimento</label>
                                <input required type="date" value={billData.first_due_date} onChange={(e) => setBillData({...billData, first_due_date: e.target.value})} className="w-full px-4 py-2.5 border rounded-xl dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-sm" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Conta Financeira (Opcional)</label>
                                <select value={billData.account_id} onChange={(e) => setBillData({...billData, account_id: e.target.value})} className="w-full px-4 py-2.5 border rounded-xl dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-sm">
                                    <option value="">Nenhuma Associada</option>
                                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Ponto de Impressão (Opcional)</label>
                                <select value={billData.print_point_id} onChange={(e) => setBillData({...billData, print_point_id: e.target.value})} className="w-full px-4 py-2.5 border rounded-xl dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-sm">
                                    <option value="">Apenas Faturar (Não gerar Nota)</option>
                                    {printPoints.map(p => <option key={p.id} value={p.id}>{p.name} {p.document_type === 'NFSE' ? '(Sefaz)' : '(Local)'}</option>)}
                                </select>
                            </div>
                            <div className="pt-2">
                                <button type="submit" className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-90 text-white font-bold rounded-xl transition shadow-md">
                                    {billData.print_point_id ? 'Confirmar Faturamento e Emissão' : 'Confirmar e Lançar no Caixa'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* PRINT POINT MODAL */}
            {isPrintPointModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className={`bg-white rounded-2xl shadow-xl w-full ${sefazLog ? 'max-w-4xl' : 'max-w-sm'} p-6 overflow-hidden mt-10 max-h-[90vh] flex flex-col`}>
                        <h3 className="text-xl font-bold text-slate-800 mb-2">
                            {sefazLog ? 'Retorno da Sefaz (ADN)' : 'Ponto de Impressão'}
                        </h3>
                        
                        {sefazLog ? (
                            <div className="flex-1 overflow-auto flex flex-col space-y-4 pt-2">
                                <div className={`p-4 rounded-xl border font-mono text-sm shadow-inner ${sefazLog.status && sefazLog.status >= 200 && sefazLog.status < 300 ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
                                    <div className="font-bold mb-2 flex items-center gap-2">
                                        <div className={`w-3 h-3 rounded-full ${sefazLog.status && sefazLog.status >= 200 && sefazLog.status < 300 ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'}`}></div>
                                        {sefazLog.status && sefazLog.status >= 200 && sefazLog.status < 300 ? 'SUCESSO! (HTTP ' + sefazLog.status + ')' : 'ERRO (HTTP ' + sefazLog.status + ')'}
                                    </div>
                                    {sefazLog.status && sefazLog.status >= 200 && sefazLog.status < 300 && (
                                        <p className="text-xs mb-3 text-emerald-700 font-sans font-semibold">
                                            A Secretaria da Fazenda aprovou o RPS e a Nota Eletrônica foi gerada com a chave abaixo:
                                        </p>
                                    )}
                                    <pre className="whitespace-pre-wrap overflow-x-auto text-[11px] leading-relaxed p-2 bg-white/50 rounded max-h-[300px]">
                                        {sefazLog.body}
                                    </pre>
                                </div>
                                
                                <div className="mt-4">
                                    <p className="text-xs font-semibold text-slate-500 mb-1">Payload GZip B64 (Enviado):</p>
                                    <pre className="w-full text-[10px] overflow-hidden text-ellipsis line-clamp-3 bg-slate-100 p-2 rounded text-slate-500 font-mono">
                                        {sefazLog.xml}
                                    </pre>
                                </div>

                                <div className="flex gap-3 pt-4 border-t border-slate-200 mt-6">
                                    <button 
                                        type="button" 
                                        onClick={() => {
                                            setIsPrintPointModalOpen(false);
                                            setSelectedOrderIdForNF(null);
                                            setSefazLog(null);
                                            fetchOrders();
                                        }}
                                        className="flex-1 py-2.5 text-center px-4 border border-slate-200 text-slate-600 font-medium rounded-xl hover:bg-slate-50 transition"
                                    >
                                        Fechar
                                    </button>
                                    <button 
                                        type="button" 
                                        onClick={() => setSefazLog(null)}
                                        className="flex-1 py-2.5 bg-[#0A162B] text-white text-center px-4 font-bold rounded-xl hover:brightness-110 transition"
                                    >
                                        Tentar Novamente
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <p className="text-sm text-slate-500 mb-6">Por favor, selecione por qual série ou ponto de impressão você deseja faturar esta Nota Fiscal.</p>
                                
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-2">Ponto de Emissão</label>
                                        <select 
                                            className="w-full px-4 py-2.5 bg-white border border-slate-300 text-slate-900 rounded-xl focus:ring-2 focus:ring-[var(--color-primary-base)] outline-none"
                                            value={selectedPrintPointId}
                                            onChange={(e) => setSelectedPrintPointId(e.target.value ? Number(e.target.value) : '')}
                                        >
                                            <option value="">-- Padrão da Empresa --</option>
                                            {printPoints.map(p => (
                                                <option key={p.id} value={p.id}>{p.name} (Próxima Num. #{p.current_number})</option>
                                            ))}
                                        </select>
                                    </div>
                                    
                                    <div className="flex gap-3 pt-2">
                                        <button 
                                            type="button" 
                                            onClick={() => {
                                                setIsPrintPointModalOpen(false);
                                                setSelectedOrderIdForNF(null);
                                            }}
                                            className="flex-1 py-2.5 text-center px-4 border border-slate-200 text-slate-600 font-medium rounded-xl hover:bg-slate-50 transition"
                                        >
                                            Cancelar
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={confirmIssueNF}
                                            disabled={loading}
                                            className={`flex-1 py-2.5 text-center px-4 font-bold rounded-xl shadow-md transition-all ${loading ? 'bg-slate-400 cursor-not-allowed text-white' : 'bg-[var(--color-primary-base)] hover:brightness-110 text-white'}`}
                                        >
                                            {loading ? 'Processando...' : 'Confirmar Emissão'}
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* CANCEL NFSE MODAL */}
            {isCancelNfseOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md shadow-xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                <X className="w-5 h-5 text-rose-500" /> Cancelar NFS-e
                            </h3>
                            <button onClick={() => setIsCancelNfseOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition">
                                <X className="w-4 h-4"/>
                            </button>
                        </div>
                        
                        <form onSubmit={handleCancelNfseSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Código de Motivo *</label>
                                <select 
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 text-slate-900 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none dark:bg-slate-950 dark:border-slate-800 dark:text-white"
                                    value={cancelNfseData.codigo_cancelamento}
                                    onChange={(e) => setCancelNfseData({...cancelNfseData, codigo_cancelamento: e.target.value})}
                                    required
                                >
                                    <option value="1">1 - Erro na emissão</option>
                                    <option value="2">2 - Serviço não prestado</option>
                                    <option value="9">9 - Outros</option>
                                </select>
                            </div>
                            
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Justificativa do Cancelamento *</label>
                                <textarea
                                    className="w-full min-h-[100px] px-4 py-3 bg-slate-50 border border-slate-200 text-slate-900 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none resize-none dark:bg-slate-950 dark:border-slate-800 dark:text-white"
                                    placeholder="Ex: Erro de digitação no valor, serviço cancelado pelo cliente antes do início..."
                                    value={cancelNfseData.motivo}
                                    onChange={(e) => setCancelNfseData({...cancelNfseData, motivo: e.target.value})}
                                    required
                                    minLength={15}
                                ></textarea>
                                <p className="text-[10px] text-slate-500 mt-1">Mínimo de 15 caracteres exigidos pela Sefin Nacional.</p>
                            </div>
                            
                            <div className="flex gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 mt-6">
                                <button 
                                    type="button" 
                                    onClick={() => setIsCancelNfseOpen(false)}
                                    className="flex-1 py-2.5 text-center px-4 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-medium rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                                >
                                    Voltar
                                </button>
                                <button 
                                    type="submit"
                                    className="flex-1 py-2.5 bg-rose-600 text-white text-center px-4 font-bold rounded-xl hover:bg-rose-700 transition shadow-md flex items-center justify-center gap-2"
                                >
                                    <X className="w-4 h-4"/> Confirmar Cancelamento
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* Consult Modal */}
            {isConsultModalOpen && consultData && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden shadow-2xl relative border border-slate-100 dark:border-slate-800">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
                            <div>
                                <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                    <Search className="w-5 h-5 text-indigo-500" /> Detalhes da NFS-e
                                </h3>
                                <p className="text-xs text-slate-500 mt-1">Situação no Sefin Nacional / Gov.br</p>
                            </div>
                            <button onClick={() => setIsConsultModalOpen(false)} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-400">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="p-6 space-y-6">
                            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 dark:bg-slate-800/40 dark:border-slate-700/50">
                                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">Informações da Resposta</h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-xs text-slate-500 mb-1">Status Reportado (SERPRO)</p>
                                        <p className="font-medium text-slate-800 dark:text-white">{consultData.situacao || 'Desconhecido'}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500 mb-1">Situação na RFB</p>
                                        {consultData.is_cancelado ? (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">
                                                Cancelada DFE
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                                                Regular / Emitida
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                                    <Code className="w-4 h-4 text-slate-400" /> JSON Bruto Sefaz
                                </h4>
                                <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto text-[10px] text-green-400 font-mono max-h-48 scrollbar-thin">
                                    <pre>{JSON.stringify(consultData.data, null, 2)}</pre>
                                </div>
                            </div>

                            {consultData.xml_legivel && (
                                <div className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 mt-4">
                                    <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                                        <FileText className="w-4 h-4 text-slate-400" /> XML Descompactado
                                    </h4>
                                    <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto text-[10px] text-blue-400 font-mono max-h-64 scrollbar-thin">
                                        <pre>{consultData.xml_legivel}</pre>
                                    </div>
                                </div>
                            )}
                            
                            <div className="flex gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                                <button 
                                    onClick={() => setIsConsultModalOpen(false)}
                                    className="flex-1 py-2.5 text-center px-4 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-medium rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                                >
                                    Fechar Janela
                                </button>
                                {consultData.is_cancelado && (
                                    <button 
                                        onClick={handleSyncNfseStatus}
                                        className="flex-1 py-2.5 bg-yellow-500 hover:bg-yellow-600 text-white text-center px-4 font-bold rounded-xl transition shadow-md flex items-center justify-center gap-2"
                                    >
                                        <RefreshCw className="w-4 h-4"/> Sincronizar Sefin {'->'} Cronuz
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* ERROR MODAL */}
            {errorModalInfo && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="bg-rose-50 border-b border-rose-100 p-6 flex flex-col items-center">
                            <div className="w-16 h-16 rounded-full bg-rose-100 flex items-center justify-center mb-4">
                                <svg className="w-8 h-8 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                                </svg>
                            </div>
                            <h2 className="text-xl font-bold text-slate-800 text-center">NFS-e Enviada, mas PDF Rejeitado</h2>
                        </div>
                        <div className="p-6">
                            <p className="text-sm text-slate-600 text-center mb-6">
                                A Sefaz Nacional retornou o seguinte motivo e sonegou o PDF:
                            </p>
                            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center text-sm font-semibold text-slate-800 break-words mb-6 select-text">
                                {errorModalInfo}
                            </div>
                            <button
                                onClick={() => setErrorModalInfo(null)}
                                className="w-full py-3 px-4 bg-[#0A162B] text-white text-sm font-bold rounded-xl hover:brightness-110 active:scale-[0.98] transition-all"
                            >
                                Ciente, Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
