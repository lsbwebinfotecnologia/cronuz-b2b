'use client';

import { useState, useEffect } from 'react';
import { DollarSign, CheckCircle, Search, Clock, AlertCircle, Plus, X, ArrowUpCircle, ArrowDownCircle, BarChart3, TrendingUp, Building2, CreditCard, Wallet, Pencil, Eye, ChevronLeft, ChevronRight, Hash, Trash2, AlertTriangle, FileText, QrCode, Mail, Layers, Download, Loader2, ShieldAlert, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { getToken, getUser } from '@/lib/auth';
import Link from 'next/link';
import CustomerAutocomplete from '@/components/CustomerAutocomplete';
import { CurrencyInput } from '@/components/CurrencyInput';

const getCategoryHierarchyName = (cat: any, categories: any[]) => {
    let current = cat;
    let names = [];
    let safe = 0;
    while (current && safe < 10) {
        names.unshift(current.name);
        current = current.parent_id ? categories.find(c => c.id === current.parent_id) : null;
        safe++;
    }
    return names.join(' > ');
};

export default function FinancialPage() {
    const [installments, setInstallments] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);

    const [accounts, setAccounts] = useState<any[]>([]);
    const [metrics, setMetrics] = useState({ total_open: 0, total_paid: 0, total_overdue: 0 });
    const [cashflow, setCashflow] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [interEnabled, setInterEnabled] = useState(false);
    const [installmentIdFilter, setInstallmentIdFilter] = useState('');
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [pageSize] = useState(50);
    const [statusFilter, setStatusFilter] = useState('');
    const [customerFilter, setCustomerFilter] = useState('');
    const [orderIdFilter, setOrderIdFilter] = useState('');
    const [searchFilter, setSearchFilter] = useState('');
    const [types, setTypes] = useState({ receivable: true, payable: true });
    const [viewScope, setViewScope] = useState<'MANAGEMENT' | 'ALL' | 'PERSONAL'>('MANAGEMENT');
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-01-01`;
    });
    const [endDate, setEndDate] = useState(() => {
        const d = new Date();
        const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        const year = lastDay.getFullYear();
        const month = String(lastDay.getMonth() + 1).padStart(2, '0');
        const day = String(lastDay.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    });
    const [dateType, setDateType] = useState<'due' | 'payment'>('due');
    const [activeTab, setActiveTab] = useState<'LIST' | 'CASHFLOW'>('LIST');

    // Create Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({
        description: '', category_id: '', type: 'PAYABLE', transaction_status: 'CONFIRMADO', is_fixed: false,
        total_amount: '', issue_date: new Date().toISOString().split('T')[0], first_due_date: new Date().toISOString().split('T')[0], 
        installments_count: '1', customer_id: '', account_id: '', order_id: '',
        recurrence_end_date: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
        customer_search_text: '',
        keep_fixed_day: false,
        exclude_from_reports: false
    });
    const [pendingCustomerInstallments, setPendingCustomerInstallments] = useState<any[]>([]);
    const [mergeWithExisting, setMergeWithExisting] = useState(false);
    const [selectedTargetInstallmentIds, setSelectedTargetInstallmentIds] = useState<number[]>([]);

    // Simulation State
    const [isSimulationOpen, setIsSimulationOpen] = useState(false);
    const [simulationAccountIds, setSimulationAccountIds] = useState<number[]>([]);
    const [selectedInstallments, setSelectedInstallments] = useState<number[]>([]);
    const [isBulkDateModalOpen, setIsBulkDateModalOpen] = useState(false);
    const [bulkDueDate, setBulkDueDate] = useState('');

    // Grouping State
    const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
    const [groupDueDate, setGroupDueDate] = useState('');
    const [groupNotes, setGroupNotes] = useState('');
    const [groupAccountId, setGroupAccountId] = useState('');
    const [groupCategoryId, setGroupCategoryId] = useState('');
    const [isGrouping, setIsGrouping] = useState(false);

    // Cashflow Forecast Report Modal State
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [reportStartDate, setReportStartDate] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    });
    const [reportEndDate, setReportEndDate] = useState(() => {
        const d = new Date();
        d.setMonth(d.getMonth() + 3);
        const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        return `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
    });
    const [reportType, setReportType] = useState<string>('');
    const [reportCustomerId, setReportCustomerId] = useState<string>('');
    const [reportData, setReportData] = useState<any>(null);
    const [reportLoading, setReportLoading] = useState(false);
    const [reportExporting, setReportExporting] = useState<'excel' | 'pdf' | null>(null);

    const [preview, setPreview] = useState<any[]>([]);
    const [customerOrders, setCustomerOrders] = useState<any[]>([]);

    // Pay Modal State
    const [isPayModalOpen, setIsPayModalOpen] = useState(false);
    const [payData, setPayData] = useState<any>({ inst_id: null, account_id: '', amount: 0 });

    // Delete Modal State
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [deleteData, setDeleteData] = useState({ inst_id: null as number | null, isRecurring: false, deleteFuture: false });

    useEffect(() => {
        fetchMetrics();
        fetchCategories();
        fetchAccounts();
        fetchCashflow();
        
        // Auto-open new transaction modal if requested via URL
        if (typeof window !== 'undefined') {
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('newTransaction') === 'true') {
                setIsModalOpen(true);
                const custId = urlParams.get('customerId');
                const custName = urlParams.get('customerName');
                const custDoc = urlParams.get('customerDoc');
                
                if (custId && custName) {
                    setFormData(prev => ({
                        ...prev,
                        customer_id: custId,
                        customer_search_text: `${custName} - ${custDoc || ''}`
                    }));
                }
            }
        }
    }, []);

    useEffect(() => {
        if (page === 1) fetchInstallments();
        else setPage(1);
        fetchMetrics();
        fetchCashflow();
    }, [statusFilter, types.receivable, types.payable, viewScope]);

    useEffect(() => {
        fetchInstallments();
    }, [page]);

    const handleSearch = () => {
        if (page === 1) fetchInstallments();
        else setPage(1);
    };

    const addMonths = (dateStr: string, months: number): string => {
        const [y, m, d] = dateStr.split('-').map(Number);
        let targetMonth = (m - 1) + months;
        let targetYear = y + Math.floor(targetMonth / 12);
        targetMonth = targetMonth % 12;
        if (targetMonth < 0) targetMonth += 12;
        const maxDay = new Date(targetYear, targetMonth + 1, 0).getDate();
        const day = Math.min(d, maxDay);
        const targetDate = new Date(targetYear, targetMonth, day, 12, 0, 0);
        return targetDate.toISOString().split('T')[0];
    };

    useEffect(() => {
        if (!formData.total_amount) {
            setPreview([]);
            return;
        }
        const rawAmount = formData.total_amount.replace(/\./g, '').replace(',', '.');
        if (isNaN(Number(rawAmount))) return;
        
        let count = 1;
        let total = parseFloat(rawAmount);
        let base = total;
        let last = total;
        
        const [y, m, d] = (formData.first_due_date || formData.issue_date).split('-');
        const issue = new Date(parseInt(y), parseInt(m) - 1, parseInt(d), 12, 0, 0);

        if (formData.is_fixed) {
            const [ey, em, ed] = formData.recurrence_end_date.split('-');
            const endd = new Date(parseInt(ey), parseInt(em) - 1, parseInt(ed), 12, 0, 0);
            
            let months = (endd.getFullYear() - issue.getFullYear()) * 12 + (endd.getMonth() - issue.getMonth()) + 1;
            if (months < 1) months = 1;
            
            count = months;
            base = total;
            last = total;
            total = base * count;
        } else {
            count = parseInt(formData.installments_count) || 1;
            base = Math.floor((total / count) * 100) / 100;
            last = total - (base * (count - 1));
        }

        const previewArr = [];
        for (let i = 0; i < count; i++) {
            let dueStr;
            if (formData.keep_fixed_day) {
                dueStr = addMonths(formData.first_due_date || formData.issue_date, i);
            } else {
                const due = new Date(issue);
                due.setDate(due.getDate() + (30 * i));
                dueStr = due.toISOString().split('T')[0];
            }
            previewArr.push({ number: i + 1, due: dueStr, amount: i === count - 1 ? last : base });
        }
        setPreview(previewArr);
    }, [formData]);

    const handleCurrencyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let value = e.target.value.replace(/\D/g, '');
        if (!value) {
            setFormData({...formData, total_amount: ''});
            return;
        }
        const floatValue = parseInt(value, 10) / 100;
        const formatted = floatValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        setFormData({...formData, total_amount: formatted});
    };

    const fetchCategories = async () => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/categories`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
            if (res.ok) setCategories(await res.json());
        } catch (e) {}
    };

    const fetchCustomers = async () => {
        // Obsolete, replaced by CustomerAutocomplete
    };

    useEffect(() => {
        const fetchOrders = async () => {
            if (!formData.customer_id) {
                setCustomerOrders([]);
                return;
            }
            try {
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/orders?customer_id=${formData.customer_id}&limit=50&status=PROCESSING,SENT_TO_HORUS,DISPATCH,INVOICED`, {
                    headers: { 'Authorization': `Bearer ${getToken()}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setCustomerOrders(Array.isArray(data) ? data : (data.items || data.data || []));
                }
            } catch (e) {}
        };
        fetchOrders();

        const fetchPendingInstallments = async () => {
            if (!formData.customer_id) {
                setPendingCustomerInstallments([]);
                setMergeWithExisting(false);
                setSelectedTargetInstallmentIds([]);
                return;
            }
            try {
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/generic_installments?customer_id=${formData.customer_id}&status=PENDING&type=${formData.type}&page=1&page_size=50`, {
                    headers: { 'Authorization': `Bearer ${getToken()}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    const items = data.items || [];
                    setPendingCustomerInstallments(items);
                    if (items.length > 0) {
                        setSelectedTargetInstallmentIds(items.map((it: any) => it.id));
                    } else {
                        setSelectedTargetInstallmentIds([]);
                        setMergeWithExisting(false);
                    }
                }
            } catch (e) {
                setPendingCustomerInstallments([]);
            }
        };
        fetchPendingInstallments();
    }, [formData.customer_id, formData.type]);

    const fetchAccounts = async () => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/accounts?active_only=true`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
            if (res.ok) setAccounts(await res.json());
        } catch (e) {}
    };

    const fetchMetrics = async () => {
        try {
            const incPersonal = viewScope === 'ALL' || viewScope === 'PERSONAL';
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/summary?include_personal=${incPersonal}`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
            if (res.ok) setMetrics(await res.json());
        } catch (e) {}
    };

    const fetchCashflow = async () => {
        try {
            const incPersonal = viewScope === 'ALL' || viewScope === 'PERSONAL';
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/cashflow?include_personal=${incPersonal}`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
            if (res.ok) setCashflow(await res.json());
        } catch (e) {}
    };

    const handleToggleExclude = async (instId: number) => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/generic_installments/${instId}/toggle_exclude`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (res.ok) {
                const data = await res.json();
                toast.success(data.message);
                setInstallments(prev => prev.map(item => item.id === instId ? { 
                    ...item, 
                    exclude_from_reports: data.exclude_from_reports, 
                    inst_exclude_from_reports: data.exclude_from_reports 
                } : item));
                fetchMetrics();
                fetchCashflow();
            } else {
                toast.error("Erro ao alterar visibilidade gerencial");
            }
        } catch (e) {
            toast.error("Erro de conexão");
        }
    };

    const fetchInstallments = async () => {
        setLoading(true);
        try {
            const url = new URL(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/generic_installments`);
            if (statusFilter) url.searchParams.append('status', statusFilter);
            if (customerFilter) url.searchParams.append('customer_id', customerFilter);
            if (orderIdFilter) url.searchParams.append('order_id', orderIdFilter);
            if (searchFilter) url.searchParams.append('search', searchFilter);
            
            if (viewScope === 'MANAGEMENT') {
                url.searchParams.append('management_only', 'true');
            } else if (viewScope === 'PERSONAL') {
                url.searchParams.append('personal_only', 'true');
            }

            if (!types.receivable && !types.payable) url.searchParams.append('type', 'NONE');
            else if (types.receivable && !types.payable) url.searchParams.append('type', 'RECEIVABLE');
            else if (!types.receivable && types.payable) url.searchParams.append('type', 'PAYABLE');
            const idDigits = installmentIdFilter.replace(/\D/g, '');
            if (idDigits) url.searchParams.append('transaction_id', idDigits);
            if (startDate) {
                url.searchParams.append('start_due_date', startDate);
            }
            if (endDate) {
                url.searchParams.append('end_due_date', endDate);
            }
            url.searchParams.append('page', page.toString());
            url.searchParams.append('page_size', pageSize.toString());
            
            const res = await fetch(url.toString(), { headers: { 'Authorization': `Bearer ${getToken()}` } });
            if (res.ok) {
                const data = await res.json();
                setInstallments(data.items || []);
                setTotal(data.total || 0);
                setSelectedInstallments([]);
            }
        } catch (e) { toast.error("Erro ao puxar financeiro"); } finally { setLoading(false); }
    };

    const handleCreateTransaction = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.customer_id) {
            toast.error("Por favor, informe o Nome Cliente / Fornecedor.");
            return;
        }
        try {
            let final_count = 1;
            let final_total = parseFloat(formData.total_amount.replace(/\./g, '').replace(',', '.'));
            
            if (formData.is_fixed) {
                const [y, m, d] = (formData.first_due_date || formData.issue_date).split('-');
                const issue = new Date(parseInt(y), parseInt(m) - 1, parseInt(d), 12, 0, 0);
                const [ey, em, ed] = formData.recurrence_end_date.split('-');
                const endd = new Date(parseInt(ey), parseInt(em) - 1, parseInt(ed), 12, 0, 0);
                
                let months = (endd.getFullYear() - issue.getFullYear()) * 12 + (endd.getMonth() - issue.getMonth()) + 1;
                if (months < 1) months = 1;
                final_count = months;
                final_total = final_total * final_count;
            } else {
                final_count = parseInt(formData.installments_count);
            }

            if (formData.order_id && customerOrders.length > 0) {
                const selectedOrder = customerOrders.find(o => o.id === parseInt(formData.order_id));
                if (selectedOrder && final_total > selectedOrder.total) {
                    const diff = final_total - selectedOrder.total;
                    const diffFormatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(diff);
                    const orderFormatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedOrder.total);
                    const wantsToProceed = window.confirm(`Atenção: O valor do lançamento ultrapassa o total do pedido (${orderFormatted}). Uma diferença de ${diffFormatted} a maior.\n\nDeseja realizar esse lançamento mesmo assim?`);
                    if (!wantsToProceed) return;
                }
            }

            const payload = {
                ...formData,
                category_id: parseInt(formData.category_id),
                total_amount: final_total,
                installments_count: final_count,
                customer_id: formData.customer_id ? parseInt(formData.customer_id) : null,
                account_id: formData.account_id ? parseInt(formData.account_id) : null,
                order_id: formData.order_id ? parseInt(formData.order_id) : null,
                merge_mode: mergeWithExisting ? "DISTRIBUTE_MONTHLY" : "NONE",
                target_installment_ids: (mergeWithExisting && selectedTargetInstallmentIds.length > 0) ? selectedTargetInstallmentIds : null
            };
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/transactions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                if (mergeWithExisting) {
                    toast.success("Lançamento incorporado e somado mês a mês com sucesso!");
                } else {
                    toast.success("Lançamento salvo com sucesso!");
                }
                setIsModalOpen(false);
                setMergeWithExisting(false);
                setSelectedTargetInstallmentIds([]);
                setPendingCustomerInstallments([]);
                setFormData({ description: '', category_id: '', type: 'PAYABLE', transaction_status: 'CONFIRMADO', is_fixed: false, total_amount: '', issue_date: new Date().toISOString().split('T')[0], first_due_date: new Date().toISOString().split('T')[0], installments_count: '1', customer_id: '', account_id: '', order_id: '', recurrence_end_date: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0], customer_search_text: '', keep_fixed_day: false, exclude_from_reports: false });
                fetchInstallments(); fetchMetrics(); fetchCashflow();
            } else {
                try {
                    const errData = await res.json();
                    if (errData && errData.detail) {
                        if (typeof errData.detail === 'string') {
                            toast.error(errData.detail);
                        } else if (Array.isArray(errData.detail)) {
                            toast.error(errData.detail.map((d: any) => d.msg).join(', '));
                        } else {
                            toast.error("Erro ao validar lançamento financeiro");
                        }
                    } else {
                        toast.error("Erro ao validar lançamento financeiro");
                    }
                } catch (jsonErr) {
                    toast.error("Erro ao validar lançamento financeiro");
                }
            }
        } catch(e) { toast.error("Servidor indisponível"); }
    };

    const handleRevertConciliation = async (instId: number) => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/generic_installments/${instId}/revert_conciliation`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (res.ok) {
                toast.success("Fechamento Estornado. Saldo revertido e Parcela reabrida!");
                fetchInstallments(); fetchMetrics(); fetchCashflow(); fetchAccounts();
            } else {
                toast.error("Erro ao estornar a conciliação.");
            }
        } catch(e) { toast.error("Erro ao estornar"); }
    };

    const confirmPay = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!payData.account_id) {
            toast.error("Você precisa selecionar a Conta para abater ou receber o valor!");
            return;
        }
        try {
            const endpoint = payData.editMode ? 'edit_payment' : 'pay';
            const reqBody = { 
                status: 'PAID', 
                account_id: parseInt(payData.account_id), 
                payment_date: payData.payment_date ? new Date(payData.payment_date + "T12:00:00").toISOString() : new Date().toISOString(),
                amount: payData.amount,
                ...(payData.category_id && { category_id: parseInt(payData.category_id) })
            };
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/generic_installments/${payData.inst_id}/${endpoint}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                body: JSON.stringify(reqBody)
            });
            if (res.ok) {
                toast.success(payData.editMode ? "Edição da Baixa realizada!" : "Parcela processada e aguardando Conciliação bancária!");
                setIsPayModalOpen(false);
                fetchInstallments(); fetchMetrics(); fetchCashflow(); fetchAccounts();
            } else {
                const js = await res.json();
                toast.error(js.detail || "Erro ao dar baixa");
            }
        } catch(e) { toast.error("Erro ao dar baixa"); }
    };

    const handleDelete = async () => {
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/generic_installments/${deleteData.inst_id}?delete_future=${deleteData.deleteFuture}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (res.ok) {
                toast.success("Lançamento excluído com sucesso!");
                setIsDeleteModalOpen(false);
                fetchInstallments(); fetchMetrics(); fetchCashflow();
            } else toast.error("Erro ao excluir");
        } catch(e) { toast.error("Erro ao excluir"); }
    };

    const handleIssueInterSlip = async (instId: number) => {
        const loadingId = toast.loading("Emitindo boleto no Banco Inter...");
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/installments/${instId}/issue-inter-slip`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${getToken()}` },
            });
            if (res.ok) {
                toast.success("Boleto emitido com sucesso!", { id: loadingId });
                fetchInstallments(); // Reload to get PDF URL
            } else {
                const data = await res.json();
                toast.error(data.detail || "Erro ao emitir boleto.", { id: loadingId });
            }
        } catch (e) {
            toast.error("Erro de conexão com o servidor.", { id: loadingId });
        }
    };

    const handleBulkUpdateDate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!bulkDueDate) {
            toast.error("Por favor, informe a nova data de vencimento.");
            return;
        }
        const loadingId = toast.loading("Atualizando datas em lote...");
        try {
            const token = getToken();
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/installments/bulk-update-date`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    installment_ids: selectedInstallments,
                    due_date: bulkDueDate
                })
            });
            if (res.ok) {
                const data = await res.json();
                toast.success(data.message || "Datas atualizadas com sucesso!", { id: loadingId });
                setIsBulkDateModalOpen(false);
                setSelectedInstallments([]);
                fetchInstallments();
                fetchMetrics();
                fetchCashflow();
            } else {
                const err = await res.json();
                toast.error(err.detail || "Erro ao atualizar datas em lote.", { id: loadingId });
            }
        } catch (error) {
            toast.error("Erro ao conectar ao servidor.", { id: loadingId });
        }
    };

    // Helper to check if selected installments can be grouped
    const selectedInstObjects = installments.filter(i => selectedInstallments.includes(i.id));
    const canGroup = selectedInstallments.length >= 2 && 
        selectedInstObjects.length === selectedInstallments.length &&
        selectedInstObjects.every(i => i.status !== 'PAID' && i.status !== 'CANCELLED' && !i.is_conciliated) &&
        new Set(selectedInstObjects.map(i => i.type)).size === 1 &&
        new Set(selectedInstObjects.map(i => i.customer_id || 0)).size === 1;

    const handleOpenGroupModal = () => {
        if (selectedInstallments.length < 2) {
            toast.error("Selecione ao menos 2 lançamentos para agrupar.");
            return;
        }

        const items = selectedInstObjects;
        const typesSet = new Set(items.map(i => i.type));
        if (typesSet.size > 1) {
            toast.error("Não é possível agrupar receitas com despesas juntas.");
            return;
        }

        const custSet = new Set(items.map(i => i.customer_id || 0));
        if (custSet.size > 1) {
            toast.error("Todos os lançamentos selecionados devem pertencer ao mesmo cliente/contato.");
            return;
        }

        const invalidStatus = items.find(i => i.status === 'PAID' || i.status === 'CANCELLED' || i.is_conciliated);
        if (invalidStatus) {
            toast.error("Não é permitido agrupar lançamentos já pagos, cancelados ou conciliados.");
            return;
        }

        const sortedDates = [...items].sort((a, b) => new Date(b.due_date).getTime() - new Date(a.due_date).getTime());
        setGroupDueDate(sortedDates[0]?.due_date ? new Date(sortedDates[0].due_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
        setGroupAccountId(items[0]?.account_id ? String(items[0].account_id) : '');
        setGroupCategoryId(items[0]?.category_id ? String(items[0].category_id) : '');

        const lines = items.map(i => {
            const dt = i.due_date ? new Date(i.due_date).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '-';
            const val = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(i.amount);
            return `• Parcela #${i.id} (Venc: ${dt}, Valor: ${val}) - ${i.description || 'Sem descrição'}`;
        });
        const combined = `Agrupamento consolidado de ${items.length} lançamentos:\n` + lines.join('\n');
        setGroupNotes(combined);
        setIsGroupModalOpen(true);
    };

    const handleConfirmGroup = async () => {
        if (!groupDueDate) {
            toast.error("Informe a data de vencimento do lançamento consolidado.");
            return;
        }
        setIsGrouping(true);
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/installments/group`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getToken()}`
                },
                body: JSON.stringify({
                    installment_ids: selectedInstallments,
                    due_date: groupDueDate,
                    new_due_date: groupDueDate,
                    description: groupNotes,
                    combined_notes: groupNotes,
                    account_id: groupAccountId ? parseInt(groupAccountId) : null,
                    new_account_id: groupAccountId ? parseInt(groupAccountId) : null,
                    category_id: groupCategoryId ? parseInt(groupCategoryId) : null,
                    new_category_id: groupCategoryId ? parseInt(groupCategoryId) : null
                })
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                let msg = 'Falha ao agrupar lançamentos.';
                if (typeof err.detail === 'string') {
                    msg = err.detail;
                } else if (Array.isArray(err.detail)) {
                    msg = err.detail.map((e: any) => e.msg || JSON.stringify(e)).join(', ');
                } else if (err.message && typeof err.message === 'string') {
                    msg = err.message;
                }
                throw new Error(msg);
            }

            const data = await res.json();
            toast.success(data.message || 'Lançamentos agrupados com sucesso!');
            setIsGroupModalOpen(false);
            setSelectedInstallments([]);
            fetchInstallments();
            fetchMetrics();
            fetchCashflow();
        } catch (err: any) {
            toast.error(err.message || 'Erro ao processar agrupamento.');
        } finally {
            setIsGrouping(false);
        }
    };

    const fetchCashflowForecastReport = async () => {
        setReportLoading(true);
        try {
            const url = new URL(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/reports/cashflow-forecast`);
            if (reportStartDate) url.searchParams.append('start_date', reportStartDate);
            if (reportEndDate) url.searchParams.append('end_date', reportEndDate);
            if (reportType) url.searchParams.append('type', reportType);
            if (reportCustomerId) url.searchParams.append('customer_id', reportCustomerId);

            const res = await fetch(url.toString(), {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (!res.ok) throw new Error("Erro ao carregar relatório de fluxo previsto.");
            const data = await res.json();
            setReportData(data);
        } catch (e: any) {
            toast.error(e.message || "Erro ao carregar relatório.");
        } finally {
            setReportLoading(false);
        }
    };

    const handleExportCashflowReport = async (format: 'excel' | 'pdf') => {
        setReportExporting(format);
        try {
            const url = new URL(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/reports/cashflow-forecast/export`);
            url.searchParams.append('format', format);
            if (reportStartDate) url.searchParams.append('start_date', reportStartDate);
            if (reportEndDate) url.searchParams.append('end_date', reportEndDate);
            if (reportType) url.searchParams.append('type', reportType);
            if (reportCustomerId) url.searchParams.append('customer_id', reportCustomerId);

            const res = await fetch(url.toString(), {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || "Erro ao exportar arquivo.");
            }

            const blob = await res.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = format === 'excel' ? 'Fluxo_Caixa_Previsto.xlsx' : 'Fluxo_Caixa_Previsto.pdf';
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(downloadUrl);
            toast.success(`Relatório em ${format.toUpperCase()} exportado com sucesso!`);
        } catch (e: any) {
            toast.error(e.message || "Falha na exportação do relatório.");
        } finally {
            setReportExporting(null);
        }
    };

    const maxChartValue = Math.max(...cashflow.map(c => Math.max(c.Receitas, c.Despesas + c.Prospeccoes, 100)));
    const totalConsolidated = accounts.reduce((acc, curr) => acc + (curr.type !== 'CREDIT_CARD' ? curr.current_balance : 0), 0);
    const totalCreditDebt = accounts.reduce((acc, curr) => acc + (curr.type === 'CREDIT_CARD' && curr.current_balance < 0 ? Math.abs(curr.current_balance) : 0), 0);

    const selectedAccounts = accounts.filter(a => simulationAccountIds.includes(a.id));
    const totalSelectedBalance = selectedAccounts.reduce((sum, a) => sum + a.current_balance, 0);

    const activeInstallments = selectedInstallments.length > 0
        ? installments.filter(inst => selectedInstallments.includes(inst.id))
        : installments;

    const projectedReceivables = activeInstallments
        .filter(inst => inst.status !== 'PAID' && inst.status !== 'CANCELLED' && inst.type === 'RECEIVABLE')
        .reduce((sum, inst) => sum + inst.amount, 0);
    const projectedPayables = activeInstallments
        .filter(inst => inst.status !== 'PAID' && inst.status !== 'CANCELLED' && inst.type === 'PAYABLE')
        .reduce((sum, inst) => sum + inst.amount, 0);
    const projectedBalance = simulationAccountIds.length > 0 ? (totalSelectedBalance + projectedReceivables - projectedPayables) : 0;

    return (
        <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
                <div className="mb-4 md:mb-0">
                    <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                        <DollarSign className="w-8 h-8 text-[var(--color-primary-base)]" />
                        Gestão Financeira
                    </h1>
                    <p className="text-sm text-slate-500 mt-2 dark:text-slate-400">
                        Seu fluxo consolidado: <strong>{new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'}).format(totalConsolidated)} vivo em caixa</strong> (Dívida Cartões: {new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'}).format(totalCreditDebt)}).
                    </p>
                </div>
                
                <div className="flex gap-2 relative z-10 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 hide-scrollbar">
                    <button 
                        onClick={() => {
                            setIsReportModalOpen(true);
                            fetchCashflowForecastReport();
                        }}
                        className="px-4 md:px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold shadow-sm transition flex items-center gap-2 text-sm whitespace-nowrap"
                        title="Relatório de Fluxo de Caixa Previsto por Cliente (Excel / PDF)"
                    >
                        <FileText className="w-4 h-4"/> Relatório Previsto
                    </button>
                    <button 
                        onClick={() => setIsSimulationOpen(!isSimulationOpen)} 
                        className={`px-4 md:px-5 py-2.5 rounded-xl font-bold transition flex items-center gap-2 text-sm text-center justify-center border whitespace-nowrap ${isSimulationOpen ? 'bg-amber-500 text-white border-amber-600' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                    >
                        <TrendingUp className="w-4 h-4"/> Simular Caixa
                    </button>
                    <button onClick={() => setIsModalOpen(true)} className="px-4 md:px-5 py-2.5 bg-[var(--color-primary-base)] text-white rounded-xl font-semibold hover:opacity-90 shadow-sm transition flex items-center gap-2 text-sm whitespace-nowrap">
                        <Plus className="w-4 h-4"/> Novo Lançamento
                    </button>
                </div>
            </div>

            {isSimulationOpen && (
                <div className="bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
                        <div className="w-full md:w-1/3 shrink-0">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Selecione as contas para simular</label>
                            <div className="flex flex-wrap gap-2">
                                {accounts.map(a => {
                                    const selected = simulationAccountIds.includes(a.id);
                                    return (
                                        <button
                                            key={a.id}
                                            type="button"
                                            onClick={() => {
                                                if (selected) {
                                                    setSimulationAccountIds(simulationAccountIds.filter(id => id !== a.id));
                                                } else {
                                                    setSimulationAccountIds([...simulationAccountIds, a.id]);
                                                }
                                            }}
                                            className={`px-3 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 shadow-sm ${selected ? 'bg-indigo-600 border-indigo-700 text-white dark:bg-indigo-50 dark:border-indigo-600' : 'bg-white border-slate-200 text-slate-700 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                                        >
                                            {a.type === 'CURRENT' || a.type === 'SAVINGS' ? <Building2 className="w-3.5 h-3.5" /> : a.type === 'CREDIT_CARD' ? <CreditCard className="w-3.5 h-3.5" /> : <Wallet className="w-3.5 h-3.5" />}
                                            {a.name}
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${selected ? 'bg-indigo-700 text-indigo-100 dark:bg-indigo-600 dark:text-indigo-100' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                                                {new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL', maximumFractionDigits: 0}).format(a.current_balance)}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="text-[10px] text-slate-400 mt-3 font-medium">O cálculo ao lado vai considerar a soma do saldo das contas selecionadas e adicionar/subtrair os lançamentos (ou os marcados se houver seleção).</p>
                        </div>

                        {simulationAccountIds.length > 0 ? (
                            <div className="w-full grid grid-cols-1 sm:grid-cols-4 gap-3">
                                <div className="bg-white dark:bg-slate-950 p-3 rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm">
                                    <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Saldo Consolidado</div>
                                    <div className="font-black text-slate-700 dark:text-slate-200 text-lg">{new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'}).format(totalSelectedBalance)}</div>
                                </div>
                                <div className="bg-emerald-50 dark:bg-emerald-900/10 p-3 rounded-xl border border-emerald-100 dark:border-emerald-900/30 shadow-sm">
                                    <div className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-500 mb-1 flex items-center gap-1"><ArrowUpCircle className="w-3 h-3"/> {selectedInstallments.length > 0 ? 'Receitas Marcadas' : 'Receitas Pendentes'}</div>
                                    <div className="font-black text-emerald-700 dark:text-emerald-400 text-lg">+ {new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'}).format(projectedReceivables)}</div>
                                </div>
                                <div className="bg-rose-50 dark:bg-rose-900/10 p-3 rounded-xl border border-rose-100 dark:border-rose-900/30 shadow-sm">
                                    <div className="text-[10px] uppercase font-bold text-rose-600 dark:text-rose-500 mb-1 flex items-center gap-1"><ArrowDownCircle className="w-3 h-3"/> {selectedInstallments.length > 0 ? 'Despesas Marcadas' : 'Despesas Pendentes'}</div>
                                    <div className="font-black text-rose-700 dark:text-rose-400 text-lg">- {new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'}).format(projectedPayables)}</div>
                                </div>
                                <div className={`p-3 rounded-xl border shadow-sm ${projectedBalance >= 0 ? 'bg-indigo-50 border-indigo-100 dark:bg-indigo-900/20 dark:border-indigo-800' : 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'}`}>
                                    <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 mb-1">Saldo Projetado</div>
                                    <div className={`font-black text-xl ${projectedBalance >= 0 ? 'text-indigo-700 dark:text-indigo-400' : 'text-red-700 dark:text-red-400'}`}>
                                        {new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'}).format(projectedBalance)}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="w-full flex items-center justify-center p-6 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-800/30">
                                <span className="text-sm font-medium text-slate-400">Selecione uma ou mais contas para ver a projeção.</span>
                            </div>
                        )}
                    </div>
                </div>
            )}


            {activeTab === 'LIST' && (
                <div className="space-y-4">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
                            <form onSubmit={(e) => { e.preventDefault(); handleSearch(); }} className="flex flex-wrap items-center gap-3 w-full">
                                <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 h-11 shadow-sm shrink-0">
                                    <Hash className="w-4 h-4 text-slate-400 mr-2"/>
                                    <input type="text" placeholder="ID Fatura" value={installmentIdFilter} onChange={e=>setInstallmentIdFilter(e.target.value)} className="bg-transparent text-sm outline-none w-20 font-medium placeholder-slate-400 text-slate-700 dark:text-slate-300" />
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <input type="text" placeholder="Ordem de Serviço (Ex: OS #39)" value={searchFilter} onChange={e=>setSearchFilter(e.target.value)} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 h-11 shadow-sm text-sm outline-none font-medium placeholder-slate-400 text-slate-700 dark:text-slate-300 w-52" />
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <input type="text" placeholder="Nº Pedido" value={orderIdFilter} onChange={e=>setOrderIdFilter(e.target.value)} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 h-11 shadow-sm text-sm outline-none font-medium placeholder-slate-400 text-slate-700 dark:text-slate-300 w-28" />
                                </div>
                                
                                <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 h-11 shadow-sm shrink-0">
                                    <span className="text-sm font-medium text-slate-500 mr-3 border-r border-slate-200 dark:border-slate-700 pr-3">Vencimento</span>
                                    <input type="date" title="Data Inicial" value={startDate} onChange={e=>setStartDate(e.target.value)} className="bg-transparent text-sm font-medium outline-none w-[115px] text-slate-700 dark:text-slate-300" />
                                    <span className="text-slate-400 mx-2">-</span>
                                    <input type="date" title="Data Final" value={endDate} onChange={e=>setEndDate(e.target.value)} className="bg-transparent text-sm font-medium outline-none w-[115px] text-slate-700 dark:text-slate-300" />
                                </div>
                                
                                <select value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value)} className="w-full sm:w-auto min-w-[120px] px-3 h-11 border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 font-bold rounded-xl text-sm outline-none shrink-0 shadow-sm">
                                    <option value="">Todas</option>
                                    <option value="PENDING">A vencer</option>
                                    <option value="OVERDUE">Vencidas</option>
                                    <option value="CANCELLED">Canceladas</option>
                                </select>
                                
                                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl shadow-sm shrink-0 w-full sm:w-auto overflow-x-auto gap-1">
                                    <button 
                                        type="button"
                                        onClick={() => setTypes({...types, receivable: !types.receivable})}
                                        className={`px-4 py-2 text-sm font-black rounded-lg transition-all flex-1 text-center whitespace-nowrap border ${types.receivable ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-sm border-emerald-200 dark:border-emerald-900/50 ring-1 ring-emerald-500/20' : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'}`}
                                    >
                                        RECEITAS
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => setTypes({...types, payable: !types.payable})}
                                        className={`px-4 py-2 text-sm font-black rounded-lg transition-all flex-1 text-center whitespace-nowrap border ${types.payable ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 shadow-sm border-rose-200 dark:border-rose-900/50 ring-1 ring-rose-500/20' : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'}`}
                                    >
                                        DESPESAS
                                    </button>
                                </div>

                                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl shadow-sm shrink-0 w-full sm:w-auto overflow-x-auto gap-1">
                                    <button 
                                        type="button"
                                        onClick={() => setViewScope('MANAGEMENT')}
                                        className={`px-3 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap border ${viewScope === 'MANAGEMENT' ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm border-slate-200 dark:border-slate-700 font-black' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
                                        title="Oculta despesas de contas pessoais e movimentações marcadas fora de relatórios"
                                    >
                                        🏢 Empresa
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => setViewScope('ALL')}
                                        className={`px-3 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap border ${viewScope === 'ALL' ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm border-slate-200 dark:border-slate-700 font-black' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
                                        title="Exibe todos os lançamentos e contas"
                                    >
                                        🌐 Todas
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => setViewScope('PERSONAL')}
                                        className={`px-3 py-2 text-xs font-bold rounded-lg transition-all whitespace-nowrap border ${viewScope === 'PERSONAL' ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-sm border-slate-200 dark:border-slate-700 font-black' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
                                        title="Exibe apenas lançamentos de contas físicas e despesas desconsideradas"
                                    >
                                        👤 Pessoais
                                    </button>
                                </div>
                                
                                <div className="w-full sm:w-auto min-w-[220px] shrink-0 h-11">
                                    <CustomerAutocomplete 
                                        value={customerFilter}
                                        onChange={(id) => setCustomerFilter(id)}
                                        placeholder="Cliente / Fornecedor"
                                        className="h-full [&>div:first-of-type]:h-full [&>div:first-of-type]:py-0 [&>div:first-of-type]:rounded-xl"
                                    />
                                </div>
                                
                                <button type="submit" className="px-6 h-11 bg-[var(--color-primary-base)] text-white font-bold rounded-xl hover:opacity-90 transition flex items-center justify-center gap-2 text-sm shadow-sm w-full sm:w-auto md:ml-auto shrink-0">
                                    <Search className="w-4 h-4" /> Buscar
                                </button>
                            </form>
                    </div>

                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                        <div className="overflow-x-auto min-h-[400px]">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold uppercase text-xs">
                                    <tr>
                                        <th className="px-4 py-4 w-10 text-center">
                                            <input 
                                                type="checkbox" 
                                                checked={installments.length > 0 && selectedInstallments.length === installments.length}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setSelectedInstallments(installments.map(i => i.id));
                                                    } else {
                                                        setSelectedInstallments([]);
                                                    }
                                                }}
                                                className="w-4 h-4 rounded border-slate-350 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                            />
                                        </th>
                                        <th className="px-6 py-4 w-12"><span className="sr-only">Tipo</span></th>
                                        <th className="px-6 py-4">#ID</th>
                                        <th className="px-6 py-4">Vencimento</th>
                                        <th className="px-6 py-4">Detalhes</th>
                                        <th className="px-6 py-4">Entidade e Pgto.</th>
                                        <th className="px-6 py-4 font-semibold text-right">Valor</th>
                                        <th className="px-6 py-4 font-semibold text-center">Status</th>
                                        <th className="px-6 py-4 font-semibold text-right">Ação</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan={9} className="text-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-primary-base)] mx-auto"></div></td></tr>
                                    ) : installments.length === 0 ? (
                                        <tr><td colSpan={9} className="text-center py-12 text-slate-500">Nenhum título encontrado.</td></tr>
                                    ) : (
                                        installments.map(inst => {
                                            const isReceivable = inst.type === 'RECEIVABLE';
                                            const isSelected = selectedInstallments.includes(inst.id);
                                            return (
                                            <tr key={inst.id} className={`border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors ${isSelected ? 'bg-indigo-50/30 dark:bg-indigo-950/10' : ''}`}>
                                                <td className="px-4 py-4 text-center">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={isSelected}
                                                        onChange={() => {
                                                            if (isSelected) {
                                                                setSelectedInstallments(selectedInstallments.filter(id => id !== inst.id));
                                                            } else {
                                                                setSelectedInstallments([...selectedInstallments, inst.id]);
                                                            }
                                                        }}
                                                        className="w-4 h-4 rounded border-slate-355 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                                    />
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isReceivable ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400' : 'bg-rose-100 text-rose-600 dark:bg-rose-900/50 dark:text-rose-400'}`}>
                                                        {isReceivable ? <ArrowUpCircle className="w-5 h-5" /> : <ArrowDownCircle className="w-5 h-5" />}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 font-bold text-slate-400 dark:text-slate-500 text-xs">
                                                    <div className="flex items-center gap-2">
                                                        <span>#{inst.transaction_id}</span>
                                                        {inst.email_sent_at && (
                                                            <div className="text-emerald-500 dark:text-emerald-400" title={`E-mail enviado em: ${new Date(inst.email_sent_at).toLocaleString('pt-BR')}`}>
                                                                <Mail className="w-4 h-4" />
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 font-medium text-slate-900 dark:text-white whitespace-nowrap">
                                                    <div>{new Date(inst.due_date).toLocaleDateString('pt-BR', {timeZone: 'UTC'})}</div>
                                                    {inst.status === 'PENDING' && inst.due_date < new Date().toISOString().split('T')[0] && (
                                                        <div className="text-[10px] uppercase font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-900/50 px-1.5 py-0.5 rounded w-fit mt-1 flex items-center gap-1">
                                                            <AlertCircle className="w-3 h-3" /> Vencido
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <Link href={`/financial/transactions/${inst.transaction_id}`} className="font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 max-w-[200px] truncate block" title={inst.description}>
                                                        {inst.description}
                                                    </Link>
                                                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                                        <span className="text-[10px] font-mono bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 rounded px-1.5 py-0.5 w-fit">{inst.category_name}</span>
                                                        {inst.account_is_personal && (
                                                            <span className="text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 rounded px-1.5 py-0.5 flex items-center gap-0.5" title="Conta bancária física/pessoal">
                                                                👤 Conta PF
                                                            </span>
                                                        )}
                                                        {inst.exclude_from_reports && (
                                                            <span className="text-[10px] font-semibold bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 rounded px-1.5 py-0.5 flex items-center gap-0.5" title="Desconsiderado das análises gerenciais da empresa">
                                                                🚫 Fora da Análise
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="font-medium text-slate-700 dark:text-slate-200 max-w-[150px] truncate" title={inst.customer_name || 'N/A'}>
                                                        {inst.customer_id ? (
                                                            <Link href={`/customers/${inst.customer_id}`} className="hover:text-[var(--color-primary-base)] hover:underline">
                                                                {inst.customer_name}
                                                            </Link>
                                                        ) : (
                                                            inst.customer_name || <span className="text-slate-400 italic">Sem Entidade</span>
                                                        )}
                                                    </div>
                                                    {inst.status === 'PAID' && inst.payment_date && (
                                                        <div className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mt-1">
                                                            <CheckCircle className="w-3 h-3" /> Pago em {new Date(inst.payment_date).toLocaleDateString('pt-BR')}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-right font-bold text-slate-900 dark:text-white">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL'}).format(inst.amount)}</td>
                                                <td className="px-6 py-4 text-center">
                                                    <div className="flex flex-col items-center justify-center gap-1">
                                                        <span className={`px-2 py-1 text-[10px] uppercase font-black rounded ${inst.status === 'PAID' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : inst.status === 'OVERDUE' ? 'bg-rose-100 text-rose-700 border border-rose-200' : inst.status === 'CANCELLED' ? 'bg-slate-200 text-slate-500 border border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700' : 'bg-amber-100 text-amber-700 border border-amber-200'}`}>
                                                            {inst.status === 'PAID' ? 'PAGO' : inst.status === 'OVERDUE' ? 'ATRASO' : inst.status === 'CANCELLED' ? 'CANCELADO' : 'PENDENTE'}
                                                        </span>
                                                        {inst.total_installments > 1 ? (
                                                            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                                                P. {inst.number}/{inst.total_installments}
                                                            </div>
                                                        ) : (
                                                            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                                                                À vista
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        {(inst.bank_slip_nosso_numero || inst.bank_slip_pdf) ? (
                                                            <a href={inst.bank_slip_nosso_numero ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/installments/${inst.id}/bank-slip-pdf` : inst.bank_slip_pdf} target="_blank" rel="noopener noreferrer" className="p-1.5 ml-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 rounded-lg transition shrink-0" title="Visualizar Boleto PDF Banco Inter">
                                                                <FileText className="w-4 h-4"/>
                                                            </a>
                                                        ) : (
                                                            inst.status !== 'PAID' && inst.status !== 'CANCELLED' && isReceivable && inst.inter_enabled && (
                                                                <button onClick={() => window.confirm("Deseja emitir boleto pelo Banco Inter para esta parcela?") && handleIssueInterSlip(inst.id)} className="p-1.5 ml-1 bg-slate-100 hover:bg-orange-100 dark:bg-slate-800 dark:hover:bg-orange-900/30 text-slate-500 hover:text-orange-600 dark:hover:text-orange-400 rounded-lg transition shrink-0" title="Gerar Boleto Banco Inter">
                                                                    <QrCode className="w-4 h-4"/>
                                                                </button>
                                                            )
                                                        )}
                                                        <button 
                                                            onClick={() => handleToggleExclude(inst.id)} 
                                                            className={`p-1.5 rounded-lg transition shrink-0 ${inst.exclude_from_reports ? 'text-amber-600 bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:hover:bg-amber-900/40' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'}`} 
                                                            title={inst.exclude_from_reports ? "Desconsiderado das análises gerenciais da empresa. Clique para INCLUIR." : "Incluído nas análises gerenciais da empresa. Clique para DESCONSIDERAR (Gasto Pessoal/Ignorar)."}
                                                        >
                                                            {inst.exclude_from_reports ? <EyeOff className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
                                                        </button>
                                                        {inst.status !== 'PAID' && inst.status !== 'CANCELLED' && (
                                                            <button onClick={()=>{
                                                                setPayData({inst_id: inst.id, account_id: inst.account_id || '', amount: inst.amount, editMode: false, payment_date: new Date().toISOString().split('T')[0], category_id: inst.category_id || ''});
                                                                setIsPayModalOpen(true);
                                                            }} className="text-xs bg-[var(--color-primary-base)]/10 text-[var(--color-primary-base)] hover:bg-[var(--color-primary-base)] font-semibold hover:text-white transition px-3 py-1.5 rounded-lg flex items-center gap-1 ml-auto">
                                                                <CheckCircle className="w-3.5 h-3.5"/> Baixar
                                                            </button>
                                                        )}
                                                        {inst.status === 'PAID' && !inst.is_conciliated && (
                                                            <button onClick={()=>{
                                                                setPayData({
                                                                     inst_id: inst.id, 
                                                                    account_id: inst.account_id || '', 
                                                                    amount: inst.amount, 
                                                                    editMode: true,
                                                                    payment_date: inst.payment_date ? new Date(inst.payment_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                                                                    category_id: inst.category_id || ''
                                                                });
                                                                setIsPayModalOpen(true);
                                                            }} className="p-1.5 text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/20 rounded-lg transition shrink-0" title="Editar informações da Baixa / Pagamento">
                                                                <Pencil className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                        {inst.status !== 'PAID' && inst.status !== 'CANCELLED' && (
                                                            <button onClick={()=>{
                                                                setDeleteData({ inst_id: inst.id, isRecurring: inst.total_installments > 1 || inst.is_fixed, deleteFuture: false });
                                                                setIsDeleteModalOpen(true);
                                                            }} className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/20 rounded-lg transition shrink-0" title="Excluir Lançamento">
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                        <Link href={`/financial/transactions/${inst.transaction_id}`} className="p-1.5 text-slate-400 hover:text-[var(--color-primary-base)] hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition shrink-0" title="Ver Detalhes do Contrato e Parcelas Associadas">
                                                            <Eye className="w-4 h-4" />
                                                        </Link>
                                                    </div>
                                                </td>
                                            </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                        
                        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex flex-col md:flex-row items-center justify-between gap-4">
                            <div className="text-sm text-slate-500 font-medium">
                                Mostrando <span className="font-bold text-slate-900 dark:text-white">{Math.min((page - 1) * pageSize + 1, total)}</span> até <span className="font-bold text-slate-900 dark:text-white">{Math.min(page * pageSize, total)}</span> de <span className="font-bold text-slate-900 dark:text-white">{total}</span> registros
                            </div>
                            <div className="flex gap-2">
                                <button disabled={page === 1} onClick={() => setPage(page - 1)} className="p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition">
                                    <ChevronLeft className="w-4 h-4"/>
                                </button>
                                <button disabled={page * pageSize >= total} onClick={() => setPage(page + 1)} className="p-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition">
                                    <ChevronRight className="w-4 h-4"/>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'CASHFLOW' && (
                <div className="bg-slate-50 border border-slate-200 dark:bg-slate-900/50 dark:border-slate-800 rounded-3xl p-6 shadow-sm overflow-hidden min-h-[500px]">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2 mb-6">
                        <TrendingUp className="text-[var(--color-primary-base)] w-5 h-5"/> Visão 180 Dias Previsto x Custo
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end min-h-[300px]">
                        {cashflow.map((m, idx) => {
                            const barReceitaH = (m.Receitas / maxChartValue) * 100;
                            const barDespesaH = (m.Despesas / maxChartValue) * 100;
                            const barProspH = (m.Prospeccoes / maxChartValue) * 100;
                            return (
                                <div key={idx} className="flex flex-col flex-1 bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 h-full shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                                    <div className="flex-1 flex items-end gap-1 mb-4 h-48">
                                        <div className="w-1/2 bg-emerald-400 rounded-t-md relative flex items-end opacity-90 hover:opacity-100 transition-all group-hover:bg-emerald-500" style={{height: `${Math.max(barReceitaH, 5)}%`}}></div>
                                        <div className="w-1/2 flex flex-col justify-end gap-[1px]">
                                             <div className="w-full bg-slate-300 dark:bg-slate-700 rounded-t-sm opacity-60" style={{height: `${barProspH}%`}} title="Prospecção (Previsão Custos)"></div>
                                             <div className="w-full bg-rose-400 rounded-t-sm" style={{height: `${Math.max(barDespesaH, 2)}%`}} title="Despesa Consolidada"></div>
                                        </div>
                                    </div>
                                    <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2 truncate">{m.name}</p>
                                        <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mb-0.5">Entradas: {new Intl.NumberFormat('pt-BR', { notation: 'compact' }).format(m.Receitas)}</p>
                                        <p className="text-[10px] text-rose-600 dark:text-rose-400 font-bold mb-1">Saídas+Prosp: {new Intl.NumberFormat('pt-BR', { notation: 'compact' }).format(m.Despesas + m.Prospeccoes)}</p>
                                        <div className={`text-xs font-bold px-2 py-1 rounded ${m["Saldo com Prosp."] >= 0 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                                           Saldo: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency:'BRL' }).format(m["Saldo com Prosp."])}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* NEW TRANSACTION MODAL  */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm shadow-2xl">
                    <div className="bg-white dark:bg-slate-950 rounded-3xl max-w-4xl w-full flex flex-col max-h-[90vh] overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800">
                        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <DollarSign className="w-6 h-6 text-[var(--color-primary-base)]"/> 
                                Lançamentos de Receitas / Despesas
                            </h2>
                            <button onClick={()=>setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto flex-1 bg-white dark:bg-slate-950 custom-scrollbar">
                           <form id="financial-form" onSubmit={handleCreateTransaction} className="space-y-6">
                               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    <div className="col-span-full md:col-span-2">
                                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Descrição</label>
                                        <input required value={formData.description} onChange={(e)=>setFormData({...formData, description: e.target.value})} className="w-full px-4 py-2.5 border rounded-xl dark:bg-slate-900 dark:border-slate-800 text-sm focus:ring-2 focus:ring-[var(--color-primary-base)]/20" placeholder="Ex: Compra de Computadores / Mensalidade Servidor"/>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Situação / Risco</label>
                                        <select required value={formData.transaction_status} onChange={(e)=>setFormData({...formData, transaction_status: e.target.value})} className="w-full px-4 py-2.5 border rounded-xl dark:bg-slate-900 dark:border-slate-800 text-sm font-medium bg-amber-50/50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-500">
                                            <option value="CONFIRMADO">Consolidado / Confirmado</option>
                                            <option value="PROSPECCAO">Prospecção / Sem Certeza</option>
                                        </select>
                                    </div>
                                    
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Natureza</label>
                                        <select required value={formData.type} onChange={(e)=>setFormData({...formData, type: e.target.value})} className="w-full px-4 py-2.5 border rounded-xl dark:bg-slate-900 dark:border-slate-800 text-sm font-semibold">
                                            <option value="PAYABLE">Despesa (Saída)</option>
                                            <option value="RECEIVABLE">Receita (Entrada)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Categoria</label>
                                        <select required value={formData.category_id} onChange={(e)=>setFormData({...formData, category_id: e.target.value})} className="w-full px-4 py-2.5 border rounded-xl dark:bg-slate-900 dark:border-slate-800 text-sm">
                                            <option value="">Selecione...</option>
                                            {categories
                                                .filter(c => c.type === formData.type)
                                                .map(c => ({...c, hierarchy: getCategoryHierarchyName(c, categories)}))
                                                .sort((a, b) => a.hierarchy.localeCompare(b.hierarchy))
                                                .map(cat => (
                                                <option key={cat.id} value={cat.id}>{cat.hierarchy}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Nome Cliente / Fornecedor <span className="text-rose-500">*</span></label>
                                        <CustomerAutocomplete 
                                            value={formData.customer_id}
                                            onChange={(id) => {
                                                setFormData({
                                                    ...formData,
                                                    customer_id: id,
                                                    order_id: ''
                                                });
                                            }}
                                            required
                                        />
                                    </div>
                                    {formData.customer_id && customerOrders.length > 0 && (
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Pedido Associado</label>
                                        <select value={formData.order_id} onChange={(e)=>setFormData({...formData, order_id: e.target.value})} className="w-full px-4 py-2.5 border rounded-xl dark:bg-slate-900 dark:border-slate-800 text-sm bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-800 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/50">
                                            <option value="">(Nenhum Pedido)</option>
                                            {customerOrders.map(o => (
                                                <option key={o.id} value={o.id}>
                                                    Pedido #{o.id} - {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(o.total || 0)}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    )}

                                    {/* Card de Agrupamento / Soma Mensal com Lançamentos Previstos */}
                                    {formData.customer_id && pendingCustomerInstallments && pendingCustomerInstallments.length > 0 && (
                                        <div className="col-span-full bg-gradient-to-br from-amber-50/80 to-indigo-50/50 dark:from-amber-950/20 dark:to-indigo-950/20 border border-amber-200 dark:border-amber-800/60 rounded-2xl p-3.5 space-y-3">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-2">
                                                    <input 
                                                        type="checkbox" 
                                                        id="merge-financial-with-existing" 
                                                        checked={mergeWithExisting} 
                                                        onChange={(e) => {
                                                            const checked = e.target.checked;
                                                            setMergeWithExisting(checked);
                                                            if (checked) {
                                                                setSelectedTargetInstallmentIds(pendingCustomerInstallments.map((it: any) => it.id));
                                                            } else {
                                                                setSelectedTargetInstallmentIds([]);
                                                            }
                                                        }} 
                                                        className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                                                    />
                                                    <label htmlFor="merge-financial-with-existing" className="text-xs font-bold text-amber-900 dark:text-amber-300 cursor-pointer flex items-center gap-1.5">
                                                        <Layers className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                                        Somar mês a mês com as parcelas já previstas deste contato ({pendingCustomerInstallments.length})?
                                                    </label>
                                                </div>

                                                {mergeWithExisting && (
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => setSelectedTargetInstallmentIds(pendingCustomerInstallments.map((it: any) => it.id))}
                                                            className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                                                        >
                                                            Marcar Todas
                                                        </button>
                                                        <span className="text-slate-300 dark:text-slate-700 text-xs">|</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => setSelectedTargetInstallmentIds([])}
                                                            className="text-[10px] font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                                                        >
                                                            Limpar
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            {mergeWithExisting && (
                                                <div className="pt-1 space-y-2">
                                                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 dark:text-slate-400 px-0.5">
                                                        <span>Parcelas que receberão a soma nos mesmos meses:</span>
                                                        <span className="text-indigo-600 dark:text-indigo-400 font-black">
                                                            {selectedTargetInstallmentIds.length} de {pendingCustomerInstallments.length} selecionada(s)
                                                        </span>
                                                    </div>

                                                    <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                                                        {pendingCustomerInstallments.map((it: any) => {
                                                            const isChecked = selectedTargetInstallmentIds.includes(it.id);
                                                            return (
                                                                <div
                                                                    key={it.id}
                                                                    onClick={() => {
                                                                        if (isChecked) {
                                                                            setSelectedTargetInstallmentIds(selectedTargetInstallmentIds.filter(id => id !== it.id));
                                                                        } else {
                                                                            setSelectedTargetInstallmentIds([...selectedTargetInstallmentIds, it.id]);
                                                                        }
                                                                    }}
                                                                    className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 text-xs ${
                                                                        isChecked
                                                                            ? 'bg-indigo-50/70 border-indigo-300 dark:bg-indigo-950/40 dark:border-indigo-700 shadow-sm'
                                                                            : 'bg-white/80 dark:bg-slate-900 border-slate-200 dark:border-slate-800 opacity-70 hover:opacity-100'
                                                                    }`}
                                                                >
                                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={isChecked}
                                                                            onChange={() => {}}
                                                                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer pointer-events-none"
                                                                        />
                                                                        <div className="truncate">
                                                                            <div className="flex items-center gap-1.5">
                                                                                <span className="font-black text-indigo-700 dark:text-indigo-400">
                                                                                    #{it.id}
                                                                                </span>
                                                                                <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                                                                                    {it.transaction?.description || it.description || 'Lançamento'}
                                                                                </span>
                                                                            </div>
                                                                            <div className="text-[10px] text-slate-500 truncate mt-0.5">
                                                                                Venc: {it.due_date ? new Date(it.due_date + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <div className="text-right flex-shrink-0">
                                                                        <div className="font-bold text-slate-900 dark:text-white">
                                                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency:'BRL' }).format(it.amount)}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>

                                                    <div className="p-2.5 rounded-xl bg-amber-100/70 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-950 dark:text-amber-200 space-y-1">
                                                        <p className="font-medium text-slate-700 dark:text-slate-300">
                                                            • O valor de cada parcela deste novo lançamento será somado diretamente na parcela correspondente do mesmo mês/ano.<br/>
                                                            • Se o novo contrato/lançamento contemplar meses excedentes, novas parcelas serão geradas automaticamente para esses meses.
                                                        </p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Conta Financeira Base</label>
                                        <select 
                                            value={formData.account_id} 
                                            onChange={(e) => {
                                                const accId = e.target.value;
                                                const selectedAcc = accounts.find(a => String(a.id) === accId);
                                                setFormData({
                                                    ...formData, 
                                                    account_id: accId,
                                                    exclude_from_reports: selectedAcc?.is_personal ? true : formData.exclude_from_reports
                                                });
                                            }} 
                                            className="w-full px-4 py-2.5 border rounded-xl dark:bg-slate-900 dark:border-slate-800 text-sm"
                                        >
                                            <option value="">(Opcional) Nenhuma Conta</option>
                                            {accounts.map(acc => (
                                                <option key={acc.id} value={acc.id}>
                                                    {acc.name} ({acc.is_personal ? '👤 Pessoal' : '🏢 Empresa'}) - {acc.type === 'CREDIT_CARD' ? 'Cartão' : acc.type === 'WALLET' ? 'Caixa' : 'Conta'}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">{formData.is_fixed ? 'Valor Mensal (R$)' : 'Valor Total (R$)'}</label>
                                        <input required type="text" value={formData.total_amount} onChange={handleCurrencyChange} className="w-full px-4 py-2.5 border rounded-xl dark:bg-slate-900 dark:border-slate-800 text-sm" placeholder="0,00"/>
                                    </div>
                                    
                                    <div className={`${formData.is_fixed ? 'col-span-full lg:col-span-2' : 'col-span-1'} flex flex-col justify-end pb-2`}>
                                        <div className="flex flex-col sm:flex-row gap-4 w-full">
                                            <label className="flex-1 flex items-center gap-3 cursor-pointer p-2.5 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                                                <input type="checkbox" className="w-5 h-5 rounded text-[var(--color-primary-base)]" checked={formData.is_fixed} onChange={(e)=>setFormData({...formData, is_fixed: e.target.checked, keep_fixed_day: e.target.checked ? formData.keep_fixed_day : false})} />
                                                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Recorrente</span>
                                            </label>
                                            {formData.is_fixed && (
                                                <label className="flex-1 flex items-center gap-3 cursor-pointer p-2.5 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition animate-fade-in">
                                                    <input type="checkbox" className="w-5 h-5 rounded text-[var(--color-primary-base)]" checked={formData.keep_fixed_day} onChange={(e)=>setFormData({...formData, keep_fixed_day: e.target.checked})} />
                                                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Fixar dia do mês</span>
                                                </label>
                                            )}
                                        </div>
                                    </div>

                                    <div className="col-span-full">
                                        <label className="flex items-start gap-3 cursor-pointer p-3 border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-950/30 transition">
                                            <input 
                                                type="checkbox" 
                                                className="w-5 h-5 mt-0.5 rounded text-amber-600 focus:ring-amber-500" 
                                                checked={formData.exclude_from_reports} 
                                                onChange={(e)=>setFormData({...formData, exclude_from_reports: e.target.checked})} 
                                            />
                                            <div>
                                                <span className="text-sm font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                                                    🚫 Desconsiderar das Análises Gerenciais da Empresa
                                                </span>
                                                <span className="text-xs text-amber-700 dark:text-amber-400 block mt-0.5">
                                                    Marque para despesas/receitas pessoais (PF) ou movimentações que não devem compor o DRE, faturamento real ou fluxo de caixa empresarial.
                                                </span>
                                            </div>
                                        </label>
                                    </div>
                                    
                                    {(() => {
                                        if (!formData.order_id || !formData.total_amount) return null;
                                        const rawAmount = formData.total_amount.replace(/\./g, "").replace(",", ".");
                                        if (isNaN(Number(rawAmount))) return null;
                                        let final_total = parseFloat(rawAmount);
                                        const selectedOrder = customerOrders.find(o => o.id === parseInt(formData.order_id));
                                        if (selectedOrder) {
                                            let final_count = 1;
                                            if (formData.is_fixed) {
                                                const [y, m, d] = (formData.first_due_date || formData.issue_date).split('-');
                                                const issue = new Date(parseInt(y), parseInt(m) - 1, parseInt(d), 12, 0, 0);
                                                const [ey, em, ed] = formData.recurrence_end_date.split('-');
                                                const endd = new Date(parseInt(ey), parseInt(em) - 1, parseInt(ed), 12, 0, 0);
                                                let mo = (endd.getFullYear() - issue.getFullYear()) * 12 + (endd.getMonth() - issue.getMonth()) + 1;
                                                final_count = mo < 1 ? 1 : mo;
                                            }
                                            final_total = final_total * final_count;
                                            if (final_total <= selectedOrder.total) return null;

                                            const diff = final_total - selectedOrder.total;
                                            const diffFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(diff);
                                            const orderFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedOrder.total);
                                            const totalFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(final_total);
                                            return (
                                                <div className="col-span-full bg-rose-50 border border-rose-200 text-rose-700 text-[13.5px] px-4 py-3 rounded-xl dark:bg-rose-950/30 dark:border-rose-900/50 dark:text-rose-400 flex items-start gap-2.5 shadow-sm">
                                                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                                    <p>
                                                        <strong>Atenção:</strong> O valor financeiro total estimado ({totalFmt}) ultrapassa o original do pedido ({orderFmt}). 
                                                        Diferença de <strong>+{diffFmt}</strong>!
                                                    </p>
                                                </div>
                                            );
                                        }
                                        return null;
                                    })()}

                                    <div className="col-span-full border-t border-slate-100 dark:border-slate-800 pt-4 mt-2">
                                        <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-4">Cronograma de Pagtos</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                            <div>
                                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1 text-slate-500">Data Base (Emissão/Fato)</label>
                                                <input required type="date" value={formData.issue_date} onChange={(e)=>setFormData({...formData, issue_date: e.target.value})} className="w-full px-4 py-2 border rounded-xl dark:bg-slate-900 dark:border-slate-800 text-sm opacity-80" />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">1º Vencimento (Início)</label>
                                                <input required type="date" value={formData.first_due_date} onChange={(e)=>setFormData({...formData, first_due_date: e.target.value})} className="w-full px-4 py-2 border border-[var(--color-primary-base)]/50 rounded-xl dark:bg-slate-900 text-sm ring-1 ring-[var(--color-primary-base)]/10" />
                                            </div>
                                            {formData.is_fixed ? (
                                                <div>
                                                    <label className="block text-sm font-semibold text-rose-600 dark:text-rose-400 mb-1">Fim da Recorrência (Data)</label>
                                                    <input required type="date" value={formData.recurrence_end_date} onChange={(e)=>setFormData({...formData, recurrence_end_date: e.target.value})} className="w-full px-4 py-2 border rounded-xl dark:bg-slate-900 border-rose-200 dark:border-rose-900/50 text-sm font-bold text-rose-600 dark:text-rose-400" />
                                                </div>
                                            ) : (
                                                <div>
                                                    <label className="block text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">A dividir em (Nº Parcs)</label>
                                                    <input required type="number" min="1" max="60" value={formData.installments_count} onChange={(e)=>setFormData({...formData, installments_count: e.target.value})} className="w-full px-4 py-2 border rounded-xl dark:bg-slate-900 dark:border-slate-800 text-sm font-bold" placeholder="1"/>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                               </div>
                           </form>

                           {/* JS MAGIC PREVIEW TABLE */}
                           {preview.length > 0 && (
                                <div className="mt-8 border border-indigo-100 bg-indigo-50/50 dark:bg-indigo-950/20 dark:border-indigo-900/50 rounded-2xl p-5 mb-2 relative overflow-hidden">
                                     <div className="absolute top-0 right-0 p-3">
                                        <span className={`text-[10px] uppercase font-black tracking-widest px-2 py-1 rounded-full ${formData.transaction_status === 'PROSPECCAO' ? 'bg-amber-100 text-amber-600' : 'text-[var(--color-primary-base)] bg-[var(--color-primary-base)]/10'}`}>
                                            {formData.transaction_status === 'PROSPECCAO' ? 'Previsto' : 'Confirmado'}
                                        </span>
                                     </div>
                                     <h3 className="text-sm font-bold text-slate-800 dark:text-indigo-100 flex items-center gap-2 mb-4">
                                         Projeção Automática de Vencimentos
                                     </h3>
                                     <div className="max-h-48 overflow-y-auto no-scrollbar rounded-xl border border-indigo-100 dark:border-indigo-900/50">
                                         <table className="w-full text-xs text-left">
                                             <thead className="bg-white dark:bg-slate-900 text-slate-500 font-semibold sticky top-0 border-b border-indigo-100 dark:border-indigo-900/50">
                                                 <tr>
                                                     <th className="px-4 py-2">Parcela</th>
                                                     <th className="px-4 py-2">Data Vencimento</th>
                                                     <th className="px-4 py-2 text-right">Valor Projetado</th>
                                                 </tr>
                                             </thead>
                                             <tbody>
                                                 {preview.map((p, idx) => (
                                                     <tr key={idx} className="border-b border-indigo-50 dark:border-indigo-900/30 bg-indigo-50/20 dark:bg-transparent">
                                                         <td className="px-4 py-2 font-mono text-slate-600 dark:text-slate-300">{p.number}/{preview.length}</td>
                                                         <td className="px-4 py-2 font-medium text-slate-700 dark:text-slate-200">{new Date(p.due + "T12:00:00").toLocaleDateString('pt-BR')} {formData.keep_fixed_day ? '(Mensal/Dia Fixo)' : '(Interv: 30d)'}</td>
                                                         <td className="px-4 py-2 font-bold text-right text-indigo-700 dark:text-indigo-400">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL'}).format(p.amount)}</td>
                                                     </tr>
                                                 ))}
                                             </tbody>
                                         </table>
                                     </div>
                                </div>
                           )}
                        </div>
                        
                        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-3 rounded-b-3xl">
                            <button type="button" onClick={()=>setIsModalOpen(false)} className="px-5 py-2 font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition dark:text-slate-300 dark:hover:bg-slate-800">
                                Cancelar
                            </button>
                            <button type="submit" form="financial-form" className="px-6 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl shadow-sm transition">
                                Salvar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* PAY / BAIXA MODAL */}
            {isPayModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md shadow-2xl">
                    <div className="bg-white dark:bg-slate-950 rounded-3xl max-w-sm w-full shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Conciliar Parcela</h2>
                            <button onClick={()=>setIsPayModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
                        </div>
                        <form onSubmit={confirmPay} className="p-6 space-y-4">
                            <div className="text-center mb-6">
                                <p className="text-sm font-semibold text-slate-500 mb-1">Valor do Título/Parcela</p>
                                <CurrencyInput
                                    value={payData.amount}
                                    onChangeValue={(val) => setPayData({...payData, amount: val})}
                                    className="w-full text-center text-3xl font-black text-slate-900 dark:text-white bg-transparent border-0 border-b-2 border-slate-200 focus:border-indigo-500 focus:ring-0 dark:border-slate-800 dark:focus:border-indigo-400 p-2 mb-2"
                                    prefixStr="R$ "
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Data do Pagamento / Baixa</label>
                                <input type="date" required value={payData.payment_date || ''} onChange={(e)=>setPayData({...payData, payment_date: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl dark:bg-slate-900 dark:border-slate-800 text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 shadow-sm transition mb-4" />
                                
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Conta / Banco Origem (Conciliação)</label>
                                <select required value={payData.account_id} onChange={(e)=>setPayData({...payData, account_id: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl dark:bg-slate-900 dark:border-slate-800 text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 shadow-sm transition">
                                    <option value="" disabled>Por onde (entrou/saiu) esse dinheiro?</option>
                                    {accounts.map(acc => (
                                        <option key={acc.id} value={acc.id}>{acc.name} — {acc.type === 'CREDIT_CARD' ? 'Fatura Cartão' : 'Saldo: '+new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'}).format(acc.current_balance)}</option>
                                    ))}
                                </select>
                                
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 mt-4">(Opcional) Corrigir Categoria</label>
                                <select value={payData.category_id || ''} onChange={(e)=>setPayData({...payData, category_id: e.target.value})} className="w-full px-4 py-3 border border-slate-200 rounded-xl dark:bg-slate-900 dark:border-slate-800 text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 shadow-sm transition mb-2">
                                    <option value="">Manter categoria original...</option>
                                    {categories
                                        .map(c => ({...c, hierarchy: getCategoryHierarchyName(c, categories)}))
                                        .sort((a, b) => a.hierarchy.localeCompare(b.hierarchy))
                                        .map(cat => (
                                        <option key={cat.id} value={cat.id}>{cat.hierarchy} ({cat.type === 'RECEIVABLE' ? 'Receita' : 'Despesa'})</option>
                                    ))}
                                </select>
                            </div>
                            
                            {accounts.length === 0 && (
                                <div className="p-3 bg-rose-50 text-rose-600 rounded-xl text-xs font-semibold mt-2 border border-rose-100">
                                    Erro: Você não possui contas criadas. Crie um Conta/Caixa no painel primeiro.
                                </div>
                            )}

                            <div className="pt-4 mt-2 border-t border-slate-100 dark:border-slate-800">
                                <button type="submit" disabled={accounts.length === 0} className="w-full px-6 py-3 bg-[var(--color-primary-base)] hover:opacity-90 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 transition flex items-center justify-center gap-2">
                                    <CheckCircle className="w-5 h-5" /> Confirmar Baixa 
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* DELETE MODAL */}
            {isDeleteModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-800">
                            <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                <Trash2 className="w-5 h-5 text-rose-500" /> Confirmar Exclusão
                            </h2>
                            <button onClick={()=>setIsDeleteModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition bg-slate-100 dark:bg-slate-800 p-2 rounded-full cursor-pointer">
                                <X className="w-4 h-4"/>
                            </button>
                        </div>
                        <form className="p-6" onSubmit={async (e) => {
                            e.preventDefault();
                            if (!deleteData.inst_id) return;
                            try {
                                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/installments/${deleteData.inst_id}?delete_future=${deleteData.deleteFuture}`, {
                                    method: 'DELETE',
                                    headers: { 'Authorization': `Bearer ${getToken()}` }
                                });
                                if (!res.ok) throw new Error((await res.json()).detail || 'Erro ao excluir parcela.');
                                toast.success('Exclusão realizada com sucesso!');
                                setIsDeleteModalOpen(false);
                                fetchInstallments();
                            } catch(err: any) {
                                toast.error(err.message);
                            }
                        }}>
                            <p className="text-slate-600 dark:text-slate-400 text-sm mb-6 font-medium leading-relaxed">
                                Tem certeza de que deseja excluir este lançamento? Esta ação não pode ser desfeita.
                            </p>

                            {deleteData.isRecurring && (
                                <div className="mb-6 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-3 uppercase tracking-wider">Despesa Recorrente / Parcelada</h4>
                                    <div className="space-y-3">
                                        <label className="flex items-start gap-3 cursor-pointer group">
                                            <div className="flex items-center h-5">
                                                <input type="radio" name="deleteFuture" checked={!deleteData.deleteFuture} onChange={()=>setDeleteData({...deleteData, deleteFuture: false})} className="w-4 h-4 text-[var(--color-primary-base)] focus:ring-[var(--color-primary-base)] dark:bg-slate-700 border-slate-300" />
                                            </div>
                                            <div className="text-sm">
                                                <span className="font-semibold text-slate-800 dark:text-slate-200 block group-hover:text-[var(--color-primary-base)] transition-colors">Apenas este lançamento</span>
                                                <span className="text-slate-500 dark:text-slate-400 text-xs">Mantém as demais parcelas ou meses futuros intactos.</span>
                                            </div>
                                        </label>
                                        <label className="flex items-start gap-3 cursor-pointer group">
                                            <div className="flex items-center h-5">
                                                <input type="radio" name="deleteFuture" checked={deleteData.deleteFuture} onChange={()=>setDeleteData({...deleteData, deleteFuture: true})} className="w-4 h-4 text-rose-500 focus:ring-rose-500 dark:bg-slate-700 border-slate-300" />
                                            </div>
                                            <div className="text-sm">
                                                <span className="font-semibold text-slate-800 dark:text-slate-200 block group-hover:text-rose-500 transition-colors">Excluir este e todos os futuros associados</span>
                                                <span className="text-slate-500 dark:text-slate-400 text-xs">Apaga este lançamento e todo o restante que estiver pendente.</span>
                                            </div>
                                        </label>
                                    </div>
                                </div>
                            )}

                            <div className="pt-2 flex justify-end gap-3">
                                <button type="button" onClick={()=>setIsDeleteModalOpen(false)} className="px-5 py-2.5 text-slate-600 dark:text-slate-300 font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition text-sm">
                                    Cancelar
                                </button>
                                <button type="submit" className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-lg shadow-rose-500/20 transition flex items-center justify-center gap-2 text-sm">
                                    <Trash2 className="w-4 h-4" /> Confirmar Exclusão
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* FLOATING ACTION BAR FOR SELECTED INSTALLMENTS */}
            {selectedInstallments.length > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200 dark:border-slate-800 px-6 py-4 rounded-2xl shadow-2xl flex flex-col md:flex-row items-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                        {selectedInstallments.length} {selectedInstallments.length === 1 ? 'selecionado' : 'selecionados'}
                    </span>
                    <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-800 hidden md:block" />
                    <div className="flex gap-4">
                        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                            Entradas: <span className="font-bold text-emerald-600 dark:text-emerald-500">{new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'}).format(installments.filter(i => selectedInstallments.includes(i.id) && i.type === 'RECEIVABLE').reduce((sum, i) => sum + i.amount, 0))}</span>
                        </div>
                        <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                            Saídas: <span className="font-bold text-rose-600 dark:text-rose-500">{new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'}).format(installments.filter(i => selectedInstallments.includes(i.id) && i.type === 'PAYABLE').reduce((sum, i) => sum + i.amount, 0))}</span>
                        </div>
                    </div>
                    <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-800 hidden md:block" />
                    <div className="flex items-center gap-2">
                        {selectedInstallments.length >= 2 && (
                            <button
                                type="button"
                                onClick={handleOpenGroupModal}
                                className={`px-4 py-2 text-white font-semibold rounded-xl text-sm transition-colors shadow-sm flex items-center gap-1.5 ${canGroup ? 'bg-purple-600 hover:bg-purple-700 cursor-pointer' : 'bg-slate-400 opacity-60 cursor-not-allowed'}`}
                                title={canGroup ? "Agrupar parcelas selecionadas em um único lançamento" : "Para agrupar, selecione ao menos 2 lançamentos pendentes do mesmo cliente e com o mesmo tipo (receitas ou despesas)."}
                            >
                                <Layers className="w-4 h-4" /> Agrupar Lançamentos
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => {
                                setBulkDueDate(new Date().toISOString().split('T')[0]);
                                setIsBulkDateModalOpen(true);
                            }}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm transition-colors shadow-sm flex items-center gap-1.5"
                        >
                            Alterar Vencimento
                        </button>
                        <button
                            type="button"
                            onClick={() => setSelectedInstallments([])}
                            className="p-2 text-slate-400 hover:text-slate-650 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-350 rounded-xl transition-colors"
                            title="Limpar seleção"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            )}

            {/* BULK UPDATE DATE MODAL */}
            {isBulkDateModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/85 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-850 max-w-md w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
                            <h3 className="font-bold text-slate-800 dark:text-white">
                                Alterar Vencimento em Lote
                            </h3>
                            <button type="button" onClick={() => setIsBulkDateModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-850 p-2 rounded-full cursor-pointer">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <form onSubmit={handleBulkUpdateDate} className="p-6 space-y-4">
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                Você está alterando o vencimento de <strong>{selectedInstallments.length}</strong> parcelas pendentes selecionadas.
                            </p>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Nova Data de Vencimento</label>
                                <input
                                    type="date"
                                    required
                                    value={bulkDueDate}
                                    onChange={(e) => setBulkDueDate(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white"
                                />
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <button type="button" onClick={() => setIsBulkDateModalOpen(false)} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-semibold dark:border-slate-800 dark:text-slate-355 dark:hover:bg-slate-800 transition">
                                    Cancelar
                                </button>
                                <button type="submit" className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm transition shadow-sm">
                                    Salvar Alterações
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* GROUP INSTALLMENTS MODAL */}
            {isGroupModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 dark:bg-slate-950/85 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-xl w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col">
                        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50 flex-shrink-0">
                            <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                <Layers className="w-5 h-5 text-purple-600" />
                                Agrupar Lançamentos Previstos
                            </h3>
                            <button type="button" onClick={() => setIsGroupModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 p-2 rounded-full cursor-pointer">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="p-6 space-y-5 overflow-y-auto flex-1">
                            <div className="p-4 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/50 rounded-2xl">
                                <div className="text-xs font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wider mb-2">
                                    Resumo da Consolidação
                                </div>
                                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                                    <div>
                                        <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                                            {selectedInstObjects[0]?.customer_name || 'Cliente'}
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            {selectedInstObjects.length} títulos selecionados ({selectedInstObjects[0]?.type === 'RECEIVABLE' ? 'Receitas' : 'Despesas'})
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xs text-slate-500">Valor Total Consolidado:</div>
                                        <div className="text-xl font-black text-purple-700 dark:text-purple-400">
                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedInstObjects.reduce((sum, i) => sum + i.amount, 0))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Detalhe dos Lançamentos Agrupados */}
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Títulos que serão consolidados:</label>
                                <div className="max-h-36 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 bg-slate-50/50 dark:bg-slate-900/40">
                                    {selectedInstObjects.map(inst => (
                                        <div key={inst.id} className="p-2.5 flex items-center justify-between text-xs">
                                            <div>
                                                <span className="font-bold text-slate-700 dark:text-slate-300 mr-2">Fatura #{inst.id}</span>
                                                <span className="text-slate-500 truncate inline-block max-w-[200px] align-middle">{inst.description}</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-slate-400 font-medium">Venc: {inst.due_date ? new Date(inst.due_date).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '-'}</span>
                                                <span className="font-bold text-slate-900 dark:text-white">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(inst.amount)}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-[11px] text-slate-400 mt-1.5">
                                    Os títulos acima serão marcados como cancelados por agrupamento com histórico auditável preservado.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Novo Vencimento Unificado *</label>
                                    <input
                                        type="date"
                                        required
                                        value={groupDueDate}
                                        onChange={(e) => setGroupDueDate(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs focus:ring-2 focus:ring-purple-500 outline-none dark:text-white font-medium"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Conta Financeira (Opcional)</label>
                                    <select
                                        value={groupAccountId}
                                        onChange={(e) => setGroupAccountId(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs focus:ring-2 focus:ring-purple-500 outline-none dark:text-white"
                                    >
                                        <option value="">(Manter conta padrão)</option>
                                        {accounts.map(acc => (
                                            <option key={acc.id} value={acc.id}>{acc.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Categoria Financeira (Opcional)</label>
                                <select
                                    value={groupCategoryId}
                                    onChange={(e) => setGroupCategoryId(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs focus:ring-2 focus:ring-purple-500 outline-none dark:text-white"
                                >
                                    <option value="">(Manter categoria)</option>
                                    {categories
                                        .filter(c => selectedInstObjects[0] ? c.type === selectedInstObjects[0].type : true)
                                        .map(c => ({ ...c, hierarchy: getCategoryHierarchyName(c, categories) }))
                                        .sort((a, b) => a.hierarchy.localeCompare(b.hierarchy))
                                        .map(cat => (
                                            <option key={cat.id} value={cat.id}>{cat.hierarchy}</option>
                                        ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Observações / Composição Contábil:</label>
                                <textarea
                                    rows={4}
                                    value={groupNotes}
                                    onChange={(e) => setGroupNotes(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs leading-relaxed outline-none dark:text-white resize-none font-mono"
                                    placeholder="Detalhe a composição deste lançamento agrupado..."
                                />
                                <p className="text-[10px] text-slate-400 mt-1">
                                    Este texto será registrado no lançamento consolidado e constará nos relatórios em PDF e Excel.
                                </p>
                            </div>

                            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                                <button
                                    type="button"
                                    onClick={() => setIsGroupModalOpen(false)}
                                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-semibold dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 transition"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={handleConfirmGroup}
                                    disabled={isGrouping}
                                    className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:opacity-90 text-white font-bold rounded-xl text-sm transition shadow-md flex items-center gap-2 disabled:opacity-50"
                                >
                                    {isGrouping ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" /> Agrupando...
                                        </>
                                    ) : (
                                        <>
                                            <Layers className="w-4 h-4" /> Confirmar Agrupamento
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* CASHFLOW FORECAST REPORT MODAL */}
            {isReportModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-slate-900/60 backdrop-blur-md">
                    <div className="bg-white dark:bg-slate-950 rounded-3xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50 flex-shrink-0">
                            <div>
                                <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
                                    <BarChart3 className="w-6 h-6 text-emerald-500" />
                                    Relatório de Fluxo de Caixa Previsto por Cliente
                                </h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                    Demonstrativo de lançamentos previstos (entradas, saídas e composição de títulos agrupados)
                                </p>
                            </div>
                            <button onClick={() => setIsReportModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Barra de Filtros e Exportação */}
                        <div className="p-5 border-b border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900/30 flex flex-wrap items-end gap-3 flex-shrink-0">
                            <div className="flex flex-col gap-1 min-w-[130px] flex-1 sm:flex-none">
                                <label className="text-[11px] font-bold uppercase text-slate-500">De (Vencimento):</label>
                                <input
                                    type="date"
                                    value={reportStartDate}
                                    onChange={(e) => setReportStartDate(e.target.value)}
                                    className="px-3 py-1.5 border rounded-xl text-xs dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                                />
                            </div>
                            <div className="flex flex-col gap-1 min-w-[130px] flex-1 sm:flex-none">
                                <label className="text-[11px] font-bold uppercase text-slate-500">Até:</label>
                                <input
                                    type="date"
                                    value={reportEndDate}
                                    onChange={(e) => setReportEndDate(e.target.value)}
                                    className="px-3 py-1.5 border rounded-xl text-xs dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                                />
                            </div>
                            <div className="flex flex-col gap-1 min-w-[140px] flex-1 sm:flex-none">
                                <label className="text-[11px] font-bold uppercase text-slate-500">Natureza:</label>
                                <select
                                    value={reportType}
                                    onChange={(e) => setReportType(e.target.value)}
                                    className="px-3 py-1.5 border rounded-xl text-xs dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                                >
                                    <option value="">Todas (Entradas e Saídas)</option>
                                    <option value="RECEIVABLE">Apenas Entradas (Receitas)</option>
                                    <option value="PAYABLE">Apenas Saídas (Despesas)</option>
                                </select>
                            </div>
                            <div className="flex flex-col gap-1 min-w-[180px] flex-1">
                                <label className="text-[11px] font-bold uppercase text-slate-500">Filtrar por Cliente / Fornecedor:</label>
                                <CustomerAutocomplete
                                    value={reportCustomerId}
                                    onChange={(id) => setReportCustomerId(id)}
                                />
                            </div>

                            <button
                                onClick={fetchCashflowForecastReport}
                                disabled={reportLoading}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                            >
                                <Search className="w-3.5 h-3.5" /> Filtrar
                            </button>

                            <div className="h-6 w-[1px] bg-slate-200 dark:bg-slate-800 hidden sm:block mx-1" />

                            <div className="flex items-center gap-2 ml-auto">
                                <button
                                    onClick={() => handleExportCashflowReport('excel')}
                                    disabled={reportExporting !== null}
                                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                                    title="Baixar planilha formatada em Excel (.xlsx)"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    {reportExporting === 'excel' ? 'Exportando...' : 'Exportar Excel'}
                                </button>
                                <button
                                    onClick={() => handleExportCashflowReport('pdf')}
                                    disabled={reportExporting !== null}
                                    className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                                    title="Baixar relatório formatado em PDF (.pdf)"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    {reportExporting === 'pdf' ? 'Exportando...' : 'Exportar PDF'}
                                </button>
                            </div>
                        </div>

                        {/* Conteúdo com scroll */}
                        <div className="p-6 overflow-y-auto flex-1 space-y-6 custom-scrollbar">
                            {/* Cards de Resumo */}
                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                                <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/50">
                                    <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1 flex items-center gap-1">
                                        <ArrowUpCircle className="w-3.5 h-3.5" /> Entradas Previstas
                                    </div>
                                    <div className="text-xl font-black text-emerald-700 dark:text-emerald-400">
                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(reportData?.grand_total_entradas || 0)}
                                    </div>
                                </div>
                                <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/50">
                                    <div className="text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 mb-1 flex items-center gap-1">
                                        <ArrowDownCircle className="w-3.5 h-3.5" /> Saídas Previstas
                                    </div>
                                    <div className="text-xl font-black text-rose-700 dark:text-rose-400">
                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(reportData?.grand_total_saidas || 0)}
                                    </div>
                                </div>
                                <div className={`p-4 rounded-2xl border ${(reportData?.grand_saldo_liquido || 0) >= 0 ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-950/20 dark:border-indigo-800/50' : 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800/50'}`}>
                                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                                        Saldo Projetado Líquido
                                    </div>
                                    <div className={`text-xl font-black ${(reportData?.grand_saldo_liquido || 0) >= 0 ? 'text-indigo-700 dark:text-indigo-400' : 'text-amber-700 dark:text-amber-400'}`}>
                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(reportData?.grand_saldo_liquido || 0)}
                                    </div>
                                </div>
                                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                                        Total de Contatos
                                    </div>
                                    <div className="text-xl font-black text-slate-700 dark:text-slate-300">
                                        {reportData?.total_contacts || 0}
                                    </div>
                                </div>
                            </div>

                            {/* Tabela Agrupada por Cliente */}
                            {reportLoading ? (
                                <div className="text-center py-16">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500 mx-auto"></div>
                                    <p className="text-xs text-slate-400 mt-2 font-medium">Consolidando lançamentos de fluxo previsto...</p>
                                </div>
                            ) : !reportData || !reportData.groups || reportData.groups.length === 0 ? (
                                <div className="text-center py-16 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/20">
                                    <DollarSign className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">Nenhum lançamento previsto encontrado para os filtros selecionados.</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {reportData.groups.map((group: any) => (
                                        <div key={group.customer_id} className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm bg-white dark:bg-slate-900">
                                            {/* Cabeçalho do Cliente */}
                                            <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                                <div>
                                                    <span className="font-bold text-slate-800 dark:text-white text-sm">
                                                        {group.customer_name}
                                                    </span>
                                                    {group.customer_document && (
                                                        <span className="text-[11px] text-slate-500 dark:text-slate-400 ml-2 font-mono">
                                                            Doc: {group.customer_document}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-3 text-xs">
                                                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                                        Receitas: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(group.total_entradas || 0)}
                                                    </span>
                                                    <span className="text-rose-600 dark:text-rose-400 font-semibold">
                                                        Despesas: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(group.total_saidas || 0)}
                                                    </span>
                                                    <span className={`font-black px-2 py-0.5 rounded-lg ${(group.saldo_liquido ?? group.saldo_cliente ?? 0) >= 0 ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'}`}>
                                                        Saldo: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(group.saldo_liquido ?? group.saldo_cliente ?? 0)}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Tabela de Lançamentos */}
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-xs text-left">
                                                    <thead className="bg-slate-50/50 dark:bg-slate-900/30 text-[10px] uppercase font-bold text-slate-400 border-b border-slate-100 dark:border-slate-800">
                                                        <tr>
                                                            <th className="px-4 py-2 w-20">Fatura</th>
                                                            <th className="px-4 py-2">Descrição / Composição</th>
                                                            <th className="px-4 py-2 w-28">Vencimento</th>
                                                            <th className="px-4 py-2 w-24 text-center">Natureza</th>
                                                            <th className="px-4 py-2 w-28 text-right">Valor Previsto</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                                        {(group.installments || group.items || []).map((inst: any) => (
                                                            <tr key={inst.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                                                <td className="px-4 py-2.5 font-bold text-slate-700 dark:text-slate-300">
                                                                    #{inst.id}
                                                                </td>
                                                                <td className="px-4 py-2.5">
                                                                    <div className="font-medium text-slate-800 dark:text-slate-200">
                                                                        {inst.description}
                                                                    </div>
                                                                </td>
                                                                <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
                                                                    {inst.due_date ? new Date(inst.due_date).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '-'}
                                                                </td>
                                                                <td className="px-4 py-2.5 text-center">
                                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${inst.type === 'RECEIVABLE' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-rose-100 text-rose-700 border border-rose-200'}`}>
                                                                        {inst.type === 'RECEIVABLE' ? 'RECEITA' : 'DESPESA'}
                                                                    </span>
                                                                </td>
                                                                <td className="px-4 py-2.5 text-right font-bold text-slate-900 dark:text-white">
                                                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(inst.amount)}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Rodapé do Modal */}
                        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-800 flex justify-end">
                            <button
                                onClick={() => setIsReportModalOpen(false)}
                                className="px-5 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
