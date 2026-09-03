'use client';

import { useEffect, useState, use, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getToken, getUser } from '@/lib/auth';

import { 
    ArrowLeft, Save, FileText, Calendar, Building, Info, 
    AlertTriangle, ShieldAlert, Receipt, CircleDollarSign, Check, Trash2, QrCode, Mail, Upload, Download,
    Scissors, X
} from 'lucide-react';
import { toast } from 'sonner';
import { CurrencyInput } from '@/components/CurrencyInput';

export default function ServiceOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    const token = getToken();
    
    // Desembrulhar o params Promise (Next 15 pattern)
    const { id: orderId } = use(params);

    const [order, setOrder] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [interEnabled, setInterEnabled] = useState(false);
    
    // Formulation states
    const [negotiatedValue, setNegotiatedValue] = useState<number>(0);
    const [executionDate, setExecutionDate] = useState<string>('');
    const [customDescription, setCustomDescription] = useState<string>('');
    const [serviceId, setServiceId] = useState<number>(0);
    const [servicesOptions, setServicesOptions] = useState<any[]>([]);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);

    // Split Service Order Modal
    const [isSplitOpen, setIsSplitOpen] = useState(false);
    const [splits, setSplits] = useState<any[]>([]);

    const addMonths = (dateStr: string, months: number) => {
        const d = new Date(dateStr + 'T12:00:00');
        d.setMonth(d.getMonth() + months);
        return d.toISOString().split('T')[0];
    };

    const handleOpenSplit = () => {
        if (!order) return;
        const val1 = Math.round((order.negotiated_value / 2) * 100) / 100;
        const val2 = Math.round((order.negotiated_value - val1) * 100) / 100;
        setSplits([
            { negotiated_value: val1.toString(), execution_date: order.execution_date, custom_description: `${order.custom_description || order.service_details?.name || 'Serviço'} - Parte 1/2` },
            { negotiated_value: val2.toString(), execution_date: addMonths(order.execution_date, 1), custom_description: `${order.custom_description || order.service_details?.name || 'Serviço'} - Parte 2/2` }
        ]);
        setIsSplitOpen(true);
    };

    const handleChangeSplitsCount = (count: number) => {
        if (!order || count < 2) return;
        const originalVal = order.negotiated_value;
        const baseVal = Math.round((originalVal / count) * 100) / 100;
        
        const newSplits = [];
        let sum = 0;
        for (let i = 0; i < count; i++) {
            let val = baseVal;
            if (i === count - 1) {
                val = Math.round((originalVal - sum) * 100) / 100;
            }
            sum += val;
            newSplits.push({
                negotiated_value: val.toString(),
                execution_date: addMonths(order.execution_date, i),
                custom_description: `${order.custom_description || order.service_details?.name || 'Serviço'} - Parte ${i+1}/${count}`
            });
        }
        setSplits(newSplits);
    };

    const handleUpdateSplitField = (index: number, field: string, value: string) => {
        const updated = [...splits];
        updated[index] = { ...updated[index], [field]: value };
        setSplits(updated);
    };

    const handleSplitSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (saving) return;
        
        const totalSplitsValue = splits.reduce((acc, curr) => acc + parseFloat(curr.negotiated_value || '0'), 0);
        if (Math.abs(totalSplitsValue - order.negotiated_value) > 0.02) {
            toast.error(`A soma das parcelas (R$ ${totalSplitsValue.toFixed(2)}) deve ser igual ao valor total da O.S. (R$ ${order.negotiated_value.toFixed(2)}).`);
            return;
        }

        setSaving(true);
        try {
            const payload = {
                splits: splits.map(item => ({
                    negotiated_value: parseFloat(item.negotiated_value),
                    execution_date: item.execution_date,
                    custom_description: item.custom_description || null
                }))
            };

            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/service-orders/${order.id}/split`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                toast.success('Serviço desmembrado com sucesso!');
                setIsSplitOpen(false);
                setSplits([]);
                router.push("/services/orders");
            } else {
                const err = await res.json();
                toast.error(err.detail || 'Erro ao desmembrar serviço.');
            }
        } catch (e) {
            toast.error('Erro de conexão ao desmembrar.');
        } finally {
            setSaving(false);
        }
    };

    // Email Modal States
    const [showEmailModal, setShowEmailModal] = useState(false);
    const [showEmailHistoryModal, setShowEmailHistoryModal] = useState(false);
    const user = getUser();
    const companyName = user?.company_name || 'Nossa Empresa';
    const [emailSubject, setEmailSubject] = useState('');
    const [emailBody, setEmailBody] = useState('');
    const [templates, setTemplates] = useState<any[]>([]);
    const [selectedTemplateType, setSelectedTemplateType] = useState('SERVICE_ORDER');
    const [toEmails, setToEmails] = useState('');
    const [attachInvoice, setAttachInvoice] = useState(true);
    const [attachBoletos, setAttachBoletos] = useState(true);
    const [sendingEmail, setSendingEmail] = useState(false);
    const [uploadingPdf, setUploadingPdf] = useState(false);
    
    const fetchDetails = useCallback(async () => {
        if (!token || !orderId) return;
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/service-orders/${orderId}/details`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            setOrder(data.data);
            
            // Set initial emails
            if (data.data.customer) {
                const em = [];
                if (data.data.customer.email) em.push(data.data.customer.email);
                if (data.data.customer.billing_emails) {
                    const splitted = data.data.customer.billing_emails.split(',').map((e:string) => e.trim()).filter((e:string) => e);
                    em.push(...splitted);
                }
                setToEmails([...new Set(em)].join(', '));
            }

            // Init form
            setNegotiatedValue(data.data.negotiated_value || 0);
            setExecutionDate(data.data.execution_date || '');
            setCustomDescription(data.data.custom_description || '');
            setServiceId(data.data.service_id || 0);
            
            // Fetch services mapping for dropdown
            const srvRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/services?limit=100`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const srvData = await srvRes.json();
            setServicesOptions(srvData.items || []);

            const u = getUser();
            if (u?.company_id) {
                try {
                    const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/companies/${u.company_id}/settings`, { headers: { 'Authorization': `Bearer ${token}` }});
                    if (r.ok) {
                        const d = await r.json();
                        setInterEnabled(d.inter_enabled || false);
                    }
                } catch(e) {}
            }

        } catch (error) {
            console.error("Erro ao carregar detalhes:", error);
            toast.error("Ordem de Serviço não encontrada.");
            router.push("/services/orders");
        } finally {
            setLoading(false);
        }
    }, [token, orderId, router]);

    const fetchTemplates = useCallback(async () => {
        if (!token) return;
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/settings/email-templates`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setTemplates(data);
                (window as any).__loadedTemplates = data;
                if (order) {
                    applyTemplate(data, 'SERVICE_ORDER', order);
                }
            }
        } catch (e) {}
    }, [token, order]);

    const applyTemplate = (tpls: any[], type: string, transaction: any) => {
        const tpl = tpls.find(t => t.type === type);
        if (!tpl) return;
        
        const currentMonth = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date());
        const cname = getUser()?.company_name || 'Nossa Empresa';
        const c_customer = transaction.customer ? transaction.customer.name : 'Cliente';
        const totalAmt = new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'}).format(transaction.negotiated_value || 0);
        
        const replacements: Record<string, string> = {
            '{month}': currentMonth,
            '{description}': transaction.custom_description || transaction.service?.name || 'Serviço',
            '{company_name}': cname,
            '{customer_name}': c_customer,
            '{total_amount}': totalAmt,
            '{service_id}': transaction.id?.toString() || '',
            '{status}': transaction.status || ''
        };

        let sub = tpl.subject;
        let bdy = tpl.body_template;
        for (const [key, val] of Object.entries(replacements)) {
            sub = sub.replaceAll(key, val);
            bdy = bdy.replaceAll(key, val);
        }

        setEmailSubject(sub);
        setEmailBody(bdy);
        setSelectedTemplateType(type);
    };

    useEffect(() => {
        if (order && templates.length === 0 && (window as any).__loadedTemplates) {
            setTemplates((window as any).__loadedTemplates);
            applyTemplate((window as any).__loadedTemplates, 'SERVICE_ORDER', order);
        } else if (order && templates.length > 0) {
            applyTemplate(templates, 'SERVICE_ORDER', order);
        }
    }, [order]);

    useEffect(() => {
        fetchDetails();
        fetchTemplates();
    }, [fetchDetails, fetchTemplates]);

    // Lógica para bloquear Inputs
    // Regra de bloqueio: SOMENTE NFS-e emitida impede edição do serviço.
    // Transações financeiras (cobranças) NÃO bloqueiam — o seller pode
    // ajustar valor/serviço enquanto não houver nota fiscal emitida.
    const isLockedByNFSe = order?.status_nfse === 'Emitida' || order?.status_nfse === 'Em Processamento';
    const isValueLocked = isLockedByNFSe;

    const handleSave = async () => {
        if (!token) return;
        setSaving(true);
        try {
            const resPut = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/service-orders/${orderId}`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({
                    service_id: serviceId,
                    negotiated_value: negotiatedValue,
                    execution_date: executionDate,
                    custom_description: customDescription
                })
            });
            
            if (!resPut.ok) {
                const errData = await resPut.json();
                throw new Error(errData.detail || "Erro ao salvar alterações da O.S.");
            }

            toast.success("O.S atualizada com sucesso!");
            
            // Reload para sincronizar com o banco
            const resGet = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/service-orders/${orderId}/details`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const dataGet = await resGet.json();
            setOrder(dataGet.data);
            // Sincroniza todos os campos do form com o valor confirmado pelo banco
            setNegotiatedValue(dataGet.data.negotiated_value || 0);
            setExecutionDate(dataGet.data.execution_date || '');
            setCustomDescription(dataGet.data.custom_description || '');
            setServiceId(dataGet.data.service_id || 0);
            
        } catch (error: any) {
            console.error(error);
            toast.error(error.message || "Erro ao salvar alterações da O.S.");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!token) return;
        if (!confirm("Tem certeza que deseja excluir esta Ordem de Serviço? A ação é irreversível.")) return;
        setDeleting(true);
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/service-orders/${orderId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.detail || "Erro ao excluir O.S.");
            }
            toast.success("O.S excluída com sucesso.");
            router.push("/services/orders");
        } catch (error: any) {
            console.error(error);
            toast.error(error.message || "Erro ao excluir O.S.");
            setDeleting(false);
        }
    };

    const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !token) return;
        setUploadingPdf(true);
        const formData = new FormData();
        formData.append("file", file);
        formData.append("order_id", orderId.toString());

        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/upload/service-order-invoice`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}` },
                body: formData
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || "Erro ao fazer upload do PDF.");
            }
            const data = await res.json();
            setOrder({ ...order, invoice_pdf_url: data.url });
            toast.success("PDF da Nota Fiscal atrelado com sucesso!");
        } catch (error: any) {
            toast.error(error.message || "Erro no upload do arquivo.");
        } finally {
            setUploadingPdf(false);
            e.target.value = '';
        }
    };

    const handleBoletoUpload = async (e: React.ChangeEvent<HTMLInputElement>, installmentId: number) => {
        const file = e.target.files?.[0];
        if (!file || !token) return;
        
        const loadingId = toast.loading("Enviando boleto...");
        const formData = new FormData();
        formData.append("file", file);
        formData.append("installment_id", installmentId.toString());

        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/upload/financial-installment-boleto`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}` },
                body: formData
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || "Erro ao fazer upload do PDF.");
            }
            toast.success("Boleto anexado com sucesso!", { id: loadingId });
            fetchDetails();
        } catch (error: any) {
            toast.error(error.message || "Erro no upload do arquivo.", { id: loadingId });
        } finally {
            e.target.value = '';
        }
    };

    const handleSendEmail = async () => {
        if (!token) return;
        setSendingEmail(true);
        try {
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/services/orders/${orderId}/send-email`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    subject: emailSubject,
                    body: emailBody,
                    to_emails: toEmails,
                    attach_invoice: attachInvoice,
                    attach_boletos: attachBoletos
                })
            });
            
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.detail || "Erro ao enviar e-mail.");
            }
            
            toast.success("E-mail enviado com sucesso para o cliente!");
            setShowEmailModal(false);
            fetchDetails();
        } catch (error: any) {
            toast.error(error.message || "Erro ao disparar e-mail.");
        } finally {
            setSendingEmail(false);
        }
    };

    const openEmailModal = () => {
        let emails = [];
        if (order.customer?.email) emails.push(order.customer.email);
        if (order.customer?.billing_emails) {
            const bEmails = order.customer.billing_emails.split(',').map((e: string) => e.trim()).filter(Boolean);
            emails.push(...bEmails);
        }
        setToEmails(emails.join(', '));
        if (templates.length > 0 && order) {
            applyTemplate(templates, selectedTemplateType || 'SERVICE_ORDER', order);
        }
        setShowEmailModal(true);
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    if (!order) return null;


    return (
        <div className="max-w-5xl mx-auto pb-12">
            <div className="mb-6">
                <Link href="/services/orders" className="text-sm font-semibold text-slate-500 hover:text-indigo-600 transition flex items-center gap-2 mb-4 w-fit">
                    <ArrowLeft className="w-4 h-4"/> Voltar para Tabela
                </Link>
                <div className="flex justify-between items-end">
                    <div>
                        <h1 className="text-3xl font-black text-slate-800 dark:text-white flex items-center gap-3">
                            <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-xl text-lg tracking-tight">OS #{order.local_id || order.id}</span>
                            {order.service_details?.name}
                        </h1>
                        <p className="text-sm text-slate-500 mt-2 flex items-center gap-2">
                            <Building className="w-4 h-4"/> Cliente: {order.customer?.name} ({order.customer?.document_number})
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={openEmailModal}
                            className="px-4 py-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:hover:bg-indigo-900/40 rounded-xl transition flex items-center gap-2 text-sm font-semibold border border-indigo-100 dark:border-indigo-900/50"
                        >
                            <Mail className="w-4 h-4"/> Enviar E-mail
                        </button>
                        {order.email_sent_at && (
                            <button 
                                onClick={() => setShowEmailHistoryModal(true)}
                                className="px-4 py-2 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:bg-slate-900/50 dark:hover:bg-slate-800 rounded-xl transition flex items-center gap-2 text-sm font-semibold border border-slate-200 dark:border-slate-800"
                            >
                                <Info className="w-4 h-4 text-emerald-500"/> Histórico
                            </button>
                        )}
                        {!isValueLocked && (
                            <button 
                                onClick={handleOpenSplit}
                                className="px-4 py-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 dark:text-indigo-400 font-bold rounded-xl transition flex items-center gap-2 text-sm border border-indigo-200 dark:border-indigo-800/50 cursor-pointer"
                            >
                                <Scissors className="w-4 h-4"/> Desmembrar O.S.
                            </button>
                        )}
                        {!isValueLocked && (
                            <button 
                                onClick={handleDelete}
                                disabled={deleting}
                                className="px-4 py-2 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-900/20 dark:hover:bg-rose-900/40 rounded-xl transition flex items-center gap-2 text-sm font-semibold border border-rose-100 dark:border-rose-900/50"
                            >
                                <Trash2 className="w-4 h-4"/> {deleting ? "Excluindo..." : "Excluir O.S."}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Lado Esquerdo - Formulário Edição */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800">
                        <div className="flex justify-between items-center mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
                            <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                <FileText className="w-5 h-5 text-indigo-500"/>
                                Dados Primários da O.S
                            </h2>
                            <button 
                                onClick={handleSave} 
                                disabled={saving}
                                className="px-5 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition shadow-md disabled:opacity-50 flex items-center gap-2 text-sm cursor-pointer"
                            >
                                <Save className="w-4 h-4"/>
                                {saving ? "Salvando..." : "Salvar Edição"}
                            </button>
                        </div>

                        {isValueLocked && (
                            <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl flex items-start gap-3">
                                <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5"/>
                                <div>
                                    <p className="text-sm font-bold text-amber-800 dark:text-amber-400">Edição de Valores Bloqueada</p>
                                    <p className="text-xs text-amber-700 dark:text-amber-500 mt-1">Este serviço já possui integrações fiscais (NFS-e Emitida) ou transações financeiras geradas atreladas a ela. O valor em reais não pode mais ser violado por integridade contábil.</p>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-6 mb-6">
                            <div className="col-span-2">
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Serviço Base Ofertado</label>
                                <select 
                                    className={`w-full p-3 bg-slate-50 dark:bg-slate-800 border ${isValueLocked ? 'border-slate-200 dark:border-slate-700 text-slate-400 cursor-not-allowed' : 'border-slate-200 dark:border-slate-700'} rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500`}
                                    value={serviceId}
                                    onChange={(e) => setServiceId(parseInt(e.target.value))}
                                    disabled={isValueLocked}
                                >
                                    <option value={order.service_id}>{order.service_details?.name}</option>
                                    {servicesOptions.filter(s => s.id !== order.service_id).map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Valor Negociado (R$)</label>
                                <CurrencyInput 
                                    className={`w-full p-3 bg-slate-50 dark:bg-slate-800 border ${isValueLocked ? 'border-slate-200 dark:border-slate-700 text-slate-400 cursor-not-allowed' : 'border-slate-200 dark:border-slate-700'} rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500`}
                                    value={negotiatedValue || 0}
                                    onChangeValue={setNegotiatedValue}
                                    disabled={isValueLocked}
                                    placeholder="R$ 0,00"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Data Limite de Execução</label>
                                <input 
                                    type="date"
                                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-700 dark:text-slate-300"
                                    value={executionDate}
                                    onChange={(e) => setExecutionDate(e.target.value)}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Observações / Detalhes Visíveis</label>
                            <textarea 
                                className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-700 dark:text-slate-300 min-h-[120px] resize-y"
                                value={customDescription}
                                onChange={(e) => setCustomDescription(e.target.value)}
                                placeholder="Descreva particularidades dessa ordem de serviço..."
                            ></textarea>
                            <p className="text-[10px] text-slate-400 mt-2 font-medium">Estas observações podem ser impressas nos laudos/PDFs para o cliente.</p>
                        </div>
                    </div>
                </div>

                {/* Lado Direito - Painel Histórico */}
                <div className="space-y-6">
                    {/* Financeiro */}
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800">
                        <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                            <CircleDollarSign className="w-4 h-4 text-emerald-500"/> Transações Geradas
                        </h3>
                        {order.txs && order.txs.length > 0 ? (
                            <div className="space-y-4">
                                {order.txs.map((tx: any, idx: number) => (
                                    <div key={idx} className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                                        <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-white/50 dark:bg-slate-900/50">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="font-black text-slate-800 dark:text-slate-200">TX #{tx.id}</span>
                                                <span className={`text-xs font-bold px-2 py-1 rounded-md ${tx.status === 'CONFIRMADO' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30' : 'bg-slate-200 text-slate-600 dark:bg-slate-700'}`}>{tx.status}</span>
                                            </div>
                                            <div className="flex justify-between text-sm">
                                                <span className="text-slate-500">Valor Faturado: <strong className="text-slate-800 dark:text-slate-200">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency:'BRL' }).format(tx.amount)}</strong></span>
                                                <span className="text-slate-500">Parcelamento: <strong className="text-slate-800 dark:text-slate-200">{tx.installments_count}x</strong></span>
                                            </div>
                                        </div>
                                        
                                        {tx.installments && tx.installments.length > 0 && (
                                            <div className="p-4 space-y-2">
                                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Cronograma Financeiro</p>
                                                {tx.installments.map((inst: any, iIdx: number) => (
                                                    <div key={iIdx} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-700/50 gap-3 shadow-sm hover:border-indigo-100 dark:hover:border-indigo-900/50 transition">
                                                        <div className="flex flex-col">
                                                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Parcela {inst.number}/{tx.installments_count}</span>
                                                            <span className="text-[10px] text-slate-400">Venc: {new Date(inst.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                                                        </div>
                                                        <div className="flex items-center gap-4">
                                                            <div className="flex flex-col items-end">
                                                                <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency:'BRL' }).format(inst.amount)}</span>
                                                                <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded mt-0.5 ${inst.status === 'PAID' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : inst.status === 'OVERDUE' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                                                                    {inst.status === 'PAID' ? 'Paga' : inst.status === 'OVERDUE' ? 'Atrasada' : 'Pendente'}
                                                                </span>
                                                            </div>
                                                            {(inst.bank_slip_pdf_url || inst.bank_slip_nosso_numero) ? (
                                                                <a 
                                                                    href={inst.bank_slip_pdf_url || `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/financial/installments/${inst.id}/bank-slip-pdf`} 
                                                                    target="_blank" 
                                                                    rel="noopener noreferrer"
                                                                    className="shrink-0 p-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 dark:text-indigo-400 rounded-lg transition"
                                                                    title="Imprimir Boleto"
                                                                >
                                                                    <QrCode className="w-4 h-4"/>
                                                                </a>
                                                            ) : (
                                                                <label className="shrink-0 p-2 cursor-pointer bg-slate-50 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 dark:bg-slate-800/50 dark:hover:bg-indigo-900/30 dark:text-slate-400 rounded-lg transition" title="Anexar Boleto Manualmente">
                                                                    <Upload className="w-4 h-4"/>
                                                                    <input type="file" accept=".pdf" className="hidden" onChange={(e) => handleBoletoUpload(e, inst.id)} />
                                                                </label>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-slate-400 italic bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl text-center border border-dashed border-slate-200 dark:border-slate-700">O financeiro (Cód. de Barras/Pix) ainda não foi cortado para esta OS.</p>
                        )}
                    </div>

                    {/* Fiscal */}
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-sm font-bold text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
                                <Receipt className="w-4 h-4 text-indigo-500"/> Log da Sefin
                            </h3>
                            <span className="text-[9px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded font-bold uppercase">{order.is_nfse ? 'NFS-e Sefaz' : 'Apenas OS Avulsa'}</span>
                        </div>

                        {/* Upload de Arquivo Manual */}
                        <div className="mb-4 p-4 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-800/30">
                            <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                                <FileText className="w-4 h-4 text-slate-500"/> Arquivo Físico da NFS-e
                            </p>
                            {order.invoice_pdf_url ? (
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold px-2 py-1 bg-emerald-50 dark:bg-emerald-900/20 rounded-md border border-emerald-100 dark:border-emerald-900/50">✔ Arquivo Vinculado</span>
                                    <div className="flex gap-2">
                                        <a href={process.env.NEXT_PUBLIC_API_URL ? process.env.NEXT_PUBLIC_API_URL.replace('/api/v1', '') + order.invoice_pdf_url : order.invoice_pdf_url} target="_blank" rel="noopener noreferrer" className="p-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:hover:bg-indigo-900/50 dark:text-indigo-400 rounded-md transition" title="Baixar / Ver PDF">
                                            <Download className="w-4 h-4"/>
                                        </a>
                                        <label className="cursor-pointer p-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-400 rounded-md transition" title="Substituir PDF">
                                            <Upload className="w-4 h-4"/>
                                            <input type="file" accept=".pdf" className="hidden" onChange={handlePdfUpload} disabled={uploadingPdf} />
                                        </label>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-3 w-full">
                                    <label className={`cursor-pointer w-full text-center text-xs font-bold text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded-lg py-2 transition ${uploadingPdf ? 'opacity-50 cursor-wait' : ''}`}>
                                        {uploadingPdf ? 'Enviando...' : 'Fazer Upload do PDF (.pdf)'}
                                        <input type="file" accept=".pdf" className="hidden" onChange={handlePdfUpload} disabled={uploadingPdf} />
                                    </label>
                                </div>
                            )}
                        </div>
                        
                        {order.is_nfse && order.nfse_history && order.nfse_history.length > 0 ? (
                            <div className="space-y-3 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
                                {order.nfse_history.map((h: any, idx: number) => (
                                    <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700 text-xs relative">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className={`font-black uppercase px-2 py-0.5 rounded-md ${h.status === 'ERROR' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30'}`}>{h.status}</span>
                                            <span className="text-[9px] text-slate-400 font-medium text-right">{new Date(h.created_at).toLocaleString()}</span>
                                        </div>
                                        {h.xml_protocol_id && <p className="text-slate-500 break-all mb-1.5"><span className="font-semibold">Chave: </span>{h.xml_protocol_id}</p>}
                                        {h.error_message && (
                                            <p className="text-rose-600 dark:text-rose-400 mt-2 bg-rose-50 dark:bg-rose-900/20 p-2 rounded border border-rose-100 dark:border-rose-900">
                                                {h.error_message}
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-slate-400 italic bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl text-center border border-dashed border-slate-200 dark:border-slate-700">Esta OS não possui rastro fiscal na prefeitura até o momento.</p>
                        )}
                    </div>

                </div>

            </div>
            
            {/* Email Modal */}
            {showEmailModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-lg">
                        <div className="flex justify-between items-center mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
                            <h2 className="text-xl font-black text-slate-800 dark:text-white flex items-center gap-2">
                                <Mail className="w-5 h-5 text-indigo-500"/>
                                Enviar E-mail ao Cliente
                            </h2>
                            <button onClick={() => setShowEmailModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition">✕</button>
                        </div>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Para (Destinatários)</label>
                                <input type="text" value={toEmails} onChange={e => setToEmails(e.target.value)} className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-700 dark:text-slate-300 text-sm" placeholder="email1@exemplo.com, email2@exemplo.com" />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Modelo da Mensagem (Template)</label>
                                <select 
                                    value={selectedTemplateType} 
                                    onChange={e => applyTemplate(templates, e.target.value, order)}
                                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-700 dark:text-slate-300 text-sm mb-4"
                                >
                                    <option value="SERVICE_ORDER">Abertura / Atualização de O.S</option>
                                    <option value="FINANCIAL_INVOICE">Faturamento Padrão</option>
                                    <option value="FINANCIAL_LATE">Cobrança de Atraso</option>
                                </select>
                            </div>
                            
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Assunto</label>
                                <input type="text" value={emailSubject} onChange={e => setEmailSubject(e.target.value)} className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-700 dark:text-slate-300 text-sm" />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Mensagem</label>
                                <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)} rows={5} className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-700 dark:text-slate-300 text-sm resize-y" placeholder="Escreva a mensagem..."></textarea>
                            </div>
                            
                            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                                <p className="text-xs font-bold text-slate-500 uppercase mb-3">Opções de Anexos</p>
                                <div className="space-y-3">
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input type="checkbox" checked={attachInvoice} onChange={e => setAttachInvoice(e.target.checked)} disabled={!order.invoice_pdf_url} className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 disabled:opacity-50" />
                                        <span className={`text-sm ${order.invoice_pdf_url ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400'}`}>Anexar PDF da Nota Fiscal {order.invoice_pdf_url ? '' : '(Sem arquivo)'}</span>
                                    </label>
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input type="checkbox" checked={attachBoletos} onChange={e => setAttachBoletos(e.target.checked)} className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500" />
                                        <span className="text-sm text-slate-700 dark:text-slate-300">Anexar Boletos (se houver parcelas geradas)</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                        
                        <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                            <button onClick={() => setShowEmailModal(false)} className="px-5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 rounded-xl transition">Cancelar</button>
                            <button onClick={handleSendEmail} disabled={sendingEmail || !toEmails.trim()} className="px-5 py-2 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition disabled:opacity-50 flex items-center gap-2">
                                {sendingEmail ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <Mail className="w-4 h-4"/>}
                                {sendingEmail ? "Enviando..." : "Enviar E-mail"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Histórico de E-mails */}
            {showEmailHistoryModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowEmailHistoryModal(false)}></div>
                    <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh]">
                        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl">
                                    <Info className="w-5 h-5"/>
                                </div>
                                <h2 className="text-lg font-black text-slate-800 dark:text-white">Histórico de Disparos</h2>
                            </div>
                            <button onClick={() => setShowEmailHistoryModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-2 bg-slate-100 dark:bg-slate-800 rounded-full">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto">
                            {order.email_logs && order.email_logs.length > 0 ? (
                                <div className="space-y-4">
                                    {[...order.email_logs].reverse().map((log: any, idx: number) => (
                                        <div key={idx} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50">
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex items-center gap-2">
                                                    <Mail className="w-4 h-4 text-emerald-500" />
                                                    <span className="font-bold text-sm text-slate-800 dark:text-slate-200">{log.subject}</span>
                                                </div>
                                                <span className="text-[10px] font-bold text-slate-500 uppercase px-2 py-1 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700">
                                                    {new Date(log.sent_at).toLocaleString('pt-BR')}
                                                </span>
                                            </div>
                                            <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                                                <p><strong>Para:</strong> {log.to}</p>
                                                <p><strong>Enviado por:</strong> {log.user || 'Sistema'}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-10 text-slate-500">
                                    Nenhum histórico encontrado.
                                </div>
                            )}
                        </div>
                        <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                            <button onClick={() => setShowEmailHistoryModal(false)} className="px-6 py-2.5 rounded-xl font-bold text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* SPLIT SERVICE ORDER MODAL */}
            {isSplitOpen && order && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm overflow-y-auto">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-200 my-8">
                        {/* Header */}
                        <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                    <Scissors className="w-5 h-5 text-indigo-500" /> Desmembrar Ordem de Serviço
                                </h3>
                                <p className="text-xs text-slate-500 mt-1">
                                    Divida a O.S. #{order.local_id} em múltiplas partes com datas e faturamentos distintos.
                                </p>
                            </div>
                            <button 
                                onClick={() => {
                                    setIsSplitOpen(false);
                                    setSplits([]);
                                }} 
                                className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-400"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-6 space-y-6">
                            {/* Summary of Original O.S. */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 text-sm">
                                <div>
                                    <span className="block text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase">Cliente</span>
                                    <span className="font-bold text-slate-700 dark:text-slate-300">{order.customer?.name || 'N/A'}</span>
                                </div>
                                <div>
                                    <span className="block text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase">Valor Total</span>
                                    <span className="font-black text-indigo-600 dark:text-indigo-400 text-base">
                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.negotiated_value)}
                                    </span>
                                </div>
                                <div>
                                    <span className="block text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase">Data Original</span>
                                    <span className="font-bold text-slate-700 dark:text-slate-300">
                                        {order.execution_date ? new Date(order.execution_date + 'T12:00:00').toLocaleDateString('pt-BR') : 'N/A'}
                                    </span>
                                </div>
                            </div>

                            {/* Quantity selector */}
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                                        Quantidade de Divisões
                                    </label>
                                    <p className="text-xs text-slate-500">Selecione em quantas partes deseja fracionar o serviço (entre 2 e 12).</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <select
                                        value={splits.length}
                                        onChange={(e) => handleChangeSplitsCount(parseInt(e.target.value))}
                                        className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 text-slate-700 dark:text-slate-300 font-bold text-sm"
                                    >
                                        {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(num => (
                                            <option key={num} value={num}>{num} Partes</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Splits List */}
                            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
                                {splits.map((item, idx) => (
                                    <div key={idx} className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm space-y-3 relative">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2.5 py-1 rounded-lg">
                                                Parte {idx + 1}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                                            {/* Value */}
                                            <div className="md:col-span-2">
                                                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                                                    Valor Negociado (R$)
                                                </label>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    required
                                                    value={item.negotiated_value}
                                                    onChange={(e) => handleUpdateSplitField(idx, 'negotiated_value', e.target.value)}
                                                    className="w-full px-3 py-2 border rounded-xl dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 font-semibold"
                                                    placeholder="0.00"
                                                />
                                            </div>

                                            {/* Execution Date */}
                                            <div className="md:col-span-2">
                                                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                                                    Data Base / Execução
                                                </label>
                                                <input
                                                    type="date"
                                                    required
                                                    value={item.execution_date}
                                                    onChange={(e) => handleUpdateSplitField(idx, 'execution_date', e.target.value)}
                                                    className="w-full px-3 py-2 border rounded-xl dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-sm focus:ring-2 focus:ring-indigo-500"
                                                />
                                            </div>

                                            {/* Custom Description */}
                                            <div className="md:col-span-2">
                                                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                                                    Descrição Customizada
                                                </label>
                                                <input
                                                    type="text"
                                                    value={item.custom_description || ''}
                                                    onChange={(e) => handleUpdateSplitField(idx, 'custom_description', e.target.value)}
                                                    className="w-full px-3 py-2 border rounded-xl dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-sm focus:ring-2 focus:ring-indigo-500"
                                                    placeholder="Descrição da parcela"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Validation & Totals Info banner */}
                            {(() => {
                                const totalSplitsValue = splits.reduce((acc, curr) => acc + parseFloat(curr.negotiated_value || '0'), 0);
                                const diff = Math.round((totalSplitsValue - order.negotiated_value) * 100) / 100;
                                const isSumValid = Math.abs(diff) <= 0.02;

                                return (
                                    <div className={`p-4 rounded-2xl border text-sm flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                                        isSumValid 
                                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-900/30 dark:text-emerald-400' 
                                            : 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/20 dark:border-rose-900/30 dark:text-rose-400'
                                    }`}>
                                        <div>
                                            <div className="font-bold flex items-center gap-1.5">
                                                {isSumValid ? (
                                                    <span>✓ Soma Válida</span>
                                                ) : (
                                                    <span>⚠ Soma Incompatível</span>
                                                )}
                                            </div>
                                            <p className="text-xs mt-0.5 opacity-90">
                                                Soma das partes: <strong>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalSplitsValue)}</strong> (Original: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.negotiated_value)}).
                                                {!isSumValid && ` Diferença de ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(diff)}.`}
                                            </p>
                                        </div>
                                        <div>
                                            <span className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase ${
                                                isSumValid 
                                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' 
                                                    : 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300'
                                            }`}>
                                                {isSumValid ? 'Pronto para salvar' : 'Ajuste os valores'}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Footer Buttons */}
                            <div className="flex gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsSplitOpen(false);
                                        setSplits([]);
                                    }}
                                    className="flex-1 py-2.5 text-center px-4 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-medium rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSplitSubmit}
                                    disabled={
                                        saving || 
                                        Math.abs(Math.round((splits.reduce((acc, curr) => acc + parseFloat(curr.negotiated_value || '0'), 0) - order.negotiated_value) * 100) / 100) > 0.02
                                    }
                                    className="flex-1 py-2.5 bg-indigo-600 text-white text-center px-4 font-bold rounded-xl hover:bg-indigo-700 transition shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {saving ? 'Processando...' : 'Confirmar Divisão'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
